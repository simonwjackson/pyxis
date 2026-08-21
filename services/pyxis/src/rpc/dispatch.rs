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
use crate::rpc::contract::{
    AccountCreateOutcome, AccountListOutcome, AlbumAddOutcome, AlbumCommandOutcome,
    AlbumListOutcome, ApiTokenCreateOutcome, BookmarkCommandOutcome, BookmarkListOutcome,
    CommandOutcome, DeviceClaimOutcome, DevicePairOutcome, HotAlbumsListOutcome,
    ListenAppendOutcome, ListenHistoryOutcome, MatchingEvaluateOutcome, PairingCreateOutcome,
    PlaylistCreateOutcome, PlaylistListOutcome, PluginListOutcome, RpcAccount, RpcAlbumCommand,
    RpcApiToken, RpcApiTokenGrant, RpcAuthGrant, RpcBookmark, RpcBookmarkCommand, RpcDevice,
    RpcFailure, RpcHotAlbum, RpcLibraryAlbum, RpcLibraryTrack, RpcListenAppendResult,
    RpcListenEvent, RpcMatchDecision, RpcMatchItem, RpcMatchResult, RpcMatchScore,
    RpcOverrideDecision, RpcPairingCode, RpcPlacement, RpcPlaylist, RpcPlugin, RpcRequest,
    RpcResponse, RpcSearchTrack, RpcSession, RpcSessionCommand, RpcSourceFailure,
    RpcSourceSearchResult, RpcSystemStatus, RpcTransport, SessionCommandOutcome,
    SessionCreateOutcome, SessionListOutcome, SessionStateOutcome, SourceSearchOutcome,
    SystemStatusOutcome, CONTRACT_ID,
};
use crate::sessions::{Session, SessionCommand as DomainSessionCommand, SessionError, Transport};
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
                Ok(album) => RpcResponse::LibraryAlbumAdd(AlbumAddOutcome::Ready(rpc_album(album))),
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
                        Ok(Some(album)) => RpcResponse::LibraryAlbumCommandRun(
                            AlbumCommandOutcome::Applied(rpc_album(album)),
                        ),
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
