//! Short-lived, one-use pairing codes.
//!
//! Pairing codes are intentionally in memory. A server restart invalidates outstanding
//! codes, which is safer than preserving a short credential across restarts and costs the
//! user one new six-digit code.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use rand::rngs::OsRng;
use rand::Rng;

use crate::db::store::AccountId;

pub const DEFAULT_PAIRING_TTL: Duration = Duration::from_secs(5 * 60);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IssuedPairing {
    pub code: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RedeemOutcome {
    Ready(AccountId),
    Invalid,
    Expired,
}

#[derive(Debug, Clone)]
struct PendingPairing {
    account_id: AccountId,
    issued_by_device_id: String,
    expires_at: Instant,
}

#[derive(Clone)]
pub struct PairingRegistry {
    pending: Arc<Mutex<HashMap<String, PendingPairing>>>,
    ttl: Duration,
}

impl PairingRegistry {
    pub fn new(ttl: Duration) -> Self {
        PairingRegistry {
            pending: Arc::new(Mutex::new(HashMap::new())),
            ttl,
        }
    }

    pub fn standard() -> Self {
        Self::new(DEFAULT_PAIRING_TTL)
    }

    pub fn issue(&self, account_id: AccountId, issued_by_device_id: String) -> IssuedPairing {
        self.issue_at(account_id, issued_by_device_id, Instant::now(), Utc::now())
    }

    fn issue_at(
        &self,
        account_id: AccountId,
        issued_by_device_id: String,
        monotonic_now: Instant,
        wall_now: DateTime<Utc>,
    ) -> IssuedPairing {
        let mut pending = self.pending.lock().expect("pairing registry poisoned");
        let code = loop {
            let candidate = format!("{:06}", OsRng.gen_range(0..1_000_000_u32));
            if !pending.contains_key(&candidate) {
                break candidate;
            }
        };
        let expires_at = monotonic_now + self.ttl;
        pending.insert(
            code.clone(),
            PendingPairing {
                account_id,
                issued_by_device_id,
                expires_at,
            },
        );

        IssuedPairing {
            code,
            expires_at: (wall_now + chrono::Duration::from_std(self.ttl).expect("valid TTL"))
                .to_rfc3339(),
        }
    }

    pub fn redeem(&self, code: &str) -> RedeemOutcome {
        self.redeem_at(code, Instant::now())
    }

    fn redeem_at(&self, code: &str, now: Instant) -> RedeemOutcome {
        let mut pending = self.pending.lock().expect("pairing registry poisoned");
        let Some(pairing) = pending.remove(code) else {
            return RedeemOutcome::Invalid;
        };
        if pairing.expires_at <= now {
            return RedeemOutcome::Expired;
        }
        tracing::debug!(
            issued_by_device_id = pairing.issued_by_device_id,
            "pairing code redeemed"
        );
        RedeemOutcome::Ready(pairing.account_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_expired_code_is_rejected_and_removed() {
        let registry = PairingRegistry::new(Duration::from_secs(10));
        let now = Instant::now();
        let issued = registry.issue_at(
            AccountId::new("account-a"),
            "device-a".into(),
            now,
            Utc::now(),
        );

        assert_eq!(
            registry.redeem_at(&issued.code, now + Duration::from_secs(11)),
            RedeemOutcome::Expired
        );
        assert_eq!(
            registry.redeem_at(&issued.code, now + Duration::from_secs(12)),
            RedeemOutcome::Invalid
        );
    }

    #[test]
    fn a_code_is_one_use() {
        let registry = PairingRegistry::standard();
        let issued = registry.issue(AccountId::new("account-a"), "device-a".into());

        assert_eq!(
            registry.redeem(&issued.code),
            RedeemOutcome::Ready(AccountId::new("account-a"))
        );
        assert_eq!(registry.redeem(&issued.code), RedeemOutcome::Invalid);
    }

    #[test]
    fn codes_are_six_numeric_characters() {
        let registry = PairingRegistry::standard();
        let issued = registry.issue(AccountId::new("account-a"), "device-a".into());

        assert_eq!(issued.code.len(), 6);
        assert!(issued
            .code
            .chars()
            .all(|character| character.is_ascii_digit()));
    }
}
