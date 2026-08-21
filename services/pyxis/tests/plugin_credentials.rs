use pyxis::db::store::{AccountId, Store};
use pyxis::plugin_credentials::CredentialVault;
use pyxis::plugins::protocol::PluginValue;

fn config(username: &str, password: &str) -> PluginValue {
    PluginValue::from(serde_json::json!({
        "username": username,
        "password": password
    }))
}

#[test]
fn credentials_round_trip_but_plaintext_never_enters_proseql() {
    let dir = tempfile::tempdir().expect("temp dir");
    let store = Store::open(dir.path()).expect("store");
    let vault = CredentialVault::open(store.clone()).expect("vault");
    let account = AccountId::new("account-a");

    vault
        .set(
            &account,
            "pandora",
            &config("user@example.com", "correct horse battery staple"),
            "device-a",
        )
        .expect("set");

    assert_eq!(
        vault.get(&account, "pandora").expect("get"),
        Some(config("user@example.com", "correct horse battery staple"))
    );
    let source = std::fs::read_to_string(Store::path_for(dir.path())).expect("source");
    assert!(!source.contains("user@example.com"));
    assert!(!source.contains("correct horse battery staple"));
    assert!(source.contains("ciphertext"));
}

#[test]
fn account_scoping_and_master_key_survive_reopen() {
    let dir = tempfile::tempdir().expect("temp dir");
    let first = AccountId::new("account-a");
    let second = AccountId::new("account-b");
    {
        let store = Store::open(dir.path()).expect("store");
        let vault = CredentialVault::open(store.clone()).expect("vault");
        vault
            .set(&first, "pandora", &config("first", "secret"), "device-a")
            .expect("set");
        assert_eq!(vault.get(&second, "pandora").unwrap(), None);
        store.close().expect("close");
    }

    let vault = CredentialVault::open(Store::open(dir.path()).expect("reopen")).expect("vault");
    assert_eq!(
        vault.get(&first, "pandora").expect("get"),
        Some(config("first", "secret"))
    );
}

#[cfg(unix)]
#[test]
fn master_key_is_owner_only() {
    use std::os::unix::fs::PermissionsExt;

    let dir = tempfile::tempdir().expect("temp dir");
    CredentialVault::open(Store::open(dir.path()).expect("store")).expect("vault");

    let mode = std::fs::metadata(dir.path().join("credentials.key"))
        .expect("metadata")
        .permissions()
        .mode()
        & 0o777;
    assert_eq!(mode, 0o600);
}
