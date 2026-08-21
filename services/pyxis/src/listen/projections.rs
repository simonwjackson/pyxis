use std::collections::HashMap;

use chrono::{DateTime, Days, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

use crate::db::schema;
use crate::db::store::{AccountId, Store};

use super::events::{ListenError, ListenLog};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HotConfig {
    pub min_recent_listens: u32,
    pub window_days: u64,
}

impl Default for HotConfig {
    fn default() -> Self {
        HotConfig {
            min_recent_listens: 3,
            window_days: 30,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HotAlbum {
    pub album_id: String,
    pub listen_count: u32,
    pub window_start: String,
    pub computed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HotAlbumRecord {
    id: String,
    account_id: String,
    album_id: String,
    listen_count: u32,
    window_start: String,
    computed_at: String,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

#[derive(Clone)]
pub struct Projections {
    store: Store,
    log: ListenLog,
}

impl Projections {
    pub fn open(store: Store) -> Self {
        Projections {
            log: ListenLog::open(store.clone()),
            store,
        }
    }

    pub fn rebuild_hot(
        &self,
        account: &AccountId,
        config: HotConfig,
        now: DateTime<Utc>,
    ) -> Result<Vec<HotAlbum>, ListenError> {
        let window_start = now
            .checked_sub_days(Days::new(config.window_days))
            .unwrap_or(DateTime::<Utc>::MIN_UTC);
        let mut counts: HashMap<String, u32> = HashMap::new();
        for event in self.log.journal(account)? {
            if event.kind != "trackPlayed" {
                continue;
            }
            let Some(album_id) = event.album_id else {
                continue;
            };
            let happened_at = DateTime::parse_from_rfc3339(&event.happened_at)
                .map_err(|_| ListenError::InvalidTime(event.happened_at.clone()))?
                .with_timezone(&Utc);
            if happened_at >= window_start && happened_at <= now {
                *counts.entry(album_id).or_default() += 1;
            }
        }

        let threshold = config.min_recent_listens.max(1);
        let computed_at = now.to_rfc3339_opts(SecondsFormat::Secs, true);
        let window_start_text = window_start.to_rfc3339_opts(SecondsFormat::Secs, true);
        let mut albums: Vec<_> = counts
            .into_iter()
            .filter(|(_, count)| *count >= threshold)
            .map(|(album_id, listen_count)| HotAlbum {
                album_id,
                listen_count,
                window_start: window_start_text.clone(),
                computed_at: computed_at.clone(),
            })
            .collect();
        albums.sort_by(|left, right| {
            right
                .listen_count
                .cmp(&left.listen_count)
                .then_with(|| left.album_id.cmp(&right.album_id))
        });

        let existing = self
            .store
            .list::<HotAlbumRecord>(schema::HOT_ALBUMS, account)?;
        let deletions: Vec<_> = existing
            .into_iter()
            .map(|record| (schema::HOT_ALBUMS.to_string(), record.id))
            .collect();
        self.store.delete_batch(account, &deletions)?;

        for album in &albums {
            let id = projection_id(account, &album.album_id);
            let record = HotAlbumRecord {
                id: id.clone(),
                account_id: String::new(),
                album_id: album.album_id.clone(),
                listen_count: album.listen_count,
                window_start: album.window_start.clone(),
                computed_at: album.computed_at.clone(),
                revision: 1,
                updated_by: "projection".into(),
                updated_at: computed_at.clone(),
            };
            self.store.put(schema::HOT_ALBUMS, account, &id, &record)?;
        }
        Ok(albums)
    }

    pub fn list_hot(&self, account: &AccountId) -> Result<Vec<HotAlbum>, ListenError> {
        let mut albums: Vec<_> = self
            .store
            .list::<HotAlbumRecord>(schema::HOT_ALBUMS, account)?
            .into_iter()
            .map(|record| HotAlbum {
                album_id: record.album_id,
                listen_count: record.listen_count,
                window_start: record.window_start,
                computed_at: record.computed_at,
            })
            .collect();
        albums.sort_by(|left, right| {
            right
                .listen_count
                .cmp(&left.listen_count)
                .then_with(|| left.album_id.cmp(&right.album_id))
        });
        Ok(albums)
    }
}

fn projection_id(account: &AccountId, album_id: &str) -> String {
    blake3::hash(format!("hot\0{}\0{album_id}", account.as_str()).as_bytes()).to_hex()[..26]
        .to_string()
}
