use std::net::IpAddr;
use std::path::PathBuf;

use clap::Parser;
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
}

fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_env("PYXIS_LOG")
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let args = Args::parse();
    let settings = Settings::resolve(args.host, args.port, args.state_dir, &ProcessEnv);

    tracing::info!(
        version = pyxis::version(),
        host = %settings.host,
        port = settings.port,
        state_dir = %settings.state_dir.display(),
        "pyxis resolved settings"
    );

    // The HTTP server lands in U4. U1 exists to prove the toolchain, the workspace and the
    // verify gate, so the binary resolves its settings and exits cleanly.
    Ok(())
}
