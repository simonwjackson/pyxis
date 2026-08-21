//! Cross-source identity decisions with durable human overrides.

pub mod overrides;
pub mod score;

use crate::db::store::{AccountId, Store, StoreError};

pub use overrides::OverrideDecision;
pub use score::{MatchItem, MatchScore};

use overrides::Overrides;

pub const AUTO_MERGE_THRESHOLD: u16 = 900;
pub const REVIEW_THRESHOLD: u16 = 750;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    AutoMerge,
    Review,
    Reject,
    ManualMerge,
    ManualSplit,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatchResult {
    pub decision: Decision,
    pub score: MatchScore,
}

#[derive(Clone)]
pub struct Matcher {
    overrides: Overrides,
}

impl Matcher {
    pub fn open(store: Store) -> Self {
        Matcher {
            overrides: Overrides::new(store),
        }
    }

    pub fn decide(
        &self,
        account: &AccountId,
        left: &MatchItem,
        right: &MatchItem,
    ) -> Result<MatchResult, StoreError> {
        let score = score::score(left, right);
        let decision = match self.overrides.get(account, &left.id, &right.id)? {
            Some(OverrideDecision::Merge) => Decision::ManualMerge,
            Some(OverrideDecision::Split) => Decision::ManualSplit,
            None if score.overall >= AUTO_MERGE_THRESHOLD && !score.variant_conflict => {
                Decision::AutoMerge
            }
            None if score.overall >= REVIEW_THRESHOLD => Decision::Review,
            None => Decision::Reject,
        };
        Ok(MatchResult { decision, score })
    }

    pub fn set_override(
        &self,
        account: &AccountId,
        left_id: &str,
        right_id: &str,
        decision: OverrideDecision,
        updated_by: &str,
    ) -> Result<(), StoreError> {
        self.overrides
            .set(account, left_id, right_id, decision, updated_by)
    }

    pub fn remove_override(
        &self,
        account: &AccountId,
        left_id: &str,
        right_id: &str,
    ) -> Result<bool, StoreError> {
        self.overrides.remove(account, left_id, right_id)
    }
}
