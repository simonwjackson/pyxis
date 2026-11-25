use std::cmp::Reverse;
use std::collections::HashMap;

use chrono::{DateTime, Utc};
use miniz_oxide::{deflate::compress_to_vec, inflate::decompress_to_vec_with_limit};

use super::{Album, Library, LibraryError};
use crate::db::{schema, store::AccountId};
use crate::listen::events::JournalRecord;
use crate::rpc::contract::{AlbumsQueryRequest, RpcAlbumSort};

use crate::sealed_tokens::SealedTokens;

// Leave room in the 1 MiB RPC body for the continuation request envelope.
const MAX_CURSOR_BYTES: usize = crate::api::MAX_RPC_BODY_BYTES - 1024;
// A small, authentic cursor must not expand to an unbounded allocation on each replay.
const MAX_SNAPSHOT_BYTES: usize = 32 * 1024 * 1024;
const TOO_LARGE: LibraryError =
    LibraryError::InvalidQuery("album snapshot is too large; narrow the query");

pub(crate) struct AlbumPage {
    pub albums: Vec<Album>,
    pub cursor: Option<String>,
}

impl AlbumPage {
    fn take(
        mut albums: Vec<Album>,
        limit: usize,
        cursors: &SealedTokens,
        scope: &[u8],
        issued: i64,
    ) -> Result<Self, LibraryError> {
        let cursor = if albums.len() > limit {
            let remaining = albums.split_off(limit);
            let body =
                serde_json::to_vec(&remaining).map_err(|e| LibraryError::Corrupt(e.to_string()))?;
            if body.len() > MAX_SNAPSHOT_BYTES {
                return Err(TOO_LARGE);
            }
            let cursor = cursors.seal(scope, &compress_to_vec(&body, 1), issued)?;
            if cursor.len() > MAX_CURSOR_BYTES {
                return Err(TOO_LARGE);
            }
            Some(cursor)
        } else {
            None
        };
        Ok(Self { albums, cursor })
    }
}

impl Library {
    pub(crate) fn query_albums(
        &self,
        cursors: &SealedTokens,
        account: &AccountId,
        query: AlbumsQueryRequest,
    ) -> Result<AlbumPage, LibraryError> {
        self.query_page(cursors, account, None, query)
    }

    pub(super) fn query_page(
        &self,
        cursors: &SealedTokens,
        account: &AccountId,
        shelf_id: Option<&str>,
        mut query: AlbumsQueryRequest,
    ) -> Result<AlbumPage, LibraryError> {
        let limit = query.limit.unwrap_or(50) as usize;
        if !(1..=100).contains(&limit) {
            return Err(LibraryError::InvalidQuery("limit must be 1..100"));
        }
        let scope = serde_json::json!([account.as_str(), shelf_id]).to_string();
        let now = Utc::now().timestamp();
        if let Some(cursor) = query.cursor {
            if query.text.is_some()
                || query.artist.is_some()
                || query.tag_expression.is_some()
                || query.sort.is_some()
            {
                return Err(LibraryError::InvalidQuery(
                    "a continuation takes only cursor and limit",
                ));
            }
            let invalid = || LibraryError::InvalidQuery("invalid or expired album cursor");
            let (issued, body) = cursors
                .open(scope.as_bytes(), &cursor, now)
                .ok_or_else(invalid)?;
            let albums = serde_json::from_slice(
                &decompress_to_vec_with_limit(&body, MAX_SNAPSHOT_BYTES).map_err(|_| invalid())?,
            )
            .map_err(|_| invalid())?;
            return AlbumPage::take(albums, limit, cursors, scope.as_bytes(), issued);
        }
        if let Some(expr) = &mut query.tag_expression {
            expr.normalize().map_err(LibraryError::InvalidQuery)?;
        }
        let text = query.text.map(|s| s.trim().to_lowercase());
        let artist = query.artist.map(|s| s.trim().to_lowercase());
        let mut albums = {
            let _guard = self.mutation.lock().expect("library mutation poisoned");
            self.list_albums(account)?
        };
        albums.retain(|a| {
            text.as_ref().is_none_or(|q| {
                a.title.to_lowercase().contains(q) || a.artist.to_lowercase().contains(q)
            }) && artist
                .as_ref()
                .is_none_or(|q| a.artist.to_lowercase() == *q)
                && query
                    .tag_expression
                    .as_ref()
                    .is_none_or(|e| e.matches(&a.tags))
        });
        match query.sort.unwrap_or(RpcAlbumSort::Added) {
            RpcAlbumSort::Added => {
                albums.sort_by(|a, b| b.added_at.cmp(&a.added_at).then(a.id.cmp(&b.id)))
            }
            RpcAlbumSort::Artist => {
                albums.sort_by_cached_key(|a| (a.artist.to_lowercase(), a.id.clone()))
            }
            RpcAlbumSort::Title => {
                albums.sort_by_cached_key(|a| (a.title.to_lowercase(), a.id.clone()))
            }
            RpcAlbumSort::LastPlayed => self.sort_last_played(account, &mut albums)?,
        }
        AlbumPage::take(albums, limit, cursors, scope.as_bytes(), now)
    }

    fn sort_last_played(
        &self,
        account: &AccountId,
        albums: &mut [Album],
    ) -> Result<(), LibraryError> {
        let mut by_album = HashMap::new();
        let mut by_track = HashMap::new();
        for event in self
            .store
            .list::<JournalRecord>(schema::LISTEN_EVENTS, account)?
        {
            if event.kind != "trackPlayed" {
                continue;
            }
            let (map, id) = match (event.album_id, event.track_id) {
                (Some(id), _) => (&mut by_album, id),
                (None, Some(id)) => (&mut by_track, id),
                _ => continue,
            };
            let time = DateTime::parse_from_rfc3339(&event.happened_at)
                .map_err(|e| LibraryError::Corrupt(e.to_string()))?;
            let latest = map.entry(id).or_insert(time);
            *latest = time.max(*latest);
        }
        albums.sort_by_cached_key(|album| {
            let time = by_album
                .get(&album.id)
                .into_iter()
                .chain(
                    album
                        .tracks
                        .iter()
                        .filter_map(|track| by_track.get(&track.id)),
                )
                .max()
                .copied();
            (Reverse(time), album.id.clone())
        });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};

    #[test]
    fn never_issues_a_cursor_too_large_for_the_next_rpc() {
        let mut noise = vec![0; crate::api::MAX_RPC_BODY_BYTES];
        blake3::Hasher::new().finalize_xof().fill(&mut noise);
        let mut album = Album {
            id: "first".into(),
            tags: vec![],
            title: "first".into(),
            artist: "artist".into(),
            year: None,
            artwork_url: None,
            added_at: String::new(),
            revision: 1,
            tracks: vec![],
        };
        let first = album.clone();
        album.id = "second".into();
        album.artwork_url = Some(STANDARD.encode(noise));
        let cursors = SealedTokens::new(&[0; 32], "test album cursors", 1800);
        assert!(matches!(
            AlbumPage::take(vec![first, album], 1, &cursors, b"scope", 0),
            Err(LibraryError::InvalidQuery(_))
        ));
    }
}
