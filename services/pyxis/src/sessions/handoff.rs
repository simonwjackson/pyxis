//! Moving what is playing from one device to another.
//!
//! Handoff is explicit and total: the queue, cursor, position and transport intent belong
//! to whoever is playing, so they move together. Volume does not move, because it belongs
//! to the speaker rather than to the music.

use super::machine::Transport;

/// The part of a session that follows the listener rather than the device.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Playback {
    pub queue: Vec<String>,
    pub cursor: Option<usize>,
    pub position_ms: u64,
    pub duration_ms: Option<u64>,
    pub transport: Transport,
}

impl Playback {
    /// An idle session: nothing queued, nothing playing.
    pub fn idle() -> Self {
        Playback {
            queue: Vec::new(),
            cursor: None,
            position_ms: 0,
            duration_ms: None,
            transport: Transport::Stopped,
        }
    }

    pub fn is_idle(&self) -> bool {
        self.queue.is_empty()
    }
}

/// Take playback away from `source`, leaving it idle.
///
/// The source is emptied rather than paused. Two devices holding the same queue, one of
/// them silently, is how a listener ends up with sound coming from a room they left.
pub fn take(source: &mut Playback) -> Playback {
    std::mem::replace(source, Playback::idle())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn playing() -> Playback {
        Playback {
            queue: vec!["track-a".into(), "track-b".into()],
            cursor: Some(1),
            position_ms: 42_000,
            duration_ms: Some(180_000),
            transport: Transport::Playing,
        }
    }

    #[test]
    fn handoff_moves_the_whole_playing_position_and_leaves_the_source_idle() {
        let mut source = playing();

        let carried = take(&mut source);

        assert_eq!(carried, playing());
        assert!(source.is_idle());
        assert_eq!(source.cursor, None);
        assert_eq!(source.position_ms, 0);
        assert_eq!(source.transport, Transport::Stopped);
    }

    #[test]
    fn handing_off_an_idle_session_is_harmless() {
        let mut source = Playback::idle();

        let carried = take(&mut source);

        assert!(carried.is_idle());
        assert!(source.is_idle());
    }
}
