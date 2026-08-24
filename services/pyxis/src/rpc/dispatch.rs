//! Operation dispatch.
//!
//! Transport parsing and authorization end before this module begins. A dispatcher
//! receives a valid request plus its account context and always returns the matching
//! operation tag. Domain failures become operation outcomes rather than framework errors.

use chrono::Utc;

use crate::accounts::{
    Account, AccountError, ApiTokenGrant, AuthContext, AuthGrant, ClaimOutcome, PairOutcome,
    Principal,
};
use crate::api::AppState;
use crate::library::{
    Album, AlbumInput, Bookmark, LibraryError, Placement, Playlist, PlaylistInput, SourceReference,
    TrackInput,
};
use crate::listen::{HotConfig, ListenError, TrackListenInput};
use crate::matching::{Decision, MatchItem, OverrideDecision};
use crate::output_catalog::{OutputError, OutputTopology};
use crate::rpc::contract::{
    AccountCreateOutcome, AccountListOutcome, AlbumAddOutcome, AlbumCommandOutcome,
    AlbumListOutcome, ApiTokenCreateOutcome, BookmarkCommandOutcome, BookmarkListOutcome,
    CommandOutcome, DeviceClaimOutcome, DevicePairOutcome, EmptyRequest, HotAlbumsListOutcome,
    ListenAppendOutcome, ListenHistoryOutcome, MatchingEvaluateOutcome, OutputGroupSetOutcome,
    OutputSessionCreateOutcome, OutputTargetsListOutcome, PairingCreateOutcome,
    PlaylistCreateOutcome, PlaylistListOutcome, PluginListOutcome, RealtimeServerMessage,
    RpcAccount, RpcAlbumCommand, RpcApiToken, RpcApiTokenGrant, RpcAuthGrant, RpcBookmark,
    RpcBookmarkCommand, RpcDevice, RpcFailure, RpcHotAlbum, RpcLibraryAlbum, RpcLibraryTrack,
    RpcListenAppendResult, RpcListenEvent, RpcMatchDecision, RpcMatchItem, RpcMatchResult,
    RpcMatchScore, RpcOutputBinding, RpcOutputGroup, RpcOutputRoom, RpcOutputTopology,
    RpcOverrideDecision, RpcPairingCode, RpcPlacement, RpcPlaylist, RpcPlugin, RpcRealtimeRemoval,
    RpcRealtimeState, RpcRealtimeTopic, RpcRequest, RpcResponse, RpcSearchTrack, RpcSession,
    RpcSessionCommand, RpcSessionDirective, RpcSourceAlbum, RpcSourceAlbumSummary,
    RpcSourceFailure, RpcSourceSearchResult, RpcSystemStatus, RpcTransport, SessionCommandOutcome,
    SessionCommandRequest, SessionCommandSendOutcome, SessionCreateOutcome, SessionHandoffOutcome,
    SessionListOutcome, SessionStateOutcome, SourceAlbumGetOutcome, SourceAlbumSearchOutcome,
    SourceSearchOutcome, SystemStatusOutcome, CONTRACT_ID,
};
use crate::rpc::realtime::Delivery;
use crate::sessions::{
    console, OutputBinding, OutputConfirmation, PreparedOutputCommand, Session,
    SessionCommand as DomainSessionCommand, SessionError, Transport,
};
use crate::source_catalog::SearchOutcome;

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
        RpcRequest::PluginList(_) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let mut plugins = Vec::new();
            for plugin in state.plugins.list() {
                let configured = match state
                    .plugin_credentials
                    .is_configured(&auth.account_id, &plugin.id)
                {
                    Ok(configured) => !plugin.requires_config || configured,
                    Err(error) => {
                        return RpcResponse::PluginList(PluginListOutcome::Unavailable(
                            RpcFailure::retryable("plugin.configUnavailable", error.to_string()),
                        ));
                    }
                };
                plugins.push(RpcPlugin {
                    id: plugin.id,
                    name: plugin.name,
                    version: plugin.version,
                    capabilities: plugin.capabilities,
                    status: plugin.status.as_str().into(),
                    configured,
                    reason: plugin.reason,
                });
            }
            RpcResponse::PluginList(PluginListOutcome::Ready(plugins))
        }
        RpcRequest::OutputTargetsList(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.outputs.discover(&auth, &request.plugin_id) {
                Ok(topology) => {
                    state.sessions.replace_output_reachability(
                        &auth.account_id,
                        &request.plugin_id,
                        safe_output_target_ids(state, &request.plugin_id, &topology),
                    );
                    publish_output_plugin_sessions(state, &auth, &request.plugin_id);
                    RpcResponse::OutputTargetsList(OutputTargetsListOutcome::Ready(
                        rpc_output_topology(request.plugin_id, topology),
                    ))
                }
                Err(error) => {
                    state.sessions.replace_output_reachability(
                        &auth.account_id,
                        &request.plugin_id,
                        Vec::new(),
                    );
                    publish_output_plugin_sessions(state, &auth, &request.plugin_id);
                    RpcResponse::OutputTargetsList(OutputTargetsListOutcome::Unavailable(
                        output_failure(error),
                    ))
                }
            }
        }
        RpcRequest::OutputSessionCreate(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let plugin_id = request.plugin_id.clone();
            state.outputs.serialize_plugin(&plugin_id, || {
                match state.outputs.discover(&auth, &request.plugin_id) {
                    Ok(topology) => {
                        state.sessions.replace_output_reachability(
                            &auth.account_id,
                            &request.plugin_id,
                            safe_output_target_ids(state, &request.plugin_id, &topology),
                        );
                        publish_output_plugin_sessions(state, &auth, &request.plugin_id);
                        let Some(group) = topology.groups.iter().find(|group| {
                            group.rooms.iter().any(|room| room.id == request.target_id)
                        }) else {
                            return RpcResponse::OutputSessionCreate(
                                OutputSessionCreateOutcome::UnknownTarget,
                            );
                        };
                        let output = OutputBinding {
                            plugin_id: request.plugin_id,
                            target_id: group.coordinator_id.clone(),
                        };
                        let room_ids = group
                            .rooms
                            .iter()
                            .map(|room| room.id.as_str())
                            .collect::<std::collections::HashSet<_>>();
                        let existing_sessions = match state.sessions.all_output_sessions() {
                            Ok(sessions) => sessions,
                            Err(error) => {
                                return RpcResponse::OutputSessionCreate(
                                    OutputSessionCreateOutcome::Unavailable(session_failure(error)),
                                );
                            }
                        };
                        let mut occupant = None;
                        for (account_id, session) in existing_sessions {
                            if session.output.as_ref().is_some_and(|binding| {
                                binding.plugin_id == output.plugin_id
                                    && room_ids.contains(binding.target_id.as_str())
                            }) {
                                if account_id != auth.account_id {
                                    return RpcResponse::OutputSessionCreate(
                                        OutputSessionCreateOutcome::Unavailable(output_failure(
                                            OutputError::TargetInUse(
                                                account_id.as_str().to_string(),
                                            ),
                                        )),
                                    );
                                }
                                occupant = Some(session);
                            }
                        }
                        if let Some(existing) = occupant {
                            return RpcResponse::OutputSessionCreate(
                                OutputSessionCreateOutcome::Ready(rpc_session(existing)),
                            );
                        }
                        let newly_claimed = match state
                            .outputs
                            .claim_target(&auth.account_id, &output)
                        {
                            Ok(newly_claimed) => newly_claimed,
                            Err(error) => {
                                return RpcResponse::OutputSessionCreate(
                                    OutputSessionCreateOutcome::Unavailable(output_failure(error)),
                                );
                            }
                        };
                        match state
                            .sessions
                            .create_output(&auth, &request.name, output.clone())
                        {
                            Ok(session) => {
                                let session = rpc_session(session);
                                publish_session(state, &auth, &session);
                                RpcResponse::OutputSessionCreate(OutputSessionCreateOutcome::Ready(
                                    session,
                                ))
                            }
                            Err(error) => {
                                if newly_claimed {
                                    state.outputs.release_target(&auth.account_id, &output);
                                }
                                RpcResponse::OutputSessionCreate(
                                    OutputSessionCreateOutcome::Unavailable(session_failure(error)),
                                )
                            }
                        }
                    }
                    Err(error) => {
                        state.sessions.replace_output_reachability(
                            &auth.account_id,
                            &request.plugin_id,
                            Vec::new(),
                        );
                        publish_output_plugin_sessions(state, &auth, &request.plugin_id);
                        RpcResponse::OutputSessionCreate(OutputSessionCreateOutcome::Unavailable(
                            output_failure(error),
                        ))
                    }
                }
            })
        }
        RpcRequest::OutputGroupSet(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let plugin_id = request.plugin_id.clone();
            state.outputs.serialize_plugin(&plugin_id, || {
                let current_topology = match state.outputs.discover(&auth, &request.plugin_id) {
                    Ok(topology) => topology,
                    Err(error) => {
                        return RpcResponse::OutputGroupSet(OutputGroupSetOutcome::Unavailable(
                            output_failure(error),
                        ));
                    }
                };
                let desired_rooms = request
                    .member_ids
                    .iter()
                    .chain(std::iter::once(&request.coordinator_id))
                    .collect::<std::collections::HashSet<_>>();
                let affected_room_ids = current_topology
                    .groups
                    .iter()
                    .filter(|group| {
                        group
                            .rooms
                            .iter()
                            .any(|room| desired_rooms.contains(&room.id))
                    })
                    .flat_map(|group| group.rooms.iter().map(|room| room.id.as_str()))
                    .collect::<std::collections::HashSet<_>>();
                let existing_sessions = match state.sessions.all_output_sessions() {
                    Ok(sessions) => sessions,
                    Err(error) => {
                        return RpcResponse::OutputGroupSet(OutputGroupSetOutcome::Unavailable(
                            session_failure(error),
                        ));
                    }
                };
                let conflicts = existing_sessions.into_iter().any(|(account_id, session)| {
                    session.output.as_ref().is_some_and(|output| {
                        if output.plugin_id != request.plugin_id
                            || !affected_room_ids.contains(output.target_id.as_str())
                        {
                            return false;
                        }
                        let current_coordinator = current_topology
                            .groups
                            .iter()
                            .find(|group| {
                                group.rooms.iter().any(|room| room.id == output.target_id)
                            })
                            .map(|group| group.coordinator_id.as_str());
                        account_id != auth.account_id
                            || current_coordinator != Some(request.coordinator_id.as_str())
                    })
                });
                if conflicts {
                    return RpcResponse::OutputGroupSet(OutputGroupSetOutcome::Unavailable(
                    RpcFailure::permanent(
                        "output.groupBusy",
                        "the requested regrouping would move a target owned by an output session",
                    ),
                ));
                }
                match state.outputs.set_group(
                    &auth,
                    &request.plugin_id,
                    &request.coordinator_id,
                    &request.member_ids,
                ) {
                    Ok(topology) => {
                        state.sessions.replace_output_reachability(
                            &auth.account_id,
                            &request.plugin_id,
                            safe_output_target_ids(state, &request.plugin_id, &topology),
                        );
                        publish_output_plugin_sessions(state, &auth, &request.plugin_id);
                        RpcResponse::OutputGroupSet(OutputGroupSetOutcome::Ready(
                            rpc_output_topology(request.plugin_id, topology),
                        ))
                    }
                    Err(error) => {
                        if output_error_marks_unreachable(&error) {
                            state.sessions.replace_output_reachability(
                                &auth.account_id,
                                &request.plugin_id,
                                Vec::new(),
                            );
                            publish_output_plugin_sessions(state, &auth, &request.plugin_id);
                        }
                        RpcResponse::OutputGroupSet(OutputGroupSetOutcome::Unavailable(
                            output_failure(error),
                        ))
                    }
                }
            })
        }
        RpcRequest::SessionCreate(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.sessions.create(&auth, &request.name) {
                Ok(session) => {
                    let session = rpc_session(session);
                    publish_session(state, &auth, &session);
                    RpcResponse::SessionCreate(SessionCreateOutcome::Ready(session))
                }
                Err(SessionError::NotDevice) => {
                    RpcResponse::SessionCreate(SessionCreateOutcome::NotDevice)
                }
                Err(error) => RpcResponse::SessionCreate(SessionCreateOutcome::Unavailable(
                    session_failure(error),
                )),
            }
        }
        RpcRequest::SessionList(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            refresh_output_sessions(state, &auth);
            match state.sessions.list(&auth, request.include_unreachable) {
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
            refresh_output_session(state, &auth, &request.session_id);
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
            let command_fingerprint =
                serde_json::to_string(&request.command).expect("session command serializes");
            let command = domain_command(request.command);
            let command_receipt = request
                .command_id
                .as_deref()
                .map(|id| (id, command_fingerprint.as_str()));
            match state
                .sessions
                .command_once(&auth, &request.session_id, command, command_receipt)
            {
                Ok(session) => {
                    let session = rpc_session(session);
                    publish_session(state, &auth, &session);
                    RpcResponse::SessionCommandRun(SessionCommandOutcome::Applied(session))
                }
                Err(SessionError::UnknownSession) => {
                    RpcResponse::SessionCommandRun(SessionCommandOutcome::UnknownSession)
                }
                Err(SessionError::NotHost) => {
                    RpcResponse::SessionCommandRun(SessionCommandOutcome::NotHost)
                }
                Err(SessionError::NotDevice) => {
                    RpcResponse::SessionCommandRun(SessionCommandOutcome::NotDevice)
                }
                Err(SessionError::CommandIdConflict) => RpcResponse::SessionCommandRun(
                    SessionCommandOutcome::Rejected(RpcFailure::permanent(
                        "session.commandIdConflict",
                        "commandId was already used for different command content",
                    )),
                ),
                Err(SessionError::InvalidCommandId) => RpcResponse::SessionCommandRun(
                    SessionCommandOutcome::Rejected(RpcFailure::permanent(
                        "session.invalidCommandId",
                        "commandId must contain 1 to 128 characters",
                    )),
                ),
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
        RpcRequest::SessionCommandSend(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let session = match state.sessions.get(&auth, &request.session_id) {
                Ok(session) => session,
                Err(error) => {
                    return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unavailable(
                        session_failure(error),
                    ))
                }
            };
            if !console::is_console_issuable(&request.command) {
                return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::HostOnly);
            }
            if let Some(output_session) =
                session.as_ref().filter(|session| session.output.is_some())
            {
                return dispatch_output_command(state, &auth, &request, output_session);
            }
            match console::route(session.as_ref()) {
                console::Route::UnknownSession => {
                    RpcResponse::SessionCommandSend(SessionCommandSendOutcome::UnknownSession)
                }
                console::Route::Unreachable => {
                    RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unreachable)
                }
                console::Route::ToHost { device_id } => {
                    if let Some(command_id) = request.command_id.as_deref() {
                        let fingerprint = serde_json::to_string(&request.command)
                            .expect("session command serializes");
                        if let Err(error) = state.sessions.reserve_command(
                            &auth,
                            &request.session_id,
                            command_id,
                            &fingerprint,
                        ) {
                            let failure = match error {
                                SessionError::CommandIdConflict => RpcFailure::permanent(
                                    "session.commandIdConflict",
                                    "commandId was already used for different command content",
                                ),
                                SessionError::InvalidCommandId => RpcFailure::permanent(
                                    "session.invalidCommandId",
                                    "commandId must contain 1 to 128 characters",
                                ),
                                other => session_failure(other),
                            };
                            return RpcResponse::SessionCommandSend(
                                SessionCommandSendOutcome::Unavailable(failure),
                            );
                        }
                    }
                    match state.realtime.deliver(
                        &device_id,
                        directive(
                            &request.session_id,
                            request.command.clone(),
                            auth.principal_id(),
                            request.command_id.as_deref(),
                        ),
                    ) {
                        Delivery::Sent => {
                            RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Dispatched)
                        }
                        // The host's socket closed between the reachability read and the
                        // delivery attempt.
                        Delivery::NoSocket => {
                            RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unreachable)
                        }
                        Delivery::Full => {
                            RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Busy)
                        }
                    }
                }
            }
        }
        RpcRequest::SessionHandoff(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let source = state.sessions.get(&auth, &request.session_id);
            let target = state.sessions.get(&auth, &request.target_session_id);
            if matches!(source, Ok(Some(ref session)) if session.output.is_some())
                || matches!(target, Ok(Some(ref session)) if session.output.is_some())
            {
                return RpcResponse::SessionHandoff(SessionHandoffOutcome::OutputUnsupported);
            }
            match state
                .sessions
                .handoff(&auth, &request.session_id, &request.target_session_id)
            {
                Ok((source, target)) => {
                    // Tell the source host directly, not only through the sessions topic.
                    // A host is not required to subscribe to anything, and one that keeps
                    // playing a queue the store has already moved is the exact failure
                    // handoff exists to prevent.
                    state.realtime.deliver(
                        &source.host_device_id,
                        directive(
                            &source.id,
                            RpcSessionCommand::Stop(EmptyRequest {}),
                            auth.principal_id(),
                            None,
                        ),
                    );
                    let source = rpc_session(source);
                    let target = rpc_session(target);
                    publish_session(state, &auth, &source);
                    publish_session(state, &auth, &target);
                    RpcResponse::SessionHandoff(SessionHandoffOutcome::Ready(target))
                }
                Err(SessionError::UnknownSession) => {
                    RpcResponse::SessionHandoff(SessionHandoffOutcome::UnknownSession)
                }
                Err(SessionError::UnknownTarget) => {
                    RpcResponse::SessionHandoff(SessionHandoffOutcome::UnknownTarget)
                }
                Err(SessionError::SourceUnreachable) => {
                    RpcResponse::SessionHandoff(SessionHandoffOutcome::SourceUnreachable)
                }
                Err(SessionError::TargetUnreachable) => {
                    RpcResponse::SessionHandoff(SessionHandoffOutcome::TargetUnreachable)
                }
                Err(SessionError::TargetBusy) => {
                    RpcResponse::SessionHandoff(SessionHandoffOutcome::TargetBusy)
                }
                Err(SessionError::SameSession) => {
                    RpcResponse::SessionHandoff(SessionHandoffOutcome::SameSession)
                }
                Err(error) => RpcResponse::SessionHandoff(SessionHandoffOutcome::Unavailable(
                    session_failure(error),
                )),
            }
        }
        RpcRequest::SourceSearchRun(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let query = request.query.trim();
            if query.is_empty() {
                return RpcResponse::SourceSearchRun(SourceSearchOutcome::Unavailable(
                    RpcFailure::permanent("source.invalidQuery", "search query cannot be empty"),
                ));
            }
            let limit = request.limit.unwrap_or(10).clamp(1, 50);
            match state.sources.search(&auth, query, limit) {
                Ok(SearchOutcome::NoSources) => {
                    RpcResponse::SourceSearchRun(SourceSearchOutcome::NoSources)
                }
                Ok(SearchOutcome::Ready { tracks, failures }) => RpcResponse::SourceSearchRun(
                    SourceSearchOutcome::Ready(RpcSourceSearchResult {
                        tracks: tracks
                            .into_iter()
                            .map(|track| RpcSearchTrack {
                                id: track.id,
                                title: track.title,
                                artist: track.artist,
                                album: track.album,
                                duration_ms: track.duration_ms,
                                track_number: track.track_number,
                                artwork_url: track.artwork_url,
                                source_plugin_id: track.source_plugin_id,
                            })
                            .collect(),
                        failures: failures
                            .into_iter()
                            .map(|failure| RpcSourceFailure {
                                plugin_id: failure.plugin_id,
                                failure: RpcFailure {
                                    code: failure.code,
                                    message: failure.message,
                                    retryable: failure.retryable,
                                },
                            })
                            .collect(),
                    }),
                ),
                Err(error) => RpcResponse::SourceSearchRun(SourceSearchOutcome::Unavailable(
                    RpcFailure::retryable("source.unavailable", error.to_string()),
                )),
            }
        }
        RpcRequest::LibraryAlbumAdd(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let input = AlbumInput {
                title: request.title,
                artist: request.artist,
                year: request.year,
                source_reference: request.source_reference.map(|reference| SourceReference {
                    plugin_id: reference.plugin_id,
                    external_id: reference.external_id,
                }),
                tracks: request
                    .tracks
                    .into_iter()
                    .map(|track| TrackInput {
                        id: track.id,
                        title: track.title,
                        artist: track.artist,
                        duration_ms: track.duration_ms,
                        track_number: track.track_number,
                    })
                    .collect(),
            };
            match state
                .library
                .add_album(&auth.account_id, input, auth.principal_id())
            {
                Ok(album) => {
                    let album = rpc_album(album);
                    publish_album(state, &auth, &album);
                    RpcResponse::LibraryAlbumAdd(AlbumAddOutcome::Ready(album))
                }
                Err(LibraryError::InvalidAlbum) => {
                    RpcResponse::LibraryAlbumAdd(AlbumAddOutcome::Invalid(RpcFailure::permanent(
                        "library.invalidAlbum",
                        "album title and artist are required",
                    )))
                }
                Err(error) => RpcResponse::LibraryAlbumAdd(AlbumAddOutcome::Unavailable(
                    library_failure(error),
                )),
            }
        }
        RpcRequest::LibraryAlbumsList(_) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.library.list_albums(&auth.account_id) {
                Ok(albums) => RpcResponse::LibraryAlbumsList(AlbumListOutcome::Ready(
                    albums.into_iter().map(rpc_album).collect(),
                )),
                Err(error) => RpcResponse::LibraryAlbumsList(AlbumListOutcome::Unavailable(
                    library_failure(error),
                )),
            }
        }
        RpcRequest::LibraryAlbumCommandRun(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match request.command {
                RpcAlbumCommand::PlacementSet(command) => {
                    let placement = placement(command.placement);
                    match state.library.set_placement(
                        &auth.account_id,
                        &request.album_id,
                        placement,
                        auth.principal_id(),
                    ) {
                        Ok(Some(album)) => {
                            let album = rpc_album(album);
                            publish_album(state, &auth, &album);
                            RpcResponse::LibraryAlbumCommandRun(AlbumCommandOutcome::Applied(album))
                        }
                        Ok(None) => {
                            RpcResponse::LibraryAlbumCommandRun(AlbumCommandOutcome::Unknown)
                        }
                        Err(error) => RpcResponse::LibraryAlbumCommandRun(
                            AlbumCommandOutcome::Unavailable(library_failure(error)),
                        ),
                    }
                }
                RpcAlbumCommand::Remove(_) => {
                    match state
                        .library
                        .remove_album(&auth.account_id, &request.album_id)
                    {
                        Ok(true) => {
                            state.realtime.publish(
                                &auth.account_id,
                                RpcRealtimeTopic::Library,
                                RpcRealtimeState::LibraryAlbumRemoved(RpcRealtimeRemoval {
                                    id: request.album_id.clone(),
                                }),
                            );
                            RpcResponse::LibraryAlbumCommandRun(AlbumCommandOutcome::Removed)
                        }
                        Ok(false) => {
                            RpcResponse::LibraryAlbumCommandRun(AlbumCommandOutcome::Unknown)
                        }
                        Err(error) => RpcResponse::LibraryAlbumCommandRun(
                            AlbumCommandOutcome::Unavailable(library_failure(error)),
                        ),
                    }
                }
            }
        }
        RpcRequest::LibraryBookmarksList(_) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.library.list_bookmarks(&auth.account_id) {
                Ok(bookmarks) => RpcResponse::LibraryBookmarksList(BookmarkListOutcome::Ready(
                    bookmarks.into_iter().map(rpc_bookmark).collect(),
                )),
                Err(error) => RpcResponse::LibraryBookmarksList(BookmarkListOutcome::Unavailable(
                    library_failure(error),
                )),
            }
        }
        RpcRequest::LibraryBookmarkCommandRun(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match request.command {
                RpcBookmarkCommand::Add(_) => match state.library.add_bookmark(
                    &auth.account_id,
                    &request.track_id,
                    auth.principal_id(),
                ) {
                    Ok(bookmark) => RpcResponse::LibraryBookmarkCommandRun(
                        BookmarkCommandOutcome::Added(rpc_bookmark(bookmark)),
                    ),
                    Err(error) => RpcResponse::LibraryBookmarkCommandRun(
                        BookmarkCommandOutcome::Unavailable(library_failure(error)),
                    ),
                },
                RpcBookmarkCommand::Remove(_) => {
                    match state
                        .library
                        .remove_bookmark(&auth.account_id, &request.track_id)
                    {
                        Ok(true) => {
                            RpcResponse::LibraryBookmarkCommandRun(BookmarkCommandOutcome::Removed)
                        }
                        Ok(false) => {
                            RpcResponse::LibraryBookmarkCommandRun(BookmarkCommandOutcome::Unknown)
                        }
                        Err(error) => RpcResponse::LibraryBookmarkCommandRun(
                            BookmarkCommandOutcome::Unavailable(library_failure(error)),
                        ),
                    }
                }
            }
        }
        RpcRequest::LibraryPlaylistCreate(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.library.create_playlist(
                &auth.account_id,
                PlaylistInput {
                    title: request.title,
                    track_ids: request.track_ids,
                },
                auth.principal_id(),
            ) {
                Ok(playlist) => RpcResponse::LibraryPlaylistCreate(PlaylistCreateOutcome::Ready(
                    rpc_playlist(playlist),
                )),
                Err(error) => RpcResponse::LibraryPlaylistCreate(
                    PlaylistCreateOutcome::Unavailable(library_failure(error)),
                ),
            }
        }
        RpcRequest::LibraryPlaylistsList(_) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.library.list_playlists(&auth.account_id) {
                Ok(playlists) => RpcResponse::LibraryPlaylistsList(PlaylistListOutcome::Ready(
                    playlists.into_iter().map(rpc_playlist).collect(),
                )),
                Err(error) => RpcResponse::LibraryPlaylistsList(PlaylistListOutcome::Unavailable(
                    library_failure(error),
                )),
            }
        }
        RpcRequest::ListenEventsAppend(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            if let Principal::Device { id } = &auth.principal {
                if request.events.iter().any(|event| &event.device_id != id) {
                    return RpcResponse::ListenEventsAppend(ListenAppendOutcome::Invalid(
                        RpcFailure::permanent(
                            "listen.deviceMismatch",
                            "a device token can only append its own events",
                        ),
                    ));
                }
            }
            let events = request
                .events
                .into_iter()
                .map(|event| TrackListenInput {
                    id: event.id,
                    track_id: event.track_id,
                    album_id: event.album_id,
                    device_id: event.device_id,
                    source_plugin_id: event.source_plugin_id,
                    listened_at: event.listened_at,
                    played_ms: event.played_ms.map(u64::from),
                    completed: event.completed,
                    context: event.context,
                    context_id: event.context_id,
                })
                .collect();
            match state
                .listen
                .append_batch(&auth.account_id, events, auth.principal_id())
            {
                Ok(result) => RpcResponse::ListenEventsAppend(ListenAppendOutcome::Ready(
                    RpcListenAppendResult {
                        accepted: u32::try_from(result.accepted).unwrap_or(u32::MAX),
                        duplicates: u32::try_from(result.duplicates).unwrap_or(u32::MAX),
                    },
                )),
                Err(ListenError::InvalidEventId(_) | ListenError::InvalidTime(_)) => {
                    RpcResponse::ListenEventsAppend(ListenAppendOutcome::Invalid(
                        RpcFailure::permanent("listen.invalidEvent", "listen event is invalid"),
                    ))
                }
                Err(ListenError::EventIdConflict(id)) => RpcResponse::ListenEventsAppend(
                    ListenAppendOutcome::Conflict(RpcFailure::permanent(
                        "listen.eventIdConflict",
                        format!("event id '{id}' has different content"),
                    )),
                ),
                Err(error) => RpcResponse::ListenEventsAppend(ListenAppendOutcome::Unavailable(
                    listen_failure(error),
                )),
            }
        }
        RpcRequest::ListenHistoryList(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let limit = usize::try_from(request.limit.unwrap_or(100).min(1000)).unwrap_or(1000);
            match state.listen.history(&auth.account_id, limit) {
                Ok(events) => RpcResponse::ListenHistoryList(ListenHistoryOutcome::Ready(
                    events
                        .into_iter()
                        .map(|event| RpcListenEvent {
                            id: event.id,
                            track_id: event.track_id,
                            album_id: event.album_id,
                            device_id: event.device_id,
                            source_plugin_id: event.source_plugin_id,
                            listened_at: event.listened_at,
                            played_ms: event
                                .played_ms
                                .map(|played| u32::try_from(played).unwrap_or(u32::MAX)),
                            completed: event.completed,
                            context: event.context,
                            context_id: event.context_id,
                        })
                        .collect(),
                )),
                Err(error) => RpcResponse::ListenHistoryList(ListenHistoryOutcome::Unavailable(
                    listen_failure(error),
                )),
            }
        }
        RpcRequest::LibraryHotAlbumsList(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let config = HotConfig {
                min_recent_listens: request.min_recent_listens.unwrap_or(3),
                window_days: u64::from(request.window_days.unwrap_or(30)),
            };
            match state
                .projections
                .rebuild_hot(&auth.account_id, config, Utc::now())
            {
                Ok(albums) => RpcResponse::LibraryHotAlbumsList(HotAlbumsListOutcome::Ready(
                    albums
                        .into_iter()
                        .map(|album| RpcHotAlbum {
                            album_id: album.album_id,
                            listen_count: album.listen_count,
                            window_start: album.window_start,
                            computed_at: album.computed_at,
                        })
                        .collect(),
                )),
                Err(error) => RpcResponse::LibraryHotAlbumsList(HotAlbumsListOutcome::Unavailable(
                    listen_failure(error),
                )),
            }
        }
        RpcRequest::MatchingEvaluate(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.matcher.decide(
                &auth.account_id,
                &match_item(request.left),
                &match_item(request.right),
            ) {
                Ok(result) => {
                    RpcResponse::MatchingEvaluate(MatchingEvaluateOutcome::Ready(RpcMatchResult {
                        decision: match result.decision {
                            Decision::AutoMerge => RpcMatchDecision::AutoMerge,
                            Decision::Review => RpcMatchDecision::Review,
                            Decision::Reject => RpcMatchDecision::Reject,
                            Decision::ManualMerge => RpcMatchDecision::ManualMerge,
                            Decision::ManualSplit => RpcMatchDecision::ManualSplit,
                        },
                        score: RpcMatchScore {
                            overall: result.score.overall,
                            artist: result.score.artist,
                            title: result.score.title,
                            album: result.score.album,
                            duration: result.score.duration,
                            year: result.score.year,
                            coverage: result.score.coverage,
                            variant_conflict: result.score.variant_conflict,
                        },
                    }))
                }
                Err(error) => RpcResponse::MatchingEvaluate(MatchingEvaluateOutcome::Unavailable(
                    RpcFailure::retryable("matching.unavailable", error.to_string()),
                )),
            }
        }
        RpcRequest::MatchingOverrideSet(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let decision = match request.decision {
                RpcOverrideDecision::Merge => OverrideDecision::Merge,
                RpcOverrideDecision::Split => OverrideDecision::Split,
            };
            match state.matcher.set_override(
                &auth.account_id,
                &request.left_id,
                &request.right_id,
                decision,
                auth.principal_id(),
            ) {
                Ok(()) => RpcResponse::MatchingOverrideSet(CommandOutcome::Succeeded),
                Err(error) => RpcResponse::MatchingOverrideSet(CommandOutcome::Unavailable(
                    RpcFailure::retryable("matching.unavailable", error.to_string()),
                )),
            }
        }
        RpcRequest::MatchingOverrideRemove(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.matcher.remove_override(
                &auth.account_id,
                &request.left_id,
                &request.right_id,
            ) {
                Ok(true) => RpcResponse::MatchingOverrideRemove(CommandOutcome::Succeeded),
                Ok(false) => RpcResponse::MatchingOverrideRemove(CommandOutcome::Unknown),
                Err(error) => RpcResponse::MatchingOverrideRemove(CommandOutcome::Unavailable(
                    RpcFailure::retryable("matching.unavailable", error.to_string()),
                )),
            }
        }
        RpcRequest::PluginConfigSet(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.plugin_credentials.set(
                &auth.account_id,
                &request.plugin_id,
                &request.config,
                auth.principal_id(),
            ) {
                Ok(()) => RpcResponse::PluginConfigSet(CommandOutcome::Succeeded),
                Err(error) => RpcResponse::PluginConfigSet(CommandOutcome::Unavailable(
                    RpcFailure::retryable("plugin.configUnavailable", error.to_string()),
                )),
            }
        }
        RpcRequest::PluginConfigRemove(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state
                .plugin_credentials
                .remove(&auth.account_id, &request.plugin_id)
            {
                Ok(true) => RpcResponse::PluginConfigRemove(CommandOutcome::Succeeded),
                Ok(false) => RpcResponse::PluginConfigRemove(CommandOutcome::Unknown),
                Err(error) => RpcResponse::PluginConfigRemove(CommandOutcome::Unavailable(
                    RpcFailure::retryable("plugin.configUnavailable", error.to_string()),
                )),
            }
        }
        RpcRequest::SourceAlbumSearch(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state
                .sources
                .search_albums(&auth, &request.plugin_id, &request.query)
            {
                Ok(albums) => RpcResponse::SourceAlbumSearch(SourceAlbumSearchOutcome::Ready(
                    albums
                        .into_iter()
                        .map(|album| RpcSourceAlbumSummary {
                            external_id: album.external_id,
                            title: album.title,
                            artist: album.artist,
                            year: album.year,
                            artwork_url: album.artwork_url,
                            source_plugin_id: album.source_plugin_id,
                        })
                        .collect(),
                )),
                Err(error) => RpcResponse::SourceAlbumSearch(
                    SourceAlbumSearchOutcome::Unavailable(source_album_failure(error)),
                ),
            }
        }
        RpcRequest::SourceAlbumGet(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state
                .sources
                .get_album(&auth, &request.plugin_id, &request.external_id)
            {
                Ok(album) => {
                    RpcResponse::SourceAlbumGet(SourceAlbumGetOutcome::Ready(RpcSourceAlbum {
                        external_id: album.external_id,
                        title: album.title,
                        artist: album.artist,
                        year: album.year,
                        artwork_url: album.artwork_url,
                        source_plugin_id: album.source_plugin_id,
                        tracks: album
                            .tracks
                            .into_iter()
                            .map(|track| RpcSearchTrack {
                                id: track.id,
                                title: track.title,
                                artist: track.artist,
                                album: track.album,
                                duration_ms: track.duration_ms,
                                track_number: track.track_number,
                                artwork_url: track.artwork_url,
                                source_plugin_id: track.source_plugin_id,
                            })
                            .collect(),
                    }))
                }
                Err(error) => RpcResponse::SourceAlbumGet(SourceAlbumGetOutcome::Unavailable(
                    source_album_failure(error),
                )),
            }
        }
    }
}

fn dispatch_output_command(
    state: &AppState,
    auth: &AuthContext,
    request: &SessionCommandRequest,
    session: &Session,
) -> RpcResponse {
    let output = session.output.as_ref().expect("output session has binding");
    state.outputs.serialize_plugin(&output.plugin_id, || {
        if let Err(error) = state.outputs.claim_target(&auth.account_id, output) {
            return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unavailable(
                output_failure(error),
            ));
        }
        let topology = match state.outputs.discover(auth, &output.plugin_id) {
            Ok(topology) => topology,
            Err(error) => {
                state.sessions.replace_output_reachability(
                    &auth.account_id,
                    &output.plugin_id,
                    Vec::new(),
                );
                publish_output_session(state, auth, &session.id);
                return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unavailable(
                    output_failure(error),
                ));
            }
        };
        let reachable = safe_output_target_ids(state, &output.plugin_id, &topology);
        state.sessions.replace_output_reachability(
            &auth.account_id,
            &output.plugin_id,
            reachable.clone(),
        );
        if !reachable.iter().any(|target| target == &output.target_id) {
            publish_output_session(state, auth, &session.id);
            return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unreachable);
        }
        state.outputs.serialize_target(output, || {
            dispatch_output_command_locked(state, auth, request)
        })
    })
}

fn dispatch_output_command_locked(
    state: &AppState,
    auth: &AuthContext,
    request: &SessionCommandRequest,
) -> RpcResponse {
    let command_id = request
        .command_id
        .clone()
        .unwrap_or_else(|| ulid::Ulid::new().to_string());
    let fingerprint = serde_json::to_string(&request.command).expect("session command serializes");
    let command = domain_command(request.command.clone());
    let prepared = match state.sessions.prepare_output_command(
        auth,
        &request.session_id,
        &command,
        &command_id,
        &fingerprint,
    ) {
        Ok(prepared) => prepared,
        Err(SessionError::UnknownSession) => {
            return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::UnknownSession)
        }
        Err(error) => {
            return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unavailable(
                output_session_failure(error),
            ))
        }
    };
    let PreparedOutputCommand::Ready {
        current,
        next,
        output,
    } = prepared
    else {
        return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Dispatched);
    };
    if !current.reachable {
        return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unreachable);
    }
    let effect = match state.outputs.apply_effect(
        auth,
        &request.session_id,
        &output,
        &current,
        &next,
        &command,
    ) {
        Ok(effect) => effect,
        Err(error) => {
            if output_error_marks_unreachable(&error) {
                state
                    .sessions
                    .set_output_reachable(&auth.account_id, &output, false);
                publish_output_session(state, auth, &request.session_id);
            }
            return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unavailable(
                output_failure(error),
            ));
        }
    };
    match state.sessions.commit_output_command(
        auth,
        &request.session_id,
        &command,
        &command_id,
        &fingerprint,
        OutputConfirmation {
            position_ms: effect.commit_position_ms,
            duration_ms: effect.commit_duration_ms,
        },
    ) {
        Ok(session) => {
            state
                .sessions
                .set_output_reachable(&auth.account_id, &output, true);
            let session = rpc_session(session);
            publish_session(state, auth, &session);
            RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Dispatched)
        }
        Err(error) => {
            let failure = output_session_failure(error);
            if effect.physical {
                let mut rollback_session = (*current).clone();
                if let Some(transport) = effect.rollback_transport {
                    rollback_session.transport = transport;
                }
                if let Some(position_ms) = effect.rollback_position_ms {
                    rollback_session.position_ms = position_ms;
                }
                if effect.rollback_duration_ms.is_some() {
                    rollback_session.duration_ms = effect.rollback_duration_ms;
                }
                if let Err(rollback) = state.outputs.restore_session(
                    auth,
                    &request.session_id,
                    &output,
                    &rollback_session,
                ) {
                    return RpcResponse::SessionCommandSend(
                        SessionCommandSendOutcome::Unavailable(RpcFailure::retryable(
                            "output.rollbackFailed",
                            format!("{}; speaker rollback failed: {rollback}", failure.message),
                        )),
                    );
                }
            }
            RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unavailable(failure))
        }
    }
}

fn output_session_failure(error: SessionError) -> RpcFailure {
    match error {
        SessionError::CommandIdConflict => RpcFailure::permanent(
            "session.commandIdConflict",
            "commandId was already used for different command content",
        ),
        SessionError::InvalidCommandId => RpcFailure::permanent(
            "session.invalidCommandId",
            "commandId must contain 1 to 128 characters",
        ),
        SessionError::Queue(error) => {
            RpcFailure::permanent("session.invalidQueueCommand", error.to_string())
        }
        SessionError::Machine(error) => {
            RpcFailure::permanent("session.invalidTransportCommand", error.to_string())
        }
        other => session_failure(other),
    }
}

fn output_error_marks_unreachable(error: &OutputError) -> bool {
    use crate::plugins::host::PluginCallError;

    match error {
        OutputError::Plugin(
            PluginCallError::Unavailable { .. }
            | PluginCallError::ProcessExited { .. }
            | PluginCallError::Timeout { .. },
        ) => true,
        OutputError::Plugin(PluginCallError::Plugin {
            code, retryable, ..
        }) => *retryable && code == "sonos.targetUnavailable",
        _ => false,
    }
}

fn safe_output_target_ids(
    state: &AppState,
    plugin_id: &str,
    topology: &OutputTopology,
) -> Vec<String> {
    let Ok(sessions) = state.sessions.all_output_sessions() else {
        return Vec::new();
    };
    let bindings = sessions
        .into_iter()
        .filter_map(|(_, session)| session.output)
        .filter(|output| output.plugin_id == plugin_id)
        .collect::<Vec<_>>();
    topology
        .groups
        .iter()
        .filter(|group| {
            let room_ids = group
                .rooms
                .iter()
                .map(|room| room.id.as_str())
                .collect::<std::collections::HashSet<_>>();
            bindings
                .iter()
                .filter(|output| room_ids.contains(output.target_id.as_str()))
                .count()
                <= 1
        })
        .flat_map(|group| group.rooms.iter().map(|room| room.id.clone()))
        .collect()
}

pub(crate) fn reconcile_all_output_sessions(state: &AppState) {
    let Ok(sessions) = state.sessions.all_output_sessions() else {
        return;
    };
    let mut groups = std::collections::HashMap::<_, Vec<Session>>::new();
    for (account_id, session) in sessions {
        let Some(output) = &session.output else {
            continue;
        };
        groups
            .entry((account_id, output.plugin_id.clone()))
            .or_default()
            .push(session);
    }
    for ((account_id, plugin_id), sessions) in groups {
        let auth = AuthContext {
            account_id,
            principal: Principal::ApiToken {
                id: "core-output-monitor".into(),
                scopes: Vec::new(),
            },
        };
        state.outputs.serialize_plugin(&plugin_id, || {
            let target_ids = match state.outputs.discover(&auth, &plugin_id) {
                Ok(topology) => safe_output_target_ids(state, &plugin_id, &topology),
                Err(_) => Vec::new(),
            };
            state
                .sessions
                .replace_output_reachability(&auth.account_id, &plugin_id, target_ids);
            for session in sessions {
                if let Ok(Some(current)) = state.sessions.get(&auth, &session.id) {
                    if let Some(output) = current.output.clone() {
                        if current.reachable
                            && state
                                .outputs
                                .claim_target(&auth.account_id, &output)
                                .is_ok()
                        {
                            refresh_one_output_session_locked(state, &auth, &current, &output);
                        }
                    }
                    publish_output_session(state, &auth, &session.id);
                }
            }
        });
    }
}

fn refresh_output_sessions(state: &AppState, auth: &AuthContext) {
    if let Ok(sessions) = state.sessions.list(auth, true) {
        for session in sessions
            .into_iter()
            .filter(|session| session.output.is_some())
        {
            refresh_one_output_session(state, auth, session);
        }
    }
}

fn refresh_output_session(state: &AppState, auth: &AuthContext, session_id: &str) {
    if let Ok(Some(session)) = state.sessions.get(auth, session_id) {
        if session.output.is_some() {
            refresh_one_output_session(state, auth, session);
        }
    }
}

fn refresh_one_output_session(state: &AppState, auth: &AuthContext, session: Session) {
    let Some(output) = session.output.clone() else {
        return;
    };
    if !session.reachable
        || state
            .outputs
            .claim_target(&auth.account_id, &output)
            .is_err()
    {
        return;
    }
    state.outputs.serialize_plugin(&output.plugin_id, || {
        refresh_one_output_session_locked(state, auth, &session, &output);
    });
}

fn refresh_one_output_session_locked(
    state: &AppState,
    auth: &AuthContext,
    session: &Session,
    output: &OutputBinding,
) {
    state.outputs.serialize_target(output, || {
        let Ok(Some(session)) = state.sessions.get(auth, &session.id) else {
            return;
        };
        let physical = match state.outputs.state(auth, output) {
            Ok(physical) => physical,
            Err(_) => {
                state
                    .sessions
                    .set_output_reachable(&auth.account_id, output, false);
                publish_output_session(state, auth, &session.id);
                return;
            }
        };
        let owns_stream =
            state
                .outputs
                .stream_belongs_to(&session.id, output, physical.stream_url.as_deref());
        let (transport, position_ms, duration_ms) = if !owns_stream {
            (Transport::Stopped, Some(0), session.duration_ms)
        } else {
            match physical.state.as_str() {
                "PLAYING" => (
                    Transport::Playing,
                    physical.position_ms,
                    physical.duration_ms,
                ),
                "PAUSED_PLAYBACK" => (
                    Transport::Paused,
                    physical.position_ms,
                    physical.duration_ms,
                ),
                "STOPPED"
                    if session.transport == Transport::Playing
                        && physical.position_ms.zip(physical.duration_ms).is_some_and(
                            |(position, duration)| position.saturating_add(2_000) >= duration,
                        ) =>
                {
                    (Transport::Ended, physical.position_ms, physical.duration_ms)
                }
                "STOPPED" => (Transport::Stopped, Some(0), physical.duration_ms),
                _ => return,
            }
        };
        if let Ok(updated) = state.sessions.reconcile_output_state(
            auth,
            &session.id,
            transport,
            position_ms,
            duration_ms,
        ) {
            if updated.revision != session.revision {
                publish_session(state, auth, &rpc_session(updated));
            }
        }
    });
}

fn publish_output_plugin_sessions(state: &AppState, auth: &AuthContext, plugin_id: &str) {
    if let Ok(sessions) = state.sessions.list(auth, true) {
        for session in sessions.into_iter().filter(|session| {
            session
                .output
                .as_ref()
                .is_some_and(|output| output.plugin_id == plugin_id)
        }) {
            publish_session(state, auth, &rpc_session(session));
        }
    }
}

fn publish_output_session(state: &AppState, auth: &AuthContext, session_id: &str) {
    if let Ok(Some(session)) = state.sessions.get(auth, session_id) {
        publish_session(state, auth, &rpc_session(session));
    }
}

fn output_failure(error: OutputError) -> RpcFailure {
    use crate::plugins::host::PluginCallError;

    match error {
        OutputError::Plugin(plugin_error) => match plugin_error {
            PluginCallError::Plugin {
                code,
                message,
                retryable,
                ..
            } => RpcFailure {
                code,
                message,
                retryable,
            },
            PluginCallError::CapabilityUnavailable { .. } | PluginCallError::Protocol { .. } => {
                RpcFailure::permanent("output.unavailable", plugin_error.to_string())
            }
            PluginCallError::Unavailable { .. }
            | PluginCallError::ProcessExited { .. }
            | PluginCallError::Timeout { .. } => {
                RpcFailure::retryable("output.unavailable", plugin_error.to_string())
            }
        },
        OutputError::InvalidOutput(message) => {
            RpcFailure::permanent("output.invalidResponse", message)
        }
        OutputError::UnknownTarget(target) => RpcFailure::permanent("output.unknownTarget", target),
        OutputError::TargetInUse(account) => RpcFailure::permanent(
            "output.targetInUse",
            format!("output target is already owned by account '{account}'"),
        ),
        OutputError::RendererOwnershipLost => RpcFailure::permanent(
            "output.rendererOwnershipLost",
            "the renderer is playing a different stream; press Play to take it over explicitly",
        ),
        OutputError::LanUrlRequired => RpcFailure::permanent(
            "output.lanUrlRequired",
            "PYXIS_LAN_BASE_URL must be configured before an output can play",
        ),
        OutputError::Credentials(error) => {
            RpcFailure::retryable("output.configUnavailable", error.to_string())
        }
        OutputError::Library(error) => {
            RpcFailure::retryable("output.libraryUnavailable", error.to_string())
        }
        OutputError::Media(error) => {
            RpcFailure::retryable("output.mediaUnavailable", error.to_string())
        }
    }
}

fn source_album_failure(error: crate::source_catalog::SourceCatalogError) -> RpcFailure {
    use crate::db::store::StoreError;
    use crate::plugin_credentials::CredentialError;
    use crate::plugins::host::PluginCallError;
    use crate::source_catalog::SourceCatalogError;

    match error {
        SourceCatalogError::Plugin(plugin_error) => match plugin_error {
            PluginCallError::Unavailable { ref reason, .. }
                if reason == "plugin is not installed" =>
            {
                RpcFailure::permanent("source.albumUnavailable", plugin_error.to_string())
            }
            PluginCallError::Unavailable { .. }
            | PluginCallError::ProcessExited { .. }
            | PluginCallError::Timeout { .. }
            | PluginCallError::Plugin {
                retryable: true, ..
            } => RpcFailure::retryable("source.albumUnavailable", plugin_error.to_string()),
            PluginCallError::CapabilityUnavailable { .. }
            | PluginCallError::Protocol { .. }
            | PluginCallError::Plugin {
                retryable: false, ..
            } => RpcFailure::permanent("source.albumUnavailable", plugin_error.to_string()),
        },
        SourceCatalogError::InvalidOutput(message) => {
            RpcFailure::permanent("source.albumInvalidOutput", message)
        }
        SourceCatalogError::Media(error) => {
            RpcFailure::retryable("source.albumMediaUnavailable", error.to_string())
        }
        SourceCatalogError::Credentials(error) => match error {
            CredentialError::Store(StoreError::Decode { .. } | StoreError::NotAnObject { .. }) => {
                RpcFailure::permanent("source.albumCredentialsInvalid", error.to_string())
            }
            CredentialError::Store(StoreError::Engine(_)) | CredentialError::Io(_) => {
                RpcFailure::retryable("source.albumCredentialsUnavailable", error.to_string())
            }
            CredentialError::InvalidKey
            | CredentialError::Encode(_)
            | CredentialError::Encrypt
            | CredentialError::Decrypt
            | CredentialError::InvalidEncoding => {
                RpcFailure::permanent("source.albumCredentialsInvalid", error.to_string())
            }
        },
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

/// One addressed command, uniquely identified so a host that reconnects mid-delivery can
/// discard a repeat instead of applying it twice.
fn directive(
    session_id: &str,
    command: RpcSessionCommand,
    issued_by: &str,
    directive_id: Option<&str>,
) -> RealtimeServerMessage {
    RealtimeServerMessage::Command(RpcSessionDirective {
        session_id: session_id.to_string(),
        command,
        issued_by: issued_by.to_string(),
        directive_id: directive_id
            .map(str::to_string)
            .unwrap_or_else(|| ulid::Ulid::new().to_string()),
    })
}

/// Publish after the write succeeded, never before. A subscriber must not see state that
/// the store rejected.
fn publish_session(state: &AppState, auth: &AuthContext, session: &RpcSession) {
    state.realtime.publish(
        &auth.account_id,
        RpcRealtimeTopic::Sessions,
        RpcRealtimeState::SessionState(session.clone()),
    );
}

fn publish_album(state: &AppState, auth: &AuthContext, album: &RpcLibraryAlbum) {
    state.realtime.publish(
        &auth.account_id,
        RpcRealtimeTopic::Library,
        RpcRealtimeState::LibraryAlbumState(album.clone()),
    );
}

pub(crate) fn rpc_session(session: Session) -> RpcSession {
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
        output: session.output.map(|output| RpcOutputBinding {
            plugin_id: output.plugin_id,
            target_id: output.target_id,
        }),
        reachable: session.reachable,
        revision: u32::try_from(session.revision).unwrap_or(u32::MAX),
        updated_at: session.updated_at,
    }
}

fn rpc_output_topology(plugin_id: String, topology: OutputTopology) -> RpcOutputTopology {
    RpcOutputTopology {
        plugin_id,
        groups: topology
            .groups
            .into_iter()
            .map(|group| RpcOutputGroup {
                id: group.id,
                coordinator_id: group.coordinator_id,
                coordinator_name: group.coordinator_name,
                rooms: group
                    .rooms
                    .into_iter()
                    .map(|room| RpcOutputRoom {
                        id: room.id,
                        name: room.name,
                        model: room.model,
                        address: room.address,
                        location_url: room.location_url,
                        coordinator: room.coordinator,
                    })
                    .collect(),
            })
            .collect(),
        refreshed_at: topology.refreshed_at as f64,
        authoritative: topology.authoritative,
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

fn match_item(item: RpcMatchItem) -> MatchItem {
    MatchItem {
        id: item.id,
        artist: item.artist,
        title: item.title,
        album: item.album,
        duration_ms: item.duration_ms,
        year: item.year,
    }
}

fn rpc_album(album: Album) -> RpcLibraryAlbum {
    RpcLibraryAlbum {
        id: album.id,
        title: album.title,
        artist: album.artist,
        year: album.year,
        placement: match album.placement {
            Placement::Discovery => RpcPlacement::Discovery,
            Placement::Collection => RpcPlacement::Collection,
            Placement::Archive => RpcPlacement::Archive,
            Placement::Dismissed => RpcPlacement::Dismissed,
        },
        placement_updated_at: album.placement_updated_at,
        added_at: album.added_at,
        revision: u32::try_from(album.revision).unwrap_or(u32::MAX),
        tracks: album
            .tracks
            .into_iter()
            .map(|track| RpcLibraryTrack {
                id: track.id,
                title: track.title,
                artist: track.artist,
                duration_ms: track.duration_ms,
                track_number: track.track_number,
                artwork_url: track.artwork_url,
                revision: u32::try_from(track.revision).unwrap_or(u32::MAX),
            })
            .collect(),
    }
}

fn placement(placement: RpcPlacement) -> Placement {
    match placement {
        RpcPlacement::Discovery => Placement::Discovery,
        RpcPlacement::Collection => Placement::Collection,
        RpcPlacement::Archive => Placement::Archive,
        RpcPlacement::Dismissed => Placement::Dismissed,
    }
}

fn rpc_bookmark(bookmark: Bookmark) -> RpcBookmark {
    RpcBookmark {
        id: bookmark.id,
        track_id: bookmark.track_id,
        created_at: bookmark.created_at,
    }
}

fn rpc_playlist(playlist: Playlist) -> RpcPlaylist {
    RpcPlaylist {
        id: playlist.id,
        title: playlist.title,
        track_ids: playlist.track_ids,
        revision: u32::try_from(playlist.revision).unwrap_or(u32::MAX),
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

fn library_failure(error: LibraryError) -> RpcFailure {
    RpcFailure::retryable("library.unavailable", error.to_string())
}

fn listen_failure(error: ListenError) -> RpcFailure {
    RpcFailure::retryable("listen.unavailable", error.to_string())
}

fn account_failure(error: AccountError) -> RpcFailure {
    RpcFailure::retryable("account.unavailable", error.to_string())
}
