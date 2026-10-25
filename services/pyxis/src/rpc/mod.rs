//! Wire protocol: contract, operation dispatch, HTTP transport and realtime fan-out.

pub mod contract;
pub mod dispatch;
pub(crate) mod library_groups;
pub mod realtime;
pub mod transport;
