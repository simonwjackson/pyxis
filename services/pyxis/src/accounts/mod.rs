//! Accounts, device adoption, pairing and bearer authentication.
//!
//! A fresh store creates one account named `default`. While it remains the only account,
//! an unpaired device may claim it without configuration. The instant a second account
//! exists, auto-adoption stops and new devices need a short-lived pairing code.

pub mod pairing;
pub mod tokens;

use std::collections::BTreeSet;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::db::schema;
use crate::db::store::{AccountId, Store, StoreError};

use pairing::{IssuedPairing, PairingRegistry, RedeemOutcome};
use tokens::{issue, verifies, TokenKind};

pub const DEFAULT_ACCOUNT_ID: &str = "default";
pub const SCOPE_ACCOUNT_READ: &str = "account:read";
pub const SCOPE_ACCOUNT_ADMIN: &str = "account:admin";
pub const SCOPE_SESSION_READ: &str = "session:read";
pub const SCOPE_SESSION_CONTROL: &str = "session:control";
pub const SCOPE_SOURCE_READ: &str = "source:read";
pub const SCOPE_LIBRARY_READ: &str = "library:read";
pub const SCOPE_LIBRARY_WRITE: &str = "library:write";
pub const SCOPE_LISTEN_READ: &str = "listen:read";
pub const SCOPE_LISTEN_WRITE: &str = "listen:write";
const ALLOWED_API_SCOPES: [&str; 9] = [
    SCOPE_ACCOUNT_READ,
    SCOPE_ACCOUNT_ADMIN,
    SCOPE_SESSION_READ,
    SCOPE_SESSION_CONTROL,
    SCOPE_SOURCE_READ,
    SCOPE_LIBRARY_READ,
    SCOPE_LIBRARY_WRITE,
    SCOPE_LISTEN_READ,
    SCOPE_LISTEN_WRITE,
];

#[derive(Debug, thiserror::Error)]
pub enum AccountError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error("account name '{0}' already exists")]
    NameTaken(String),
    #[error("unknown API token scope '{0}'")]
    InvalidScope(String),
    #[error("account '{0}' does not exist")]
    UnknownAccount(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Device {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthGrant {
    pub account: Account,
    pub device: Device,
    pub bearer_token: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClaimOutcome {
    Ready(AuthGrant),
    PairingRequired,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PairOutcome {
    Ready(AuthGrant),
    InvalidCode,
    Expired,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiTokenGrant {
    pub token: ApiToken,
    pub bearer_token: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiToken {
    pub id: String,
    pub name: String,
    pub scopes: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Principal {
    Device { id: String },
    ApiToken { id: String, scopes: Vec<String> },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthContext {
    pub account_id: AccountId,
    pub principal: Principal,
}

impl AuthContext {
    pub fn principal_id(&self) -> &str {
        match &self.principal {
            Principal::Device { id } | Principal::ApiToken { id, .. } => id,
        }
    }

    pub fn allows(&self, required_scope: &str) -> bool {
        match &self.principal {
            Principal::Device { .. } => true,
            Principal::ApiToken { scopes, .. } => {
                scopes.iter().any(|scope| scope == required_scope)
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceRecord {
    id: String,
    account_id: String,
    name: String,
    token_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_seen_at: Option<String>,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiTokenRecord {
    id: String,
    account_id: String,
    name: String,
    token_hash: String,
    scopes: Vec<String>,
    created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    revoked_at: Option<String>,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

#[derive(Clone)]
pub struct Accounts {
    store: Store,
    pairings: PairingRegistry,
}

impl Accounts {
    pub fn open(store: Store) -> Result<Self, AccountError> {
        let accounts = Accounts {
            store,
            pairings: PairingRegistry::standard(),
        };
        accounts.ensure_default()?;
        Ok(accounts)
    }

    fn ensure_default(&self) -> Result<(), AccountError> {
        if self.store.list_accounts::<Account>()?.is_empty() {
            let account = Account {
                id: DEFAULT_ACCOUNT_ID.into(),
                name: DEFAULT_ACCOUNT_ID.into(),
                is_default: true,
                created_at: now(),
            };
            self.store.put_account(&account.id, &account)?;
        }
        Ok(())
    }

    pub fn count(&self) -> Result<usize, AccountError> {
        Ok(self.store.list_accounts::<Account>()?.len())
    }

    pub fn claim_device(&self, name: &str) -> Result<ClaimOutcome, AccountError> {
        let accounts = self.store.list_accounts::<Account>()?;
        if accounts.len() != 1 {
            return Ok(ClaimOutcome::PairingRequired);
        }
        Ok(ClaimOutcome::Ready(self.issue_device(&accounts[0], name)?))
    }

    pub fn create_account(&self, name: &str, device_name: &str) -> Result<AuthGrant, AccountError> {
        let existing = self.store.list_accounts::<Account>()?;
        if existing
            .iter()
            .any(|account| account.name.eq_ignore_ascii_case(name))
        {
            return Err(AccountError::NameTaken(name.to_string()));
        }

        let account = Account {
            id: Ulid::new().to_string(),
            name: name.to_string(),
            is_default: false,
            created_at: now(),
        };
        self.store.put_account(&account.id, &account)?;

        match self.issue_device(&account, device_name) {
            Ok(grant) => Ok(grant),
            Err(error) => {
                // Account and its first device form one logical write. ProseQL does not yet
                // expose this cross-collection transaction through Store, so compensate if
                // device creation fails rather than leave an inaccessible account behind.
                let _ = self.store.delete_account(&account.id);
                Err(error)
            }
        }
    }

    pub fn list_for(&self, auth: &AuthContext) -> Result<Vec<Account>, AccountError> {
        Ok(self
            .store
            .get_account::<Account>(auth.account_id.as_str())?
            .into_iter()
            .collect())
    }

    pub fn issue_pairing(&self, auth: &AuthContext) -> IssuedPairing {
        self.pairings
            .issue(auth.account_id.clone(), auth.principal_id().to_string())
    }

    pub fn pair_device(&self, code: &str, name: &str) -> Result<PairOutcome, AccountError> {
        match self.pairings.redeem(code) {
            RedeemOutcome::Invalid => Ok(PairOutcome::InvalidCode),
            RedeemOutcome::Expired => Ok(PairOutcome::Expired),
            RedeemOutcome::Ready(account_id) => {
                let account = self
                    .store
                    .get_account::<Account>(account_id.as_str())?
                    .ok_or_else(|| AccountError::UnknownAccount(account_id.as_str().into()))?;
                Ok(PairOutcome::Ready(self.issue_device(&account, name)?))
            }
        }
    }

    pub fn create_api_token(
        &self,
        auth: &AuthContext,
        name: &str,
        scopes: &[String],
    ) -> Result<ApiTokenGrant, AccountError> {
        let scopes = validate_scopes(scopes)?;
        let issued = issue(TokenKind::Api);
        let id = Ulid::new().to_string();
        let timestamp = now();
        let record = ApiTokenRecord {
            id: id.clone(),
            account_id: String::new(),
            name: name.to_string(),
            token_hash: issued.hash,
            scopes: scopes.clone(),
            created_at: timestamp.clone(),
            revoked_at: None,
            revision: 1,
            updated_by: auth.principal_id().to_string(),
            updated_at: timestamp.clone(),
        };
        self.store
            .put(schema::API_TOKENS, &auth.account_id, &id, &record)?;

        Ok(ApiTokenGrant {
            token: ApiToken {
                id,
                name: name.to_string(),
                scopes,
                created_at: timestamp,
            },
            bearer_token: issued.bearer,
        })
    }

    pub fn revoke_api_token(
        &self,
        auth: &AuthContext,
        token_id: &str,
    ) -> Result<bool, AccountError> {
        let Some(mut record) =
            self.store
                .get::<ApiTokenRecord>(schema::API_TOKENS, &auth.account_id, token_id)?
        else {
            return Ok(false);
        };
        record.revoked_at = Some(now());
        record.revision += 1;
        record.updated_by = auth.principal_id().to_string();
        record.updated_at = now();
        self.store
            .put(schema::API_TOKENS, &auth.account_id, token_id, &record)?;
        Ok(true)
    }

    pub fn authenticate(&self, bearer: &str) -> Result<Option<AuthContext>, AccountError> {
        let accounts = self.store.list_accounts::<Account>()?;

        if bearer.starts_with(TokenKind::Device.prefix()) {
            for account in &accounts {
                let account_id = AccountId::new(&account.id);
                for device in self
                    .store
                    .list::<DeviceRecord>(schema::DEVICES, &account_id)?
                {
                    if verifies(bearer, &device.token_hash) {
                        return Ok(Some(AuthContext {
                            account_id,
                            principal: Principal::Device { id: device.id },
                        }));
                    }
                }
            }
            return Ok(None);
        }

        if bearer.starts_with(TokenKind::Api.prefix()) {
            for account in &accounts {
                let account_id = AccountId::new(&account.id);
                for token in self
                    .store
                    .list::<ApiTokenRecord>(schema::API_TOKENS, &account_id)?
                {
                    if token.revoked_at.is_none() && verifies(bearer, &token.token_hash) {
                        return Ok(Some(AuthContext {
                            account_id,
                            principal: Principal::ApiToken {
                                id: token.id,
                                scopes: token.scopes,
                            },
                        }));
                    }
                }
            }
        }

        Ok(None)
    }

    fn issue_device(&self, account: &Account, name: &str) -> Result<AuthGrant, AccountError> {
        let issued = issue(TokenKind::Device);
        let id = Ulid::new().to_string();
        let timestamp = now();
        let record = DeviceRecord {
            id: id.clone(),
            account_id: String::new(),
            name: name.to_string(),
            token_hash: issued.hash,
            last_seen_at: Some(timestamp.clone()),
            revision: 1,
            updated_by: id.clone(),
            updated_at: timestamp,
        };
        self.store
            .put(schema::DEVICES, &AccountId::new(&account.id), &id, &record)?;

        Ok(AuthGrant {
            account: account.clone(),
            device: Device {
                id,
                name: name.to_string(),
            },
            bearer_token: issued.bearer,
        })
    }
}

fn validate_scopes(scopes: &[String]) -> Result<Vec<String>, AccountError> {
    let mut unique = BTreeSet::new();
    for scope in scopes {
        if !ALLOWED_API_SCOPES.contains(&scope.as_str()) {
            return Err(AccountError::InvalidScope(scope.clone()));
        }
        unique.insert(scope.clone());
    }
    Ok(unique.into_iter().collect())
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn accounts() -> (tempfile::TempDir, Accounts) {
        let dir = tempfile::tempdir().expect("temp dir");
        let store = Store::open(dir.path()).expect("open store");
        let accounts = Accounts::open(store).expect("open accounts");
        (dir, accounts)
    }

    #[test]
    fn fresh_store_has_exactly_one_default_account() {
        let (_dir, accounts) = accounts();

        assert_eq!(accounts.count().expect("count"), 1);
        let claimed = accounts.claim_device("phone").expect("claim");
        let ClaimOutcome::Ready(grant) = claimed else {
            panic!("fresh store should auto-adopt");
        };
        assert_eq!(grant.account.id, DEFAULT_ACCOUNT_ID);
    }

    #[test]
    fn duplicate_account_names_are_rejected_case_insensitively() {
        let (_dir, accounts) = accounts();
        let first = accounts.claim_device("phone").expect("claim");
        let ClaimOutcome::Ready(_grant) = first else {
            panic!("claim");
        };

        let error = accounts
            .create_account("DEFAULT", "phone")
            .expect_err("duplicate");

        assert!(matches!(error, AccountError::NameTaken(_)));
    }

    #[test]
    fn unknown_api_scopes_are_rejected() {
        let (_dir, accounts) = accounts();
        let ClaimOutcome::Ready(grant) = accounts.claim_device("phone").expect("claim") else {
            panic!("claim");
        };
        let auth = accounts
            .authenticate(&grant.bearer_token)
            .expect("authenticate")
            .expect("auth");

        let error = accounts
            .create_api_token(&auth, "bad", &["delete:everything".into()])
            .expect_err("invalid scope");

        assert!(matches!(error, AccountError::InvalidScope(_)));
    }
}
