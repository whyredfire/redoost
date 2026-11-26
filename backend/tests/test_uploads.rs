mod common;

use chrono::TimeDelta;
use common::{ANONYMOUS, TestApp, digest};
use serde_json::{Value, json};

const FILES: [(&str, &[u8]); 3] = [
    ("index.html", b"<h1>Hello from redoost</h1>"),
    ("assets/app.js", b"console.log('hello')"),
    ("docs/caf\u{e9} menu.txt", b"spaces and unicode"),
];

fn manifest(files: &[(&str, &[u8])]) -> Value {
    let files: Vec<_> = files
        .iter()
        .map(|(path, content)| json!({"path": path, "size": content.len(), "sha256": digest(content)}))
        .collect();
    json!({"files": files})
}

async fn deployment(app: &TestApp, token: &str) -> Value {
    app.post("/api/deployments", token, manifest(&FILES))
        .await
        .body
}

/// Where a file goes, in the version folder the deployment's uploads go to.
fn key(deployment: &Value, path: &str) -> String {
    let upload = &deployment["uploads"][0];
    let key = upload["fields"]["key"].as_str().unwrap();
    let folder = key.strip_suffix(upload["path"].as_str().unwrap()).unwrap();
    format!("{folder}{path}")
}

fn url(deployment: &Value) -> String {
    format!("/api/deployments/{}", deployment["slug"].as_str().unwrap())
}

async fn upload_all(app: &TestApp, deployment: &Value) {
    for (path, content) in FILES {
        assert_eq!(app.upload(deployment, path, content).await, 204, "{path}");
    }
}

#[tokio::test]
async fn uploads_matching_files() {
    let app = TestApp::start().await;
    let created = deployment(&app, &app.new_token().await).await;

    for ((path, content), content_type) in
        FILES
            .iter()
            .zip(["text/html", "text/javascript", "text/plain"])
    {
        assert_eq!(app.upload(&created, path, content).await, 204);

        let head = app.head(&key(&created, path)).await.unwrap();
        assert_eq!(head.content_length(), Some(content.len() as i64));
        assert_eq!(head.content_type(), Some(content_type));
        assert_eq!(head.checksum_sha256(), Some(digest(content).as_str()));
    }
}

#[tokio::test]
async fn uploads_gzipped_files() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    // Stands in for compressed bytes, which S3 stores as they are
    let content = b"\x1f\x8b gzipped <h1>Hello from redoost</h1>";
    let file = json!({"path": "index.html", "size": content.len(), "sha256": digest(content), "gzip": true});
    let created = app
        .post("/api/deployments", &token, json!({"files": [file]}))
        .await
        .body;

    // The signed policy requires the header, so it can't be left out
    let without = app
        .upload_with(&created, "index.html", content, &[("Content-Encoding", "")])
        .await;
    assert_eq!(without, 400);
    assert_eq!(app.upload(&created, "index.html", content).await, 204);

    let head = app.head(&key(&created, "index.html")).await.unwrap();
    assert_eq!(head.content_encoding(), Some("gzip"));
    assert_eq!(head.content_length(), Some(content.len() as i64));
}

#[tokio::test]
async fn replaying_a_policy_is_harmless() {
    let app = TestApp::start().await;
    let created = deployment(&app, &app.new_token().await).await;
    let content = FILES[0].1;

    assert_eq!(app.upload(&created, "index.html", content).await, 204);
    assert_eq!(app.upload(&created, "index.html", content).await, 204);
}

#[tokio::test]
async fn rejects_different_content() {
    let app = TestApp::start().await;
    let created = deployment(&app, &app.new_token().await).await;
    let content = FILES[0].1.to_ascii_uppercase();

    assert_eq!(app.upload(&created, "index.html", &content).await, 400);
    assert!(app.head(&key(&created, "index.html")).await.is_none());
}

#[tokio::test]
async fn rejects_other_keys() {
    let app = TestApp::start().await;
    let created = deployment(&app, &app.new_token().await).await;
    let slug = created["slug"].as_str().unwrap();
    for other in [
        key(&created, "other.html"),
        // The folder older sites are served from
        format!("{slug}/index.html"),
        "other-slug/index.html".to_string(),
    ] {
        let response = app
            .upload_with(&created, "index.html", FILES[0].1, &[("key", &other)])
            .await;

        assert_eq!(response, 400, "{other}");
        assert!(app.head(&other).await.is_none());
    }
}

#[tokio::test]
async fn rejects_changed_content_type() {
    let app = TestApp::start().await;
    let created = deployment(&app, &app.new_token().await).await;
    let changes = [("Content-Type", "text/plain")];

    assert_eq!(
        app.upload_with(&created, "index.html", FILES[0].1, &changes)
            .await,
        400
    );
}

#[tokio::test]
async fn rejects_expired_policies() {
    let app = TestApp::start_with(|settings| settings.upload_window = TimeDelta::seconds(-1)).await;
    let token = app.new_token().await;
    let content = FILES[0].1;
    let site = manifest(&[("index.html", content)]);
    let created = app.post("/api/deployments", &token, site).await.body;

    assert_eq!(app.upload(&created, "index.html", content).await, 400);
    assert!(app.head(&key(&created, "index.html")).await.is_none());
}

#[tokio::test]
async fn completes_once_every_file_is_uploaded() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let created = deployment(&app, &token).await;
    let complete = format!("{}/complete", url(&created));

    app.upload(&created, "index.html", FILES[0].1).await;
    let response = app.post(&complete, &token, manifest(&FILES)).await;
    assert_eq!(response.status, 409);
    assert_eq!(response.body["detail"], "1 of 3 files uploaded");

    upload_all(&app, &created).await;
    let response = app.post(&complete, &token, manifest(&FILES)).await;
    assert_eq!(response.status, 200);
    assert_eq!(response.body["state"], "ready");
}

#[tokio::test]
async fn completion_counts_the_stored_sizes() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let created = deployment(&app, &token).await;
    let complete = format!("{}/complete", url(&created));
    upload_all(&app, &created).await;

    // Same paths and checksums, but sizes that would hide the files from the quota
    let mut understated = manifest(&FILES);
    for file in understated["files"].as_array_mut().unwrap() {
        file["size"] = json!(0);
    }
    assert_eq!(app.post(&complete, &token, understated).await.status, 409);

    let response = app.post(&complete, &token, manifest(&FILES)).await;
    assert_eq!(response.status, 200);
    let total: usize = FILES.iter().map(|(_, content)| content.len()).sum();
    assert_eq!(response.body["total_size"], total);
}

#[tokio::test]
async fn updates_switch_folders_once_complete() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let created = deployment(&app, &token).await;
    let slug = created["slug"].as_str().unwrap();
    let url = url(&created);
    upload_all(&app, &created).await;
    app.post(&format!("{url}/complete"), &token, manifest(&FILES))
        .await;
    let served = key(&created, "");
    let stored = app.get(&format!("{url}/files"), &token).await.body;
    for (file, (path, content)) in stored
        .as_array()
        .unwrap()
        .iter()
        .zip([FILES[1], FILES[2], FILES[0]])
    {
        assert_eq!(
            (&file["path"], &file["sha256"]),
            (&json!(path), &json!(digest(content)))
        );
    }

    let files: [(&str, &[u8]); 3] = [
        ("index.html", b"<h1>Updated</h1>"),
        ("assets/app.js", FILES[1].1),
        ("new.txt", b"new file"),
    ];
    let updated = app.put(&url, &token, manifest(&files)).await.body;
    let paths: Vec<_> = updated["uploads"]
        .as_array()
        .unwrap()
        .iter()
        .map(|u| &u["path"])
        .collect();
    assert_eq!(paths, ["index.html", "new.txt"]);
    let response = app
        .post(&format!("{url}/complete"), &token, manifest(&files))
        .await;
    assert_eq!(response.body["detail"], "1 of 3 files uploaded");

    for (path, content) in [files[0], files[2]] {
        assert_eq!(app.upload(&updated, path, content).await, 204);
    }
    // Visitors still get the old files until the update completes
    let head = app.head(&format!("{served}index.html")).await.unwrap();
    assert_eq!(head.checksum_sha256(), Some(digest(FILES[0].1).as_str()));

    let response = app
        .post(&format!("{url}/complete"), &token, manifest(&files))
        .await;
    assert_eq!(response.status, 200);
    assert_eq!(response.body["file_count"], 3);
    let folder = key(&updated, "");
    // The unchanged file is copied into the new version
    let mut expected: Vec<_> = files
        .iter()
        .map(|(path, _)| format!("{folder}{path}"))
        .collect();
    expected.sort();
    assert_eq!(app.keys(&folder).await, expected);
    let head = app.head(&format!("{folder}index.html")).await.unwrap();
    assert_eq!(head.checksum_sha256(), Some(digest(files[0].1).as_str()));
    let resolved = app.get(&format!("/internal/sites/{slug}"), ANONYMOUS).await;
    assert_eq!(
        resolved.header("x-site-root"),
        format!("/{}", folder.trim_end_matches('/'))
    );

    // The old version is kept until it's pruned
    assert!(!app.keys(&served).await.is_empty());
    // Long enough after it was served that Nginx's cache has moved on
    sqlx::query("UPDATE version SET retired_at = retired_at - interval '1 hour'")
        .execute(&app.db)
        .await
        .unwrap();
    assert_eq!(
        app.delete(&format!("{url}/versions"), &token).await.status,
        200
    );
    assert!(app.keys(&served).await.is_empty());
    assert_eq!(app.keys(&format!("{slug}/")).await, app.keys(&folder).await);
}

#[tokio::test]
async fn updates_skip_files_another_client_compressed() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    // Two clients compressing the same page to different bytes
    let gzipped = |content: &[u8]| {
        let file = json!({
            "path": "index.html", "size": content.len(), "sha256": digest(content), "gzip": true,
            "original_sha256": digest(FILES[0].1),
        });
        json!({"files": [file]})
    };
    let content = b"\x1f\x8b compressed at level 9";
    let first = gzipped(content);
    let created = app
        .post("/api/deployments", &token, first.clone())
        .await
        .body;
    let url = url(&created);

    assert_eq!(app.upload(&created, "index.html", content).await, 204);
    assert_eq!(
        app.post(&format!("{url}/complete"), &token, first)
            .await
            .status,
        200
    );
    let second = gzipped(b"\x1f\x8b compressed at level 1");
    assert_eq!(
        app.put(&url, &token, second.clone()).await.body["uploads"],
        json!([])
    );
    assert_eq!(
        app.post(&format!("{url}/complete"), &token, second)
            .await
            .status,
        200
    );

    // The new version holds the bytes the first client uploaded
    let site = format!("/internal/sites/{}", created["slug"].as_str().unwrap());
    let root = app
        .get(&site, ANONYMOUS)
        .await
        .header("x-site-root")
        .to_string();
    assert_ne!(
        root,
        format!("/{}", key(&created, "").trim_end_matches('/'))
    );
    let head = app
        .head(&format!("{}/index.html", &root[1..]))
        .await
        .unwrap();
    assert_eq!(head.checksum_sha256(), Some(digest(content).as_str()));
    assert_eq!(head.content_encoding(), Some("gzip"));
}

#[tokio::test]
async fn cancelled_updates_leave_nothing_behind() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let created = deployment(&app, &token).await;
    let slug = created["slug"].as_str().unwrap();
    let url = url(&created);
    upload_all(&app, &created).await;
    app.post(&format!("{url}/complete"), &token, manifest(&FILES))
        .await;
    let before = app.keys(&format!("{slug}/")).await;

    let big = vec![b'x'; 4096];
    let files: [(&str, &[u8]); 4] = [
        ("index.html", b"<h1>Never finished</h1>"),
        FILES[1],
        FILES[2],
        ("big.bin", &big),
    ];
    let updated = app.put(&url, &token, manifest(&files)).await.body;
    for (path, content) in [files[0], files[3]] {
        assert_eq!(app.upload(&updated, path, content).await, 204);
    }
    assert_ne!(app.keys(&format!("{slug}/")).await, before);

    assert_eq!(
        app.post(&format!("{url}/cancel"), &token, Value::Null)
            .await
            .status,
        204
    );
    assert_eq!(app.keys(&format!("{slug}/")).await, before);
    let head = app.head(&key(&created, "index.html")).await.unwrap();
    assert_eq!(head.checksum_sha256(), Some(digest(FILES[0].1).as_str()));
}

#[tokio::test]
async fn delete_removes_uploaded_files() {
    let app = TestApp::start().await;
    let token = app.new_token().await;
    let created = deployment(&app, &token).await;
    upload_all(&app, &created).await;

    assert_eq!(app.delete(&url(&created), &token).await.status, 204);
    let slug = created["slug"].as_str().unwrap();
    assert!(app.keys(&format!("{slug}/")).await.is_empty());
}

#[tokio::test]
async fn cleanup_removes_orphaned_files() {
    let app = TestApp::start().await;
    let created = deployment(&app, &app.new_token().await).await;
    app.upload(&created, "index.html", FILES[0].1).await;
    app.put_object("orphan-test-0000/index.html", b"").await;

    app.cleanup().await;

    assert!(app.head("orphan-test-0000/index.html").await.is_none());
    assert!(app.head(&key(&created, "index.html")).await.is_some());
}
