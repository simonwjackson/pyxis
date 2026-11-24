//! Durable wall-clock deadline. Fade is a temporary renderer gain, not a volume command.
use super::machine::MachineError;
use chrono::{DateTime, TimeDelta, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SleepTimer {
    pub id: String,
    pub deadline: DateTime<Utc>,
    pub fade_seconds: u32,
}

impl SleepTimer {
    pub fn new(
        at: Option<&str>,
        minutes: Option<u32>,
        fade_seconds: u32,
        now: DateTime<Utc>,
    ) -> Result<Self, MachineError> {
        let deadline = match (at, minutes) {
            (Some(at), None) => DateTime::parse_from_rfc3339(at).ok().map(|at| at.to_utc()),
            (None, Some(n)) => now.checked_add_signed(TimeDelta::minutes(i64::from(n))),
            _ => None,
        }
        .filter(|at| *at > now && at.format("%Y").to_string().len() == 4)
        .ok_or(MachineError::InvalidSleep)?;
        Ok(Self {
            id: ulid::Ulid::new().to_string(),
            deadline,
            fade_seconds,
        })
    }
    pub fn fade_volume(&self, now: DateTime<Utc>, volume: u8) -> Option<u8> {
        let remaining = (self.deadline - now).num_milliseconds().max(0);
        let window = i64::from(self.fade_seconds) * 1000;
        (remaining < window).then(|| (i64::from(volume) * remaining / window) as u8)
    }
}
