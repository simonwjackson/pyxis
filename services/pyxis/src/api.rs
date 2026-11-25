//! HTTP application boundary.
//!
//! RPC, realtime, health and media bytes at `/stream/:trackId`, plus the optional PWA
//! shell. Keeping this router small makes it a real public-contract test target instead of
//! hiding behavior behind a running process. `/rpc` and `/stream/:trackId` answer browsers
//! on allowlisted origins (`crate::origins`); the other routes stay same-origin only.

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Context;
use axum::extract::{DefaultBodyLimit, Request};
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::routing::{get, post};
use axum::Router;
use tokio::net::TcpListener;
use tower_http::services::{ServeDir, ServeFile};

use crate::accounts::Accounts;
use crate::db::store::Store;
use crate::fidelity_upgrades::{FidelityUpgradeDependencies, FidelityUpgrader, UpgradeRun};
use crate::library::Library;
use crate::listen::ListenLog;
use crate::matching::Matcher;
use crate::media::probe::FfprobeAudioProbe;
use crate::media::Media;
use crate::origins::{self, AllowedOrigins, Cors};
use crate::output_catalog::OutputCatalog;
use crate::plugin_credentials::CredentialVault;
use crate::plugins::host::PluginHost;
use crate::rpc::realtime::{self, Realtime};
use crate::rpc::transport;
use crate::sessions::Sessions;
use crate::settings::Settings;
use crate::source_catalog::SourceCatalog;
use crate::stations::Stations;
use crate::stream::{self, OutputStreamTokens, StreamService};

#[derive(Clone)]
pub struct AppState {
    pub(crate) accounts: Accounts,
    pub library: Library,
    pub listen: ListenLog,
    pub matcher: Matcher,
    pub media: Media,
    pub(crate) fidelity_upgrader: FidelityUpgrader,
    pub(crate) outputs: OutputCatalog,
    pub(crate) output_stream_tokens: OutputStreamTokens,
    pub(crate) plugin_credentials: CredentialVault,
    pub(crate) plugins: PluginHost,
    pub realtime: Realtime,
    pub sessions: Sessions,
    pub(crate) sources: SourceCatalog,
    pub(crate) stations: Stations,
    pub(crate) stream: StreamService,
    pub(crate) allowed_origins: AllowedOrigins,
}

impl AppState {
    /// Open with an empty plugin registry. Tests and callers that need deterministic
    /// zero-plugin behavior use this; production passes discovered plugins explicitly.
    pub fn open(store: Store) -> anyhow::Result<Self> {
        Self::open_with_plugins(store, PluginHost::empty())
    }

    pub fn open_with_plugins(store: Store, plugins: PluginHost) -> anyhow::Result<Self> {
        Self::open_with_plugins_and_lan_base(
            store,
            plugins,
            std::env::var("PYXIS_LAN_BASE_URL").ok(),
        )
    }

    pub fn open_with_plugins_and_lan_base(
        store: Store,
        plugins: PluginHost,
        lan_base_url: Option<String>,
    ) -> anyhow::Result<Self> {
        let stream = StreamService::open(store.state_dir())?;
        let output_stream_tokens = OutputStreamTokens::default();
        let accounts = Accounts::open(store.clone())?;
        let library = Library::open(store.clone());
        let listen = ListenLog::open(store.clone());
        let matcher = Matcher::open(store.clone());
        let media = Media::open(store.clone())?;
        let plugin_credentials = CredentialVault::open(store.clone())?;
        let sessions = Sessions::open(store.clone());
        let fidelity_upgrader = FidelityUpgrader::new(
            FidelityUpgradeDependencies {
                store: store.clone(),
                library: library.clone(),
                matcher: matcher.clone(),
                media: media.clone(),
                credentials: plugin_credentials.clone(),
                plugins: plugins.clone(),
                sessions: sessions.clone(),
            },
            Arc::new(FfprobeAudioProbe::default()),
        )?;
        let sources =
            SourceCatalog::new(plugins.clone(), media.clone(), plugin_credentials.clone());
        let stations = Stations::new(plugins.clone(), media.clone(), plugin_credentials.clone());
        let outputs = OutputCatalog::new(
            plugins.clone(),
            plugin_credentials.clone(),
            library.clone(),
            media.clone(),
            output_stream_tokens.clone(),
            lan_base_url,
        );
        let persisted_output_sessions = sessions
            .all_output_sessions()
            .context("read persisted output ownership")?;
        outputs
            .restore_target_owners(&persisted_output_sessions)
            .context("restore persisted output ownership")?;
        Ok(AppState {
            accounts,
            library,
            listen,
            matcher,
            media,
            fidelity_upgrader,
            outputs,
            output_stream_tokens,
            plugin_credentials,
            plugins,
            realtime: Realtime::new(),
            sessions,
            sources,
            stations,
            stream,
            allowed_origins: AllowedOrigins::default(),
        })
    }

    /// Allow browsers on these exact origins, besides the core's own. The composition root
    /// passes the operator's setting; the default allows none.
    pub fn with_allowed_origins(mut self, allowed_origins: AllowedOrigins) -> Self {
        self.allowed_origins = allowed_origins;
        self
    }
}

pub fn router(state: AppState) -> Router {
    router_with_web(state, None)
}

pub fn stream_router(state: AppState) -> Router {
    Router::new()
        .route("/stream/:track_id", get(stream::stream))
        .with_state(Arc::new(state))
}

pub fn router_with_web(state: AppState, web_root: Option<PathBuf>) -> Router {
    // The layer wraps the whole method router, including its 405 fallback, so OPTIONS
    // preflight reaches it on routes that otherwise accept only POST or GET.
    let rpc_cors = Cors::new(state.allowed_origins.clone(), "POST");
    let stream_cors = Cors::new(state.allowed_origins.clone(), "GET, HEAD");
    let app = Router::new()
        .route("/healthz", get(healthz))
        .route(
            "/rpc",
            post(transport::rpc).layer(middleware::from_fn_with_state(rpc_cors, origins::cors)),
        )
        .route("/realtime", get(realtime::realtime))
        .route(
            "/stream/:track_id",
            get(stream::stream).layer(middleware::from_fn_with_state(stream_cors, origins::cors)),
        )
        // RPC payloads are metadata and commands, never media bytes. A 1 MiB request is
        // already pathological and should be rejected before it enters the contract parser.
        .layer(DefaultBodyLimit::max(1024 * 1024))
        .with_state(Arc::new(state));

    match web_root {
        None => app,
        Some(root) => {
            let index = root.join("index.html");
            let assets = Router::new()
                .fallback_service(ServeDir::new(root.join("assets")))
                .layer(middleware::from_fn(immutable_asset));
            let shell = Router::new()
                .fallback_service(ServeDir::new(root).fallback(ServeFile::new(index)))
                .layer(middleware::from_fn(always_fresh_shell));

            app.nest("/assets", assets).fallback_service(shell)
        }
    }
}

pub async fn serve(settings: &Settings, state: AppState) -> anyhow::Result<()> {
    let listener = TcpListener::bind((settings.host, settings.port))
        .await
        .with_context(|| format!("bind {}:{}", settings.host, settings.port))?;
    let address = listener.local_addr().context("read bound address")?;
    tracing::info!(%address, "pyxis listening");

    let primary = axum::serve(
        listener,
        router_with_web(state.clone(), settings.web_root.clone()),
    );
    let device_sleep = spawn_sleep_monitor(state.clone(), crate::rpc::dispatch::SleepLane::Device);
    let output_sleep = spawn_sleep_monitor(state.clone(), crate::rpc::dispatch::SleepLane::Output);
    let expiry_monitor = spawn_session_expiry(state.clone());
    let output_monitor = spawn_output_monitor(state.clone());
    let fidelity_monitor = spawn_fidelity_monitor(state.clone());
    let lan_url = std::env::var("PYXIS_LAN_BASE_URL")
        .ok()
        .and_then(|value| reqwest::Url::parse(&value).ok());
    let Some(lan_url) = lan_url else {
        let shutdown_state = state.clone();
        let result = primary
            .with_graceful_shutdown(async move {
                shutdown_signal().await;
                shutdown_state.fidelity_upgrader.cancel();
            })
            .await
            .context("serve HTTP");
        state.fidelity_upgrader.cancel();
        device_sleep.abort();
        output_sleep.abort();
        output_monitor.abort();
        expiry_monitor.abort();
        fidelity_monitor.abort();
        return result;
    };
    let host = lan_url.host_str().context("LAN URL has no host")?;
    let port = lan_url
        .port_or_known_default()
        .context("LAN URL has no port")?;
    let lan_listener = TcpListener::bind(format!("{host}:{port}"))
        .await
        .with_context(|| format!("bind LAN stream {host}:{port}"))?;
    let lan_address = lan_listener
        .local_addr()
        .context("read LAN stream address")?;
    tracing::info!(address = %lan_address, "pyxis LAN stream listening");
    let lan = axum::serve(lan_listener, stream_router(state.clone()));

    let result = tokio::select! {
        result = primary => result.context("serve HTTP"),
        result = lan => result.context("serve LAN stream"),
        () = shutdown_signal() => Ok(()),
    };
    state.fidelity_upgrader.cancel();
    device_sleep.abort();
    output_sleep.abort();
    output_monitor.abort();
    expiry_monitor.abort();
    fidelity_monitor.abort();
    result
}

fn spawn_session_expiry(state: AppState) -> tokio::task::JoinHandle<()> {
    let hour = std::time::Duration::from_secs(3600);
    tokio::spawn(run_session_expiry(hour, move || {
        let state = state.clone();
        async move {
            match tokio::task::spawn_blocking(move || {
                state
                    .sessions
                    .expire_unreachable(chrono::Utc::now(), |account, id| {
                        crate::rpc::retirement::publish_retired(&state, account, id)
                    })
            })
            .await
            {
                Ok(Ok(())) => {}
                Ok(Err(e)) => tracing::warn!(%e,"session expiry failed"),
                Err(e) => tracing::warn!(%e,"session expiry task failed"),
            }
        }
    }))
}

async fn run_session_expiry<F: std::future::Future<Output = ()>>(
    period: std::time::Duration,
    mut sweep: impl FnMut() -> F,
) {
    // Presence starts empty. Give hosts a full period to reconnect before any deletion.
    let mut ticks = tokio::time::interval_at(tokio::time::Instant::now() + period, period);
    ticks.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        ticks.tick().await;
        sweep().await;
    }
}

fn spawn_fidelity_monitor(state: AppState) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            let upgrader = state.fidelity_upgrader.clone();
            match tokio::task::spawn_blocking(move || upgrader.run_once(chrono::Utc::now())).await {
                Ok(Ok(UpgradeRun::Upgraded {
                    track_id,
                    format,
                    fidelity,
                })) => tracing::info!(
                    %track_id,
                    %format,
                    lossless = fidelity.lossless,
                    bitrate_kbps = fidelity.bitrate_kbps,
                    "background fidelity upgrade completed"
                ),
                Ok(Ok(UpgradeRun::Deferred { track_id, code })) => {
                    tracing::debug!(%track_id, %code, "background fidelity upgrade deferred")
                }
                Ok(Ok(UpgradeRun::Rejected { track_id, code })) => {
                    tracing::debug!(%track_id, %code, "background fidelity candidate rejected")
                }
                Ok(Ok(UpgradeRun::Idle | UpgradeRun::Satisfied { .. })) => {}
                Ok(Err(error)) => tracing::warn!(%error, "fidelity monitor run failed"),
                Err(error) => tracing::warn!(%error, "fidelity monitor task failed"),
            }
        }
    })
}

fn spawn_sleep_monitor(
    state: AppState,
    lane: crate::rpc::dispatch::SleepLane,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut ticks = tokio::time::interval(std::time::Duration::from_secs(1));
        ticks.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            ticks.tick().await;
            let state = state.clone();
            match tokio::task::spawn_blocking(move || lane.run(&state, chrono::Utc::now)).await {
                Ok(Ok(())) => {}
                Ok(Err(error)) => tracing::warn!(%error,"sleep timer scan failed"),
                Err(error) => tracing::warn!(%error,"sleep monitor task failed"),
            }
        }
    })
}

fn spawn_output_monitor(state: AppState) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            let state = state.clone();
            if let Err(error) = tokio::task::spawn_blocking(move || {
                crate::rpc::dispatch::reconcile_all_output_sessions(&state);
            })
            .await
            {
                tracing::warn!(%error, "output monitor task failed");
            }
        }
    })
}

/// Asset filenames carry a content hash, so a given URL's bytes never change and may be
/// kept for a year. Only successes: a miss during a deploy would otherwise pin a negative
/// answer for just as long.
async fn immutable_asset(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    if response.status().is_success() {
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=31536000, immutable"),
        );
    }
    response
}

/// The shell names the hashed assets, so a stale copy pins the whole client to an old
/// build.
///
/// Marking it uncacheable is not enough on its own. Every file in the Nix store carries the
/// same zeroed mtime, so a browser that kept the old shell revalidates with a matching
/// `Last-Modified` and is told 304 for genuinely different content. The validators are
/// therefore stripped in both directions: a request cannot ask to be told 304, and a
/// response carries nothing that would let it ask next time. The shell is a few hundred
/// bytes, so always sending it costs nothing worth measuring.
async fn always_fresh_shell(mut request: Request, next: Next) -> Response {
    request.headers_mut().remove(header::IF_MODIFIED_SINCE);
    request.headers_mut().remove(header::IF_NONE_MATCH);

    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.remove(header::LAST_MODIFIED);
    headers.remove(header::ETAG);
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

async fn healthz() -> StatusCode {
    StatusCode::OK
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::error!(%error, "failed to install Ctrl-C handler");
        }
    };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{signal, SignalKind};
        match signal(SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => tracing::error!(%error, "failed to install SIGTERM handler"),
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }

    tracing::info!("shutdown signal received");
}

#[cfg(test)]
mod expiry_tests {
    use super::run_session_expiry;
    use futures_util::FutureExt;
    use std::{cell::Cell, time::Duration};

    #[tokio::test(start_paused = true)]
    async fn expiry_waits_a_full_period_before_each_sweep_including_the_first() {
        let period = Duration::from_secs(3600);
        let count = Cell::new(0);
        let monitor = run_session_expiry(period, || {
            count.set(count.get() + 1);
            std::future::ready(())
        });
        tokio::pin!(monitor);
        assert!(monitor.as_mut().now_or_never().is_none());
        assert_eq!(count.get(), 0);
        for n in 1..=2 {
            tokio::time::advance(period - Duration::from_millis(1)).await;
            assert!(monitor.as_mut().now_or_never().is_none());
            assert_eq!(count.get(), n - 1);
            tokio::time::advance(Duration::from_millis(1)).await;
            assert!(monitor.as_mut().now_or_never().is_none());
            assert_eq!(count.get(), n);
        }
    }
}
