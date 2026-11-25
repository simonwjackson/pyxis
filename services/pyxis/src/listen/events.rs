use std::sync::{Arc, Mutex};

use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::db::schema;
use crate::db::store::{AccountId, Store, StoreError, StoreWrite};
pub use crate::rpc::contract::ListenTrackEventInput as TrackListenInput;
use crate::rpc::contract::{
    CaptureEntryContext, JournalEvent, JournalKind, ListenCaptureInput, ListenStationSessionInput,
};

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

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct JournalRecord {
    pub id: String,
    pub account_id: String,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub station_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_origin: Option<crate::rpc::contract::CaptureContext>,

    pub happened_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
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

#[derive(Default)]
pub struct PageQuery<'a> {
    pub limit: usize,
    pub from: Option<&'a str>,
    pub to: Option<&'a str>,
    pub cursor: Option<&'a str>,
    pub kinds: Option<&'a [JournalKind]>,
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

    pub fn append_batch(
        &self,
        account: &AccountId,
        events: Vec<TrackListenInput>,
        updated_by: &str,
    ) -> Result<AppendResult, ListenError> {
        self.append_events(
            account,
            events.into_iter().map(JournalEvent::TrackPlayed).collect(),
            updated_by,
        )
    }

    pub fn append_events(
        &self,
        account: &AccountId,
        events: Vec<JournalEvent>,
        updated_by: &str,
    ) -> Result<AppendResult, ListenError> {
        let _guard = self.append.lock().expect("listen append poisoned");
        let total = events.len();
        let mut pending = std::collections::BTreeMap::new();
        for event in events {
            let row = record(event, updated_by)?;
            let existing =
                self.store
                    .get::<JournalRecord>(schema::LISTEN_EVENTS, account, &row.id)?;
            if let Some(previous) = existing.as_ref().or_else(|| pending.get(&row.id)) {
                if event_of(previous) != event_of(&row) {
                    return Err(ListenError::EventIdConflict(row.id));
                }
            } else {
                pending.insert(row.id.clone(), row);
            }
        }
        let accepted = pending.len();
        self.store.put_batch(
            schema::LISTEN_EVENTS,
            account,
            &pending.into_iter().collect::<Vec<_>>(),
        )?;
        Ok(AppendResult {
            accepted,
            duplicates: total - accepted,
        })
    }

    pub fn history(
        &self,
        account: &AccountId,
        limit: usize,
    ) -> Result<Vec<TrackListenInput>, ListenError> {
        let (events, _) = self.history_page(
            account,
            PageQuery {
                limit,
                kinds: Some(&[JournalKind::TrackPlayed]),
                ..Default::default()
            },
        )?;
        Ok(events
            .into_iter()
            .filter_map(|row| match row {
                JournalEvent::TrackPlayed(e) => Some(e),
                _ => None,
            })
            .collect())
    }

    pub fn history_page(
        &self,
        account: &AccountId,
        PageQuery {
            limit,
            from,
            to,
            cursor,
            kinds,
        }: PageQuery<'_>,
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
            if let Some(event) = event_of(&record) {
                if kinds.is_none_or(|k| k.contains(&JournalKind::from(&event))) {
                    events.push((time, record.id, event));
                }
            }
        }
        events.sort_by(|(a, x, _), (b, y, _)| (b, y).cmp(&(a, x)));
        let more = events.len() > limit;
        events.truncate(limit);
        let cursor = events.last().filter(|_| more).map(|(_, id, _)| id.clone());
        Ok((events.into_iter().map(|(_, _, e)| e).collect(), cursor))
    }
}
fn record(event: JournalEvent, actor: &str) -> Result<JournalRecord, ListenError> {
    let mut row = JournalRecord::default();
    match event {
        JournalEvent::TrackPlayed(e) => {
            row.kind = "trackPlayed".into();
            row.id = e.id;
            row.device_id = Some(e.device_id);
            row.happened_at = e.listened_at;
            row.track_id = Some(e.track_id);
            row.album_id = e.album_id;
            row.source_plugin_id = e.source_plugin_id;
            row.completed = Some(e.completed);
            row.context = Some(e.context);
            row.context_id = e.context_id;
            row.played_ms = e.played_ms.map(u64::from);
        }
        JournalEvent::StationSession(e) => {
            row.kind = "stationSession".into();
            row.id = e.id;
            row.device_id = Some(e.device_id);
            row.happened_at = e.started_at;
            row.source_plugin_id = Some(e.source_plugin_id);
            row.session_id = Some(e.session_id);
            row.station_id = Some(e.station_id);
            row.ended_at = e.ended_at;
        }
        JournalEvent::Capture(e) => {
            row.kind = "capture".into();
            row.id = e.id;
            row.device_id = e.device_id;
            row.happened_at = e.captured_at;
            row.album_id = Some(e.album_id);
            row.track_id = e.entry_context.track_id;
            row.entry_origin = Some(e.entry_context.origin);
        }
    }
    Ulid::from_string(&row.id).map_err(|_| ListenError::InvalidEventId(row.id.clone()))?;
    let instant = |s: &str| {
        DateTime::parse_from_rfc3339(s).map_err(|_| ListenError::InvalidTime(s.to_string()))
    };
    let start = instant(&row.happened_at)?;
    if let Some(end) = &row.ended_at {
        if instant(end)? < start {
            return Err(ListenError::InvalidTime(end.clone()));
        }
    }
    row.updated_by = actor.into();
    row.revision = 1;
    row.updated_at = Utc::now().to_rfc3339_opts(SecondsFormat::Nanos, true);
    Ok(row)
}

/// The library commits this write in the same transaction as the album add.
pub(crate) fn capture_write(
    album_id: &str,
    context: CaptureEntryContext,
    device_id: Option<&str>,
    actor: &str,
) -> Result<StoreWrite, StoreError> {
    let row = record(
        JournalEvent::Capture(ListenCaptureInput {
            id: Ulid::new().to_string(),
            album_id: album_id.into(),
            device_id: device_id.map(str::to_owned),
            captured_at: Utc::now().to_rfc3339(),
            entry_context: context,
        }),
        actor,
    )
    .expect("server-issued id and timestamp");
    Store::write(schema::LISTEN_EVENTS, &row.id, &row)
}

fn event_of(row: &JournalRecord) -> Option<JournalEvent> {
    Some(match row.kind.as_str() {
        "trackPlayed" => JournalEvent::TrackPlayed(TrackListenInput {
            id: row.id.clone(),
            device_id: row.device_id.clone()?,
            track_id: row.track_id.clone()?,
            album_id: row.album_id.clone(),
            source_plugin_id: row.source_plugin_id.clone(),
            listened_at: row.happened_at.clone(),
            played_ms: row.played_ms.map(|n| u32::try_from(n).unwrap_or(u32::MAX)),
            completed: row.completed.unwrap_or(false),
            context: row.context.clone()?,
            context_id: row.context_id.clone(),
        }),
        "stationSession" => JournalEvent::StationSession(ListenStationSessionInput {
            id: row.id.clone(),
            device_id: row.device_id.clone()?,
            source_plugin_id: row.source_plugin_id.clone()?,
            station_id: row.station_id.clone()?,
            session_id: row.session_id.clone()?,
            started_at: row.happened_at.clone(),
            ended_at: row.ended_at.clone(),
        }),
        "capture" => JournalEvent::Capture(ListenCaptureInput {
            id: row.id.clone(),
            device_id: row.device_id.clone(),
            album_id: row.album_id.clone()?,
            captured_at: row.happened_at.clone(),
            entry_context: CaptureEntryContext {
                origin: row.entry_origin.clone()?,
                track_id: row.track_id.clone(),
            },
        }),
        _ => return None,
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
