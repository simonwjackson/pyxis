//! Read preferences at resolution time: changing the order affects already known copies.
use super::{Accounts, AuthContext};
use crate::db::{
    schema,
    store::{AccountId, Store, StoreError},
};
use crate::rpc::contract::RpcAccountSettings;
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Debug)]
pub enum SetError {
    Conflict(RpcAccountSettings),
    Invalid,
    Store(StoreError),
}

#[derive(Deserialize)]
struct Record {
    revision: u32,
    value: String,
}

pub(crate) fn read(store: &Store, account: &AccountId) -> Result<RpcAccountSettings, StoreError> {
    let row = store.get::<Record>(schema::SETTINGS, account, &key(account))?;
    match row {
        None => Ok(RpcAccountSettings {
            revision: 0,
            source_priority: vec![],
        }),
        Some(row) => Ok(RpcAccountSettings {
            revision: row.revision,
            source_priority: serde_json::from_str(&row.value).map_err(|e| StoreError::Decode {
                collection: schema::SETTINGS.into(),
                message: e.to_string(),
            })?,
        }),
    }
}
fn key(account: &AccountId) -> String {
    format!("account-settings:{}", account.as_str())
}
impl Accounts {
    pub fn settings(&self, account: &AccountId) -> Result<RpcAccountSettings, StoreError> {
        read(&self.store, account)
    }
    pub fn set_settings(
        &self,
        auth: &AuthContext,
        expected_revision: u32,
        source_priority: Vec<String>,
    ) -> Result<RpcAccountSettings, SetError> {
        let mut seen = HashSet::new();
        if source_priority.len() > 256
            || source_priority.iter().any(|id| {
                id.is_empty()
                    || id.len() > 256
                    || id.trim() != id
                    || id.chars().any(char::is_control)
                    || !seen.insert(id)
            })
        {
            return Err(SetError::Invalid);
        }
        let _guard = self
            .settings_mutation
            .lock()
            .expect("settings mutation poisoned");
        let current = self.settings(&auth.account_id).map_err(SetError::Store)?;
        if current.revision != expected_revision {
            return Err(SetError::Conflict(current));
        }
        let revision = current.revision.checked_add(1).ok_or(SetError::Invalid)?;
        self.store.put(schema::SETTINGS,&auth.account_id,&key(&auth.account_id), &serde_json::json!({"scope":"account","value":serde_json::to_string(&source_priority).expect("string list serializes"),"revision":revision,"updatedAt":super::now(),"updatedBy":auth.principal_id()})).map_err(SetError::Store)?;
        Ok(RpcAccountSettings {
            revision,
            source_priority,
        })
    }
}
