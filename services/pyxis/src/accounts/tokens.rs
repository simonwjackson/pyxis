//! Opaque bearer token issuance and verification.
//!
//! Tokens are random credentials, not signed claims. The store holds only a BLAKE3 hash;
//! account, principal and scopes come from the record found by that hash. Revocation is
//! therefore immediate and requires no signing-key rotation story.

use std::fmt::Write;

use rand::rngs::OsRng;
use rand::RngCore;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenKind {
    Device,
    Api,
}

impl TokenKind {
    pub fn prefix(self) -> &'static str {
        match self {
            TokenKind::Device => "pyx_dev_",
            TokenKind::Api => "pyx_api_",
        }
    }
}

#[derive(Debug, Clone)]
pub struct IssuedToken {
    pub bearer: String,
    pub hash: String,
}

pub fn issue(kind: TokenKind) -> IssuedToken {
    let mut entropy = [0_u8; 32];
    OsRng.fill_bytes(&mut entropy);

    let mut bearer = String::with_capacity(kind.prefix().len() + entropy.len() * 2);
    bearer.push_str(kind.prefix());
    for byte in entropy {
        write!(&mut bearer, "{byte:02x}").expect("writing to String cannot fail");
    }

    let hash = hash(&bearer);
    IssuedToken { bearer, hash }
}

pub fn hash(bearer: &str) -> String {
    blake3::hash(bearer.as_bytes()).to_hex().to_string()
}

/// Compare hashes without leaking the matching prefix through an early return.
pub fn verifies(bearer: &str, expected_hash: &str) -> bool {
    let actual = hash(bearer);
    constant_time_eq::constant_time_eq(actual.as_bytes(), expected_hash.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_and_api_tokens_are_visibly_distinct() {
        assert!(issue(TokenKind::Device).bearer.starts_with("pyx_dev_"));
        assert!(issue(TokenKind::Api).bearer.starts_with("pyx_api_"));
    }

    #[test]
    fn only_the_exact_bearer_matches_its_hash() {
        let issued = issue(TokenKind::Device);

        assert!(verifies(&issued.bearer, &issued.hash));
        assert!(!verifies(&format!("{}x", issued.bearer), &issued.hash));
        assert_ne!(issued.bearer, issued.hash);
    }

    #[test]
    fn separately_issued_tokens_do_not_repeat() {
        assert_ne!(
            issue(TokenKind::Device).bearer,
            issue(TokenKind::Device).bearer
        );
    }
}
