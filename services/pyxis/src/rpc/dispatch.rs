//! Operation dispatch.
//!
//! Transport parsing and authorization end before this module begins. A dispatcher
//! receives a valid request plus its account context and always returns the matching
//! operation tag. Domain failures become operation outcomes rather than framework errors.

mod sleep;
pub use sleep::SleepLane;

use super::contract::{JournalEvent, ListenEventInput};
use crate::accounts::{
    Account, AccountError, ApiTokenGrant, AuthContext, AuthGrant, ClaimOutcome, PairOutcome,
    Principal,
};
use crate::api::AppState;
use crate::library::{
    Album, AlbumInput, Bookmark, LibraryError, Playlist, PlaylistInput, SourceReference, TrackInput,
};
use crate::listen::ListenError;
use crate::matching::{Decision, MatchItem, OverrideDecision};
use crate::output_catalog::{OutputError, OutputTopology};
use crate::rpc::contract::{
    AccountCreateOutcome, AccountListOutcome, AlbumAddOutcome, AlbumCommandOutcome,
    AlbumListOutcome, ApiTokenCreateOutcome, BookmarkCommandOutcome, BookmarkListOutcome,
    CommandOutcome, DeviceClaimOutcome, DevicePairOutcome, EmptyRequest, ListenAppendOutcome,
    ListenHistoryOutcome, MatchingEvaluateOutcome, OutputGroupSetOutcome,
    OutputSessionCreateOutcome, OutputTargetsListOutcome, PairingCreateOutcome,
    PlaylistCreateOutcome, PlaylistListOutcome, PluginListOutcome, RealtimeServerMessage,
    RpcAccount, RpcAlbumCommand, RpcApiToken, RpcApiTokenGrant, RpcAuthGrant, RpcBookmark,
    RpcBookmarkCommand, RpcDevice, RpcFailure, RpcLibraryAlbum, RpcLibraryTrack,
    RpcListenAppendResult, RpcListenEvent, RpcMatchDecision, RpcMatchItem, RpcMatchResult,
    RpcMatchScore, RpcOutputBinding, RpcOutputGroup, RpcOutputRoom, RpcOutputTopology,
    RpcOverrideDecision, RpcPairingCode, RpcPlaylist, RpcPlugin, RpcRealtimeRemoval,
    RpcRealtimeState, RpcRealtimeTopic, RpcRequest, RpcResponse, RpcSearchTrack, RpcSession,
    RpcSessionCommand, RpcSessionDirective, RpcSourceAlbum, RpcSourceAlbumSummary,
    RpcSourceArtistSummary, RpcSourceFailure, RpcSourceSearchResult, RpcStation, RpcStationBatch,
    RpcStationListResult, RpcSystemStatus, RpcTransport, SessionCommandOutcome,
    SessionCommandRequest, SessionCommandSendOutcome, SessionCreateOutcome, SessionHandoffOutcome,
    SessionListOutcome, SessionStateOutcome, SourceAlbumGetOutcome, SourceAlbumSearchOutcome,
    SourceSearchOutcome, SourceStationCreateOutcome, SourceStationListOutcome,
    SourceStationNextOutcome, SystemStatusOutcome, CONTRACT_ID,
};
use crate::rpc::realtime::Delivery;
use crate::sessions::{
    console, OutputBinding, OutputConfirmation, PreparedOutputCommand, Session,
    SessionCommand as DomainSessionCommand, SessionError, Transport,
};
use crate::source_catalog::SearchOutcome;
use crate::stations::{StationCreateOutcome, StationListOutcome, StationNextOutcome};

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
        RpcRequest::AccountSettingsGet(_) => {
            use super::contract::AccountSettingsGetOutcome as Outcome;
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::AccountSettingsGet(match state.accounts.settings(&auth.account_id) {
                Ok(settings) => Outcome::Ready(settings),
                Err(e) => Outcome::Unavailable(RpcFailure::retryable(
                    "settings.unavailable",
                    e.to_string(),
                )),
            })
        }
        RpcRequest::AccountSettingsSet(request) => {
            use super::contract::AccountSettingsSetOutcome as Outcome;
            use crate::accounts::settings::SetError;
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::AccountSettingsSet(
                match state.accounts.set_settings(
                    &auth,
                    request.expected_revision,
                    request.source_priority,
                ) {
                    Ok(settings) => Outcome::Ready(settings),
                    Err(SetError::Conflict(settings)) => Outcome::Conflict(settings),
                    Err(SetError::Invalid) => Outcome::Invalid(RpcFailure::permanent(
                        "settings.invalidPriority",
                        "sourcePriority requires distinct nonempty plugin ids",
                    )),
                    Err(SetError::Store(e)) => Outcome::Unavailable(RpcFailure::retryable(
                        "settings.unavailable",
                        e.to_string(),
                    )),
                },
            )
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
            for plugin in state.plugins.list().into_iter().filter(|plugin| {
                plugin
                    .capabilities
                    .iter()
                    .any(|capability| matches!(capability.as_str(), "source" | "output"))
            }) {
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
                    station_seed_kinds: plugin.station_seed_kinds,
                    source_operations: plugin.source_operations,
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
                                OutputSessionCreateOutcome::Ready(Box::new(rpc_session(existing))),
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
                                    Box::new(session),
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
                if !current_topology.authoritative
                    || desired_rooms
                        .iter()
                        .any(|room| current_topology.coordinator_of(room).is_none())
                {
                    return RpcResponse::OutputGroupSet(OutputGroupSetOutcome::Unavailable(
                        RpcFailure::retryable(
                            "output.groupNotConverged",
                            "discovery did not confirm all requested rooms",
                        ),
                    ));
                }
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
                let next_coordinators = current_topology
                    .coordinators_after_group_set(&request.coordinator_id, &request.member_ids);
                let mut moved = Vec::new();
                for (account_id, session) in existing_sessions {
                    let Some(output) = session.output else {
                        continue;
                    };
                    if output.plugin_id != request.plugin_id
                        || !affected_room_ids.contains(output.target_id.as_str())
                    {
                        continue;
                    }
                    if account_id != auth.account_id {
                        return RpcResponse::OutputGroupSet(OutputGroupSetOutcome::Unavailable(
                            RpcFailure::permanent(
                                "output.groupBusy",
                                "another account owns a room in the affected group",
                            ),
                        ));
                    }
                    let next = next_coordinators.get(&output.target_id).map(String::as_str);
                    if current_topology.coordinator_of(&output.target_id) != next
                        && next != Some(output.target_id.as_str())
                    {
                        moved.push((session.id, output));
                    }
                }
                match state.outputs.set_group(
                    &auth,
                    &request.plugin_id,
                    &request.coordinator_id,
                    &request.member_ids,
                ) {
                    Ok(topology) => {
                        let confirmed = topology.authoritative
                            && desired_rooms.iter().all(|room| {
                                topology.coordinator_of(room) == Some(&request.coordinator_id)
                            })
                            && affected_room_ids.iter().all(|room| {
                                topology.coordinator_of(room)
                                    == next_coordinators.get(*room).map(String::as_str)
                            })
                            && topology
                                .groups
                                .iter()
                                .filter(|group| group.coordinator_id == request.coordinator_id)
                                .flat_map(|g| &g.rooms)
                                .all(|room| desired_rooms.contains(&room.id));
                        if !confirmed {
                            return RpcResponse::OutputGroupSet(
                                OutputGroupSetOutcome::Unavailable(RpcFailure::retryable(
                                    "output.groupNotConverged",
                                    "plugin topology did not confirm the requested group",
                                )),
                            );
                        }
                        // Joining the coordinator already switched the renderer. A physical
                        // Stop here would silence the new group, not the released session.
                        match state.sessions.release_outputs(&auth, &moved) {
                            Ok(released) => {
                                for (session, (_, output)) in released.into_iter().zip(&moved) {
                                    state.outputs.release_target(&auth.account_id, output);
                                    publish_session(state, &auth, &rpc_session(session));
                                }
                            }
                            Err(error) => {
                                return RpcResponse::OutputGroupSet(
                                    OutputGroupSetOutcome::Unavailable(session_failure(error)),
                                )
                            }
                        }
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
                    RpcResponse::SessionCreate(SessionCreateOutcome::Ready(Box::new(session)))
                }
                Err(SessionError::NotDevice) => {
                    RpcResponse::SessionCreate(SessionCreateOutcome::NotDevice)
                }
                Err(error) => RpcResponse::SessionCreate(SessionCreateOutcome::Unavailable(
                    session_failure(error),
                )),
            }
        }
        RpcRequest::SessionRetire(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::SessionRetire(super::retirement::retire(state, &auth, &request.session_id))
        }
        RpcRequest::SessionList(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            // Output reconciliation runs in the serialized background monitor. A generic
            // session read must never wait on physical-output I/O: device-hosted workers pull
            // this snapshot before pushing renderer-confirmed commands.
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
                Ok(Some(session)) => RpcResponse::SessionStateGet(SessionStateOutcome::Ready(
                    Box::new(rpc_session(session)),
                )),
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
                .host_command(&auth, &request.session_id, command, command_receipt)
            {
                Ok((session, retired)) => {
                    let session = rpc_session(session);
                    if retired {
                        super::retirement::publish_retired(state, &auth.account_id, &session.id);
                    } else {
                        publish_session(state, &auth, &session);
                    }
                    RpcResponse::SessionCommandRun(SessionCommandOutcome::Applied(Box::new(
                        session,
                    )))
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
            // --- sleep timer (U44): core owns intent, host owns the eventual Stop ---
            if matches!(
                request.command,
                RpcSessionCommand::SleepSet(_) | RpcSessionCommand::SleepCancel(_)
            ) {
                if session.as_ref().is_some_and(|s| !s.reachable) {
                    return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unreachable);
                }
                let fingerprint =
                    serde_json::to_string(&request.command).expect("session command serializes");
                let receipt = request
                    .command_id
                    .as_deref()
                    .map(|id| (id, fingerprint.as_str()));
                return RpcResponse::SessionCommandSend(
                    match state.sessions.set_device_sleep(
                        &auth,
                        &request.session_id,
                        domain_command(request.command),
                        receipt,
                    ) {
                        Ok(session) => {
                            publish_session(state, &auth, &rpc_session(session));
                            SessionCommandSendOutcome::Dispatched
                        }
                        Err(SessionError::UnknownSession) => {
                            SessionCommandSendOutcome::UnknownSession
                        }
                        Err(error) => {
                            SessionCommandSendOutcome::Unavailable(output_session_failure(error))
                        }
                    },
                );
            }
            match console::route(session.as_ref()) {
                console::Route::UnknownSession => {
                    RpcResponse::SessionCommandSend(SessionCommandSendOutcome::UnknownSession)
                }
                console::Route::Unreachable => {
                    RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unreachable)
                }
                console::Route::ToHost { device_id } => {
                    let mut expected_revision = session.as_ref().map(|session| session.revision);
                    if let Some(command_id) = request.command_id.as_deref() {
                        let fingerprint = serde_json::to_string(&request.command)
                            .expect("session command serializes");
                        match state.sessions.reserve_command(
                            &auth,
                            &request.session_id,
                            command_id,
                            &fingerprint,
                        ) {
                            Ok(revision) => expected_revision = Some(revision),
                            Err(error) => {
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
                    }
                    match state.realtime.deliver(
                        &device_id,
                        directive(
                            &request.session_id,
                            request.command.clone(),
                            auth.principal_id(),
                            request.command_id.as_deref(),
                            if matches!(request.command, RpcSessionCommand::Seek(_)) {
                                expected_revision
                                    .map(|revision| u32::try_from(revision).unwrap_or(u32::MAX))
                            } else {
                                None
                            },
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
                            RpcSessionCommand::Stop(Default::default()),
                            auth.principal_id(),
                            None,
                            None,
                        ),
                    );
                    let source = rpc_session(source);
                    let target = rpc_session(target);
                    publish_session(state, &auth, &source);
                    publish_session(state, &auth, &target);
                    RpcResponse::SessionHandoff(SessionHandoffOutcome::Ready(Box::new(target)))
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
        RpcRequest::SourceArtistDiscography(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::SourceArtistDiscography(state.sources.read(
                &auth,
                &request.plugin_id,
                "artist.discography",
                serde_json::json!({"externalId":request.external_id}),
                request.cursor.as_deref(),
                request.limit,
            ))
        }
        RpcRequest::SourcePlaylistTracks(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::SourcePlaylistTracks(state.sources.track_read(
                &auth,
                &request.plugin_id,
                "playlist.tracks",
                serde_json::json!({"externalId":request.external_id}),
                request.cursor.as_deref(),
                request.limit,
            ))
        }
        RpcRequest::SourceTrackRelated(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::SourceTrackRelated(state.sources.track_read(
                &auth,
                &request.plugin_id,
                "track.related",
                serde_json::json!({"externalId":request.external_id}),
                request.cursor.as_deref(),
                request.limit,
            ))
        }
        RpcRequest::SourceTrackDetails(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            if request.external_ids.is_empty()
                || request.external_ids.len() > 50
                || request
                    .external_ids
                    .iter()
                    .any(|id| !crate::source_catalog::valid_text(id))
            {
                return RpcResponse::SourceTrackDetails(
                    crate::rpc::contract::SourceReadOutcome::Invalid(RpcFailure::permanent(
                        "source.invalidIds",
                        "expected 1 to 50 recording ids",
                    )),
                );
            }
            RpcResponse::SourceTrackDetails(state.sources.track_read(
                &auth,
                &request.plugin_id,
                "track.details",
                serde_json::json!({"externalIds":request.external_ids}),
                None,
                Some(50),
            ))
        }
        RpcRequest::SourceTrackLyrics(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::SourceTrackLyrics(state.sources.read(
                &auth,
                &request.plugin_id,
                "track.lyrics",
                serde_json::json!({"externalId":request.external_id}),
                None,
                None,
            ))
        }
        RpcRequest::SourceTrackCredits(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::SourceTrackCredits(state.sources.read(
                &auth,
                &request.plugin_id,
                "track.credits",
                serde_json::json!({"externalId":request.external_id}),
                None,
                None,
            ))
        }
        RpcRequest::SourceSearchSuggest(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::SourceSearchSuggest(state.sources.read(
                &auth,
                &request.plugin_id,
                "search.suggest",
                serde_json::json!({"query":request.query}),
                request.cursor.as_deref(),
                request.limit,
            ))
        }
        RpcRequest::SourceSearchRun(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let query = request.query.trim();
            if query.is_empty() && request.page.is_none() {
                return RpcResponse::SourceSearchRun(SourceSearchOutcome::Unavailable(
                    RpcFailure::permanent("source.invalidQuery", "search query cannot be empty"),
                ));
            }
            let limit = request.limit.unwrap_or(10).clamp(1, 50);
            match state.sources.search(
                &auth,
                query,
                limit,
                request.exact_match.unwrap_or(false),
                request.page.as_ref(),
            ) {
                Ok(SearchOutcome::InvalidCursor) => {
                    RpcResponse::SourceSearchRun(SourceSearchOutcome::Invalid(
                        RpcFailure::permanent("source.invalidCursor", "invalid search cursor"),
                    ))
                }
                Ok(SearchOutcome::NoSources) => {
                    RpcResponse::SourceSearchRun(SourceSearchOutcome::NoSources)
                }
                Ok(SearchOutcome::Ready {
                    tracks,
                    albums,
                    artists,
                    playlists,
                    pages,
                    failures,
                }) => RpcResponse::SourceSearchRun(SourceSearchOutcome::Ready(
                    RpcSourceSearchResult {
                        playlists,
                        pages: (!pages.is_empty()).then_some(pages),
                        tracks: tracks.into_iter().map(rpc_search_track).collect(),
                        albums: albums
                            .into_iter()
                            .map(|album| RpcSourceAlbumSummary {
                                external_id: album.external_id,
                                title: album.title,
                                artist: album.artist,
                                year: album.year,
                                release_type: album.release_type,
                                artwork_url: album.artwork_url,
                                source_plugin_id: album.source_plugin_id,
                            })
                            .collect(),
                        artists: artists
                            .into_iter()
                            .map(|artist| RpcSourceArtistSummary {
                                external_id: artist.external_id,
                                name: artist.name,
                                artwork_url: artist.artwork_url,
                                source_plugin_id: artist.source_plugin_id,
                            })
                            .collect(),
                        failures: failures.into_iter().map(rpc_source_failure).collect(),
                    },
                )),
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
                artwork_url: request.artwork_url,
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
            match state.library.add_album_with_context(
                &auth.account_id,
                input,
                auth.principal_id(),
                request.entry_context.map(|ctx| {
                    (
                        ctx,
                        match &auth.principal {
                            Principal::Device { id } => Some(id.as_str()),
                            Principal::ApiToken { .. } => None,
                        },
                    )
                }),
            ) {
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

        // --- library.tracks.get (U40) ---
        RpcRequest::LibraryTracksGet(request) => {
            use crate::rpc::contract::TracksGetOutcome;
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::LibraryTracksGet(
                match state
                    .library
                    .track_metadata(&auth.account_id, &request.track_ids)
                {
                    Ok(result) => TracksGetOutcome::Ready(result),
                    Err(LibraryError::TooManyTracks) => {
                        TracksGetOutcome::Invalid(RpcFailure::permanent(
                            "library.tooManyTracks",
                            "trackIds exceeds 200 entries",
                        ))
                    }
                    Err(error) => TracksGetOutcome::Unavailable(library_failure(error)),
                },
            )
        }
        // --- library.albums.query (U41) ---
        RpcRequest::LibraryAlbumsQuery(request) => {
            use crate::rpc::contract::AlbumsQueryOutcome;
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::LibraryAlbumsQuery(
                match state
                    .library
                    .query_albums(&state.album_cursors, &auth.account_id, request)
                {
                    Ok(page) => AlbumsQueryOutcome::Ready(rpc_album_page(page)),
                    Err(LibraryError::InvalidQuery(message)) => AlbumsQueryOutcome::Invalid(
                        RpcFailure::permanent("library.invalidQuery", message),
                    ),
                    Err(error) => AlbumsQueryOutcome::Unavailable(library_failure(error)),
                },
            )
        }
        // --- Shelves (U43) ---
        RpcRequest::LibraryShelfSave(request) => {
            use crate::rpc::contract::ShelfSaveOutcome;
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::LibraryShelfSave(
                match state
                    .library
                    .save_shelf(&auth.account_id, request, auth.principal_id())
                {
                    Ok(shelf) => ShelfSaveOutcome::Ready(shelf),
                    Err(LibraryError::InvalidShelf(message)) => ShelfSaveOutcome::Invalid(
                        RpcFailure::permanent("library.invalidShelf", message),
                    ),
                    Err(LibraryError::UnknownShelf) => ShelfSaveOutcome::Unknown,
                    Err(LibraryError::ShelfConflict(revision)) => {
                        ShelfSaveOutcome::Conflict(revision)
                    }
                    Err(error) => ShelfSaveOutcome::Unavailable(library_failure(error)),
                },
            )
        }
        RpcRequest::LibraryShelfRemove(request) => {
            use crate::rpc::contract::ShelfRemoveOutcome;
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::LibraryShelfRemove(
                match state.library.remove_shelf(
                    &auth.account_id,
                    &request.shelf_id,
                    request.expected_revision,
                ) {
                    Ok(()) => ShelfRemoveOutcome::Removed,
                    Err(LibraryError::UnknownShelf) => ShelfRemoveOutcome::Unknown,
                    Err(LibraryError::ShelfConflict(revision)) => {
                        ShelfRemoveOutcome::Conflict(revision)
                    }
                    Err(error) => ShelfRemoveOutcome::Unavailable(library_failure(error)),
                },
            )
        }
        RpcRequest::LibraryShelvesList(_) => {
            use crate::rpc::contract::ShelvesListOutcome;
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::LibraryShelvesList(match state.library.list_shelves(&auth.account_id) {
                Ok(shelves) => ShelvesListOutcome::Ready(shelves),
                Err(error) => ShelvesListOutcome::Unavailable(library_failure(error)),
            })
        }
        RpcRequest::LibraryShelfAlbumsList(request) => {
            use crate::rpc::contract::ShelfAlbumsListOutcome;
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::LibraryShelfAlbumsList(
                match state
                    .library
                    .shelf_albums(&state.album_cursors, &auth.account_id, request)
                {
                    Ok(page) => ShelfAlbumsListOutcome::Ready(rpc_album_page(page)),
                    Err(LibraryError::InvalidQuery(message)) => ShelfAlbumsListOutcome::Invalid(
                        RpcFailure::permanent("library.invalidQuery", message),
                    ),
                    Err(LibraryError::UnknownShelf) => ShelfAlbumsListOutcome::Unknown,
                    Err(error) => ShelfAlbumsListOutcome::Unavailable(library_failure(error)),
                },
            )
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
                RpcAlbumCommand::TagsSet(command) => {
                    let outcome = match state.library.set_tags(&auth.account_id, &request.album_id, command.tags, auth.principal_id()) {
                        Ok(Some(album)) => { let album = rpc_album(album); publish_album(state, &auth, &album); AlbumCommandOutcome::Applied(album) }
                        Ok(None) => AlbumCommandOutcome::Unknown,
                        Err(LibraryError::InvalidTags) => AlbumCommandOutcome::Unavailable(RpcFailure::permanent("library.invalidTags", "tags must contain at most 64 nonempty labels of at most 64 characters without control characters")),
                        Err(error) => AlbumCommandOutcome::Unavailable(library_failure(error)),
                    };
                    RpcResponse::LibraryAlbumCommandRun(outcome)
                }

                RpcAlbumCommand::ArtworkRefresh(_) => {
                    let reference = match state
                        .library
                        .source_reference(&auth.account_id, &request.album_id)
                    {
                        Ok(Some(reference)) => reference,
                        Ok(None) => {
                            return RpcResponse::LibraryAlbumCommandRun(
                                AlbumCommandOutcome::Unknown,
                            );
                        }
                        Err(error) => {
                            return RpcResponse::LibraryAlbumCommandRun(
                                AlbumCommandOutcome::Unavailable(library_failure(error)),
                            );
                        }
                    };
                    let source = match state.sources.get_album(
                        &auth,
                        &reference.plugin_id,
                        &reference.external_id,
                    ) {
                        Ok(source) => source,
                        Err(error) => {
                            return RpcResponse::LibraryAlbumCommandRun(
                                AlbumCommandOutcome::Unavailable(source_album_failure(error)),
                            );
                        }
                    };
                    let input = AlbumInput {
                        title: source.title,
                        artist: source.artist,
                        year: source.year,
                        artwork_url: source.artwork_url,
                        source_reference: Some(reference),
                        tracks: source
                            .tracks
                            .into_iter()
                            .map(|track| TrackInput {
                                id: Some(track.id),
                                title: track.title,
                                artist: track.artist,
                                duration_ms: track.duration_ms,
                                track_number: track.track_number,
                            })
                            .collect(),
                    };
                    match state.library.refresh_artwork(
                        &auth.account_id,
                        &request.album_id,
                        input,
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
        RpcRequest::LibraryPlaylistTracksAdd(request) => {
            use crate::rpc::contract::PlaylistTracksAddOutcome;
            let Some(auth) = auth else {
                return auth_required();
            };
            let outcome = match state.library.add_playlist_tracks(
                &auth.account_id,
                &request.playlist_id,
                request.track_ids,
                &request.command_id,
                auth.principal_id(),
            ) {
                Ok(Some(playlist)) => PlaylistTracksAddOutcome::Applied(rpc_playlist(playlist)),
                Ok(None) => PlaylistTracksAddOutcome::UnknownPlaylist,
                Err(LibraryError::InvalidPlaylistCommand(message)) => {
                    PlaylistTracksAddOutcome::Rejected(RpcFailure::permanent(
                        "library.invalidPlaylistCommand",
                        message,
                    ))
                }
                Err(LibraryError::PlaylistCommandConflict) => {
                    PlaylistTracksAddOutcome::Rejected(RpcFailure::permanent(
                        "library.commandIdConflict",
                        "commandId was already used for different playlist content",
                    ))
                }
                Err(error) => PlaylistTracksAddOutcome::Unavailable(library_failure(error)),
            };
            RpcResponse::LibraryPlaylistTracksAdd(outcome)
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
            let events: Vec<_> = request
                .events
                .into_iter()
                .map(|e| match e {
                    ListenEventInput::Track(t) => JournalEvent::TrackPlayed(t),
                    ListenEventInput::Journal(row) => row,
                })
                .collect();
            if let Principal::Device { id } = &auth.principal {
                if events.iter().any(|row|match row {JournalEvent::TrackPlayed(e)=>Some(&e.device_id),JournalEvent::StationSession(e)=>Some(&e.device_id),JournalEvent::Capture(e)=>e.device_id.as_ref()}!=Some(id)) {return RpcResponse::ListenEventsAppend(ListenAppendOutcome::Invalid(RpcFailure::permanent("listen.deviceMismatch","a device token can only append its own events")));}
            }
            match state
                .listen
                .append_events(&auth.account_id, events, auth.principal_id())
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
        RpcRequest::ListenJournalList(request) => {
            use super::contract::{JournalListOutcome as Outcome, JournalPage};
            let Some(auth) = auth else {
                return auth_required();
            };
            let limit = request.limit.unwrap_or(100).clamp(1, 1000) as usize;
            RpcResponse::ListenJournalList(
                match state.listen.history_page(
                    &auth.account_id,
                    crate::listen::events::PageQuery {
                        limit,
                        from: request.from.as_deref(),
                        to: request.to.as_deref(),
                        cursor: request.cursor.as_deref(),
                        kinds: request.kinds.as_deref(),
                    },
                ) {
                    Ok((events, next_cursor)) => Outcome::Ready(JournalPage {
                        events,
                        next_cursor,
                    }),
                    Err(error @ (ListenError::InvalidCursor | ListenError::InvalidTime(_))) => {
                        Outcome::Invalid(RpcFailure::permanent(
                            "listen.invalidPage",
                            error.to_string(),
                        ))
                    }
                    Err(error) => Outcome::Unavailable(listen_failure(error)),
                },
            )
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
                            played_ms: event.played_ms,
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
                            release_type: album.release_type,
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
                        release_type: album.release_type,
                        artwork_url: album.artwork_url,
                        source_plugin_id: album.source_plugin_id,
                        tracks: album.tracks.into_iter().map(rpc_search_track).collect(),
                    }))
                }
                Err(error) => RpcResponse::SourceAlbumGet(SourceAlbumGetOutcome::Unavailable(
                    source_album_failure(error),
                )),
            }
        }
        RpcRequest::SourceStationList(_) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            RpcResponse::SourceStationList(station_list_outcome(state.stations.list(&auth)))
        }
        RpcRequest::SourceStationSearch(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            let limit = request.limit.unwrap_or(20).clamp(1, 50);
            RpcResponse::SourceStationSearch(station_list_outcome(state.stations.search(
                &auth,
                &request.query,
                limit,
            )))
        }
        RpcRequest::SourceStationCreate(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.stations.create(
                &auth,
                &request.plugin_id,
                request.seed.kind,
                &request.seed.external_id,
                request.seed.mode,
            ) {
                Ok(StationCreateOutcome::Ready(station)) => RpcResponse::SourceStationCreate(
                    SourceStationCreateOutcome::Ready(rpc_station(station)),
                ),
                Ok(StationCreateOutcome::UnsupportedSeed) => {
                    RpcResponse::SourceStationCreate(SourceStationCreateOutcome::UnsupportedSeed)
                }
                Err(error) => RpcResponse::SourceStationCreate(
                    SourceStationCreateOutcome::Unavailable(source_station_failure(error)),
                ),
            }
        }
        RpcRequest::SourceStationNext(request) => {
            let Some(auth) = auth else {
                return auth_required();
            };
            match state.stations.next(
                &auth,
                &request.plugin_id,
                &request.station_id,
                request.cursor.as_deref(),
                request.limit,
            ) {
                Ok(StationNextOutcome::Ready(batch)) => RpcResponse::SourceStationNext(
                    SourceStationNextOutcome::Ready(RpcStationBatch {
                        tracks: batch.tracks.into_iter().map(rpc_search_track).collect(),
                        cursor: batch.cursor,
                        exhausted: batch.exhausted,
                    }),
                ),
                Ok(StationNextOutcome::UnknownStation) => {
                    RpcResponse::SourceStationNext(SourceStationNextOutcome::UnknownStation)
                }
                Err(error) => RpcResponse::SourceStationNext(
                    SourceStationNextOutcome::Unavailable(source_station_failure(error)),
                ),
            }
        }
    }
}

fn rpc_source_failure(failure: crate::source_catalog::SearchFailure) -> RpcSourceFailure {
    RpcSourceFailure {
        plugin_id: failure.plugin_id,
        failure: RpcFailure {
            code: failure.code,
            message: failure.message,
            retryable: failure.retryable,
        },
    }
}

pub(crate) fn rpc_station(station: crate::stations::Station) -> RpcStation {
    RpcStation {
        external_id: station.external_id,
        name: station.name,
        artwork_url: station.artwork_url,
        source_plugin_id: station.source_plugin_id,
    }
}

pub(crate) fn rpc_search_track(track: crate::source_catalog::SearchTrack) -> RpcSearchTrack {
    RpcSearchTrack {
        id: track.id,
        external_id: track.external_id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        album_external_id: track.album_external_id,
        duration_ms: track.duration_ms,
        track_number: track.track_number,
        artwork_url: track.artwork_url,
        source_plugin_id: track.source_plugin_id,
    }
}

fn station_list_outcome(
    result: Result<StationListOutcome, crate::source_catalog::SourceCatalogError>,
) -> SourceStationListOutcome {
    match result {
        Ok(StationListOutcome::NoSources) => SourceStationListOutcome::NoSources,
        Ok(StationListOutcome::Ready { stations, failures }) => {
            SourceStationListOutcome::Ready(RpcStationListResult {
                stations: stations.into_iter().map(rpc_station).collect(),
                failures: failures.into_iter().map(rpc_source_failure).collect(),
            })
        }
        Err(error) => SourceStationListOutcome::Unavailable(source_station_failure(error)),
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
        checked_output_command(state, auth, request, output)
    })
}

/// Caller holds the plugin lock, which fences topology discovery, the effect and its commit.
pub(super) fn checked_output_command(
    state: &AppState,
    auth: &AuthContext,
    request: &SessionCommandRequest,
    output: &OutputBinding,
) -> RpcResponse {
    match state.sessions.get(auth, &request.session_id) {
        Ok(Some(current)) if current.output.as_ref() == Some(output) => {}
        Ok(Some(_)) => {
            return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unreachable)
        }
        Ok(None) => {
            return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::UnknownSession)
        }
        Err(e) => {
            return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unavailable(
                session_failure(e),
            ))
        }
    }
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
            publish_output_session(state, auth, &request.session_id);
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
        publish_output_session(state, auth, &request.session_id);
        return RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unreachable);
    }
    state.outputs.serialize_target(output, || {
        dispatch_output_command_locked(state, auth, request)
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
            stream_digest: state.outputs.stream_digest(&current.id, &output),
            position_ms: effect.commit_position_ms,
            duration_ms: effect.commit_duration_ms,
        },
    ) {
        Ok(session) => {
            state
                .sessions
                .set_output_reachable(&auth.account_id, &output, true);
            if let Err(error) = sleep::restore_pending(state, auth, &session, &output) {
                tracing::warn!(session_id=%session.id,%error,"volume restore pending after confirmed command");
            }
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
    reconcile_output_scan(state, sessions);
}

pub(crate) fn reconcile_output_scan(
    state: &AppState,
    sessions: Vec<(crate::db::store::AccountId, Session)>,
) {
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
                    if current.output != session.output {
                        continue;
                    }
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
    state.outputs.serialize_plugin(&output.plugin_id, || {
        if let Ok(Some(current)) = state.sessions.get(auth, &session.id) {
            if current.reachable
                && current.output.as_ref() == Some(&output)
                && state
                    .outputs
                    .claim_target(&auth.account_id, &output)
                    .is_ok()
            {
                refresh_one_output_session_locked(state, auth, &current, &output);
            }
        }
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
                    let request = SessionCommandRequest {
                        session_id: session.id.clone(),
                        command_id: Some(format!("track-ended-{}", session.revision)),
                        command: RpcSessionCommand::TrackEnded(EmptyRequest {}),
                    };
                    let result = dispatch_output_command_locked(state, auth, &request);
                    if !matches!(
                        result,
                        RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Dispatched)
                    ) {
                        state
                            .sessions
                            .set_output_reachable(&auth.account_id, output, false);
                        publish_output_session(state, auth, &session.id);
                    }
                    return;
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
            physical
                .volume
                .filter(|_| !session.fading && session.pending_restore.is_none()),
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
        OutputError::StreamToken(error) => {
            RpcFailure::retryable("output.unavailable", error.to_string())
        }
        OutputError::RollbackFailed(message) => {
            RpcFailure::retryable("output.rollbackFailed", message)
        }
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
    source_failure("album", error)
}

fn source_station_failure(error: crate::source_catalog::SourceCatalogError) -> RpcFailure {
    source_failure("station", error)
}

/// Builds a source failure code for one subject, so a station error never claims to be an
/// album error. A client routes on the code, and a wrong subject sends it to the wrong
/// recovery path.
pub(crate) fn source_failure(
    subject: &str,
    error: crate::source_catalog::SourceCatalogError,
) -> RpcFailure {
    use crate::db::store::StoreError;
    use crate::plugin_credentials::CredentialError;
    use crate::plugins::host::PluginCallError;
    use crate::source_catalog::SourceCatalogError;

    let unavailable = format!("source.{subject}Unavailable");
    let invalid_output = format!("source.{subject}InvalidOutput");
    let media_unavailable = format!("source.{subject}MediaUnavailable");
    let credentials_invalid = format!("source.{subject}CredentialsInvalid");
    let credentials_unavailable = format!("source.{subject}CredentialsUnavailable");

    match error {
        SourceCatalogError::Plugin(plugin_error) => match plugin_error {
            PluginCallError::Unavailable { ref reason, .. }
                if reason == "plugin is not installed" =>
            {
                RpcFailure::permanent(unavailable, plugin_error.to_string())
            }
            PluginCallError::Unavailable { .. }
            | PluginCallError::ProcessExited { .. }
            | PluginCallError::Timeout { .. }
            | PluginCallError::Plugin {
                retryable: true, ..
            } => RpcFailure::retryable(unavailable, plugin_error.to_string()),
            PluginCallError::CapabilityUnavailable { .. }
            | PluginCallError::Protocol { .. }
            | PluginCallError::Plugin {
                retryable: false, ..
            } => RpcFailure::permanent(unavailable, plugin_error.to_string()),
        },
        SourceCatalogError::CursorSeal(error) => {
            RpcFailure::permanent(unavailable, error.to_string())
        }
        SourceCatalogError::InvalidOutput(message) => {
            RpcFailure::permanent(invalid_output, message)
        }
        SourceCatalogError::Media(error) => {
            RpcFailure::retryable(media_unavailable, error.to_string())
        }
        SourceCatalogError::Credentials(error) => match error {
            CredentialError::Store(StoreError::Decode { .. } | StoreError::NotAnObject { .. }) => {
                RpcFailure::permanent(credentials_invalid, error.to_string())
            }
            CredentialError::Store(StoreError::Engine(_)) | CredentialError::Io(_) => {
                RpcFailure::retryable(credentials_unavailable, error.to_string())
            }
            CredentialError::InvalidKey
            | CredentialError::Encode(_)
            | CredentialError::Encrypt
            | CredentialError::Decrypt
            | CredentialError::InvalidEncoding => {
                RpcFailure::permanent(credentials_invalid, error.to_string())
            }
        },
    }
}

fn system_status(state: &AppState) -> RpcResponse {
    match state.accounts.count() {
        Ok(account_count) => {
            let visible = state.plugins.list().into_iter().filter(|plugin| {
                plugin.status == crate::plugins::registry::PluginStatus::Live
                    && plugin
                        .capabilities
                        .iter()
                        .any(|capability| matches!(capability.as_str(), "source" | "output"))
            });
            let mut plugin_count = 0_u32;
            let mut capabilities = std::collections::BTreeSet::new();
            for plugin in visible {
                plugin_count = plugin_count.saturating_add(1);
                capabilities.extend(plugin.capabilities);
            }
            RpcResponse::SystemStatusGet(SystemStatusOutcome::Ready(RpcSystemStatus {
                version: crate::version().to_string(),
                contract_id: CONTRACT_ID.to_string(),
                account_count: u32::try_from(account_count).unwrap_or(u32::MAX),
                plugin_count,
                capabilities: capabilities.into_iter().collect(),
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
pub(super) fn directive(
    session_id: &str,
    command: RpcSessionCommand,
    issued_by: &str,
    directive_id: Option<&str>,
    expected_revision: Option<u32>,
) -> RealtimeServerMessage {
    RealtimeServerMessage::Command(RpcSessionDirective {
        expected_revision,
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
pub(super) fn publish_session(state: &AppState, auth: &AuthContext, session: &RpcSession) {
    state.sessions.with_current(auth, &session.id, |current| {
        state.realtime.publish(
            &auth.account_id,
            RpcRealtimeTopic::Sessions,
            RpcRealtimeState::SessionState(rpc_session(current)),
        )
    });
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
        sleep_timer: session
            .sleep_timer
            .map(|t| super::contract::RpcSleepTimer {
                id: t.id,
                deadline: t
                    .deadline
                    .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
                fade_seconds: t.fade_seconds,
            })
            .map(Box::new),
        repeat: match session.repeat {
            crate::sessions::Repeat::Off => crate::rpc::contract::RpcRepeatMode::Off,
            crate::sessions::Repeat::All => crate::rpc::contract::RpcRepeatMode::All,
            crate::sessions::Repeat::One => crate::rpc::contract::RpcRepeatMode::One,
        },
        shuffle: session.shuffle,
        queue_order: Some(session.queue_order.clone()),
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
            index: command
                .index
                .map(|index| usize::try_from(index).unwrap_or(usize::MAX)),
        },
        RpcSessionCommand::QueueRemove(command) => DomainSessionCommand::QueueRemove {
            index: usize::try_from(command.index).unwrap_or(usize::MAX),
        },
        RpcSessionCommand::QueueClear(_) => DomainSessionCommand::QueueClear,
        RpcSessionCommand::RepeatSet(command) => DomainSessionCommand::RepeatSet {
            mode: match command.mode {
                crate::rpc::contract::RpcRepeatMode::Off => crate::sessions::Repeat::Off,
                crate::rpc::contract::RpcRepeatMode::All => crate::sessions::Repeat::All,
                crate::rpc::contract::RpcRepeatMode::One => crate::sessions::Repeat::One,
            },
        },
        RpcSessionCommand::ShuffleSet(command) => DomainSessionCommand::ShuffleSet {
            enabled: command.enabled,
        },
        RpcSessionCommand::CursorJump(command) => DomainSessionCommand::CursorJump {
            index: usize::try_from(command.index).unwrap_or(usize::MAX),
        },
        RpcSessionCommand::Seek(command) => DomainSessionCommand::Seek {
            position_ms: u64::from(command.position_ms),
        },
        RpcSessionCommand::Play(_) => DomainSessionCommand::Play,
        RpcSessionCommand::Pause(_) => DomainSessionCommand::Pause,
        RpcSessionCommand::SleepSet(c) => {
            DomainSessionCommand::SleepSet(crate::sessions::sleep::SleepTimer::new(
                c.at.as_deref(),
                c.minutes,
                c.fade_seconds.unwrap_or_default(),
                chrono::Utc::now(),
            ))
        }
        RpcSessionCommand::SleepCancel(_) => DomainSessionCommand::SleepCancel,
        RpcSessionCommand::Stop(c) if c.sleep_timer_id.is_some() => {
            DomainSessionCommand::SleepStop(c.sleep_timer_id.unwrap())
        }
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

fn rpc_album_page(page: crate::library::AlbumPage) -> crate::rpc::contract::RpcAlbumPage {
    crate::rpc::contract::RpcAlbumPage {
        albums: page.albums.into_iter().map(rpc_album).collect(),
        cursor: page.cursor,
    }
}

pub(crate) fn rpc_album(album: Album) -> RpcLibraryAlbum {
    RpcLibraryAlbum {
        tags: album.tags,
        id: album.id,
        title: album.title,
        artist: album.artist,
        year: album.year,
        artwork_url: album.artwork_url,

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

fn rpc_bookmark(bookmark: Bookmark) -> RpcBookmark {
    RpcBookmark {
        id: bookmark.id,
        track_id: bookmark.track_id,
        created_at: bookmark.created_at,
    }
}

pub(crate) fn rpc_playlist(playlist: Playlist) -> RpcPlaylist {
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

pub(super) fn session_failure(error: SessionError) -> RpcFailure {
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
