//! Device-hosted playback sessions.
//!
//! Durable state contains queue, cursor, transport, position and volume. Reachability is
//! deliberately ephemeral: after a server restart every device-hosted session is
//! unreachable until its host reconnects. Stream URLs are never stored; the current track
//! always maps back to `/stream/:trackId`, which re-resolves provider URLs on demand.

pub mod machine;
pub mod queue;

use std::collections::HashSet;
use std::sync::{Arc, Mutex, RwLock};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::accounts::{AuthContext, Principal};
use crate::db::schema;
use crate::db::store::{Store, StoreError};

pub use machine::Transport;

use machine::MachineError;
use queue::QueueError;

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error("only a device can host or control its own session")]
    NotDevice,
    #[error("session does not exist")]
    UnknownSession,
    #[error("caller is not the session host")]
    NotHost,
    #[error(transparent)]
    Queue(#[from] QueueError),
    #[error(transparent)]
    Machine(#[from] MachineError),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub host_device_id: String,
    pub queue: Vec<String>,
    pub cursor: Option<usize>,
    pub transport: Transport,
    pub position_ms: u64,
    pub duration_ms: Option<u64>,
    pub volume: u8,
    pub reachable: bool,
    pub revision: u64,
    pub updated_at: String,
}

impl Session {
    pub fn current_track_id(&self) -> Option<&str> {
        self.cursor
            .and_then(|cursor| self.queue.get(cursor))
            .map(String::as_str)
    }

    pub fn stream_path(&self) -> Option<String> {
        self.current_track_id()
            .map(|track_id| format!("/stream/{track_id}"))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionCommand {
    QueueAdd {
        track_ids: Vec<String>,
    },
    QueueRemove {
        index: usize,
    },
    QueueClear,
    QueueShuffle,
    CursorJump {
        index: usize,
    },
    Play,
    Pause,
    Stop,
    TrackEnded,
    PositionReport {
        position_ms: u64,
        duration_ms: Option<u64>,
    },
    VolumeSet {
        volume: u8,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionRecord {
    id: String,
    account_id: String,
    name: String,
    host_device_id: String,
    transport: Transport,
    position_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    duration_ms: Option<u64>,
    volume: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    cursor: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    output_ref: Option<String>,
    queue: Vec<String>,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

#[derive(Clone)]
pub struct Sessions {
    store: Store,
    reachable_devices: Arc<RwLock<HashSet<String>>>,
    mutation: Arc<Mutex<()>>,
}

impl Sessions {
    pub fn open(store: Store) -> Self {
        Sessions {
            store,
            reachable_devices: Arc::new(RwLock::new(HashSet::new())),
            mutation: Arc::new(Mutex::new(())),
        }
    }

    pub fn create(&self, auth: &AuthContext, name: &str) -> Result<Session, SessionError> {
        let device_id = device_id(auth)?;
        let _guard = self.mutation.lock().expect("session mutation poisoned");
        let timestamp = now();
        let record = SessionRecord {
            id: Ulid::new().to_string(),
            account_id: String::new(),
            name: name.to_string(),
            host_device_id: device_id.to_string(),
            transport: Transport::Stopped,
            position_ms: 0,
            duration_ms: None,
            volume: 100,
            cursor: None,
            output_ref: None,
            queue: Vec::new(),
            revision: 1,
            updated_by: device_id.to_string(),
            updated_at: timestamp,
        };
        self.store
            .put(schema::SESSIONS, &auth.account_id, &record.id, &record)?;
        self.mark_device_reachable(device_id, true);
        Ok(self.session(record))
    }

    pub fn list(&self, auth: &AuthContext) -> Result<Vec<Session>, SessionError> {
        Ok(self
            .store
            .list::<SessionRecord>(schema::SESSIONS, &auth.account_id)?
            .into_iter()
            .map(|record| self.session(record))
            .collect())
    }

    pub fn get(
        &self,
        auth: &AuthContext,
        session_id: &str,
    ) -> Result<Option<Session>, SessionError> {
        Ok(self
            .store
            .get::<SessionRecord>(schema::SESSIONS, &auth.account_id, session_id)?
            .map(|record| self.session(record)))
    }

    pub fn command(
        &self,
        auth: &AuthContext,
        session_id: &str,
        command: SessionCommand,
    ) -> Result<Session, SessionError> {
        let caller = device_id(auth)?;
        let _guard = self.mutation.lock().expect("session mutation poisoned");
        let Some(mut record) =
            self.store
                .get::<SessionRecord>(schema::SESSIONS, &auth.account_id, session_id)?
        else {
            return Err(SessionError::UnknownSession);
        };
        if record.host_device_id != caller {
            return Err(SessionError::NotHost);
        }

        match command {
            SessionCommand::QueueAdd { track_ids } => {
                queue::add(&mut record.queue, &mut record.cursor, track_ids);
            }
            SessionCommand::QueueRemove { index } => {
                if queue::remove(&mut record.queue, &mut record.cursor, index)? {
                    machine::stop(&mut record.transport, &mut record.position_ms);
                    record.duration_ms = None;
                }
            }
            SessionCommand::QueueClear => {
                queue::clear(&mut record.queue, &mut record.cursor);
                machine::stop(&mut record.transport, &mut record.position_ms);
                record.duration_ms = None;
            }
            SessionCommand::QueueShuffle => queue::shuffle(&mut record.queue, record.cursor),
            SessionCommand::CursorJump { index } => {
                queue::jump(&record.queue, &mut record.cursor, index)?;
                machine::stop(&mut record.transport, &mut record.position_ms);
                record.duration_ms = None;
            }
            SessionCommand::Play => machine::play(
                &mut record.transport,
                &mut record.position_ms,
                record.queue.is_empty(),
            )?,
            SessionCommand::Pause => machine::pause(&mut record.transport)?,
            SessionCommand::Stop => {
                machine::stop(&mut record.transport, &mut record.position_ms);
            }
            SessionCommand::TrackEnded => machine::track_ended(&mut record.transport)?,
            SessionCommand::PositionReport {
                position_ms,
                duration_ms,
            } => {
                record.position_ms = position_ms;
                if duration_ms.is_some() {
                    record.duration_ms = duration_ms;
                }
            }
            SessionCommand::VolumeSet { volume } => {
                machine::set_volume(&mut record.volume, volume)?;
            }
        }

        record.revision += 1;
        record.updated_by = caller.to_string();
        record.updated_at = now();
        self.store
            .put(schema::SESSIONS, &auth.account_id, session_id, &record)?;
        Ok(self.session(record))
    }

    pub fn mark_device_reachable(&self, device_id: &str, reachable: bool) {
        let mut devices = self
            .reachable_devices
            .write()
            .expect("session reachability poisoned");
        if reachable {
            devices.insert(device_id.to_string());
        } else {
            devices.remove(device_id);
        }
    }

    fn session(&self, record: SessionRecord) -> Session {
        let reachable = self
            .reachable_devices
            .read()
            .expect("session reachability poisoned")
            .contains(&record.host_device_id);
        Session {
            id: record.id,
            name: record.name,
            host_device_id: record.host_device_id,
            queue: record.queue,
            cursor: record.cursor,
            transport: record.transport,
            position_ms: record.position_ms,
            duration_ms: record.duration_ms,
            volume: record.volume,
            reachable,
            revision: record.revision,
            updated_at: record.updated_at,
        }
    }
}

fn device_id(auth: &AuthContext) -> Result<&str, SessionError> {
    match &auth.principal {
        Principal::Device { id } => Ok(id),
        Principal::ApiToken { .. } => Err(SessionError::NotDevice),
    }
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Nanos, true)
}
