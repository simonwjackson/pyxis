//! Source-neutral library groups. A cursor holds an immutable page snapshot, not a label filter.
use std::collections::{BTreeSet, HashMap};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use ulid::Ulid;

use crate::accounts::AuthContext;
use crate::api::AppState;
use crate::listen::HotConfig;
use crate::rpc::contract::*;
use crate::rpc::dispatch::{rpc_album, rpc_playlist, rpc_station};
use crate::stations::StationListOutcome;

#[derive(Clone, Default)]
pub(crate) struct GroupPages(Arc<Mutex<HashMap<String, SavedPage>>>);

struct SavedPage {
    account_id: String,
    group_id: String,
    items: Vec<RpcGroupMember>,
    availability: RpcGroupAvailability,
    issued: Instant,
}

struct Group {
    record: RpcLibraryGroup,
    members: Vec<RpcGroupMember>,
}

fn failure(error: impl std::fmt::Display) -> RpcFailure {
    RpcFailure::retryable("library.groupsUnavailable", error.to_string())
}

fn gather(state: &AppState, auth: &AuthContext) -> Result<Vec<Group>, RpcFailure> {
    let albums = state
        .library
        .list_albums(&auth.account_id)
        .map_err(failure)?;
    let mut groups = Vec::new();
    let mut add = |key: &str, label: &str, kind, members: Vec<RpcGroupMember>, availability| {
        let count = match &availability {
            RpcGroupAvailability::Ready => Some(u32::try_from(members.len()).unwrap_or(u32::MAX)),
            RpcGroupAvailability::Partial(_) => None,
        };
        let id =
            blake3::hash(format!("library-group\0{}\0{key}", auth.account_id.as_str()).as_bytes())
                .to_hex()
                .to_string();
        groups.push(Group {
            record: RpcLibraryGroup {
                id,
                label: label.into(),
                kind,
                count,
                availability,
            },
            members,
        });
    };
    let member_albums = |selected: Vec<crate::library::Album>| {
        selected
            .into_iter()
            .map(|album| RpcGroupMember::Album(rpc_album(album)))
            .collect()
    };
    add(
        "albums",
        "Albums",
        RpcLibraryGroupKind::Albums,
        member_albums(albums.clone()),
        RpcGroupAvailability::Ready,
    );
    for (key, label, placement) in [
        (
            "discovery",
            "Discovery",
            crate::library::Placement::Discovery,
        ),
        (
            "collection",
            "Collection",
            crate::library::Placement::Collection,
        ),
        ("archive", "Archive", crate::library::Placement::Archive),
        (
            "dismissed",
            "Dismissed",
            crate::library::Placement::Dismissed,
        ),
    ] {
        add(
            key,
            label,
            RpcLibraryGroupKind::Albums,
            member_albums(
                albums
                    .iter()
                    .filter(|album| album.placement == placement)
                    .cloned()
                    .collect(),
            ),
            RpcGroupAvailability::Ready,
        );
    }
    let hot: BTreeSet<_> = state
        .projections
        .rebuild_hot(&auth.account_id, HotConfig::default(), chrono::Utc::now())
        .map_err(failure)?
        .into_iter()
        .map(|album| album.album_id)
        .collect();
    add(
        "hot",
        "Hot albums",
        RpcLibraryGroupKind::Albums,
        member_albums(
            albums
                .iter()
                .filter(|album| hot.contains(&album.id))
                .cloned()
                .collect(),
        ),
        RpcGroupAvailability::Ready,
    );
    let tags: BTreeSet<_> = albums
        .iter()
        .flat_map(|album| album.tags.iter().cloned())
        .collect();
    for tag in tags {
        add(
            &format!("tag\0{tag}"),
            &tag,
            RpcLibraryGroupKind::Albums,
            member_albums(
                albums
                    .iter()
                    .filter(|album| album.tags.contains(&tag))
                    .cloned()
                    .collect(),
            ),
            RpcGroupAvailability::Ready,
        );
    }
    let bookmarks = state
        .library
        .list_bookmarks(&auth.account_id)
        .map_err(failure)?;
    let members = bookmarks
        .into_iter()
        .map(|bookmark| {
            let track = state
                .library
                .get_track(&auth.account_id, &bookmark.track_id)
                .map_err(failure)?
                .map(|track| RpcLibraryTrack {
                    id: track.id,
                    title: track.title,
                    artist: track.artist,
                    duration_ms: track.duration_ms,
                    track_number: track.track_number,
                    artwork_url: track.artwork_url,
                    revision: u32::try_from(track.revision).unwrap_or(u32::MAX),
                });
            Ok(RpcGroupMember::Bookmark(RpcBookmarkMember {
                bookmark: RpcBookmark {
                    id: bookmark.id,
                    track_id: bookmark.track_id,
                    created_at: bookmark.created_at,
                },
                track,
            }))
        })
        .collect::<Result<_, RpcFailure>>()?;
    add(
        "bookmarks",
        "Bookmarks",
        RpcLibraryGroupKind::Bookmarks,
        members,
        RpcGroupAvailability::Ready,
    );
    let (stations, availability) = match state.stations.list(auth).map_err(failure)? {
        StationListOutcome::NoSources => (vec![], RpcGroupAvailability::Ready),
        StationListOutcome::Ready { stations, failures } => {
            let availability = if failures.is_empty() {
                RpcGroupAvailability::Ready
            } else {
                RpcGroupAvailability::Partial(
                    failures
                        .into_iter()
                        .map(|source| RpcSourceFailure {
                            plugin_id: source.plugin_id,
                            failure: RpcFailure {
                                code: source.code,
                                message: source.message,
                                retryable: source.retryable,
                            },
                        })
                        .collect(),
                )
            };
            (
                stations
                    .into_iter()
                    .map(|station| RpcGroupMember::Station(rpc_station(station)))
                    .collect(),
                availability,
            )
        }
    };
    add(
        "stations",
        "Stations",
        RpcLibraryGroupKind::Stations,
        stations,
        availability,
    );
    let playlists = state
        .library
        .list_playlists(&auth.account_id)
        .map_err(failure)?;
    add(
        "playlists",
        "Playlists",
        RpcLibraryGroupKind::Playlists,
        playlists
            .into_iter()
            .map(|playlist| RpcGroupMember::Playlist(rpc_playlist(playlist)))
            .collect(),
        RpcGroupAvailability::Ready,
    );
    Ok(groups)
}

pub(crate) fn list(state: &AppState, auth: &AuthContext) -> GroupsListOutcome {
    match gather(state, auth) {
        Ok(groups) => {
            GroupsListOutcome::Ready(groups.into_iter().map(|group| group.record).collect())
        }
        Err(error) => GroupsListOutcome::Unavailable(error),
    }
}

pub(crate) fn items(
    state: &AppState,
    auth: &AuthContext,
    request: GroupItemsListRequest,
) -> GroupItemsListOutcome {
    if !(1..=100).contains(&request.limit) {
        return GroupItemsListOutcome::Rejected(RpcFailure::permanent(
            "library.invalidLimit",
            "limit must be 1..100",
        ));
    }
    let saved = if let Some(cursor) = request.cursor {
        let pages = state.group_pages.0.lock().expect("group pages poisoned");
        let Some(page) = pages.get(&cursor).filter(|page| {
            page.account_id == auth.account_id.as_str()
                && page.group_id == request.group_id
                && page.issued.elapsed() < Duration::from_secs(1800)
        }) else {
            return GroupItemsListOutcome::Rejected(RpcFailure::permanent(
                "library.invalidCursor",
                "cursor expired or belongs to another account/group",
            ));
        };
        SavedPage {
            account_id: page.account_id.clone(),
            group_id: page.group_id.clone(),
            items: page.items.clone(),
            availability: page.availability.clone(),
            issued: page.issued,
        }
    } else {
        let groups = match gather(state, auth) {
            Ok(groups) => groups,
            Err(error) => return GroupItemsListOutcome::Unavailable(error),
        };
        let Some(group) = groups
            .into_iter()
            .find(|group| group.record.id == request.group_id)
        else {
            return GroupItemsListOutcome::UnknownGroup;
        };
        SavedPage {
            account_id: auth.account_id.as_str().into(),
            group_id: request.group_id,
            items: group.members,
            availability: group.record.availability,
            issued: Instant::now(),
        }
    };
    let mut remaining = saved.items;
    let tail = remaining.split_off(remaining.len().min(request.limit as usize));
    let cursor = if tail.is_empty() {
        None
    } else {
        let cursor = Ulid::new().to_string();
        let mut pages = state.group_pages.0.lock().expect("group pages poisoned");
        pages.retain(|_, page| page.issued.elapsed() < Duration::from_secs(1800));
        if pages.len() >= 512 {
            if let Some(oldest) = pages
                .iter()
                .min_by_key(|(_, page)| page.issued)
                .map(|(id, _)| id.clone())
            {
                pages.remove(&oldest);
            }
        }
        pages.insert(
            cursor.clone(),
            SavedPage {
                items: tail,
                account_id: saved.account_id,
                group_id: saved.group_id,
                availability: saved.availability.clone(),
                issued: saved.issued,
            },
        );
        Some(cursor)
    };
    GroupItemsListOutcome::Ready(RpcGroupPage {
        items: remaining,
        cursor,
        availability: saved.availability,
    })
}
