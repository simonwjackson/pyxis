//! Operation dispatch.
//!
//! Transport parsing ends before this module begins. A dispatcher receives a valid
//! [`RpcRequest`] and always returns the matching operation tag. Store failures become the
//! operation's `unavailable` outcome; they never escape as framework errors.

use crate::db::store::Store;
use crate::rpc::contract::{
    AccountListOutcome, RpcAccount, RpcFailure, RpcRequest, RpcResponse, RpcSystemStatus,
    SystemStatusOutcome, CONTRACT_ID,
};

pub fn dispatch(store: &Store, request: RpcRequest) -> RpcResponse {
    match request {
        RpcRequest::SystemStatusGet(_) => system_status(store),
        RpcRequest::AccountList(_) => account_list(store),
    }
}

fn system_status(store: &Store) -> RpcResponse {
    match store.list_accounts::<RpcAccount>() {
        Ok(accounts) => RpcResponse::SystemStatusGet(SystemStatusOutcome::Ready(RpcSystemStatus {
            version: crate::version().to_string(),
            contract_id: CONTRACT_ID.to_string(),
            account_count: u32::try_from(accounts.len()).unwrap_or(u32::MAX),
            // U7 replaces these constants with the live capability registry. Empty is
            // already a valid product state, not a placeholder error.
            plugin_count: 0,
            capabilities: Vec::new(),
        })),
        Err(error) => {
            RpcResponse::SystemStatusGet(SystemStatusOutcome::Unavailable(store_failure(error)))
        }
    }
}

fn account_list(store: &Store) -> RpcResponse {
    match store.list_accounts::<RpcAccount>() {
        Ok(accounts) => RpcResponse::AccountList(AccountListOutcome::Ready(accounts)),
        Err(error) => {
            RpcResponse::AccountList(AccountListOutcome::Unavailable(store_failure(error)))
        }
    }
}

fn store_failure(error: impl std::fmt::Display) -> RpcFailure {
    RpcFailure::retryable("store.unavailable", error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_is_ready_when_no_accounts_or_plugins_exist() {
        let dir = tempfile::tempdir().expect("temp dir");
        let store = Store::open(dir.path()).expect("open store");

        let response = dispatch(&store, RpcRequest::SystemStatusGet(Default::default()));
        let encoded = serde_json::to_value(response).expect("serialize");

        assert_eq!(encoded["outcome"]["status"], "ready");
        assert_eq!(encoded["outcome"]["value"]["accountCount"], 0);
        assert_eq!(encoded["outcome"]["value"]["pluginCount"], 0);
    }
}
