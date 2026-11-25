use super::*;
use crate::rpc::contract::StopCommand;
use crate::sessions::sleep::SleepTimer;
use chrono::{DateTime, Utc};

/// Device directives never wait for plugin I/O, even on the next scheduler tick.
#[derive(Clone, Copy)]
pub enum SleepLane {
    Device,
    Output,
}

impl SleepLane {
    pub fn run(
        self,
        state: &AppState,
        clock: impl Fn() -> DateTime<Utc>,
    ) -> Result<(), SessionError> {
        for (account_id, session) in state
            .sessions
            .sleep_sessions(matches!(self, Self::Output))?
        {
            let auth = AuthContext {
                account_id,
                principal: Principal::ApiToken {
                    id: "core-sleep".into(),
                    scopes: Vec::new(),
                },
            };
            if let Some(output) = session.output.as_ref() {
                if session.pending_restore.is_none()
                    && !session
                        .sleep_timer
                        .as_ref()
                        .is_some_and(|t| due(t, clock(), session.volume))
                {
                    continue;
                }
                let result=state.outputs.serialize_plugin(&output.plugin_id,|| -> anyhow::Result<()>{
                    let Some(current)=state.sessions.get(&auth,&session.id)? else{return Ok(())};
                    if current.output.as_ref()!=Some(output) || current.sleep_timer!=session.sleep_timer{return Ok(());}
                    let topology=state.outputs.discover(&auth,&output.plugin_id)?;
                    if !safe_output_target_ids(state,&output.plugin_id,&topology).contains(&output.target_id){return Ok(());}
                    state.sessions.set_output_reachable(&auth.account_id,output,true);
                    if let Err(error)=restore_pending(state,&auth,&current,output){
                        tracing::warn!(session_id=%current.id,%error,"volume restoration still pending");
                    }
                    if let Some(timer)=&current.sleep_timer{fire_output(state,&auth,&current,output,timer,&clock)?;}
                    Ok(())
                });
                if let Err(error) = result {
                    tracing::warn!(session_id=%session.id,%error,"output sleep timer pending");
                }
            } else if let Some(timer) = session
                .sleep_timer
                .filter(|t| t.deadline <= clock() && session.reachable)
            {
                // Scanning and delivery are not atomic. Fence the directive against
                // retirement or timer replacement while holding the session mutation lock.
                state.sessions.with_current(&auth, &session.id, |current| {
                    if !current.reachable || current.sleep_timer.as_ref() != Some(&timer) {
                        return;
                    }
                    let request = stop_request(&current.id, &timer);
                    state.realtime.deliver(
                        &current.host_device_id,
                        directive(
                            &current.id,
                            request.command,
                            "core-sleep",
                            request.command_id.as_deref(),
                            None,
                        ),
                    );
                });
            }
        }
        Ok(())
    }
}
fn due(timer: &SleepTimer, now: DateTime<Utc>, volume: u8) -> bool {
    timer.deadline <= now || timer.fade_volume(now, volume).is_some()
}
fn stop_request(id: &str, timer: &SleepTimer) -> SessionCommandRequest {
    SessionCommandRequest {
        session_id: id.into(),
        command_id: Some(format!("sleep:{}", timer.id)),
        command: RpcSessionCommand::Stop(StopCommand {
            sleep_timer_id: Some(timer.id.clone()),
        }),
    }
}

fn fire_output(
    state: &AppState,
    auth: &AuthContext,
    current: &Session,
    output: &OutputBinding,
    timer: &SleepTimer,
    clock: &impl Fn() -> DateTime<Utc>,
) -> anyhow::Result<()> {
    let now = clock();
    // The renderer may still be at the previous fade's cutoff. Never capture that
    // transient volume as the next restore target. The deadline Stop is independent.
    if current.pending_restore.is_none() && timer.fade_volume(now, current.volume).is_some() {
        let fade = || -> anyhow::Result<()> {
            let base = if current.fading {
                current.volume
            } else {
                let physical = state.outputs.state(auth, output)?;
                state
                    .outputs
                    .ensure_sleep_owner(&current.id, output, &physical)?;
                let fading =
                    state
                        .sessions
                        .begin_fade(auth, &current.id, &timer.id, physical.volume)?;
                let volume = fading.volume;
                publish_session(state, auth, &rpc_session(fading));
                volume
            };
            if let Some(volume) = timer.fade_volume(clock(), base) {
                state
                    .outputs
                    .fade_volume(auth, &current.id, output, volume)?;
            }
            Ok(())
        };
        if let Err(error) = fade() {
            tracing::warn!(session_id=%current.id,%error,"sleep fade step failed");
        }
    }
    // A slow or failed final fade cannot postpone the deadline Stop. Its own
    // renderer check and timer-bound receipt still fence ownership and redelivery.
    if timer.deadline <= clock() {
        let response =
            dispatch_output_command_locked(state, auth, &stop_request(&current.id, timer));
        if !matches!(
            response,
            RpcResponse::SessionCommandSend(SessionCommandSendOutcome::Dispatched)
        ) {
            anyhow::bail!("sleep Stop not confirmed: {response:?}");
        }
    }
    Ok(())
}

/// Stop commits the unarmed session and its restoration obligation together. Retrying
/// that obligation must not send another Stop or touch a foreign renderer.
pub(super) fn restore_pending(
    state: &AppState,
    auth: &AuthContext,
    session: &Session,
    output: &OutputBinding,
) -> anyhow::Result<()> {
    if let Some(volume) = session.pending_restore {
        match state.outputs.fade_volume(auth, &session.id, output, volume) {
            Ok(()) | Err(OutputError::RendererOwnershipLost) => {
                state.sessions.complete_restore(auth, &session.id)?
            }
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}
