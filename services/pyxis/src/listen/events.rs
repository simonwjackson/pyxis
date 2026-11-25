use std::sync::{Arc, Mutex};

use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::db::schema;
use crate::db::store::{AccountId, Store, StoreError};

pub use crate::rpc::contract::ListenTrackEventInput as TrackListenInput;
pub type ListenEvent = TrackListenInput;
use crate::rpc::contract::{JournalEvent, JournalKind};
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AppendResult {
    pub accepted: usize,
    pub duplicates: usize,
}

#[derive(Debug, thiserror::Error)]
pub enum ListenError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error("listen event id '{0}' is not a ULID")]
    InvalidEventId(String),
    #[error("listen event time '{0}' is not RFC3339")]
    InvalidTime(String),
    #[error("unknown history cursor")]
    InvalidCursor,
    #[error("listen event id '{0}' was replayed with different content")]
    EventIdConflict(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct JournalRecord {
    pub id: String,
    pub account_id: String,
    pub kind: String,
    pub happened_at: String,
    pub device_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_plugin_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub played_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_id: Option<String>,
    pub revision: u64,
    pub updated_by: String,
    pub updated_at: String,
}

#[derive(Clone)]
pub struct ListenLog {
    store: Store,
    append: Arc<Mutex<()>>,
}

impl ListenLog {
    pub fn open(store: Store) -> Self {
        ListenLog {
            store,
            append: Arc::new(Mutex::new(())),
        }
    }

    /// Each event is one durable append. A process crash can leave a batch partially
    /// accepted, but replaying the same batch fills the remainder without duplication.
    pub fn append_batch(
        &self,
        account: &AccountId,
        events: Vec<TrackListenInput>,
        updated_by: &str,
    ) -> Result<AppendResult, ListenError> {
        let _guard = self.append.lock().expect("listen append poisoned");
        for event in &events {
            validate(event)?;
            if let Some(existing) =
                self.store
                    .get::<JournalRecord>(schema::LISTEN_EVENTS, account, &event.id)?
            {
                if input_of(&existing).as_ref() != Some(event) {
                    return Err(ListenError::EventIdConflict(event.id.clone()));
                }
            }
        }

        let mut accepted = 0;
        let mut duplicates = 0;
        for event in events {
            if self
                .store
                .get::<JournalRecord>(schema::LISTEN_EVENTS, account, &event.id)?
                .is_some()
            {
                duplicates += 1;
                continue;
            }
            let record = record(event, updated_by);
            self.store
                .put(schema::LISTEN_EVENTS, account, &record.id, &record)?;
            accepted += 1;
        }
        Ok(AppendResult {
            accepted,
            duplicates,
        })
    }

    pub fn history(
        &self,
        account: &AccountId,
        limit: usize,
    ) -> Result<Vec<ListenEvent>, ListenError> {
        let (events, _) = self.history_page(
            account,
            limit,
            None,
            None,
            None,
            Some(&[JournalKind::TrackPlayed]),
        )?;
        Ok(events
            .into_iter()
            .map(|JournalEvent::TrackPlayed(e)| e)
            .collect())
    }

    pub fn history_page(
        &self,
        account: &AccountId,
        limit: usize,
        from: Option<&str>,
        to: Option<&str>,
        cursor: Option<&str>,
        kinds: Option<&[JournalKind]>,
    ) -> Result<(Vec<JournalEvent>, Option<String>), ListenError> {
        let instant = |text: &str| {
            DateTime::parse_from_rfc3339(text).map_err(|_| ListenError::InvalidTime(text.into()))
        };
        let from = from.map(instant).transpose()?;
        let to = to.map(instant).transpose()?;
        let before = if let Some(id) = cursor {
            let record = self
                .store
                .get::<JournalRecord>(schema::LISTEN_EVENTS, account, id)?
                .ok_or(ListenError::InvalidCursor)?;
            Some((instant(&record.happened_at)?, record.id))
        } else {
            None
        };
        let mut events = Vec::new();
        for record in self
            .store
            .list::<JournalRecord>(schema::LISTEN_EVENTS, account)?
        {
            let time = instant(&record.happened_at)?;
            if from.is_some_and(|f| time < f)
                || to.is_some_and(|t| time >= t)
                || before
                    .as_ref()
                    .is_some_and(|(t, id)| (time, &record.id) >= (*t, id))
            {
                continue;
            }
            if kinds.is_some_and(|k| !k.contains(&JournalKind::TrackPlayed)) {
                continue;
            }
            if let Some(event) = event_of(&record) {
                events.push((time, event));
            }
        }
        events.sort_by(|(a, x), (b, y)| (b, &y.id).cmp(&(a, &x.id)));
        let more = events.len() > limit;
        events.truncate(limit);
        let cursor = events.last().filter(|_| more).map(|(_, e)| e.id.clone());
        Ok((
            events
                .into_iter()
                .map(|(_, event)| JournalEvent::TrackPlayed(event))
                .collect(),
            cursor,
        ))
    }
}

fn validate(event: &TrackListenInput) -> Result<(), ListenError> {
    Ulid::from_string(&event.id).map_err(|_| ListenError::InvalidEventId(event.id.clone()))?;
    DateTime::parse_from_rfc3339(&event.listened_at)
        .map_err(|_| ListenError::InvalidTime(event.listened_at.clone()))?;
    Ok(())
}

fn record(event: TrackListenInput, updated_by: &str) -> JournalRecord {
    JournalRecord {
        id: event.id,
        account_id: String::new(),
        kind: "trackPlayed".into(),
        happened_at: event.listened_at,
        device_id: event.device_id,
        track_id: Some(event.track_id),
        album_id: event.album_id,
        source_plugin_id: event.source_plugin_id,
        played_ms: event.played_ms.map(u64::from),
        completed: Some(event.completed),
        context: Some(event.context),
        context_id: event.context_id,
        revision: 1,
        updated_by: updated_by.into(),
        updated_at: Utc::now().to_rfc3339_opts(SecondsFormat::Nanos, true),
    }
}

fn input_of(record: &JournalRecord) -> Option<TrackListenInput> {
    Some(TrackListenInput {
        id: record.id.clone(),
        track_id: record.track_id.clone()?,
        album_id: record.album_id.clone(),
        device_id: record.device_id.clone(),
        source_plugin_id: record.source_plugin_id.clone(),
        listened_at: record.happened_at.clone(),
        played_ms: record
            .played_ms
            .map(|n| u32::try_from(n).unwrap_or(u32::MAX)),
        completed: record.completed.unwrap_or(false),
        context: record.context.clone()?,
        context_id: record.context_id.clone(),
    })
}

fn event_of(record: &JournalRecord) -> Option<ListenEvent> {
    if record.kind != "trackPlayed" {
        return None;
    }
    Some(ListenEvent {
        id: record.id.clone(),
        track_id: record.track_id.clone()?,
        album_id: record.album_id.clone(),
        device_id: record.device_id.clone(),
        source_plugin_id: record.source_plugin_id.clone(),
        listened_at: record.happened_at.clone(),
        played_ms: record
            .played_ms
            .map(|n| u32::try_from(n).unwrap_or(u32::MAX)),
        completed: record.completed.unwrap_or(false),
        context: record.context.clone()?,
        context_id: record.context_id.clone(),
    })
}

#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(32))]

        #[test]
        fn replaying_any_batch_size_is_idempotent(count in 1_usize..25) {
            let dir = tempfile::tempdir().expect("temp dir");
            let log = ListenLog::open(Store::open(dir.path()).expect("store"));
            let account = AccountId::new("account-a");
            let events: Vec<_> = (0..count)
                .map(|index| TrackListenInput {
                    id: Ulid::new().to_string(),
                    track_id: format!("track-{index}"),
                    album_id: Some("album-a".into()),
                    device_id: "device-a".into(),
                    source_plugin_id: None,
                    listened_at: "2026-08-21T00:00:00Z".into(),
                    played_ms: Some(60_000),
                    completed: false,
                    context: "queue".into(),
                    context_id: None,
                })
                .collect();

            let first = log.append_batch(&account, events.clone(), "device-a").unwrap();
            let replay = log.append_batch(&account, events, "device-a").unwrap();

            prop_assert_eq!(first.accepted, count);
            prop_assert_eq!(replay.duplicates, count);
            prop_assert_eq!(log.history(&account, count + 1).unwrap().len(), count);
        }
    }
}
