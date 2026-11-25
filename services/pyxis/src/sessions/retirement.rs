use super::{AccountIdentity, Session, SessionError, SessionRecord, Sessions, Transport};
use crate::{
    accounts::AuthContext,
    db::{schema, store::AccountId},
};
use chrono::{DateTime, Duration, Utc};

pub(crate) enum RetireStep {
    RestorePending,
    Retired,
    StopHost { host: String, command_id: String },
    StopOutput,
}

impl Sessions {
    /// Re-read under the same lock as retirement. A delayed command or disconnect must
    /// never publish live state after subscribers have already received the removal.
    pub(crate) fn with_current(&self, auth: &AuthContext, id: &str, publish: impl FnOnce(Session)) {
        let _guard = self.mutation.lock().expect("session mutation poisoned");
        match self.get(auth, id) {
            Ok(Some(session)) => publish(session),
            Ok(None) => {}
            Err(error) => tracing::warn!(%error,"cannot publish current session"),
        }
    }

    pub(crate) fn retire(&self, auth: &AuthContext, id: &str) -> Result<RetireStep, SessionError> {
        let _guard = self.mutation.lock().expect("session mutation poisoned");
        let mut row = self
            .store
            .get::<SessionRecord>(schema::SESSIONS, &auth.account_id, id)?
            .ok_or(SessionError::UnknownSession)?;
        if matches!(row.transport, Transport::Playing | Transport::Paused) {
            if row.output_ref.is_some() {
                return Ok(RetireStep::StopOutput);
            }
            let command_id = match row.retire_command_id.as_ref() {
                Some(id) => id.clone(),
                None => {
                    let command_id = ulid::Ulid::new().to_string();
                    row.retire_command_id = Some(command_id.clone());
                    self.store
                        .put_session_snapshot(&auth.account_id, id, &row)?;
                    command_id
                }
            };
            return Ok(RetireStep::StopHost {
                host: row.host_device_id,
                command_id,
            });
        }
        // Keep the scheduler's durable volume restore obligation until it finishes.
        if row.pending_restore.is_some() {
            return Ok(RetireStep::RestorePending);
        }
        self.store.retire_session(&auth.account_id, id)?;
        Ok(RetireStep::Retired)
    }

    pub fn expire_unreachable(
        &self,
        now: DateTime<Utc>,
        mut retired: impl FnMut(&AccountId, &str),
    ) -> Result<(), SessionError> {
        let cutoff = now - Duration::days(30);
        let _guard = self.mutation.lock().expect("session mutation poisoned");
        let reachable = self
            .reachable_devices
            .read()
            .expect("session reachability poisoned");
        for account in self.store.list_accounts::<AccountIdentity>()? {
            let account = AccountId::new(account.id);
            for row in self
                .store
                .list::<SessionRecord>(schema::SESSIONS, &account)?
            {
                if row.output_ref.is_none()
                    && row.pending_restore.is_none()
                    && !reachable.contains_key(&row.host_device_id)
                    && DateTime::parse_from_rfc3339(&row.updated_at).is_ok_and(|t| t < cutoff)
                {
                    self.store.retire_session(&account, &row.id)?;
                    retired(&account, &row.id);
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        accounts::{Accounts, Principal},
        db::store::Store,
    };

    #[test]
    fn expiry_preserves_a_pending_volume_restore_even_without_an_output_binding() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path()).unwrap();
        Accounts::open(store.clone()).unwrap();
        let start = "2026-01-01T00:00:00Z".parse::<DateTime<Utc>>().unwrap();
        let sessions = Sessions::with_clock(store.clone(), move || start);
        let host = AuthContext {
            account_id: AccountId::new("default"),
            principal: Principal::Device {
                id: "offline".into(),
            },
        };
        let id = sessions.create(&host, "stale").unwrap().id;
        // A normal fade is output-only. Seed the persisted obligation without an
        // output binding to prove that restore protection is independent of output protection.
        let mut row = store
            .get::<SessionRecord>(schema::SESSIONS, &host.account_id, &id)
            .unwrap()
            .unwrap();
        row.pending_restore = Some(70);
        store
            .put_session_snapshot(&host.account_id, &id, &row)
            .unwrap();
        let now = start + Duration::days(31);
        sessions
            .expire_unreachable(now, |_, _| panic!("restore lost"))
            .unwrap();
        assert_eq!(
            sessions.get(&host, &id).unwrap().unwrap().pending_restore,
            Some(70)
        );
        sessions.complete_restore(&host, &id).unwrap();
        sessions
            .expire_unreachable(now, |_, retired| assert_eq!(retired, id))
            .unwrap();
        assert!(sessions.get(&host, &id).unwrap().is_none());
    }
}
