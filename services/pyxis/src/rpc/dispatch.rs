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
    DeviceClaimOutcome, DevicePairOutcome, PairingCreateOutcome, PluginListOutcome, RpcAccount,
    RpcApiToken, RpcApiTokenGrant, RpcAuthGrant, RpcDevice, RpcFailure, RpcPairingCode, RpcPlugin,
    RpcRequest, RpcResponse, RpcSession, RpcSessionCommand, RpcSystemStatus, RpcTransport,
    SessionCommandOutcome, SessionCreateOutcome, SessionListOutcome, SessionStateOutcome,
    SystemStatusOutcome, CONTRACT_ID,
};
use crate::sessions::{Session, SessionCommand as DomainSessionCommand, SessionError, Transport};

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
        RpcRequest::PluginList(_) => RpcResponse::PluginList(PluginListOutcome::Ready(
            state
                .plugins
                .list()
                .into_iter()
                .map(|plugin| RpcPlugin {
                    id: plugin.id,
                    name: plugin.name,
                    version: plugin.version,
                    capabilities: plugin.capabilities,
                    status: plugin.status.as_str().into(),
                    reason: plugin.reason,
                })
                .collect(),
        )),
        RpcRequest::SessionCreate(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.sessions.create(&auth, &request.name) {
                Ok(session) => {
                    RpcResponse::SessionCreate(SessionCreateOutcome::Ready(rpc_session(session)))
                }
                Err(SessionError::NotDevice) => {
                    RpcResponse::SessionCreate(SessionCreateOutcome::NotDevice)
                }
                Err(error) => RpcResponse::SessionCreate(SessionCreateOutcome::Unavailable(
                    session_failure(error),
                )),
            }
        }
        RpcRequest::SessionList(_) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.sessions.list(&auth) {
                Ok(sessions) => RpcResponse::SessionList(SessionListOutcome::Ready(
                    sessions.into_iter().map(rpc_session).collect(),
                )),
                Err(error) => RpcResponse::SessionList(SessionListOutcome::Unavailable(
                    session_failure(error),
                )),
            }
        }
        RpcRequest::SessionStateGet(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.sessions.get(&auth, &request.session_id) {
                Ok(Some(session)) => {
                    RpcResponse::SessionStateGet(SessionStateOutcome::Ready(rpc_session(session)))
                }
                Ok(None) => RpcResponse::SessionStateGet(SessionStateOutcome::Unknown),
                Err(error) => RpcResponse::SessionStateGet(SessionStateOutcome::Unavailable(
                    session_failure(error),
                )),
            }
        }
        RpcRequest::SessionCommandRun(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let command = domain_command(request.command);
            match state.sessions.command(&auth, &request.session_id, command) {
                Ok(session) => RpcResponse::SessionCommandRun(SessionCommandOutcome::Applied(
                    rpc_session(session),
                )),
                Err(SessionError::UnknownSession) => {
                    RpcResponse::SessionCommandRun(SessionCommandOutcome::UnknownSession)
                }
                Err(SessionError::NotHost) => {
                    RpcResponse::SessionCommandRun(SessionCommandOutcome::NotHost)
                }
                Err(SessionError::NotDevice) => {
                    RpcResponse::SessionCommandRun(SessionCommandOutcome::NotDevice)
                }
                Err(SessionError::Queue(error)) => {
                    RpcResponse::SessionCommandRun(SessionCommandOutcome::Rejected(
                        RpcFailure::permanent("session.invalidQueueCommand", error.to_string()),
                    ))
                }
                Err(SessionError::Machine(error)) => {
                    RpcResponse::SessionCommandRun(SessionCommandOutcome::Rejected(
                        RpcFailure::permanent("session.invalidTransportCommand", error.to_string()),
                    ))
                }
                Err(error) => RpcResponse::SessionCommandRun(SessionCommandOutcome::Unavailable(
                    session_failure(error),
                )),
            }
        }
    }
}

fn system_status(state: &AppState) -> RpcResponse {
    match state.accounts.count() {
        Ok(account_count) => {
            let (plugin_count, capabilities) = state.plugins.live_summary();
            RpcResponse::SystemStatusGet(SystemStatusOutcome::Ready(RpcSystemStatus {
                version: crate::version().to_string(),
                contract_id: CONTRACT_ID.to_string(),
                account_count: u32::try_from(account_count).unwrap_or(u32::MAX),
                plugin_count: u32::try_from(plugin_count).unwrap_or(u32::MAX),
                capabilities,
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

fn rpc_session(session: Session) -> RpcSession {
    let current_track_id = session.current_track_id().map(str::to_string);
    let stream_path = session.stream_path();
    RpcSession {
        id: session.id,
        name: session.name,
        host_device_id: session.host_device_id,
        queue: session.queue,
        cursor: session.cursor.and_then(|cursor| u32::try_from(cursor).ok()),
        current_track_id,
        stream_path,
        transport: match session.transport {
            Transport::Stopped => RpcTransport::Stopped,
            Transport::Playing => RpcTransport::Playing,
            Transport::Paused => RpcTransport::Paused,
            Transport::Ended => RpcTransport::Ended,
        },
        position_ms: u32::try_from(session.position_ms).unwrap_or(u32::MAX),
        duration_ms: session
            .duration_ms
            .map(|duration| u32::try_from(duration).unwrap_or(u32::MAX)),
        volume: session.volume,
        reachable: session.reachable,
        revision: u32::try_from(session.revision).unwrap_or(u32::MAX),
        updated_at: session.updated_at,
    }
}

fn domain_command(command: RpcSessionCommand) -> DomainSessionCommand {
    match command {
        RpcSessionCommand::QueueAdd(command) => DomainSessionCommand::QueueAdd {
            track_ids: command.track_ids,
        },
        RpcSessionCommand::QueueRemove(command) => DomainSessionCommand::QueueRemove {
            index: usize::try_from(command.index).unwrap_or(usize::MAX),
        },
        RpcSessionCommand::QueueClear(_) => DomainSessionCommand::QueueClear,
        RpcSessionCommand::QueueShuffle(_) => DomainSessionCommand::QueueShuffle,
        RpcSessionCommand::CursorJump(command) => DomainSessionCommand::CursorJump {
            index: usize::try_from(command.index).unwrap_or(usize::MAX),
        },
        RpcSessionCommand::Play(_) => DomainSessionCommand::Play,
        RpcSessionCommand::Pause(_) => DomainSessionCommand::Pause,
        RpcSessionCommand::Stop(_) => DomainSessionCommand::Stop,
        RpcSessionCommand::TrackEnded(_) => DomainSessionCommand::TrackEnded,
        RpcSessionCommand::PositionReport(command) => DomainSessionCommand::PositionReport {
            position_ms: u64::from(command.position_ms),
            duration_ms: command.duration_ms.map(u64::from),
        },
        RpcSessionCommand::VolumeSet(command) => DomainSessionCommand::VolumeSet {
            volume: command.volume,
        },
    }
}

fn auth_required() -> RpcResponse {
    RpcResponse::rejected(RpcFailure::permanent(
        "auth.required",
        "this RPC operation requires a bearer token",
    ))
}

fn session_failure(error: SessionError) -> RpcFailure {
    RpcFailure::retryable("session.unavailable", error.to_string())
}

fn account_failure(error: AccountError) -> RpcFailure {
    RpcFailure::retryable("account.unavailable", error.to_string())
}
