//! Account-scoped album library.
//!
//! Albums enter only through [`Library::add_album`] and always start in Discovery. Source
//! ids live in `albumSourceRefs`; album and track ids remain opaque core identity.

pub mod albums;
pub mod placement;

use std::sync::{Arc, Mutex};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::db::schema;
use crate::db::store::{AccountId, Store, StoreError};

pub use albums::{Album, AlbumInput, SourceReference, Track, TrackInput};
pub use placement::Placement;

use albums::{normalize, AlbumRecord, AlbumTrackRecord, SourceReferenceRecord, TrackRecord};

#[derive(Debug, thiserror::Error)]
pub enum LibraryError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error("album title and artist are required")]
    InvalidAlbum,
    #[error("library relationship is corrupt: {0}")]
    Corrupt(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Bookmark {
    pub id: String,
    pub track_id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlaylistInput {
    pub title: String,
    pub track_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Playlist {
    pub id: String,
    pub title: String,
    pub track_ids: Vec<String>,
    pub revision: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BookmarkRecord {
    id: String,
    account_id: String,
    track_id: String,
    created_at: String,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistRecord {
    id: String,
    account_id: String,
    title: String,
    track_ids: Vec<String>,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

#[derive(Clone)]
pub struct Library {
    store: Store,
    mutation: Arc<Mutex<()>>,
}

impl Library {
    pub fn open(store: Store) -> Self {
        Library {
            store,
            mutation: Arc::new(Mutex::new(())),
        }
    }

    pub fn add_album(
        &self,
        account: &AccountId,
        input: AlbumInput,
        updated_by: &str,
    ) -> Result<Album, LibraryError> {
        if input.title.trim().is_empty() || input.artist.trim().is_empty() {
            return Err(LibraryError::InvalidAlbum);
        }
        let _guard = self.mutation.lock().expect("library mutation poisoned");

        if let Some(existing_id) = self.find_existing(account, &input)? {
            let existing = self.get_album(account, &existing_id)?.ok_or_else(|| {
                LibraryError::Corrupt("source ref points to missing album".into())
            })?;
            if existing.placement == Placement::Dismissed {
                return self
                    .set_placement_locked(account, &existing.id, Placement::Discovery, updated_by)?
                    .ok_or_else(|| LibraryError::Corrupt("album vanished during re-add".into()));
            }
            return Ok(existing);
        }

        let id = Ulid::new().to_string();
        let timestamp = now();
        let album = AlbumRecord {
            id: id.clone(),
            account_id: String::new(),
            title: input.title.trim().into(),
            artist: input.artist.trim().into(),
            normalized_title: normalize(&input.title),
            normalized_artist: normalize(&input.artist),
            placement: Placement::Discovery,
            placement_updated_at: timestamp.clone(),
            year: input.year,
            added_at: timestamp.clone(),
            revision: 1,
            updated_by: updated_by.into(),
            updated_at: timestamp.clone(),
        };
        self.store.put(schema::ALBUMS, account, &id, &album)?;

        let mut created_tracks = Vec::new();
        let mut relationships = Vec::new();
        let result = (|| -> Result<(), LibraryError> {
            for (index, input) in input.tracks.into_iter().enumerate() {
                let track_id = input.id.unwrap_or_else(|| Ulid::new().to_string());
                if self
                    .store
                    .get::<TrackRecord>(schema::TRACKS, account, &track_id)?
                    .is_none()
                {
                    let track = TrackRecord {
                        id: track_id.clone(),
                        account_id: String::new(),
                        title: input.title,
                        artist: input.artist,
                        duration_ms: input.duration_ms,
                        track_number: input.track_number,
                        artwork_url: None,
                        revision: 1,
                        updated_by: updated_by.into(),
                        updated_at: timestamp.clone(),
                    };
                    self.store.put(schema::TRACKS, account, &track_id, &track)?;
                    created_tracks.push(track_id.clone());
                }
                let relationship_id = relationship_id(&id, &track_id);
                let relationship = AlbumTrackRecord {
                    id: relationship_id.clone(),
                    account_id: String::new(),
                    album_id: id.clone(),
                    track_id,
                    position: u32::try_from(index).unwrap_or(u32::MAX),
                    revision: 1,
                    updated_by: updated_by.into(),
                    updated_at: timestamp.clone(),
                };
                self.store.put(
                    schema::ALBUM_TRACKS,
                    account,
                    &relationship_id,
                    &relationship,
                )?;
                relationships.push(relationship_id);
            }

            if let Some(reference) = input.source_reference {
                let reference_id =
                    source_reference_id(account, &reference.plugin_id, &reference.external_id);
                let record = SourceReferenceRecord {
                    id: reference_id.clone(),
                    account_id: String::new(),
                    album_id: id.clone(),
                    plugin_id: reference.plugin_id,
                    external_id: reference.external_id,
                    revision: 1,
                    updated_by: updated_by.into(),
                    updated_at: timestamp,
                };
                self.store
                    .put(schema::ALBUM_SOURCE_REFS, account, &reference_id, &record)?;
            }
            Ok(())
        })();

        if let Err(error) = result {
            for relationship in relationships {
                let _ = self
                    .store
                    .delete(schema::ALBUM_TRACKS, account, &relationship);
            }
            for track in created_tracks {
                let _ = self.store.delete(schema::TRACKS, account, &track);
            }
            let _ = self.store.delete(schema::ALBUMS, account, &id);
            return Err(error);
        }

        self.get_album(account, &id)?
            .ok_or_else(|| LibraryError::Corrupt("new album could not be read back".into()))
    }

    pub fn get_album(
        &self,
        account: &AccountId,
        album_id: &str,
    ) -> Result<Option<Album>, LibraryError> {
        let Some(record) = self
            .store
            .get::<AlbumRecord>(schema::ALBUMS, account, album_id)?
        else {
            return Ok(None);
        };
        Ok(Some(self.album(account, record)?))
    }

    pub fn list_albums(&self, account: &AccountId) -> Result<Vec<Album>, LibraryError> {
        let mut albums = Vec::new();
        for record in self.store.list::<AlbumRecord>(schema::ALBUMS, account)? {
            albums.push(self.album(account, record)?);
        }
        albums.sort_by(|left, right| {
            left.artist
                .cmp(&right.artist)
                .then_with(|| left.title.cmp(&right.title))
        });
        Ok(albums)
    }

    pub fn set_placement(
        &self,
        account: &AccountId,
        album_id: &str,
        placement: Placement,
        updated_by: &str,
    ) -> Result<Option<Album>, LibraryError> {
        let _guard = self.mutation.lock().expect("library mutation poisoned");
        self.set_placement_locked(account, album_id, placement, updated_by)
    }

    fn set_placement_locked(
        &self,
        account: &AccountId,
        album_id: &str,
        placement: Placement,
        updated_by: &str,
    ) -> Result<Option<Album>, LibraryError> {
        let Some(mut record) = self
            .store
            .get::<AlbumRecord>(schema::ALBUMS, account, album_id)?
        else {
            return Ok(None);
        };
        if record.placement != placement {
            let timestamp = now();
            record.placement = placement;
            record.placement_updated_at = timestamp.clone();
            record.revision += 1;
            record.updated_by = updated_by.into();
            record.updated_at = timestamp;
            self.store.put(schema::ALBUMS, account, album_id, &record)?;
        }
        Ok(Some(self.album(account, record)?))
    }

    pub fn remove_album(&self, account: &AccountId, album_id: &str) -> Result<bool, LibraryError> {
        let _guard = self.mutation.lock().expect("library mutation poisoned");
        if self
            .store
            .get::<AlbumRecord>(schema::ALBUMS, account, album_id)?
            .is_none()
        {
            return Ok(false);
        }
        let mut records: Vec<(String, String)> = self
            .store
            .list::<SourceReferenceRecord>(schema::ALBUM_SOURCE_REFS, account)?
            .into_iter()
            .filter(|reference| reference.album_id == album_id)
            .map(|reference| (schema::ALBUM_SOURCE_REFS.into(), reference.id))
            .collect();
        records.extend(
            self.store
                .list::<AlbumTrackRecord>(schema::ALBUM_TRACKS, account)?
                .into_iter()
                .filter(|relationship| relationship.album_id == album_id)
                .map(|relationship| (schema::ALBUM_TRACKS.into(), relationship.id)),
        );
        records.push((schema::ALBUMS.into(), album_id.into()));
        self.store.delete_batch(account, &records)?;
        Ok(true)
    }

    pub fn add_bookmark(
        &self,
        account: &AccountId,
        track_id: &str,
        updated_by: &str,
    ) -> Result<Bookmark, LibraryError> {
        let id = bookmark_id(account, track_id);
        if let Some(existing) = self
            .store
            .get::<BookmarkRecord>(schema::BOOKMARKS, account, &id)?
        {
            return Ok(bookmark(existing));
        }
        let timestamp = now();
        let record = BookmarkRecord {
            id: id.clone(),
            account_id: String::new(),
            track_id: track_id.into(),
            created_at: timestamp.clone(),
            revision: 1,
            updated_by: updated_by.into(),
            updated_at: timestamp,
        };
        self.store.put(schema::BOOKMARKS, account, &id, &record)?;
        Ok(bookmark(record))
    }

    pub fn remove_bookmark(
        &self,
        account: &AccountId,
        track_id: &str,
    ) -> Result<bool, LibraryError> {
        Ok(self
            .store
            .delete(schema::BOOKMARKS, account, &bookmark_id(account, track_id))?)
    }

    pub fn list_bookmarks(&self, account: &AccountId) -> Result<Vec<Bookmark>, LibraryError> {
        Ok(self
            .store
            .list::<BookmarkRecord>(schema::BOOKMARKS, account)?
            .into_iter()
            .map(bookmark)
            .collect())
    }

    pub fn create_playlist(
        &self,
        account: &AccountId,
        input: PlaylistInput,
        updated_by: &str,
    ) -> Result<Playlist, LibraryError> {
        let id = Ulid::new().to_string();
        let record = PlaylistRecord {
            id: id.clone(),
            account_id: String::new(),
            title: input.title,
            track_ids: input.track_ids,
            revision: 1,
            updated_by: updated_by.into(),
            updated_at: now(),
        };
        self.store.put(schema::PLAYLISTS, account, &id, &record)?;
        Ok(playlist(record))
    }

    pub fn list_playlists(&self, account: &AccountId) -> Result<Vec<Playlist>, LibraryError> {
        Ok(self
            .store
            .list::<PlaylistRecord>(schema::PLAYLISTS, account)?
            .into_iter()
            .map(playlist)
            .collect())
    }

    fn find_existing(
        &self,
        account: &AccountId,
        input: &AlbumInput,
    ) -> Result<Option<String>, LibraryError> {
        if let Some(reference) = &input.source_reference {
            if let Some(record) = self
                .store
                .list::<SourceReferenceRecord>(schema::ALBUM_SOURCE_REFS, account)?
                .into_iter()
                .find(|record| {
                    record.plugin_id == reference.plugin_id
                        && record.external_id == reference.external_id
                })
            {
                return Ok(Some(record.album_id));
            }
        }
        let title = normalize(&input.title);
        let artist = normalize(&input.artist);
        Ok(self
            .store
            .list::<AlbumRecord>(schema::ALBUMS, account)?
            .into_iter()
            .find(|record| {
                record.normalized_title == title
                    && record.normalized_artist == artist
                    && record.year == input.year
            })
            .map(|record| record.id))
    }

    fn album(&self, account: &AccountId, record: AlbumRecord) -> Result<Album, LibraryError> {
        let mut relationships: Vec<_> = self
            .store
            .list::<AlbumTrackRecord>(schema::ALBUM_TRACKS, account)?
            .into_iter()
            .filter(|relationship| relationship.album_id == record.id)
            .collect();
        relationships.sort_by_key(|relationship| relationship.position);
        let mut tracks = Vec::new();
        for relationship in relationships {
            let track = self
                .store
                .get::<TrackRecord>(schema::TRACKS, account, &relationship.track_id)?
                .ok_or_else(|| {
                    LibraryError::Corrupt(format!(
                        "album '{}' references missing track '{}'",
                        record.id, relationship.track_id
                    ))
                })?;
            tracks.push(Track {
                id: track.id,
                title: track.title,
                artist: track.artist,
                duration_ms: track.duration_ms,
                track_number: track.track_number,
                artwork_url: track.artwork_url,
                revision: track.revision,
            });
        }
        Ok(Album {
            id: record.id,
            title: record.title,
            artist: record.artist,
            year: record.year,
            placement: record.placement,
            placement_updated_at: record.placement_updated_at,
            added_at: record.added_at,
            revision: record.revision,
            tracks,
        })
    }
}

fn relationship_id(album_id: &str, track_id: &str) -> String {
    short_hash(&format!("album-track\0{album_id}\0{track_id}"))
}

fn source_reference_id(account: &AccountId, plugin_id: &str, external_id: &str) -> String {
    short_hash(&format!(
        "album-source\0{}\0{plugin_id}\0{external_id}",
        account.as_str()
    ))
}

fn bookmark_id(account: &AccountId, track_id: &str) -> String {
    short_hash(&format!("bookmark\0{}\0{track_id}", account.as_str()))
}

fn short_hash(value: &str) -> String {
    blake3::hash(value.as_bytes()).to_hex()[..26].to_string()
}

fn bookmark(record: BookmarkRecord) -> Bookmark {
    Bookmark {
        id: record.id,
        track_id: record.track_id,
        created_at: record.created_at,
    }
}

fn playlist(record: PlaylistRecord) -> Playlist {
    Playlist {
        id: record.id,
        title: record.title,
        track_ids: record.track_ids,
        revision: record.revision,
    }
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Nanos, true)
}
