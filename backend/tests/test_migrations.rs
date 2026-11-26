mod common;

use common::{empty_database, serial};
use redoost_api::config::Settings;
use sqlx::PgPool;

// The newest Alembic revision of the Python release
const ALEMBIC_HEAD: &str = "3caf283cca3f";

async fn tables(db: &PgPool) -> Vec<String> {
    sqlx::query_scalar(
        "SELECT tablename::text FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    )
    .fetch_all(db)
    .await
    .unwrap()
}

async fn mark_as_alembic(db: &PgPool, revision: &str) {
    sqlx::raw_sql("CREATE TABLE alembic_version (version_num varchar(32) PRIMARY KEY)")
        .execute(db)
        .await
        .unwrap();
    sqlx::query("INSERT INTO alembic_version VALUES ($1)")
        .bind(revision)
        .execute(db)
        .await
        .unwrap();
}

#[tokio::test]
async fn migrations_create_the_schema_once() {
    let _serial = serial().await;
    let db = empty_database(&Settings::from_env().unwrap()).await;

    redoost_api::migrate(&db).await.unwrap();
    let created = tables(&db).await;
    // Running again changes nothing
    redoost_api::migrate(&db).await.unwrap();

    assert_eq!(tables(&db).await, created);
    for table in [
        "api_token",
        "cli_login",
        "deployment",
        "discarded_folder",
        "slug_offer",
        "users",
        "version",
    ] {
        assert!(
            created.iter().any(|name| name == table),
            "{table} in {created:?}"
        );
    }
}

#[tokio::test]
async fn databases_from_the_python_release_are_adopted() {
    let _serial = serial().await;
    let db = empty_database(&Settings::from_env().unwrap()).await;
    // Stands in for the schema Alembic left, which the baseline matches
    redoost_api::migrate(&db).await.unwrap();
    sqlx::raw_sql("DROP TABLE _sqlx_migrations")
        .execute(&db)
        .await
        .unwrap();
    mark_as_alembic(&db, ALEMBIC_HEAD).await;

    redoost_api::migrate(&db).await.unwrap();

    let tables = tables(&db).await;
    assert!(
        !tables.iter().any(|name| name == "alembic_version"),
        "{tables:?}"
    );
    assert!(
        tables.iter().any(|name| name == "_sqlx_migrations"),
        "{tables:?}"
    );
}

#[tokio::test]
async fn databases_behind_the_python_release_are_refused() {
    let _serial = serial().await;
    let db = empty_database(&Settings::from_env().unwrap()).await;
    mark_as_alembic(&db, "5fe42e2d28ca").await;

    assert!(redoost_api::migrate(&db).await.is_err());
}
