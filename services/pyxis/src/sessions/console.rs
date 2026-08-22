//! Addressing a command to the device that hosts a session.
//!
//! Routing is decided here as a pure classification so the rule can be tested without a
//! socket, and so the session layer never has to know the realtime transport exists.

use super::Session;
use crate::rpc::contract::RpcSessionCommand;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Route {
    /// Deliver to this device's live sockets.
    ToHost {
        device_id: String,
    },
    UnknownSession,
    /// The host is not connected. A console command is refused rather than queued: a
    /// command applied minutes later is not what the person pressing the button meant.
    Unreachable,
}

/// Whether a console may issue this command at all.
///
/// Some commands are reports, not intents: they state what the host's audio actually did.
/// Only the host can know that, and `session.command.run` already refuses them from anyone
/// else. Forwarding one as a directive would let a console launder a false report through
/// the host's own identity.
pub fn is_console_issuable(command: &RpcSessionCommand) -> bool {
    !matches!(
        command,
        RpcSessionCommand::PositionReport(_) | RpcSessionCommand::TrackEnded(_)
    )
}

pub fn route(session: Option<&Session>) -> Route {
    match session {
        None => Route::UnknownSession,
        Some(session) if !session.reachable => Route::Unreachable,
        Some(session) => Route::ToHost {
            device_id: session.host_device_id.clone(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sessions::Transport;

    fn session(reachable: bool) -> Session {
        Session {
            id: "session-1".into(),
            name: "Desk".into(),
            host_device_id: "device-a".into(),
            queue: Vec::new(),
            cursor: None,
            transport: Transport::Stopped,
            position_ms: 0,
            duration_ms: None,
            volume: 100,
            reachable,
            revision: 1,
            updated_at: "now".into(),
        }
    }

    #[test]
    fn a_reachable_session_routes_to_its_host_device() {
        assert_eq!(
            route(Some(&session(true))),
            Route::ToHost {
                device_id: "device-a".into()
            }
        );
    }

    #[test]
    fn an_unreachable_host_is_never_silently_queued() {
        assert_eq!(route(Some(&session(false))), Route::Unreachable);
    }

    #[test]
    fn an_unknown_session_is_distinct_from_an_unreachable_one() {
        assert_eq!(route(None), Route::UnknownSession);
    }

    #[test]
    fn a_console_may_express_intent_but_never_report_what_the_audio_did() {
        use crate::rpc::contract::{EmptyRequest, PositionReportCommand};

        assert!(is_console_issuable(&RpcSessionCommand::Pause(
            EmptyRequest {}
        )));
        assert!(!is_console_issuable(&RpcSessionCommand::PositionReport(
            PositionReportCommand {
                position_ms: 1_000,
                duration_ms: None,
            }
        )));
        assert!(!is_console_issuable(&RpcSessionCommand::TrackEnded(
            EmptyRequest {}
        )));
    }
}
