mod common;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use common::serial;
use redoost_api::config::Settings;
use redoost_api::storage::{Storage, limited};

#[tokio::test]
async fn limited_caps_how_many_run_at_once() {
    let running = AtomicUsize::new(0);
    let most = AtomicUsize::new(0);
    let call = async |value: usize| {
        let now = running.fetch_add(1, Ordering::SeqCst) + 1;
        most.fetch_max(now, Ordering::SeqCst);
        tokio::time::sleep(Duration::from_millis(1)).await;
        running.fetch_sub(1, Ordering::SeqCst);
        anyhow::Ok(value)
    };

    let results = limited((0..100).map(call), 7).await.unwrap();

    assert_eq!(results, (0..100).collect::<Vec<_>>());
    assert_eq!(most.load(Ordering::SeqCst), 7);
}

#[tokio::test]
async fn clients_give_up_before_the_gateway_does() {
    let _serial = serial().await;
    let storage = Storage::new(&Settings::from_env().unwrap());
    let config = storage.client.config();

    // Three tries at 15 seconds stay under the gateway's 60
    let timeouts = config.timeout_config().unwrap();
    assert_eq!(timeouts.connect_timeout(), Some(Duration::from_secs(5)));
    assert_eq!(timeouts.read_timeout(), Some(Duration::from_secs(15)));
    assert_eq!(config.retry_config().unwrap().max_attempts(), 3);
}
