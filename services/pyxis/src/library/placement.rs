//! Explicit album placement. `Hot` is deliberately absent because it is a projection over
//! listen history, not a destination a user can assign.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Placement {
    Discovery,
    Collection,
    Archive,
    Dismissed,
}
