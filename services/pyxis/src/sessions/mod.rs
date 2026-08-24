//! Device-hosted playback sessions.
//!
//! Durable state contains queue, cursor, transport, position and volume. Reachability is
//! deliberately ephemeral: after a server restart every device-hosted session is
//! unreachable until its host reconnects. Stream URLs are never stored; the current track
//! always maps back to `/stream/:trackId`, which re-resolves provider URLs on demand.

pub mod console;
pub mod handoff;
pub mod machine;
pub mod queue;

use std::collections::HashMap;
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
    #[error("session is not hosted by an output plugin")]
    NotOutput,
    #[error("command id was already used for different content")]
    CommandIdConflict,
    #[error("command id must contain 1 to 128 characters")]
    InvalidCommandId,
    #[error(transparent)]
    Queue(#[from] QueueError),
    #[error(transparent)]
    Machine(#[from] MachineError),
    #[error("target session does not exist")]
    UnknownTarget,
    #[error("a session cannot hand off to itself")]
    SameSession,
    #[error("the source session's host is not connected")]
    SourceUnreachable,
    #[error("the target session's host is not connected")]
    TargetUnreachable,
    #[error("the target session already holds a queue")]
    TargetBusy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutputBinding {
    pub plugin_id: String,
    pub target_id: String,
}

impl OutputBinding {
    pub fn host_id(&self, account_id: &crate::db::store::AccountId) -> String {
        format!(
            "output:{}:{}:{}",
            account_id.as_str(),
            self.plugin_id,
            self.target_id
        )
    }
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
    pub output: Option<OutputBinding>,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PreparedOutputCommand {
    Applied(Box<Session>),
    Ready {
        current: Box<Session>,
        next: Box<Session>,
        output: OutputBinding,
    },
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct OutputConfirmation {
    pub position_ms: Option<u64>,
    pub duration_ms: Option<u64>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandReceiptRecord {
    id: String,
    account_id: String,
    session_id: String,
    command_id: String,
    fingerprint: String,
    applied: bool,
    revision: u64,
    updated_by: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct AccountIdentity {
    id: String,
}

impl SessionRecord {
    fn playback(&self) -> handoff::Playback {
        handoff::Playback {
            queue: self.queue.clone(),
            cursor: self.cursor,
            position_ms: self.position_ms,
            duration_ms: self.duration_ms,
            transport: self.transport,
        }
    }

    fn apply(&mut self, playback: handoff::Playback, actor: &str) {
        self.queue = playback.queue;
        self.cursor = playback.cursor;
        self.position_ms = playback.position_ms;
        self.duration_ms = playback.duration_ms;
        self.transport = playback.transport;
        self.revision += 1;
        self.updated_by = actor.to_string();
        self.updated_at = now();
    }
}

#[derive(Clone)]
pub struct Sessions {
    store: Store,
    /// Live realtime sockets per device. A device with several open clients stays reachable
    /// until the last one goes away, so closing one tab cannot strand a playing session.
    reachable_devices: Arc<RwLock<HashMap<String, u32>>>,
    mutation: Arc<Mutex<()>>,
}

impl Sessions {
    pub fn open(store: Store) -> Self {
        Sessions {
            store,
            reachable_devices: Arc::new(RwLock::new(HashMap::new())),
            mutation: Arc::new(Mutex::new(())),
        }
    }

    pub fn create(&self, auth: &AuthContext, name: &str) -> Result<Session, SessionError> {
        let device_id = device_id(auth)?;
        self.create_record(auth, name, device_id, None)
    }

    pub fn create_output(
        &self,
        auth: &AuthContext,
        name: &str,
        output: OutputBinding,
    ) -> Result<Session, SessionError> {
        let host_id = output.host_id(&auth.account_id);
        self.create_record(auth, name, &host_id, Some(output))
    }

    fn create_record(
        &self,
        auth: &AuthContext,
        name: &str,
        host_id: &str,
        output: Option<OutputBinding>,
    ) -> Result<Session, SessionError> {
        let _guard = self.mutation.lock().expect("session mutation poisoned");
        let timestamp = now();
        let record = SessionRecord {
            id: Ulid::new().to_string(),
            account_id: String::new(),
            name: name.to_string(),
            host_device_id: host_id.to_string(),
            transport: Transport::Stopped,
            position_ms: 0,
            duration_ms: None,
            volume: 100,
            cursor: None,
            output_ref: output
                .as_ref()
                .map(|binding| serde_json::to_string(binding).expect("output binding serializes")),
            queue: Vec::new(),
            revision: 1,
            updated_by: auth.principal_id().to_string(),
            updated_at: timestamp,
        };
        self.store
            .put(schema::SESSIONS, &auth.account_id, &record.id, &record)?;
        Ok(self.session(record))
    }

    /// Sessions on the account.
    ///
    /// `include_unreachable` separates the two honest questions: "where can I send a
    /// command right now" and "what sessions exist". A console asking the first must not
    /// be offered a device that cannot answer.
    pub fn list(
        &self,
        auth: &AuthContext,
        include_unreachable: bool,
    ) -> Result<Vec<Session>, SessionError> {
        Ok(self
            .store
            .list::<SessionRecord>(schema::SESSIONS, &auth.account_id)?
            .into_iter()
            .map(|record| self.session(record))
            .filter(|session| include_unreachable || session.reachable)
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

    pub fn all_output_sessions(
        &self,
    ) -> Result<Vec<(crate::db::store::AccountId, Session)>, SessionError> {
        let mut result = Vec::new();
        for account in self.store.list_accounts::<AccountIdentity>()? {
            let account_id = crate::db::store::AccountId::new(account.id);
            for record in self
                .store
                .list::<SessionRecord>(schema::SESSIONS, &account_id)?
                .into_iter()
                .filter(|record| output_binding(record).is_some())
            {
                result.push((account_id.clone(), self.session(record)));
            }
        }
        Ok(result)
    }

    pub fn has_any_output_sessions(&self, plugin_id: &str) -> Result<bool, SessionError> {
        Ok(self.all_output_sessions()?.into_iter().any(|(_, session)| {
            session
                .output
                .as_ref()
                .is_some_and(|output| output.plugin_id == plugin_id)
        }))
    }

    pub fn find_output(
        &self,
        auth: &AuthContext,
        output: &OutputBinding,
    ) -> Result<Option<Session>, SessionError> {
        Ok(self
            .store
            .list::<SessionRecord>(schema::SESSIONS, &auth.account_id)?
            .into_iter()
            .find(|record| output_binding(record).as_ref() == Some(output))
            .map(|record| self.session(record)))
    }

    pub fn reserve_command(
        &self,
        auth: &AuthContext,
        session_id: &str,
        command_id: &str,
        fingerprint: &str,
    ) -> Result<(), SessionError> {
        validate_command_id(command_id)?;
        let _guard = self.mutation.lock().expect("session mutation poisoned");
        if self
            .store
            .get::<SessionRecord>(schema::SESSIONS, &auth.account_id, session_id)?
            .is_none()
        {
            return Err(SessionError::UnknownSession);
        }
        let receipt_id = command_receipt_id(session_id, command_id);
        if let Some(existing) = self.store.get::<CommandReceiptRecord>(
            schema::SESSION_COMMAND_RECEIPTS,
            &auth.account_id,
            &receipt_id,
        )? {
            return if existing.fingerprint == fingerprint {
                Ok(())
            } else {
                Err(SessionError::CommandIdConflict)
            };
        }
        let timestamp = now();
        let receipt = CommandReceiptRecord {
            id: receipt_id,
            account_id: String::new(),
            session_id: session_id.to_string(),
            command_id: command_id.to_string(),
            fingerprint: fingerprint.to_string(),
            applied: false,
            revision: 1,
            updated_by: auth.principal_id().to_string(),
            updated_at: timestamp,
        };
        self.store.put(
            schema::SESSION_COMMAND_RECEIPTS,
            &auth.account_id,
            &receipt.id,
            &receipt,
        )?;
        Ok(())
    }

    pub fn command(
        &self,
        auth: &AuthContext,
        session_id: &str,
        command: SessionCommand,
    ) -> Result<Session, SessionError> {
        self.command_once(auth, session_id, command, None)
    }

    pub fn command_once(
        &self,
        auth: &AuthContext,
        session_id: &str,
        command: SessionCommand,
        command_receipt: Option<(&str, &str)>,
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
        let mut receipt = if let Some((command_id, fingerprint)) = command_receipt {
            validate_command_id(command_id)?;
            let receipt_id = command_receipt_id(session_id, command_id);
            match self.store.get::<CommandReceiptRecord>(
                schema::SESSION_COMMAND_RECEIPTS,
                &auth.account_id,
                &receipt_id,
            )? {
                Some(existing) if existing.fingerprint != fingerprint => {
                    return Err(SessionError::CommandIdConflict)
                }
                Some(existing) if existing.applied => return Ok(self.session(record)),
                Some(existing) => Some(existing),
                None => Some(CommandReceiptRecord {
                    id: receipt_id,
                    account_id: String::new(),
                    session_id: session_id.to_string(),
                    command_id: command_id.to_string(),
                    fingerprint: fingerprint.to_string(),
                    applied: false,
                    revision: 1,
                    updated_by: caller.to_string(),
                    updated_at: now(),
                }),
            }
        } else {
            None
        };

        apply_command(&mut record, &command)?;

        record.revision += 1;
        record.updated_by = caller.to_string();
        record.updated_at = now();
        if let Some(receipt) = &mut receipt {
            receipt.applied = true;
            receipt.revision += 1;
            receipt.updated_by = caller.to_string();
            receipt.updated_at = now();
            self.store.put_mixed_batch(
                &auth.account_id,
                &[
                    Store::write(schema::SESSIONS, session_id.to_string(), &record)?,
                    Store::write(
                        schema::SESSION_COMMAND_RECEIPTS,
                        receipt.id.clone(),
                        receipt,
                    )?,
                ],
            )?;
        } else {
            self.store
                .put(schema::SESSIONS, &auth.account_id, session_id, &record)?;
        }
        Ok(self.session(record))
    }

    pub fn prepare_output_command(
        &self,
        auth: &AuthContext,
        session_id: &str,
        command: &SessionCommand,
        command_id: &str,
        fingerprint: &str,
    ) -> Result<PreparedOutputCommand, SessionError> {
        validate_command_id(command_id)?;
        let actor = auth.principal_id();
        let _guard = self.mutation.lock().expect("session mutation poisoned");
        let Some(record) =
            self.store
                .get::<SessionRecord>(schema::SESSIONS, &auth.account_id, session_id)?
        else {
            return Err(SessionError::UnknownSession);
        };
        let output = output_binding(&record).ok_or(SessionError::NotOutput)?;
        let receipt_id = command_receipt_id(session_id, command_id);
        match self.store.get::<CommandReceiptRecord>(
            schema::SESSION_COMMAND_RECEIPTS,
            &auth.account_id,
            &receipt_id,
        )? {
            Some(existing) if existing.fingerprint != fingerprint => {
                return Err(SessionError::CommandIdConflict)
            }
            Some(existing) if existing.applied => {
                return Ok(PreparedOutputCommand::Applied(Box::new(
                    self.session(record),
                )))
            }
            Some(_) => {}
            None => {
                let receipt = CommandReceiptRecord {
                    id: receipt_id,
                    account_id: String::new(),
                    session_id: session_id.to_string(),
                    command_id: command_id.to_string(),
                    fingerprint: fingerprint.to_string(),
                    applied: false,
                    revision: 1,
                    updated_by: actor.to_string(),
                    updated_at: now(),
                };
                self.store.put(
                    schema::SESSION_COMMAND_RECEIPTS,
                    &auth.account_id,
                    &receipt.id,
                    &receipt,
                )?;
            }
        }
        let current = self.session(record.clone());
        let mut next = record;
        apply_command(&mut next, command)?;
        next.revision += 1;
        next.updated_by = actor.to_string();
        next.updated_at = now();
        Ok(PreparedOutputCommand::Ready {
            current: Box::new(current),
            next: Box::new(self.session(next)),
            output,
        })
    }

    pub fn commit_output_command(
        &self,
        auth: &AuthContext,
        session_id: &str,
        command: &SessionCommand,
        command_id: &str,
        fingerprint: &str,
        confirmation: OutputConfirmation,
    ) -> Result<Session, SessionError> {
        let actor = auth.principal_id();
        let _guard = self.mutation.lock().expect("session mutation poisoned");
        let Some(mut record) =
            self.store
                .get::<SessionRecord>(schema::SESSIONS, &auth.account_id, session_id)?
        else {
            return Err(SessionError::UnknownSession);
        };
        if output_binding(&record).is_none() {
            return Err(SessionError::NotOutput);
        }
        let receipt_id = command_receipt_id(session_id, command_id);
        let Some(mut receipt) = self.store.get::<CommandReceiptRecord>(
            schema::SESSION_COMMAND_RECEIPTS,
            &auth.account_id,
            &receipt_id,
        )?
        else {
            return Err(SessionError::InvalidCommandId);
        };
        if receipt.fingerprint != fingerprint {
            return Err(SessionError::CommandIdConflict);
        }
        if receipt.applied {
            return Ok(self.session(record));
        }
        apply_command(&mut record, command)?;
        if let Some(position_ms) = confirmation.position_ms {
            record.position_ms = position_ms;
        }
        if confirmation.duration_ms.is_some() {
            record.duration_ms = confirmation.duration_ms;
        }
        record.revision += 1;
        record.updated_by = actor.to_string();
        record.updated_at = now();
        receipt.applied = true;
        receipt.revision += 1;
        receipt.updated_by = actor.to_string();
        receipt.updated_at = now();
        self.store.put_mixed_batch(
            &auth.account_id,
            &[
                Store::write(schema::SESSIONS, session_id.to_string(), &record)?,
                Store::write(
                    schema::SESSION_COMMAND_RECEIPTS,
                    receipt.id.clone(),
                    &receipt,
                )?,
            ],
        )?;
        Ok(self.session(record))
    }

    pub fn reconcile_output_state(
        &self,
        auth: &AuthContext,
        session_id: &str,
        transport: Transport,
        position_ms: Option<u64>,
        duration_ms: Option<u64>,
    ) -> Result<Session, SessionError> {
        let actor = auth.principal_id();
        let _guard = self.mutation.lock().expect("session mutation poisoned");
        let Some(mut record) =
            self.store
                .get::<SessionRecord>(schema::SESSIONS, &auth.account_id, session_id)?
        else {
            return Err(SessionError::UnknownSession);
        };
        if output_binding(&record).is_none() {
            return Err(SessionError::NotOutput);
        }
        let next_position = position_ms.unwrap_or(record.position_ms);
        let next_duration = duration_ms.or(record.duration_ms);
        if record.transport == transport
            && record.position_ms == next_position
            && record.duration_ms == next_duration
        {
            return Ok(self.session(record));
        }
        record.transport = transport;
        record.position_ms = next_position;
        record.duration_ms = next_duration;
        record.revision += 1;
        record.updated_by = actor.to_string();
        record.updated_at = now();
        self.store
            .put(schema::SESSIONS, &auth.account_id, session_id, &record)?;
        Ok(self.session(record))
    }

    /// Move queue, cursor, position and transport intent to another session.
    ///
    /// Both sessions are rewritten under the same guard, so a listener can never observe
    /// the queue existing in two places or in neither.
    ///
    /// A target that already holds a queue is refused rather than overwritten: erasing
    /// what somebody else is listening to is not a reasonable side effect of moving your
    /// own music. Both hosts must be connected, because a source that cannot be told to
    /// stop may keep playing the queue this call just moved away from it.
    ///
    /// Reachability is read outside the mutation guard, so a host that disconnects during
    /// the commit can still end up holding the queue. The listener recovers by handing
    /// back, and no state is lost.
    pub fn handoff(
        &self,
        auth: &AuthContext,
        session_id: &str,
        target_session_id: &str,
    ) -> Result<(Session, Session), SessionError> {
        if session_id == target_session_id {
            return Err(SessionError::SameSession);
        }
        let actor = auth.principal_id().to_string();
        let _guard = self.mutation.lock().expect("session mutation poisoned");

        let Some(mut source) =
            self.store
                .get::<SessionRecord>(schema::SESSIONS, &auth.account_id, session_id)?
        else {
            return Err(SessionError::UnknownSession);
        };
        let Some(mut target) = self.store.get::<SessionRecord>(
            schema::SESSIONS,
            &auth.account_id,
            target_session_id,
        )?
        else {
            return Err(SessionError::UnknownTarget);
        };
        if !self.device_is_reachable(&source.host_device_id) {
            return Err(SessionError::SourceUnreachable);
        }
        if !self.device_is_reachable(&target.host_device_id) {
            return Err(SessionError::TargetUnreachable);
        }
        if !target.playback().is_idle() {
            return Err(SessionError::TargetBusy);
        }

        let mut playback = source.playback();
        let carried = handoff::take(&mut playback);
        source.apply(playback, &actor);
        target.apply(carried, &actor);

        self.store.put_mixed_batch(
            &auth.account_id,
            &[
                Store::write(schema::SESSIONS, source.id.clone(), &source)?,
                Store::write(schema::SESSIONS, target.id.clone(), &target)?,
            ],
        )?;
        Ok((self.session(source), self.session(target)))
    }

    pub fn device_is_reachable(&self, device_id: &str) -> bool {
        self.reachable_devices
            .read()
            .expect("session reachability poisoned")
            .contains_key(device_id)
    }

    pub fn replace_output_reachability(
        &self,
        account_id: &crate::db::store::AccountId,
        plugin_id: &str,
        target_ids: impl IntoIterator<Item = String>,
    ) {
        let prefix = format!("output:{}:{plugin_id}:", account_id.as_str());
        let mut devices = self
            .reachable_devices
            .write()
            .expect("session reachability poisoned");
        devices.retain(|id, _| !id.starts_with(&prefix));
        for target_id in target_ids {
            devices.insert(
                OutputBinding {
                    plugin_id: plugin_id.to_string(),
                    target_id,
                }
                .host_id(account_id),
                1,
            );
        }
    }

    pub fn set_output_reachable(
        &self,
        account_id: &crate::db::store::AccountId,
        output: &OutputBinding,
        reachable: bool,
    ) {
        let mut devices = self
            .reachable_devices
            .write()
            .expect("session reachability poisoned");
        if reachable {
            devices.insert(output.host_id(account_id), 1);
        } else {
            devices.remove(&output.host_id(account_id));
        }
    }

    /// One realtime socket opened for `device_id`.
    ///
    /// Reachability has exactly one meaning: the device is holding a live realtime socket
    /// right now. It is never persisted and never inferred from a past RPC call, so a
    /// crashed or sleeping host cannot leave a session looking controllable.
    pub fn attach_device(&self, device_id: &str) {
        *self
            .reachable_devices
            .write()
            .expect("session reachability poisoned")
            .entry(device_id.to_string())
            .or_insert(0) += 1;
    }

    /// One realtime socket closed. The device stops being reachable at zero.
    pub fn detach_device(&self, device_id: &str) {
        let mut devices = self
            .reachable_devices
            .write()
            .expect("session reachability poisoned");
        let Some(connections) = devices.get_mut(device_id) else {
            return;
        };
        *connections = connections.saturating_sub(1);
        if *connections == 0 {
            devices.remove(device_id);
        }
    }

    fn session(&self, record: SessionRecord) -> Session {
        let reachable = self
            .reachable_devices
            .read()
            .expect("session reachability poisoned")
            .contains_key(&record.host_device_id);
        let output = output_binding(&record);
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
            output,
            reachable,
            revision: record.revision,
            updated_at: record.updated_at,
        }
    }
}

fn apply_command(record: &mut SessionRecord, command: &SessionCommand) -> Result<(), SessionError> {
    match command {
        SessionCommand::QueueAdd { track_ids } => {
            queue::add(&mut record.queue, &mut record.cursor, track_ids.clone());
        }
        SessionCommand::QueueRemove { index } => {
            if queue::remove(&mut record.queue, &mut record.cursor, *index)? {
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
            queue::jump(&record.queue, &mut record.cursor, *index)?;
            machine::stop(&mut record.transport, &mut record.position_ms);
            record.duration_ms = None;
        }
        SessionCommand::Play => machine::play(
            &mut record.transport,
            &mut record.position_ms,
            record.queue.is_empty(),
        )?,
        SessionCommand::Pause => machine::pause(&mut record.transport)?,
        SessionCommand::Stop => machine::stop(&mut record.transport, &mut record.position_ms),
        SessionCommand::TrackEnded => machine::track_ended(&mut record.transport)?,
        SessionCommand::PositionReport {
            position_ms,
            duration_ms,
        } => {
            record.position_ms = *position_ms;
            if duration_ms.is_some() {
                record.duration_ms = *duration_ms;
            }
        }
        SessionCommand::VolumeSet { volume } => {
            machine::set_volume(&mut record.volume, *volume)?;
        }
    }
    Ok(())
}

fn output_binding(record: &SessionRecord) -> Option<OutputBinding> {
    record
        .output_ref
        .as_deref()
        .and_then(|value| serde_json::from_str(value).ok())
}

fn validate_command_id(command_id: &str) -> Result<(), SessionError> {
    if command_id.is_empty() || command_id.chars().count() > 128 {
        return Err(SessionError::InvalidCommandId);
    }
    Ok(())
}

fn command_receipt_id(session_id: &str, command_id: &str) -> String {
    format!("{session_id}:{command_id}")
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
