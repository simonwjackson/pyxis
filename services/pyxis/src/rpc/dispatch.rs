//! Operation dispatch.
//!
//! Transport parsing and authorization end before this module begins. A dispatcher
//! receives a valid request plus its account context and always returns the matching
//! operation tag. Domain failures become operation outcomes rather than framework errors.

use crate::accounts::{
    Account, AccountError, ApiTokenGrant, AuthContext, AuthGrant, ClaimOutcome, PairOutcome,
};
use crate::api::AppState;
use crate::rpc::contract::{
    AccountCreateOutcome, AccountListOutcome, ApiTokenCreateOutcome, CommandOutcome,
    DeviceClaimOutcome, DevicePairOutcome, PairingCreateOutcome, RpcAccount, RpcApiToken,
    RpcApiTokenGrant, RpcAuthGrant, RpcDevice, RpcFailure, RpcPairingCode, RpcRequest, RpcResponse,
    RpcSystemStatus, SystemStatusOutcome, CONTRACT_ID,
};

pub fn dispatch(state: &AppState, request: RpcRequest, auth: Option<AuthContext>) -> RpcResponse {
    match request {
        RpcRequest::SystemStatusGet(_) => system_status(state),
        RpcRequest::AuthDeviceClaim(request) => match state.accounts.claim_device(&request.name) {
            Ok(ClaimOutcome::Ready(grant)) => {
                RpcResponse::AuthDeviceClaim(DeviceClaimOutcome::Ready(rpc_grant(grant)))
            }
            Ok(ClaimOutcome::PairingRequired) => {
                RpcResponse::AuthDeviceClaim(DeviceClaimOutcome::PairingRequired)
            }
            Err(error) => RpcResponse::AuthDeviceClaim(DeviceClaimOutcome::Unavailable(
                account_failure(error),
            )),
        },
        RpcRequest::AuthDevicePair(request) => {
            match state.accounts.pair_device(&request.code, &request.name) {
                Ok(PairOutcome::Ready(grant)) => {
                    RpcResponse::AuthDevicePair(DevicePairOutcome::Ready(rpc_grant(grant)))
                }
                Ok(PairOutcome::InvalidCode) => {
                    RpcResponse::AuthDevicePair(DevicePairOutcome::InvalidCode)
                }
                Ok(PairOutcome::Expired) => RpcResponse::AuthDevicePair(DevicePairOutcome::Expired),
                Err(error) => RpcResponse::AuthDevicePair(DevicePairOutcome::Unavailable(
                    account_failure(error),
                )),
            }
        }
        RpcRequest::AuthPairingCreate(_) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let pairing = state.accounts.issue_pairing(&auth);
            RpcResponse::AuthPairingCreate(PairingCreateOutcome::Ready(RpcPairingCode {
                code: pairing.code,
                expires_at: pairing.expires_at,
            }))
        }
        RpcRequest::AuthTokenCreate(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state
                .accounts
                .create_api_token(&auth, &request.name, &request.scopes)
            {
                Ok(grant) => RpcResponse::AuthTokenCreate(ApiTokenCreateOutcome::Ready(
                    rpc_api_token_grant(grant),
                )),
                Err(AccountError::InvalidScope(scope)) => RpcResponse::AuthTokenCreate(
                    ApiTokenCreateOutcome::InvalidScope(RpcFailure::permanent(
                        "auth.invalidScope",
                        format!("unknown API token scope '{scope}'"),
                    )),
                ),
                Err(error) => RpcResponse::AuthTokenCreate(ApiTokenCreateOutcome::Unavailable(
                    account_failure(error),
                )),
            }
        }
        RpcRequest::AuthTokenRevoke(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.accounts.revoke_api_token(&auth, &request.token_id) {
                Ok(true) => RpcResponse::AuthTokenRevoke(CommandOutcome::Succeeded),
                Ok(false) => RpcResponse::AuthTokenRevoke(CommandOutcome::Unknown),
                Err(error) => RpcResponse::AuthTokenRevoke(CommandOutcome::Unavailable(
                    account_failure(error),
                )),
            }
        }
        RpcRequest::AccountList(_) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.accounts.list_for(&auth) {
                Ok(accounts) => RpcResponse::AccountList(AccountListOutcome::Ready(
                    accounts.into_iter().map(rpc_account).collect(),
                )),
                Err(error) => RpcResponse::AccountList(AccountListOutcome::Unavailable(
                    account_failure(error),
                )),
            }
        }
        RpcRequest::AccountCreate(request) => {
            if auth.is_none() {
                return auth_required();
            }
            match state
                .accounts
                .create_account(&request.name, &request.device_name)
            {
                Ok(grant) => {
                    RpcResponse::AccountCreate(AccountCreateOutcome::Ready(rpc_grant(grant)))
                }
                Err(AccountError::NameTaken(_)) => {
                    RpcResponse::AccountCreate(AccountCreateOutcome::NameTaken)
                }
                Err(error) => RpcResponse::AccountCreate(AccountCreateOutcome::Unavailable(
                    account_failure(error),
                )),
            }
        }
    }
}

fn system_status(state: &AppState) -> RpcResponse {
    match state.accounts.count() {
        Ok(account_count) => {
            RpcResponse::SystemStatusGet(SystemStatusOutcome::Ready(RpcSystemStatus {
                version: crate::version().to_string(),
                contract_id: CONTRACT_ID.to_string(),
                account_count: u32::try_from(account_count).unwrap_or(u32::MAX),
                // U7 replaces these constants with the live capability registry. Empty is
                // already a valid product state, not a placeholder error.
                plugin_count: 0,
                capabilities: Vec::new(),
            }))
        }
        Err(error) => {
            RpcResponse::SystemStatusGet(SystemStatusOutcome::Unavailable(account_failure(error)))
        }
    }
}

fn rpc_account(account: Account) -> RpcAccount {
    RpcAccount {
        id: account.id,
        name: account.name,
        is_default: account.is_default,
        created_at: account.created_at,
    }
}

fn rpc_grant(grant: AuthGrant) -> RpcAuthGrant {
    RpcAuthGrant {
        account: rpc_account(grant.account),
        device: RpcDevice {
            id: grant.device.id,
            name: grant.device.name,
        },
        bearer_token: grant.bearer_token,
    }
}

fn rpc_api_token_grant(grant: ApiTokenGrant) -> RpcApiTokenGrant {
    RpcApiTokenGrant {
        token: RpcApiToken {
            id: grant.token.id,
            name: grant.token.name,
            scopes: grant.token.scopes,
            created_at: grant.token.created_at,
        },
        bearer_token: grant.bearer_token,
    }
}

fn auth_required() -> RpcResponse {
    RpcResponse::rejected(RpcFailure::permanent(
        "auth.required",
        "this RPC operation requires a bearer token",
    ))
}

fn account_failure(error: AccountError) -> RpcFailure {
    RpcFailure::retryable("account.unavailable", error.to_string())
}
