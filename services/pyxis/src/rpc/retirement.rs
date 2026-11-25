//! A device confirms Stop itself. An output confirms through its existing, serialized
//! transport path. Neither a queued directive nor a failed speaker call proves silence.
use super::contract::{
    RpcFailure, RpcRealtimeRemoval, RpcRealtimeState, RpcRealtimeTopic, RpcResponse,
    RpcSessionCommand, SessionCommandRequest, SessionCommandSendOutcome,
    SessionRetireOutcome as Outcome, StopCommand,
};
use super::dispatch::{checked_output_command, directive, session_failure};
use super::realtime::Delivery;
use crate::{
    accounts::AuthContext,
    api::AppState,
    db::store::AccountId,
    sessions::{retirement::RetireStep, SessionError},
};

pub(super) fn retire(state: &AppState, auth: &AuthContext, id: &str) -> Outcome {
    let output = match state.sessions.get(auth, id) {
        Ok(Some(session)) => session.output,
        Ok(None) => return Outcome::UnknownSession,
        Err(e) => return Outcome::Unavailable(session_failure(e)),
    };
    let finish = || -> Result<Outcome, SessionError> {
        if let Some(binding) = &output {
            let Some(current) = state.sessions.get(auth, id)? else {
                return Ok(Outcome::UnknownSession);
            };
            // Regroup may have released this binding while retirement waited for the lock.
            if current.output.as_ref() != Some(binding) {
                return Ok(Outcome::Busy);
            }
        }
        match state.sessions.retire(auth, id)? {
            RetireStep::RestorePending => return Ok(Outcome::Busy),
            RetireStep::Retired => {}
            RetireStep::StopHost { host, command_id } => {
                return Ok(
                    match state.realtime.deliver(
                        &host,
                        directive(
                            id,
                            RpcSessionCommand::Stop(StopCommand::default()),
                            auth.principal_id(),
                            Some(&command_id),
                            None,
                        ),
                    ) {
                        Delivery::Sent => Outcome::StopRequested,
                        Delivery::Full => Outcome::Busy,
                        Delivery::NoSocket => Outcome::Unreachable,
                    },
                )
            }
            RetireStep::StopOutput => {
                let stop = SessionCommandRequest {
                    session_id: id.into(),
                    command_id: None,
                    command: RpcSessionCommand::Stop(StopCommand::default()),
                };
                match checked_output_command(
                    state,
                    auth,
                    &stop,
                    output.as_ref().expect("core-hosted session"),
                ) {
                    RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Dispatched) => {}
                    RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unavailable(e)) => {
                        return Ok(Outcome::Unavailable(e))
                    }
                    RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Unreachable) => {
                        return Ok(Outcome::Unreachable)
                    }
                    _ => {
                        return Ok(Outcome::Unavailable(RpcFailure::retryable(
                            "session.stopFailed",
                            "renderer did not confirm stop",
                        )))
                    }
                }
                if !matches!(state.sessions.retire(auth, id)?, RetireStep::Retired) {
                    return Ok(Outcome::Busy);
                }
            }
        }
        if let Some(output) = &output {
            state.outputs.release_target(&auth.account_id, output);
        }
        publish_retired(state, &auth.account_id, id);
        Ok(Outcome::Retired)
    };
    let result = if let Some(output) = &output {
        state.outputs.serialize_plugin(&output.plugin_id, finish)
    } else {
        finish()
    };
    match result {
        Ok(outcome) => outcome,
        Err(SessionError::UnknownSession) => Outcome::UnknownSession,
        Err(e) => Outcome::Unavailable(session_failure(e)),
    }
}

pub(crate) fn publish_retired(state: &AppState, account: &AccountId, id: &str) {
    state.realtime.publish(
        account,
        RpcRealtimeTopic::Sessions,
        RpcRealtimeState::SessionRetired(RpcRealtimeRemoval { id: id.into() }),
    );
}
