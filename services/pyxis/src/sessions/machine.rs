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

/// What the session did when the renderer said a track ran out.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrackEnd {
    /// The queue had another track. The cursor moved and the session is still playing.
    Advanced,
    /// The queue is exhausted. The session stops and waits to be asked for more.
    Finished,
}

/// A track ran out on the renderer.
///
/// Silence belongs at the end of the record, not between its tracks. The cursor advances
/// while the queue still has something on it, and only an exhausted queue reaches `Ended` --
/// which is what the client reads to offer carrying on, rather than carrying on by itself.
/// Position resets either way, because the next track starts at its beginning and a finished
/// queue must not resume halfway through the last one.
pub fn track_ended(
    transport: &mut Transport,
    position_ms: &mut u64,
    cursor: &mut Option<usize>,
    queue_len: usize,
) -> Result<TrackEnd, MachineError> {
    if *transport != Transport::Playing {
        return Err(MachineError::InvalidTransition {
            action: "end track",
            transport: *transport,
        });
    }
    *position_ms = 0;
    let next = cursor.and_then(|at| at.checked_add(1)).filter(|at| *at < queue_len);
    match next {
        Some(at) => {
            *cursor = Some(at);
            Ok(TrackEnd::Advanced)
        }
        None => {
            *transport = Transport::Ended;
            Ok(TrackEnd::Finished)
        }
    }
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

    #[test]
    fn a_track_ending_mid_queue_moves_to_the_next_one_and_keeps_playing() {
        let mut transport = Transport::Playing;
        let mut position = 200_000;
        let mut cursor = Some(0);

        let outcome = track_ended(&mut transport, &mut position, &mut cursor, 3).expect("end");

        assert_eq!(outcome, TrackEnd::Advanced);
        assert_eq!(cursor, Some(1));
        // Silence belongs at the end of a record, not between its tracks.
        assert_eq!(transport, Transport::Playing);
        assert_eq!(position, 0);
    }

    #[test]
    fn the_last_track_ending_stops_rather_than_wrapping_around() {
        let mut transport = Transport::Playing;
        let mut position = 200_000;
        let mut cursor = Some(2);

        let outcome = track_ended(&mut transport, &mut position, &mut cursor, 3).expect("end");

        assert_eq!(outcome, TrackEnd::Finished);
        // The cursor stays on the track that just played: the album is over, not rewound.
        assert_eq!(cursor, Some(2));
        assert_eq!(transport, Transport::Ended);
        assert_eq!(position, 0);
    }

    #[test]
    fn a_single_track_queue_finishes_instead_of_repeating() {
        let mut transport = Transport::Playing;
        let mut position = 1_000;
        let mut cursor = Some(0);

        let outcome = track_ended(&mut transport, &mut position, &mut cursor, 1).expect("end");

        assert_eq!(outcome, TrackEnd::Finished);
        assert_eq!(transport, Transport::Ended);
    }
}
