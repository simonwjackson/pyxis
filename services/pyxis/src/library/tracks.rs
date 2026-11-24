use std::collections::{HashMap, HashSet};

use serde::Deserialize;

use super::{AlbumRecord, AlbumTrackRecord, Library, LibraryError};
use crate::db::{schema, store::AccountId};
use crate::media::CandidateMetadata;
use crate::rpc::contract::{RpcTrackMetadata, RpcTracksResult};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CandidateLabel {
    track_id: String,
    metadata: Option<CandidateMetadata>,
}

impl Library {
    pub(crate) fn track_metadata(
        &self,
        account: &AccountId,
        ids: &[String],
    ) -> Result<RpcTracksResult, LibraryError> {
        if ids.len() > 200 {
            return Err(LibraryError::TooManyTracks);
        }
        let mut result = RpcTracksResult {
            tracks: vec![],
            misses: vec![],
        };
        if ids.is_empty() {
            return Ok(result);
        }
        let wanted: HashSet<_> = ids.iter().collect();
        let _guard = self.mutation.lock().expect("library mutation poisoned");
        let mut albums = HashMap::<String, String>::new();
        for link in self
            .store
            .list::<AlbumTrackRecord>(schema::ALBUM_TRACKS, account)?
        {
            if wanted.contains(&link.track_id) {
                let id = albums
                    .entry(link.track_id)
                    .or_insert_with(|| link.album_id.clone());
                if link.album_id < *id {
                    *id = link.album_id;
                }
            }
        }
        let mut labels: HashMap<_, _> = self
            .store
            .list::<CandidateLabel>(schema::TRACK_CANDIDATES, account)?
            .into_iter()
            .filter(|c| wanted.contains(&c.track_id))
            .filter_map(|c| Some((c.track_id, c.metadata?)))
            .collect();
        let mut found = HashMap::new();
        for id in wanted {
            let label = labels.remove(id);
            let (title, artist, duration_ms) = match (self.get_track(account, id)?, &label) {
                (Some(t), _) => (
                    t.title,
                    t.artist,
                    t.duration_ms
                        .or_else(|| label.as_ref().and_then(|m| m.duration_ms)),
                ),
                (None, Some(m)) => (m.title.clone(), m.artist.clone(), m.duration_ms),
                _ => continue,
            };
            let album_id = albums.remove(id);
            let album_title = match &album_id {
                Some(id) => self
                    .store
                    .get::<AlbumRecord>(schema::ALBUMS, account, id)?
                    .map(|a| a.title),
                None => label.and_then(|m| m.album_title),
            };
            found.insert(
                id,
                RpcTrackMetadata {
                    id: id.clone(),
                    title,
                    artist,
                    duration_ms,
                    album_id,
                    album_title,
                },
            );
        }
        for id in ids {
            match found.get(id) {
                Some(track) => result.tracks.push(track.clone()),
                None => result.misses.push(id.clone()),
            }
        }
        Ok(result)
    }
}
