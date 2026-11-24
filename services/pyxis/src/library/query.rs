use std::cmp::Reverse;
use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

use chrono::DateTime;
use ulid::Ulid;

use super::{Album, Library, LibraryError};
use crate::db::{schema, store::AccountId};
use crate::listen::events::JournalRecord;
use crate::rpc::contract::{AlbumsQueryRequest, RpcAlbumSort};

const LIFETIME: Duration = Duration::from_secs(30 * 60);
const MAX_SNAPSHOTS: usize = 16;

#[derive(Default)]
pub(super) struct AlbumPages(VecDeque<Snapshot>);

pub(crate) struct AlbumPage {
    pub albums: Vec<Album>,
    pub cursor: Option<String>,
}

struct Snapshot {
    id: Ulid,
    issued: Instant,
    account: AccountId,
    shelf_id: Option<String>,
    albums: Vec<Album>,
}

impl Snapshot {
    fn page(&self, offset: usize, limit: usize) -> AlbumPage {
        let end = (offset + limit).min(self.albums.len());
        AlbumPage {
            albums: self.albums[offset..end].to_vec(),
            cursor: (end < self.albums.len()).then(|| format!("{}:{end}", self.id)),
        }
    }
}

impl Library {
    pub(crate) fn query_albums(
        &self,
        account: &AccountId,
        query: AlbumsQueryRequest,
    ) -> Result<AlbumPage, LibraryError> {
        self.query_page(account, None, query)
    }

    pub(super) fn query_page(
        &self,
        account: &AccountId,
        shelf_id: Option<&str>,
        mut query: AlbumsQueryRequest,
    ) -> Result<AlbumPage, LibraryError> {
        let limit = query.limit.unwrap_or(50) as usize;
        if !(1..=100).contains(&limit) {
            return Err(LibraryError::InvalidQuery("limit must be 1..100"));
        }
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
            let invalid = LibraryError::InvalidQuery("invalid or expired album cursor");
            let Some((id, offset)) = cursor
                .split_once(':')
                .and_then(|(id, n)| Some((Ulid::from_string(id).ok()?, n.parse::<usize>().ok()?)))
            else {
                return Err(invalid);
            };
            let pages = self.pages.lock().expect("album pages poisoned");
            let snapshot = pages
                .0
                .iter()
                .find(|s| {
                    s.id == id
                        && s.account == *account
                        && s.shelf_id.as_deref() == shelf_id
                        && s.issued.elapsed() < LIFETIME
                        && offset < s.albums.len()
                })
                .ok_or(invalid)?;
            return Ok(snapshot.page(offset, limit));
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
        let snapshot = Snapshot {
            id: Ulid::new(),
            issued: Instant::now(),
            account: account.clone(),
            shelf_id: shelf_id.map(str::to_owned),
            albums,
        };
        let page = snapshot.page(0, limit);
        if page.cursor.is_some() {
            let mut pages = self.pages.lock().expect("album pages poisoned");
            pages.0.retain(|s| s.issued.elapsed() < LIFETIME);
            if pages.0.len() >= MAX_SNAPSHOTS {
                pages.0.pop_front();
            }
            pages.0.push_back(snapshot);
        }
        Ok(page)
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
