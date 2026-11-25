use serde::{Deserialize, Serialize};

use crate::sealed_tokens::{SealError, SealedTokens};

const TTL_SECONDS: i64 = 6 * 60 * 60;

#[derive(Clone)]
pub struct OutputStreamTokens(SealedTokens);

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct OutputStreamGrant {
    pub account_id: String,
    pub candidate_id: String,
    pub preferred_formats: Vec<String>,
    pub selected_format: Option<String>,
}

impl OutputStreamTokens {
    pub(crate) fn new(key: &[u8; 32]) -> Self {
        Self(SealedTokens::new(
            key,
            "pyxis output stream tokens v1",
            TTL_SECONDS,
        ))
    }

    pub(crate) fn mint(
        &self,
        track_id: &str,
        grant: &OutputStreamGrant,
        issued_at: i64,
    ) -> Result<String, SealError> {
        let body = serde_json::to_vec(grant).map_err(|_| SealError)?;
        self.0.seal(track_id.as_bytes(), &body, issued_at)
    }

    pub(super) fn authorize(
        &self,
        token: &str,
        track_id: &str,
        now: i64,
    ) -> Option<OutputStreamGrant> {
        let (_, body) = self.0.open(track_id.as_bytes(), token, now)?;
        serde_json::from_slice(&body).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grant_preserves_account_candidate_and_formats_until_expiry() {
        let tokens = OutputStreamTokens::new(&[1; 32]);
        let grant = OutputStreamGrant {
            account_id: "first".into(),
            candidate_id: "candidate-1".into(),
            preferred_formats: vec!["m4a".into()],
            selected_format: Some("m4a/mp4a.40.2".into()),
        };
        let issued = 100;
        let token = tokens.mint("track-1", &grant, issued).unwrap();
        assert_eq!(
            tokens.authorize(&token, "track-1", issued + TTL_SECONDS - 1),
            Some(grant)
        );
        assert!(tokens
            .authorize(&token, "track-1", issued + TTL_SECONDS)
            .is_none());
        assert!(OutputStreamTokens::new(&[2; 32])
            .authorize(&token, "track-1", issued)
            .is_none());
    }
}
