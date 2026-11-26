use axum::Router;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use chrono::Utc;

use crate::AppState;
use crate::deployments::find_deployment;
use crate::error::{ApiError, ApiResult};
use crate::models::DeploymentState;

// Only called by Nginx; not exposed publicly
pub fn router() -> Router<AppState> {
    Router::new().route("/internal/sites/{slug}", get(resolve_site))
}

async fn resolve_site(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> ApiResult<Response> {
    let deployment = find_deployment(&mut *state.db.acquire().await?, &slug).await?;
    // Nginx's auth_request only understands 2xx, 401 and 403
    let Some(deployment) = deployment.filter(|deployment| {
        deployment.state == DeploymentState::Ready
            && deployment.enabled
            && deployment
                .expires_at
                .is_none_or(|expires_at| expires_at > Utc::now())
    }) else {
        return Err(ApiError::new(StatusCode::FORBIDDEN, "Site not available"));
    };
    let spa = if deployment.spa { "1" } else { "0" };
    // The folder being served, which changes when an update completes
    let folder = deployment.folder.unwrap_or_else(|| format!("{slug}/"));
    let root = format!("/{}", folder.strip_suffix('/').unwrap_or(&folder));
    Ok((
        StatusCode::NO_CONTENT,
        [("X-Site-Spa", spa.to_owned()), ("X-Site-Root", root)],
    )
        .into_response())
}
