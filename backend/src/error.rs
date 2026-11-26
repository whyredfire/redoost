use axum::Json;
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

/// Errors shaped the way FastAPI sent them, which the dashboard and CLI read.
#[derive(Debug)]
pub enum ApiError {
    /// {"detail": "message"}
    Http(StatusCode, String),
    /// A 401 that tells clients to send a bearer token
    Unauthorized(&'static str),
    /// A 422 listing what's wrong with the request, as {"detail": [{"loc", "msg", "type"}]}
    Invalid(Vec<Value>),
    /// Anything unexpected, like Postgres or S3 failing
    Internal(anyhow::Error),
}

pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    pub fn new(status: StatusCode, detail: impl Into<String>) -> ApiError {
        ApiError::Http(status, detail.into())
    }

    /// A request that doesn't validate, at a location like ["body", "files", 0, "path"].
    pub fn invalid(loc: Value, msg: impl Into<String>) -> ApiError {
        ApiError::Invalid(vec![
            json!({"loc": loc, "msg": msg.into(), "type": "value_error"}),
        ])
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            ApiError::Http(status, detail) => {
                (status, Json(json!({"detail": detail}))).into_response()
            }
            ApiError::Unauthorized(detail) => (
                StatusCode::UNAUTHORIZED,
                [(header::WWW_AUTHENTICATE, "Bearer")],
                Json(json!({"detail": detail})),
            )
                .into_response(),
            ApiError::Invalid(problems) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({"detail": problems})),
            )
                .into_response(),
            ApiError::Internal(error) => {
                tracing::error!("{error:#}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error").into_response()
            }
        }
    }
}

impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(error: E) -> ApiError {
        ApiError::Internal(error.into())
    }
}

/// Reads a JSON body. Handlers call it after authenticating, as FastAPI checked
/// credentials before the body.
pub fn parse_body<T: DeserializeOwned>(body: &[u8]) -> ApiResult<T> {
    serde_json::from_slice(body)
        .map_err(|error| ApiError::invalid(json!(["body"]), error.to_string()))
}
