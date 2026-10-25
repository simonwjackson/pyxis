use std::net::IpAddr;
use std::path::PathBuf;

use clap::Parser;
use pyxis::api::{self, AppState};
use pyxis::db::store::Store;
use pyxis::instance_lock::InstanceLock;
use pyxis::origins::AllowedOrigins;
use pyxis::plugins::host::{HostPolicy, PluginHost};
use pyxis::settings::{ProcessEnv, Settings};

#[derive(Parser, Debug)]
#[command(name = "pyxis", version, about = "Pyxis music service")]
struct Args {
    /// Address to bind. Defaults to loopback; the tailnet edge is a separate process.
    #[arg(long, env = "PYXIS_HOST")]
    host: Option<IpAddr>,

    /// Port to bind.
    #[arg(long, env = "PYXIS_PORT")]
    port: Option<u16>,

    /// State directory. Defaults to $XDG_DATA_HOME/pyxis.
    #[arg(long, env = "PYXIS_STATE_DIR")]
    state_dir: Option<PathBuf>,

    /// Built web client root. Omit in API-only deployments and development with Vite.
    #[arg(long, env = "PYXIS_WEB_ROOT")]
    web_root: Option<PathBuf>,

    /// Comma-separated exact browser origins, besides this server's own, that may call
    /// /rpc, read /stream and open /realtime. Example: https://vela.example. Never `*`.
    #[arg(long, env = "PYXIS_ALLOWED_ORIGINS")]
    allowed_origins: Option<AllowedOrigins>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_env("PYXIS_LOG")
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let args = Args::parse();
    let settings = Settings::resolve(
        args.host,
        args.port,
        args.state_dir,
        args.web_root,
        args.allowed_origins,
        &ProcessEnv,
    );

    // Acquire before opening ProseQL. The engine requires one process owner per store, so
    // detecting a second server after the database opens is already too late.
    let _instance_lock = InstanceLock::acquire(&settings.state_dir)?;
    let store = Store::open(&settings.state_dir)?;

    tracing::info!(
        version = pyxis::version(),
        host = %settings.host,
        port = settings.port,
        state_dir = %settings.state_dir.display(),
        allowed_origins = ?settings.allowed_origins.iter().collect::<Vec<_>>(),
        "pyxis starting"
    );

    let plugins = PluginHost::discover(
        &settings.state_dir.join("plugins"),
        std::env::var_os("PATH").as_deref(),
        HostPolicy::default(),
    )?;
    let state = AppState::open_with_plugins(store.clone(), plugins)?
        .with_allowed_origins(settings.allowed_origins.clone());
    let served = api::serve(&settings, state).await;
    store.close()?;
    served
}
