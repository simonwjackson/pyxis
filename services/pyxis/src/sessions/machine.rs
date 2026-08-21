//! Pure playback transport state machine.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Transport {
    Stopped,
    Playing,
    Paused,
    Ended,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum MachineError {
    #[error("cannot play an empty queue")]
    EmptyQueue,
    #[error("cannot {action} while transport is {transport:?}")]
    InvalidTransition {
        action: &'static str,
        transport: Transport,
    },
    #[error("volume {0} is outside 0..=100")]
    InvalidVolume(u8),
}

pub fn play(
    transport: &mut Transport,
    position_ms: &mut u64,
    queue_is_empty: bool,
) -> Result<(), MachineError> {
    if queue_is_empty {
        return Err(MachineError::EmptyQueue);
    }
    if *transport == Transport::Ended {
        *position_ms = 0;
    }
    *transport = Transport::Playing;
    Ok(())
}

pub fn pause(transport: &mut Transport) -> Result<(), MachineError> {
    if *transport != Transport::Playing {
        return Err(MachineError::InvalidTransition {
            action: "pause",
            transport: *transport,
        });
    }
    *transport = Transport::Paused;
    Ok(())
}

pub fn stop(transport: &mut Transport, position_ms: &mut u64) {
    *transport = Transport::Stopped;
    *position_ms = 0;
}

pub fn track_ended(transport: &mut Transport) -> Result<(), MachineError> {
    if *transport != Transport::Playing {
        return Err(MachineError::InvalidTransition {
            action: "end track",
            transport: *transport,
        });
    }
    *transport = Transport::Ended;
    Ok(())
}

pub fn set_volume(volume: &mut u8, next: u8) -> Result<(), MachineError> {
    if next > 100 {
        return Err(MachineError::InvalidVolume(next));
    }
    *volume = next;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ended_restarts_from_zero_when_played_again() {
        let mut transport = Transport::Ended;
        let mut position = 42_000;

        play(&mut transport, &mut position, false).expect("play");

        assert_eq!(transport, Transport::Playing);
        assert_eq!(position, 0);
    }

    #[test]
    fn pause_is_only_valid_while_playing() {
        let mut transport = Transport::Stopped;

        assert!(matches!(
            pause(&mut transport),
            Err(MachineError::InvalidTransition { .. })
        ));
    }
}
