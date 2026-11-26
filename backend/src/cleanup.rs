use std::collections::HashSet;

use anyhow::Result;

use crate::AppState;
use crate::models::now;

// Caps each run, so a large backlog is cleared over several runs
const BATCH_SIZE: usize = 100;

/// What a run removed.
pub struct Report {
    /// Uploads past their window, nobody finished
    pub expired: usize,
    /// Site folders in the bucket without a site
    pub orphaned: usize,
    /// Folders deleted once their time came
    pub discarded: usize,
}

pub async fn run(state: &AppState) -> Result<Report> {
    let now = now();
    let mut tx = state.db.begin().await?;
    // Unfinished uploads past their window, whose policies can no longer be used.
    // Rows go first, skipping any a late completion has locked to publish it, and
    // their files after; files a failed delete leaves are orphans for a later run.
    let expired: Vec<String> = sqlx::query_scalar(
        "DELETE FROM deployment WHERE slug IN (
             SELECT slug FROM deployment WHERE state = 'uploading' AND locked_until < $1
             LIMIT 100 FOR UPDATE SKIP LOCKED
         )
         RETURNING slug",
    )
    .bind(now)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;

    // Rows are committed before any upload, so a folder without one is leftover.
    // Listing each page before querying for its slugs keeps that true here, and
    // going a page at a time keeps memory and query size flat however many sites there are.
    let mut orphaned: Vec<String> = Vec::new();
    let mut after = None;
    loop {
        let (slugs, next) = state.storage.slug_page(after).await?;
        let known: HashSet<String> =
            sqlx::query_scalar("SELECT slug FROM deployment WHERE slug = ANY($1)")
                .bind(&slugs)
                .fetch_all(&state.db)
                .await?
                .into_iter()
                .collect();
        orphaned.extend(
            slugs
                .into_iter()
                .filter(|slug| !known.contains(slug) && !expired.contains(slug)),
        );
        after = next;
        if orphaned.len() >= BATCH_SIZE || after.is_none() {
            break;
        }
    }
    orphaned.truncate(BATCH_SIZE);

    state
        .storage
        .delete_sites(&[orphaned.as_slice(), expired.as_slice()].concat())
        .await?;

    // Updates nobody finished or cancelled. The statement takes the folders off their
    // rows and queues them in one go, skipping rows the API has locked to change them.
    // Sites from before versions uploaded into the folder they serve, which stays.
    sqlx::query(
        "WITH abandoned AS (
             SELECT slug, owner_id, pending_folder, folder AS served FROM deployment
             WHERE state = 'ready' AND pending_folder IS NOT NULL AND locked_until < $1
             LIMIT 100 FOR UPDATE SKIP LOCKED
         ), cleared AS (
             UPDATE deployment SET pending_folder = NULL, pending_size = 0, pending_digest = NULL
             FROM abandoned WHERE deployment.slug = abandoned.slug
             RETURNING abandoned.pending_folder, abandoned.owner_id, abandoned.served
         )
         INSERT INTO discarded_folder (folder, owner_id, size, delete_after)
         SELECT pending_folder, owner_id, 0, $1 FROM cleared
         WHERE pending_folder IS NOT NULL AND pending_folder IS DISTINCT FROM served
         ON CONFLICT DO NOTHING",
    )
    .bind(now)
    .execute(&state.db)
    .await?;

    // Folders let go above, by cancelled uploads, and by sites deleted mid-upload.
    // Rows go once all their files have, so a failed delete leaves them for a later run.
    let mut tx = state.db.begin().await?;
    let discarded: Vec<String> = sqlx::query_scalar(
        "SELECT folder FROM discarded_folder WHERE delete_after <= $1 LIMIT 100",
    )
    .bind(now)
    .fetch_all(&mut *tx)
    .await?;
    for folder in &discarded {
        state.storage.delete_folder(folder).await?;
        sqlx::query("DELETE FROM discarded_folder WHERE folder = $1")
            .bind(folder)
            .execute(&mut *tx)
            .await?;
    }

    // CLI sign-ins nobody finished, tokens past their expiry, and addresses nobody took
    sqlx::query("DELETE FROM cli_login WHERE expires_at < $1")
        .bind(now)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM api_token WHERE expires_at < $1")
        .bind(now)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM slug_offer WHERE expires_at < $1")
        .bind(now)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Report {
        expired: expired.len(),
        orphaned: orphaned.len(),
        discarded: discarded.len(),
    })
}
