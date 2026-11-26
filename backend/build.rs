// sqlx::migrate! embeds the migrations, so the binary is rebuilt when one changes
fn main() {
    println!("cargo:rerun-if-changed=migrations");
}
