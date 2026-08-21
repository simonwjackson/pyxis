//! Encrypted per-account plugin configuration.
//!
//! ProseQL stores only XChaCha20-Poly1305 ciphertext and nonce. A random owner-only master
//! key lives beside the database and is part of the backed-up state. Account and plugin id
//! are authenticated as associated data, so swapping ciphertext between records fails.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use chacha20poly1305::aead::{Aead, Payload};
use chacha20poly1305::{KeyInit, XChaCha20Poly1305, XNonce};
use chrono::{SecondsFormat, Utc};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};

use crate::db::schema;
use crate::db::store::{AccountId, Store, StoreError};
use crate::plugins::protocol::PluginValue;

#[derive(Debug, thiserror::Error)]
pub enum CredentialError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error("credential key I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("credential key must contain exactly 32 bytes")]
    InvalidKey,
    #[error("plugin configuration could not be encoded: {0}")]
    Encode(#[from] serde_json::Error),
    #[error("plugin configuration encryption failed")]
    Encrypt,
    #[error("plugin configuration decryption failed")]
    Decrypt,
    #[error("plugin credential record contains invalid base64")]
    InvalidEncoding,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CredentialRecord {
    id: String,
    account_id: String,
    plugin_id: String,
    ciphertext: String,
    nonce: String,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

#[derive(Clone)]
pub struct CredentialVault {
    store: Store,
    key: Arc<[u8; 32]>,
}

impl CredentialVault {
    pub fn open(store: Store) -> Result<Self, CredentialError> {
        let key = load_or_create_key(&store.state_dir().join("credentials.key"))?;
        Ok(CredentialVault {
            store,
            key: Arc::new(key),
        })
    }

    pub fn set(
        &self,
        account: &AccountId,
        plugin_id: &str,
        config: &PluginValue,
        updated_by: &str,
    ) -> Result<(), CredentialError> {
        let plaintext = serde_json::to_vec(config)?;
        let mut nonce = [0_u8; 24];
        OsRng.fill_bytes(&mut nonce);
        let ciphertext = cipher(&self.key)
            .encrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: &plaintext,
                    aad: aad(account, plugin_id).as_bytes(),
                },
            )
            .map_err(|_| CredentialError::Encrypt)?;
        let id = credential_id(account, plugin_id);
        let existing =
            self.store
                .get::<CredentialRecord>(schema::PLUGIN_CREDENTIALS, account, &id)?;
        let record = CredentialRecord {
            id: id.clone(),
            account_id: String::new(),
            plugin_id: plugin_id.into(),
            ciphertext: BASE64.encode(ciphertext),
            nonce: BASE64.encode(nonce),
            revision: existing.map_or(1, |record| record.revision + 1),
            updated_by: updated_by.into(),
            updated_at: now(),
        };
        self.store
            .put(schema::PLUGIN_CREDENTIALS, account, &id, &record)?;
        Ok(())
    }

    pub fn get(
        &self,
        account: &AccountId,
        plugin_id: &str,
    ) -> Result<Option<PluginValue>, CredentialError> {
        let Some(record) = self.store.get::<CredentialRecord>(
            schema::PLUGIN_CREDENTIALS,
            account,
            &credential_id(account, plugin_id),
        )?
        else {
            return Ok(None);
        };
        let nonce = BASE64
            .decode(record.nonce)
            .map_err(|_| CredentialError::InvalidEncoding)?;
        let nonce: [u8; 24] = nonce
            .try_into()
            .map_err(|_| CredentialError::InvalidEncoding)?;
        let ciphertext = BASE64
            .decode(record.ciphertext)
            .map_err(|_| CredentialError::InvalidEncoding)?;
        let plaintext = cipher(&self.key)
            .decrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: &ciphertext,
                    aad: aad(account, plugin_id).as_bytes(),
                },
            )
            .map_err(|_| CredentialError::Decrypt)?;
        Ok(Some(serde_json::from_slice(&plaintext)?))
    }

    pub fn remove(&self, account: &AccountId, plugin_id: &str) -> Result<bool, CredentialError> {
        Ok(self.store.delete(
            schema::PLUGIN_CREDENTIALS,
            account,
            &credential_id(account, plugin_id),
        )?)
    }

    pub fn is_configured(
        &self,
        account: &AccountId,
        plugin_id: &str,
    ) -> Result<bool, CredentialError> {
        Ok(self
            .store
            .get::<CredentialRecord>(
                schema::PLUGIN_CREDENTIALS,
                account,
                &credential_id(account, plugin_id),
            )?
            .is_some())
    }
}

fn cipher(key: &[u8; 32]) -> XChaCha20Poly1305 {
    XChaCha20Poly1305::new(key.into())
}

fn aad(account: &AccountId, plugin_id: &str) -> String {
    format!("{}\0{plugin_id}", account.as_str())
}

fn credential_id(account: &AccountId, plugin_id: &str) -> String {
    blake3::hash(format!("plugin-credential\0{}\0{plugin_id}", account.as_str()).as_bytes())
        .to_hex()[..26]
        .to_string()
}

fn load_or_create_key(path: &Path) -> Result<[u8; 32], CredentialError> {
    match fs::read(path) {
        Ok(bytes) => return bytes.try_into().map_err(|_| CredentialError::InvalidKey),
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error.into()),
        Err(_) => {}
    }

    let mut key = [0_u8; 32];
    OsRng.fill_bytes(&mut key);
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let bytes = fs::read(path)?;
            return bytes.try_into().map_err(|_| CredentialError::InvalidKey);
        }
        Err(error) => return Err(error.into()),
    };
    file.write_all(&key)?;
    file.sync_all()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(key)
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Nanos, true)
}
