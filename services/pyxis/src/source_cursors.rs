//! A source continuation belongs to one account, source operation and query. Authenticate
//! that scope as associated data: it need not be copied into the client-visible token.

use crate::sealed_tokens::{SealError, SealedTokens};
use chrono::Utc;
use serde_json::{json, Value};

use crate::db::store::AccountId;

const TTL_SECONDS: i64 = 30 * 60;

#[derive(Clone)]
pub(crate) struct SourceCursors(SealedTokens);

pub(crate) struct PageScope<'a> {
    tokens: &'a SealedTokens,
    fingerprint: blake3::Hash,
}

impl SourceCursors {
    pub(crate) fn new(credentials_key: &[u8; 32]) -> Self {
        Self(SealedTokens::new(
            credentials_key,
            "pyxis source paging cursors v1",
            TTL_SECONDS,
        ))
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
            tokens: &self.0,
            fingerprint: blake3::hash(scope.to_string().as_bytes()),
        }
    }
}

impl PageScope<'_> {
    pub(crate) fn seal(&self, continuation: Option<String>) -> Result<Option<String>, SealError> {
        continuation
            .filter(|c| !c.trim().is_empty())
            .map(|c| self.seal_at(&c, Utc::now().timestamp()))
            .transpose()
    }

    pub(crate) fn open(&self, token: &str) -> Option<String> {
        self.open_at(token, Utc::now().timestamp())
    }

    fn seal_at(&self, continuation: &str, now: i64) -> Result<String, SealError> {
        self.tokens
            .seal(self.fingerprint.as_bytes(), continuation.as_bytes(), now)
    }

    fn open_at(&self, token: &str, now: i64) -> Option<String> {
        let (_, body) = self.tokens.open(self.fingerprint.as_bytes(), token, now)?;
        String::from_utf8(body).ok()
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
