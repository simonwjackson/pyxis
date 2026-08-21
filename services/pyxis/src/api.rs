//! HTTP application boundary.
//!
//! RPC and health are the only U4 routes. Media bytes join later at `/stream/:trackId`,
//! and the PWA shell joins at its own milestone. Keeping this router small makes it a real
//! public-contract test target instead of hiding behavior behind a running process.

use std::sync::Arc;

use anyhow::Context;
use axum::extract::DefaultBodyLimit;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::Router;
use tokio::net::TcpListener;

use crate::accounts::Accounts;
use crate::db::store::Store;
use crate::rpc::transport;
use crate::settings::Settings;

#[derive(Clone)]
pub struct AppState {
    pub(crate) accounts: Accounts,
}

impl AppState {
    pub fn open(store: Store) -> anyhow::Result<Self> {
        let accounts = Accounts::open(store)?;
        Ok(AppState { accounts })
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/rpc", post(transport::rpc))
        // RPC payloads are metadata and commands, never media bytes. A 1 MiB request is
        // already pathological and should be rejected before it enters the contract parser.
        .layer(DefaultBodyLimit::max(1024 * 1024))
        .with_state(Arc::new(state))
}

pub async fn serve(settings: &Settings, state: AppState) -> anyhow::Result<()> {
    let listener = TcpListener::bind((settings.host, settings.port))
        .await
        .with_context(|| format!("bind {}:{}", settings.host, settings.port))?;
    let address = listener.local_addr().context("read bound address")?;

    tracing::info!(%address, "pyxis listening");

    axum::serve(listener, router(state))
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
