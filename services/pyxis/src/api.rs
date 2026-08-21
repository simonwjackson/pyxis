//! HTTP application boundary.
//!
//! RPC and health are the only U4 routes. Media bytes join later at `/stream/:trackId`,
//! and the PWA shell joins at its own milestone. Keeping this router small makes it a real
//! public-contract test target instead of hiding behavior behind a running process.

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Context;
use axum::extract::DefaultBodyLimit;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::Router;
use tokio::net::TcpListener;
use tower_http::services::{ServeDir, ServeFile};

use crate::accounts::Accounts;
use crate::db::store::Store;
use crate::library::Library;
use crate::listen::{ListenLog, Projections};
use crate::matching::Matcher;
use crate::media::Media;
use crate::plugin_credentials::CredentialVault;
use crate::plugins::host::PluginHost;
use crate::rpc::transport;
use crate::sessions::Sessions;
use crate::settings::Settings;
use crate::source_catalog::SourceCatalog;
use crate::stream::{self, StreamService};

#[derive(Clone)]
pub struct AppState {
    pub(crate) accounts: Accounts,
    pub library: Library,
    pub listen: ListenLog,
    pub matcher: Matcher,
    pub media: Media,
    pub projections: Projections,
    pub(crate) plugin_credentials: CredentialVault,
    pub(crate) plugins: PluginHost,
    pub sessions: Sessions,
    pub(crate) sources: SourceCatalog,
    pub(crate) stream: StreamService,
}

impl AppState {
    /// Open with an empty plugin registry. Tests and callers that need deterministic
    /// zero-plugin behavior use this; production passes discovered plugins explicitly.
    pub fn open(store: Store) -> anyhow::Result<Self> {
        Self::open_with_plugins(store, PluginHost::empty())
    }

    pub fn open_with_plugins(store: Store, plugins: PluginHost) -> anyhow::Result<Self> {
        let stream = StreamService::open(store.state_dir())?;
        let accounts = Accounts::open(store.clone())?;
        let library = Library::open(store.clone());
        let listen = ListenLog::open(store.clone());
        let matcher = Matcher::open(store.clone());
        let media = Media::open(store.clone())?;
        let plugin_credentials = CredentialVault::open(store.clone())?;
        let projections = Projections::open(store.clone());
        let sessions = Sessions::open(store);
        let sources =
            SourceCatalog::new(plugins.clone(), media.clone(), plugin_credentials.clone());
        Ok(AppState {
            accounts,
            library,
            listen,
            matcher,
            media,
            plugin_credentials,
            projections,
            plugins,
            sessions,
            sources,
            stream,
        })
    }
}

pub fn router(state: AppState) -> Router {
    router_with_web(state, None)
}

pub fn router_with_web(state: AppState, web_root: Option<PathBuf>) -> Router {
    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/rpc", post(transport::rpc))
        .route("/stream/:track_id", get(stream::stream))
        // RPC payloads are metadata and commands, never media bytes. A 1 MiB request is
        // already pathological and should be rejected before it enters the contract parser.
        .layer(DefaultBodyLimit::max(1024 * 1024))
        .with_state(Arc::new(state));

    match web_root {
        None => app,
        Some(root) => {
            let index = root.join("index.html");
            app.fallback_service(ServeDir::new(root).fallback(ServeFile::new(index)))
        }
    }
}

pub async fn serve(settings: &Settings, state: AppState) -> anyhow::Result<()> {
    let listener = TcpListener::bind((settings.host, settings.port))
        .await
        .with_context(|| format!("bind {}:{}", settings.host, settings.port))?;
    let address = listener.local_addr().context("read bound address")?;

    tracing::info!(%address, "pyxis listening");

    axum::serve(listener, router_with_web(state, settings.web_root.clone()))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("serve HTTP")
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
