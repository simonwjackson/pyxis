use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

use crate::db::schema;
use crate::db::store::{AccountId, Store, StoreError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OverrideDecision {
    Merge,
    Split,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverrideRecord {
    id: String,
    account_id: String,
    left_id: String,
    right_id: String,
    decision: OverrideDecision,
    created_at: String,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

#[derive(Clone)]
pub struct Overrides {
    store: Store,
}

impl Overrides {
    pub fn new(store: Store) -> Self {
        Overrides { store }
    }

    pub fn get(
        &self,
        account: &AccountId,
        left_id: &str,
        right_id: &str,
    ) -> Result<Option<OverrideDecision>, StoreError> {
        Ok(self
            .store
            .get::<OverrideRecord>(
                schema::MATCH_OVERRIDES,
                account,
                &override_id(account, left_id, right_id),
            )?
            .map(|record| record.decision))
    }

    pub fn set(
        &self,
        account: &AccountId,
        left_id: &str,
        right_id: &str,
        decision: OverrideDecision,
        updated_by: &str,
    ) -> Result<(), StoreError> {
        let (left_id, right_id) = canonical_pair(left_id, right_id);
        let id = override_id(account, &left_id, &right_id);
        let existing = self
            .store
            .get::<OverrideRecord>(schema::MATCH_OVERRIDES, account, &id)?;
        let timestamp = now();
        let record = OverrideRecord {
            id: id.clone(),
            account_id: String::new(),
            left_id,
            right_id,
            decision,
            created_at: existing
                .as_ref()
                .map_or_else(|| timestamp.clone(), |record| record.created_at.clone()),
            revision: existing.map_or(1, |record| record.revision + 1),
            updated_by: updated_by.into(),
            updated_at: timestamp,
        };
        self.store
            .put(schema::MATCH_OVERRIDES, account, &id, &record)
    }

    pub fn remove(
        &self,
        account: &AccountId,
        left_id: &str,
        right_id: &str,
    ) -> Result<bool, StoreError> {
        self.store.delete(
            schema::MATCH_OVERRIDES,
            account,
            &override_id(account, left_id, right_id),
        )
    }
}

fn canonical_pair(left_id: &str, right_id: &str) -> (String, String) {
    if left_id <= right_id {
        (left_id.into(), right_id.into())
    } else {
        (right_id.into(), left_id.into())
    }
}

fn override_id(account: &AccountId, left_id: &str, right_id: &str) -> String {
    let (left_id, right_id) = canonical_pair(left_id, right_id);
    blake3::hash(
        format!(
            "match-override\0{}\0{left_id}\0{right_id}",
            account.as_str()
        )
        .as_bytes(),
    )
    .to_hex()[..26]
        .to_string()
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Nanos, true)
}
