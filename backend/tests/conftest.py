import os

os.environ.update(
    {
        "REDOOST_LOG_LEVEL": "INFO",
        "REDOOST_DATABASE_URL": "sqlite+aiosqlite://",
        "REDOOST_S3_ENDPOINT": "http://127.0.0.1:3900",
        "REDOOST_S3_PUBLIC_ENDPOINT": "http://127.0.0.1:3900",
        "REDOOST_S3_REGION": "garage",
        "REDOOST_S3_BUCKET": "redoost-sites",
        "REDOOST_S3_ACCESS_KEY_ID": "test-key",
        "REDOOST_S3_SECRET_ACCESS_KEY": "test-secret",
    }
)
