use anyhow::Result;
use clap::Parser;
use redoost_api::config::Settings;
use redoost_api::{AppState, app, cleanup, migrate, setup_bucket};
use tokio::net::TcpListener;
use tokio::signal::unix::{SignalKind, signal};
use tracing::Level;

/// Redoost's API, and the jobs that run next to it.
#[derive(Parser)]
enum Command {
    /// Serve the API on port 8000
    Serve,
    /// Bring the database schema up to date
    Migrate,
    /// Remove expired uploads, orphaned files, and discarded folders
    Cleanup,
    /// Configure the bucket to serve sites and take uploads from browsers
    SetupBucket,
}

#[tokio::main]
async fn main() -> Result<()> {
    let command = Command::parse();
    let settings = Settings::from_env()?;
    let level = if settings.log_level == "VERBOSE" {
        Level::DEBUG
    } else {
        Level::INFO
    };
    tracing_subscriber::fmt().with_max_level(level).init();
    let state = AppState::new(settings)?;
    match command {
        Command::Serve => serve(state).await,
        Command::Migrate => migrate(&state.db).await,
        Command::Cleanup => {
            let report = cleanup::run(&state).await?;
            tracing::info!(
                "Removed {} expired deployments, {} orphaned sites, and {} discarded folders",
                report.expired,
                report.orphaned,
                report.discarded
            );
            Ok(())
        }
        Command::SetupBucket => setup_bucket::run(&state).await,
    }
}

async fn serve(state: AppState) -> Result<()> {
    let listener = TcpListener::bind("0.0.0.0:8000").await?;
    tracing::info!("Listening on {}", listener.local_addr()?);
    axum::serve(listener, app(state))
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

// Containers are stopped with SIGTERM, so requests in flight finish first
async fn shutdown() {
    let mut terminate = signal(SignalKind::terminate()).expect("SIGTERM can be handled");
    tokio::select! {
        _ = terminate.recv() => {}
        _ = tokio::signal::ctrl_c() => {}
    }
}
