//! Short-lived capabilities. Each purpose derives a separate key from credentials.key.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chacha20poly1305::{
    aead::{Aead, AeadCore, Payload},
    KeyInit, XChaCha20Poly1305, XNonce,
};
use rand::rngs::OsRng;

#[derive(Clone)]
pub(crate) struct SealedTokens {
    cipher: XChaCha20Poly1305,
    ttl_seconds: i64,
}

#[derive(Debug, thiserror::Error)]
#[error("token could not be sealed")]
pub struct SealError;

impl SealedTokens {
    pub(crate) fn new(credentials_key: &[u8; 32], purpose: &'static str, ttl_seconds: i64) -> Self {
        let key = blake3::derive_key(purpose, credentials_key);
        Self {
            cipher: XChaCha20Poly1305::new((&key).into()),
            ttl_seconds,
        }
    }

    pub(crate) fn seal(&self, scope: &[u8], body: &[u8], now: i64) -> Result<String, SealError> {
        let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
        let plaintext = [now.to_be_bytes().as_slice(), body].concat();
        let ciphertext = self
            .cipher
            .encrypt(
                &nonce,
                Payload {
                    msg: &plaintext,
                    aad: scope,
                },
            )
            .map_err(|_| SealError)?;
        Ok(URL_SAFE_NO_PAD.encode([nonce.as_slice(), &ciphertext].concat()))
    }

    pub(crate) fn open(&self, scope: &[u8], token: &str, now: i64) -> Option<(i64, Vec<u8>)> {
        let bytes = URL_SAFE_NO_PAD.decode(token).ok()?;
        let (nonce, ciphertext) = bytes.split_at_checked(24)?;
        let plaintext = self
            .cipher
            .decrypt(
                XNonce::from_slice(nonce),
                Payload {
                    msg: ciphertext,
                    aad: scope,
                },
            )
            .ok()?;
        let (issued_at, body) = plaintext.split_at_checked(8)?;
        let issued_at = i64::from_be_bytes(issued_at.try_into().ok()?);
        let age = now.checked_sub(issued_at)?;
        if !(0..self.ttl_seconds).contains(&age) {
            return None;
        }
        Some((issued_at, body.to_vec()))
    }
}
