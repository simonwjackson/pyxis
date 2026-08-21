//! Append-only listening journal and rebuildable projections.

pub mod events;
pub mod projections;

pub use events::{AppendResult, ListenError, ListenEvent, ListenLog, TrackListenInput};
pub use projections::{HotAlbum, HotConfig, Projections};
