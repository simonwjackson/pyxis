//! Append-only listening journal and raw history.

pub mod events;

pub use events::{AppendResult, ListenError, ListenLog, TrackListenInput};
