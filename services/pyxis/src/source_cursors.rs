//! A source continuation belongs to one account, source operation and query. Authenticate
//! that scope as associated data: it need not be copied into the client-visible token.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chacha20poly1305::{
    aead::{Aead, AeadCore, Payload},
    KeyInit, XChaCha20Poly1305, XNonce,
};
use chrono::Utc;
use rand::rngs::OsRng;
use serde_json::{json, Value};

use crate::db::store::AccountId;

const TTL_SECONDS: i64 = 30 * 60;

#[derive(Clone)]
pub(crate) struct SourceCursors(XChaCha20Poly1305);

pub(crate) struct PageScope<'a> {
    cipher: &'a XChaCha20Poly1305,
    fingerprint: blake3::Hash,
}

#[derive(Debug, thiserror::Error)]
#[error("source continuation could not be sealed")]
pub struct CursorSealError;

impl SourceCursors {
    pub(crate) fn new(credentials_key: &[u8; 32]) -> Self {
        let key = blake3::derive_key("pyxis source paging cursors v1", credentials_key);
        Self(XChaCha20Poly1305::new((&key).into()))
    }

    /// `query` contains all selectors, not page controls (cursor and limit). Structured
    /// encoding keeps fields distinct even when an external id contains a separator.
    pub(crate) fn bind(
        &self,
        account: &AccountId,
        plugin: &str,
        operation: &str,
        query: &Value,
    ) -> PageScope<'_> {
        let scope = json!([account.as_str(), plugin, operation, query]);
        PageScope {
            cipher: &self.0,
            fingerprint: blake3::hash(scope.to_string().as_bytes()),
        }
    }
}

impl PageScope<'_> {
    pub(crate) fn seal(
        &self,
        continuation: Option<String>,
    ) -> Result<Option<String>, CursorSealError> {
        continuation
            .filter(|c| !c.trim().is_empty())
            .map(|c| self.seal_at(&c, Utc::now().timestamp()))
            .transpose()
    }

    pub(crate) fn open(&self, token: &str) -> Option<String> {
        self.open_at(token, Utc::now().timestamp())
    }

    fn seal_at(&self, continuation: &str, now: i64) -> Result<String, CursorSealError> {
        let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
        let plaintext = [now.to_be_bytes().as_slice(), continuation.as_bytes()].concat();
        let ciphertext = self
            .cipher
            .encrypt(
                &nonce,
                Payload {
                    msg: &plaintext,
                    aad: self.fingerprint.as_bytes(),
                },
            )
            .map_err(|_| CursorSealError)?;
        Ok(URL_SAFE_NO_PAD.encode([nonce.as_slice(), &ciphertext].concat()))
    }

    fn open_at(&self, token: &str, now: i64) -> Option<String> {
        let bytes = URL_SAFE_NO_PAD.decode(token).ok()?;
        let (nonce, ciphertext) = bytes.split_at_checked(24)?;
        let plaintext = self
            .cipher
            .decrypt(
                XNonce::from_slice(nonce),
                Payload {
                    msg: ciphertext,
                    aad: self.fingerprint.as_bytes(),
                },
            )
            .ok()?;
        let (issued_at, continuation) = plaintext.split_at_checked(8)?;
        let age = now.checked_sub(i64::from_be_bytes(issued_at.try_into().ok()?))?;
        if !(0..TTL_SECONDS).contains(&age) {
            return None;
        }
        String::from_utf8(continuation.to_vec()).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_issuing_scope_and_key_can_resume_within_the_lifetime() {
        let cursors = SourceCursors::new(&[1; 32]);
        let account = AccountId::new("first");
        let query = json!({"query":"bowie"});
        let scope = cursors.bind(&account, "source", "search", &query);
        let cursor = scope.seal_at("page-2", 100).unwrap();
        assert_eq!(
            scope.open_at(&cursor, 100 + TTL_SECONDS - 1).as_deref(),
            Some("page-2")
        );
        assert_eq!(scope.open_at(&cursor, 100 + TTL_SECONDS), None);
        assert_eq!(scope.open_at(&cursor, 99), None);
        assert_eq!(
            cursors
                .bind(&AccountId::new("second"), "source", "search", &query)
                .open_at(&cursor, 100),
            None
        );
        assert_eq!(
            SourceCursors::new(&[2; 32])
                .bind(&account, "source", "search", &query)
                .open_at(&cursor, 100),
            None
        );
    }
}
