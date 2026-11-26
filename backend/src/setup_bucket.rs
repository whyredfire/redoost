use anyhow::Result;
use aws_sdk_s3::types::{CorsConfiguration, CorsRule, IndexDocument, WebsiteConfiguration};

use crate::AppState;

pub async fn run(state: &AppState) -> Result<()> {
    let (s3, bucket) = (&state.storage.client, &state.storage.bucket);
    // Nginx serves published sites from the bucket's website endpoint
    let website = WebsiteConfiguration::builder()
        .index_document(IndexDocument::builder().suffix("index.html").build()?)
        .build();
    // Browsers upload straight to the bucket from the frontend
    let cors = CorsConfiguration::builder()
        .cors_rules(
            CorsRule::builder()
                .allowed_origins(&state.settings.app_origin)
                .allowed_methods("POST")
                .allowed_headers("*")
                .build()?,
        )
        .build()?;
    s3.put_bucket_website()
        .bucket(bucket)
        .website_configuration(website)
        .send()
        .await?;
    s3.put_bucket_cors()
        .bucket(bucket)
        .cors_configuration(cors)
        .send()
        .await?;
    tracing::info!("Configured bucket {bucket}");
    Ok(())
}
