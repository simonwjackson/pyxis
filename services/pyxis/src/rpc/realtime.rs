//! WebSocket realtime channel.
//!
//! State fan-out is account-scoped by construction: every account owns its own broadcast
//! channel, so a socket physically cannot receive another account's events even if a topic
//! name were mistyped or a future topic forgot its scope check.
//!
//! Reconnects carry an opaque resume token. The token encodes a per-process epoch, so a
//! token minted before a restart is refused rather than silently replaying the wrong
//! events. A client whose resume point has already been evicted is told so explicitly and
//! refetches through RPC.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::Response;
use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{broadcast, mpsc};
use ulid::Ulid;

use crate::accounts::{AuthContext, Principal};
use crate::api::AppState;
use crate::db::store::AccountId;
use crate::rpc::contract::{
    RealtimeClientMessage, RealtimeEvent, RealtimeServerMessage, RealtimeTopics, RealtimeWelcome,
    RpcFailure, RpcRealtimeState, RpcRealtimeTopic, CONTRACT_ID,
};
use crate::rpc::dispatch::rpc_session;
use crate::sessions::Sessions;

/// Events retained per account for resume. A reconnect after a brief drop replays from
/// here; anything older is reported as dropped rather than silently skipped.
const REPLAY_CAPACITY: usize = 256;

/// Live fan-out depth. A subscriber slower than this is disconnected with a typed failure
/// instead of being allowed to grow the server's memory without bound.
const BROADCAST_CAPACITY: usize = 256;

/// A socket that never says hello holds a task and a connection slot. Close it.
const HELLO_TIMEOUT: Duration = Duration::from_secs(10);

/// Realtime frames are commands and state, never media. Anything larger is pathological,
/// and the cap applies before authentication so an anonymous peer cannot force a large
/// read. The RPC transport caps its body for the same reason.
const MAX_FRAME_BYTES: usize = 64 * 1024;

/// Keepalive cadence. TCP alone does not notice a host that lost power, and a host that
/// silently vanished must stop looking reachable.
const HEARTBEAT: Duration = Duration::from_secs(15);

/// Silence budget before a socket is presumed dead. Two missed heartbeats.
const IDLE_TIMEOUT: Duration = Duration::from_secs(45);

/// A peer that stops reading must not pin a task and its buffers forever.
const WRITE_TIMEOUT: Duration = Duration::from_secs(10);

/// Pending directed commands per socket. Bounded so a console pressing a button at a
/// wedged renderer is refused rather than absorbed into server memory.
const DIRECTED_CAPACITY: usize = 64;

/// Whether a directed message reached a socket.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Delivery {
    Sent,
    /// The device has no live socket.
    NoSocket,
    /// A socket exists but is not draining its commands.
    Full,
}

/// Removes this socket from the directed registry when the socket ends.
struct DeviceRegistration {
    realtime: Realtime,
    device: String,
    registration: u64,
    receiver: Option<mpsc::Receiver<RealtimeServerMessage>>,
}

impl DeviceRegistration {
    fn take_receiver(&mut self) -> Option<mpsc::Receiver<RealtimeServerMessage>> {
        self.receiver.take()
    }
}

impl Drop for DeviceRegistration {
    fn drop(&mut self) {
        self.realtime
            .deregister_device(&self.device, self.registration);
    }
}

/// Account-scoped publish and subscribe hub.
#[derive(Clone)]
pub struct Realtime {
    epoch: Arc<str>,
    accounts: Arc<Mutex<HashMap<String, AccountChannel>>>,
    /// Sockets addressable by host device, for commands aimed at one device rather than
    /// fanned out to an account. Registrations are keyed so a closing socket can remove
    /// exactly its own entry.
    devices: Arc<Mutex<HashMap<String, Vec<DeviceSocket>>>>,
    next_registration: Arc<AtomicU64>,
}

struct DeviceSocket {
    registration: u64,
    sender: mpsc::Sender<RealtimeServerMessage>,
}

struct AccountChannel {
    sender: broadcast::Sender<Arc<RealtimeEvent>>,
    replay: VecDeque<(u64, Arc<RealtimeEvent>)>,
    next_sequence: u64,
}

impl AccountChannel {
    fn new() -> Self {
        AccountChannel {
            sender: broadcast::Sender::new(BROADCAST_CAPACITY),
            replay: VecDeque::new(),
            next_sequence: 0,
        }
    }
}

struct Attachment {
    receiver: broadcast::Receiver<Arc<RealtimeEvent>>,
    missed: Vec<Arc<RealtimeEvent>>,
    resume_token: String,
    resumed: bool,
    missed_events_dropped: bool,
}

impl Default for Realtime {
    fn default() -> Self {
        Self::new()
    }
}

impl Realtime {
    pub fn new() -> Self {
        Realtime {
            epoch: Ulid::new().to_string().into(),
            accounts: Arc::new(Mutex::new(HashMap::new())),
            devices: Arc::new(Mutex::new(HashMap::new())),
            next_registration: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Send one directed message to a device.
    ///
    /// Exactly one socket receives it. A device with several tabs open would otherwise
    /// apply one console press once per tab, which turns `queue.add` into duplicate
    /// tracks. The newest socket wins, because that is the one the person is looking at.
    pub fn deliver(&self, device_id: &str, message: RealtimeServerMessage) -> Delivery {
        let mut devices = self.devices.lock().expect("realtime devices poisoned");
        let Some(sockets) = devices.get_mut(device_id) else {
            return Delivery::NoSocket;
        };
        sockets.retain(|socket| !socket.sender.is_closed());

        let mut outcome = Delivery::NoSocket;
        for socket in sockets.iter().rev() {
            match socket.sender.try_send(message.clone()) {
                Ok(()) => {
                    outcome = Delivery::Sent;
                    break;
                }
                // Wedged renderer: try an older socket of the same device before giving up.
                Err(mpsc::error::TrySendError::Full(_)) => outcome = Delivery::Full,
                Err(mpsc::error::TrySendError::Closed(_)) => continue,
            }
        }
        if sockets.is_empty() {
            devices.remove(device_id);
        }
        outcome
    }

    fn register_device(&self, device_id: &str) -> DeviceRegistration {
        let (sender, receiver) = mpsc::channel(DIRECTED_CAPACITY);
        let registration = self.next_registration.fetch_add(1, Ordering::Relaxed);
        self.devices
            .lock()
            .expect("realtime devices poisoned")
            .entry(device_id.to_string())
            .or_default()
            .push(DeviceSocket {
                registration,
                sender,
            });
        DeviceRegistration {
            realtime: self.clone(),
            device: device_id.to_string(),
            registration,
            receiver: Some(receiver),
        }
    }

    fn deregister_device(&self, device_id: &str, registration: u64) {
        let mut devices = self.devices.lock().expect("realtime devices poisoned");
        let Some(sockets) = devices.get_mut(device_id) else {
            return;
        };
        sockets.retain(|socket| socket.registration != registration);
        if sockets.is_empty() {
            devices.remove(device_id);
        }
    }

    /// Fan one state change out to every socket on `account_id`.
    ///
    /// Publishing never fails and never blocks the caller: a mutation that succeeded must
    /// not be reported as failed because nobody was listening.
    pub fn publish(
        &self,
        account_id: &AccountId,
        topic: RpcRealtimeTopic,
        state: RpcRealtimeState,
    ) {
        let mut accounts = self.accounts.lock().expect("realtime hub poisoned");
        // Only accounts that have connected at least once keep a replay buffer. Retaining
        // history nobody can ever ask for would mean a bulk import pinning hundreds of
        // full records for the life of the process.
        let Some(channel) = accounts.get_mut(account_id.as_str()) else {
            return;
        };

        let sequence = channel.next_sequence;
        channel.next_sequence += 1;
        let event = Arc::new(RealtimeEvent {
            topic,
            resume_token: self.token(sequence + 1),
            state,
        });

        channel.replay.push_back((sequence, Arc::clone(&event)));
        while channel.replay.len() > REPLAY_CAPACITY {
            channel.replay.pop_front();
        }
        let _ = channel.sender.send(event);
    }

    /// Subscribe and compute any replay under one lock, so an event published between the
    /// two steps can be neither missed nor delivered twice.
    fn attach(&self, account_id: &str, resume_token: Option<&str>) -> Attachment {
        let mut accounts = self.accounts.lock().expect("realtime hub poisoned");
        let channel = accounts
            .entry(account_id.to_string())
            .or_insert_with(AccountChannel::new);

        let receiver = channel.sender.subscribe();
        let head = self.token(channel.next_sequence);
        let Some(requested) = resume_token else {
            return Attachment {
                receiver,
                missed: Vec::new(),
                resume_token: head,
                resumed: false,
                missed_events_dropped: false,
            };
        };

        let oldest = channel
            .replay
            .front()
            .map(|(sequence, _)| *sequence)
            .unwrap_or(channel.next_sequence);
        let cursor = self
            .parse_token(requested)
            .filter(|cursor| *cursor <= channel.next_sequence && *cursor >= oldest);

        match cursor {
            None => Attachment {
                receiver,
                missed: Vec::new(),
                resume_token: head,
                resumed: false,
                missed_events_dropped: true,
            },
            Some(cursor) => {
                let missed: Vec<_> = channel
                    .replay
                    .iter()
                    .filter(|(sequence, _)| *sequence >= cursor)
                    .map(|(_, event)| Arc::clone(event))
                    .collect();
                Attachment {
                    receiver,
                    missed,
                    // Stay at the requested cursor rather than jumping to the head. A
                    // client that persists this token and then dies before applying the
                    // replay must be able to ask for the same backlog again.
                    resume_token: self.token(cursor),
                    resumed: true,
                    missed_events_dropped: false,
                }
            }
        }
    }

    fn token(&self, cursor: u64) -> String {
        format!("{}:{cursor}", self.epoch)
    }

    fn parse_token(&self, token: &str) -> Option<u64> {
        let (epoch, cursor) = token.split_once(':')?;
        if epoch != &*self.epoch {
            return None;
        }
        cursor.parse().ok()
    }
}

pub async fn realtime(State(state): State<Arc<AppState>>, upgrade: WebSocketUpgrade) -> Response {
    upgrade
        .max_frame_size(MAX_FRAME_BYTES)
        .max_message_size(MAX_FRAME_BYTES)
        .on_upgrade(move |socket| serve_socket(state, socket))
}

/// Holds one device's reachability for the life of a socket.
///
/// The refcount is released on drop, so an unexpected unwind cannot leave a dead host
/// looking controllable.
struct DevicePresence {
    sessions: Sessions,
    device: String,
    released: bool,
}

impl DevicePresence {
    fn hold(sessions: &Sessions, device: &str) -> Self {
        sessions.attach_device(device);
        DevicePresence {
            sessions: sessions.clone(),
            device: device.to_string(),
            released: false,
        }
    }

    fn release(&mut self) {
        if !self.released {
            self.released = true;
            self.sessions.detach_device(&self.device);
        }
    }
}

impl Drop for DevicePresence {
    fn drop(&mut self) {
        self.release();
    }
}

/// Republish every session this device hosts.
///
/// `reachable` is the one field only the realtime layer can observe, so a connect or
/// disconnect has to fan out or subscribers keep rendering stale reachability until an
/// unrelated command happens to republish.
async fn publish_hosted_sessions(state: &Arc<AppState>, context: &AuthContext, device: &str) {
    let state = Arc::clone(state);
    let context = context.clone();
    let device = device.to_string();
    let _ = tokio::task::spawn_blocking(move || {
        // Include unreachable: on disconnect the session that must be republished is
        // precisely the one that just stopped being reachable.
        let Ok(sessions) = state.sessions.list(&context, true) else {
            return;
        };
        for session in sessions
            .into_iter()
            .filter(|session| session.host_device_id == device)
        {
            state.realtime.publish(
                &context.account_id,
                RpcRealtimeTopic::Sessions,
                RpcRealtimeState::SessionState(rpc_session(session)),
            );
        }
    })
    .await;
}

async fn serve_socket(state: Arc<AppState>, socket: WebSocket) {
    let (mut sink, mut stream) = socket.split();

    let accepted = match accept(&state, &mut sink, &mut stream).await {
        Some(accepted) => accepted,
        None => return,
    };

    let context = accepted.context.clone();
    let device = accepted.device.clone();

    // Announce arrival only after the socket is attached to the hub, so this client sees
    // its own reachability transition on the same channel as everyone else.
    if let Some(device) = &device {
        publish_hosted_sessions(&state, &context, device).await;
    }

    let presence = accepted.presence;
    let registration = accepted.registration;
    pump(
        accepted.context,
        accepted.topics,
        accepted.receiver,
        accepted.directed,
        sink,
        stream,
    )
    .await;
    drop(registration);
    drop(presence);

    if let Some(device) = &device {
        publish_hosted_sessions(&state, &context, device).await;
    }
}

struct Accepted {
    context: AuthContext,
    topics: HashSet<RpcRealtimeTopic>,
    receiver: broadcast::Receiver<Arc<RealtimeEvent>>,
    device: Option<String>,
    /// Commands addressed to this device specifically, rather than to its account.
    directed: Option<mpsc::Receiver<RealtimeServerMessage>>,
    /// Dropped when the socket ends, removing this socket from the directed registry.
    registration: Option<DeviceRegistration>,
    /// Dropped when the socket ends, which is what makes the host unreachable again.
    presence: Option<DevicePresence>,
}

async fn accept(
    state: &Arc<AppState>,
    sink: &mut SplitSink<WebSocket, Message>,
    stream: &mut SplitStream<WebSocket>,
) -> Option<Accepted> {
    let hello = match tokio::time::timeout(HELLO_TIMEOUT, first_hello(stream)).await {
        Err(_) => {
            return refuse(
                sink,
                RpcFailure::permanent(
                    "realtime.helloTimeout",
                    "socket did not send 'realtime.hello' in time",
                ),
            )
            .await
        }
        Ok(None) => return None,
        Ok(Some(Inbound::Invalid(failure))) => return refuse(sink, failure).await,
        Ok(Some(Inbound::Message(RealtimeClientMessage::Hello(hello)))) => hello,
        Ok(Some(Inbound::Keepalive | Inbound::Message(_))) => {
            return refuse(
                sink,
                RpcFailure::permanent(
                    "realtime.helloRequired",
                    "the first message must be 'realtime.hello'",
                ),
            )
            .await
        }
    };

    let authenticated = {
        let state = Arc::clone(state);
        let bearer = hello.bearer_token.clone();
        tokio::task::spawn_blocking(move || state.accounts.authenticate(&bearer)).await
    };
    let context = match authenticated {
        Ok(Ok(Some(context))) => context,
        Ok(Ok(None)) => {
            return refuse(
                sink,
                RpcFailure::permanent("auth.invalidToken", "bearer token is invalid or revoked"),
            )
            .await
        }
        Ok(Err(error)) => {
            return refuse(
                sink,
                RpcFailure::retryable("auth.unavailable", error.to_string()),
            )
            .await
        }
        Err(error) => {
            return refuse(
                sink,
                RpcFailure::retryable(
                    "realtime.unavailable",
                    format!("realtime authentication task failed: {error}"),
                ),
            )
            .await
        }
    };

    // Fail closed on scope. Narrowing the subscription silently would leave the client
    // believing it is watching a topic that will never deliver.
    if let Some(topic) = authorize_topics(&context, &hello.topics) {
        return refuse(
            sink,
            RpcFailure::permanent(
                "auth.insufficientScope",
                format!(
                    "topic '{}' requires scope '{}'",
                    topic_name(topic),
                    topic.required_scope()
                ),
            ),
        )
        .await;
    }

    // A host device is reachable exactly while it holds a realtime socket. Taking the
    // refcount before the welcome frame makes that frame a real happens-before edge: a
    // client that creates a session the moment it is welcomed cannot see itself offline.
    let device = match &context.principal {
        Principal::Device { id } => Some(id.clone()),
        Principal::ApiToken { .. } => None,
    };
    let presence = device
        .as_deref()
        .map(|device| DevicePresence::hold(&state.sessions, device));
    let mut registration = device
        .as_deref()
        .map(|device| state.realtime.register_device(device));
    let directed = registration
        .as_mut()
        .and_then(DeviceRegistration::take_receiver);

    let attachment = state
        .realtime
        .attach(context.account_id.as_str(), hello.resume_token.as_deref());
    let topics: HashSet<_> = hello.topics.iter().copied().collect();

    let welcome = RealtimeServerMessage::Welcome(RealtimeWelcome {
        account_id: context.account_id.as_str().to_string(),
        contract_id: CONTRACT_ID.to_string(),
        topics: sorted(&topics),
        resume_token: attachment.resume_token.clone(),
        resumed: attachment.resumed,
        missed_events_dropped: attachment.missed_events_dropped,
    });
    if send(sink, &welcome).await.is_err() {
        return None;
    }
    for event in &attachment.missed {
        if !topics.contains(&event.topic) {
            continue;
        }
        if send(sink, &RealtimeServerMessage::Event((**event).clone()))
            .await
            .is_err()
        {
            return None;
        }
    }

    // The receiver was created before replay was computed, so events published while the
    // backlog was being written are queued rather than lost.
    Some(Accepted {
        context,
        topics,
        receiver: attachment.receiver,
        device,
        directed,
        registration,
        presence,
    })
}

async fn pump(
    context: AuthContext,
    mut topics: HashSet<RpcRealtimeTopic>,
    mut receiver: broadcast::Receiver<Arc<RealtimeEvent>>,
    directed: Option<mpsc::Receiver<RealtimeServerMessage>>,
    mut sink: SplitSink<WebSocket, Message>,
    mut stream: SplitStream<WebSocket>,
) {
    // An API token has no device, so it can watch but can never be commanded.
    let (mut directed, has_directed) = match directed {
        Some(directed) => (directed, true),
        None => (mpsc::channel(1).1, false),
    };
    let mut heartbeat = tokio::time::interval(HEARTBEAT);
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    heartbeat.tick().await;
    let mut last_seen = tokio::time::Instant::now();

    loop {
        tokio::select! {
            _ = heartbeat.tick() => {
                if last_seen.elapsed() > IDLE_TIMEOUT {
                    return;
                }
                if tokio::time::timeout(WRITE_TIMEOUT, sink.send(Message::Ping(Vec::new())))
                    .await
                    .map(|sent| sent.is_err())
                    .unwrap_or(true)
                {
                    return;
                }
            },
            addressed = directed.recv(), if has_directed => match addressed {
                // A directed command bypasses topic filtering: it is addressed to this
                // device, not published to a topic the device chose to watch.
                Some(message) => {
                    if send(&mut sink, &message).await.is_err() {
                        return;
                    }
                }
                None => return,
            },
            published = receiver.recv() => match published {
                Ok(event) => {
                    if !topics.contains(&event.topic) {
                        continue;
                    }
                    if send(&mut sink, &RealtimeServerMessage::Event((*event).clone()))
                        .await
                        .is_err()
                    {
                        return;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(missed)) => {
                    let _ = refuse(
                        &mut sink,
                        RpcFailure::retryable(
                            "realtime.lagged",
                            format!("socket fell {missed} events behind and must resubscribe"),
                        ),
                    )
                    .await;
                    return;
                }
                Err(broadcast::error::RecvError::Closed) => return,
            },
            received = next_inbound(&mut stream) => match received {
                None => return,
                Some(Inbound::Keepalive) => {
                    last_seen = tokio::time::Instant::now();
                }
                Some(Inbound::Invalid(failure)) => {
                    let _ = refuse(&mut sink, failure).await;
                    return;
                }
                Some(Inbound::Message(RealtimeClientMessage::Hello(_))) => {
                    let _ = refuse(
                        &mut sink,
                        RpcFailure::permanent(
                            "realtime.alreadyAuthenticated",
                            "'realtime.hello' is only valid as the first message",
                        ),
                    )
                    .await;
                    return;
                }
                Some(Inbound::Message(RealtimeClientMessage::Subscribe(request))) => {
                    last_seen = tokio::time::Instant::now();
                    if let Some(topic) = authorize_topics(&context, &request.topics) {
                        let _ = refuse(
                            &mut sink,
                            RpcFailure::permanent(
                                "auth.insufficientScope",
                                format!(
                                    "topic '{}' requires scope '{}'",
                                    topic_name(topic),
                                    topic.required_scope()
                                ),
                            ),
                        )
                        .await;
                        return;
                    }
                    topics.extend(request.topics.iter().copied());
                    if acknowledge(&mut sink, &topics).await.is_err() {
                        return;
                    }
                }
                Some(Inbound::Message(RealtimeClientMessage::Unsubscribe(request))) => {
                    last_seen = tokio::time::Instant::now();
                    for topic in &request.topics {
                        topics.remove(topic);
                    }
                    if acknowledge(&mut sink, &topics).await.is_err() {
                        return;
                    }
                }
            },
        }
    }
}

/// Confirm the resulting subscription set, so a client knows when a change took effect.
async fn acknowledge(
    sink: &mut SplitSink<WebSocket, Message>,
    topics: &HashSet<RpcRealtimeTopic>,
) -> Result<(), ()> {
    send(
        sink,
        &RealtimeServerMessage::Subscribed(RealtimeTopics {
            topics: sorted(topics),
        }),
    )
    .await
}

/// Deduplicated and ordered, never the caller's raw vector. A client comparing successive
/// frames must not see a spurious change from hash iteration order.
fn sorted(topics: &HashSet<RpcRealtimeTopic>) -> Vec<RpcRealtimeTopic> {
    let mut ordered: Vec<_> = topics.iter().copied().collect();
    ordered.sort();
    ordered
}

/// Returns the first topic the caller may not watch, or `None` when all are allowed.
fn authorize_topics(
    context: &AuthContext,
    topics: &[RpcRealtimeTopic],
) -> Option<RpcRealtimeTopic> {
    topics
        .iter()
        .copied()
        .find(|topic| !context.allows(topic.required_scope()))
}

fn topic_name(topic: RpcRealtimeTopic) -> &'static str {
    match topic {
        RpcRealtimeTopic::Sessions => "sessions",
        RpcRealtimeTopic::Library => "library",
    }
}

enum Inbound {
    Message(RealtimeClientMessage),
    /// A ping or pong. Carries no protocol meaning but proves the peer is alive.
    Keepalive,
    Invalid(RpcFailure),
}

/// Read until the first frame that carries protocol meaning. Keepalives before hello are
/// tolerated but do not extend the hello deadline, which wraps this whole call.
async fn first_hello(stream: &mut SplitStream<WebSocket>) -> Option<Inbound> {
    loop {
        match next_inbound(stream).await? {
            Inbound::Keepalive => continue,
            inbound => return Some(inbound),
        }
    }
}

async fn next_inbound(stream: &mut SplitStream<WebSocket>) -> Option<Inbound> {
    match stream.next().await? {
        Ok(Message::Text(text)) => Some(match serde_json::from_str(&text) {
            Ok(message) => Inbound::Message(message),
            Err(error) => Inbound::Invalid(RpcFailure::permanent(
                "request.invalidPayload",
                format!("invalid realtime message: {error}"),
            )),
        }),
        Ok(Message::Binary(_)) => Some(Inbound::Invalid(RpcFailure::permanent(
            "request.malformed",
            "realtime messages must be UTF-8 JSON text frames",
        ))),
        Ok(Message::Ping(_) | Message::Pong(_)) => Some(Inbound::Keepalive),
        Ok(Message::Close(_)) | Err(_) => None,
    }
}

/// Send one terminal failure frame and close. Always resolves to `None` so an accept path
/// can `return refuse(..).await` without inventing a value.
async fn refuse(sink: &mut SplitSink<WebSocket, Message>, failure: RpcFailure) -> Option<Accepted> {
    let _ = send(sink, &RealtimeServerMessage::Failure(failure)).await;
    // A stalled peer is exactly why the send above can time out, and the close handshake
    // has to flush the same blocked buffer. Bound it too, or the task outlives the failure
    // it just reported and keeps its host looking reachable.
    let _ = tokio::time::timeout(WRITE_TIMEOUT, sink.close()).await;
    None
}

async fn send(
    sink: &mut SplitSink<WebSocket, Message>,
    message: &RealtimeServerMessage,
) -> Result<(), ()> {
    let encoded = serde_json::to_string(message).map_err(|_| ())?;
    // A peer that stops reading must not pin this task and its buffers forever.
    match tokio::time::timeout(WRITE_TIMEOUT, sink.send(Message::Text(encoded))).await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(_)) | Err(_) => Err(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn album_state(id: &str) -> RpcRealtimeState {
        RpcRealtimeState::LibraryAlbumRemoved(crate::rpc::contract::RpcRealtimeRemoval {
            id: id.to_string(),
        })
    }

    #[test]
    fn a_resume_token_from_a_previous_process_is_refused() {
        let hub = Realtime::new();
        let account = AccountId::new("default");
        drop(hub.attach(account.as_str(), None));
        hub.publish(&account, RpcRealtimeTopic::Library, album_state("one"));

        let stale = Realtime::new().token(0);
        let attachment = hub.attach(account.as_str(), Some(&stale));

        assert!(!attachment.resumed);
        assert!(attachment.missed_events_dropped);
        assert!(attachment.missed.is_empty());
    }

    #[test]
    fn an_evicted_resume_point_reports_dropped_rather_than_replaying_a_gap() {
        let hub = Realtime::new();
        let account = AccountId::new("default");
        let first_visit = hub.attach(account.as_str(), None);
        let from_the_start = first_visit.resume_token.clone();
        drop(first_visit);
        for index in 0..REPLAY_CAPACITY + 5 {
            hub.publish(
                &account,
                RpcRealtimeTopic::Library,
                album_state(&index.to_string()),
            );
        }

        let attachment = hub.attach(account.as_str(), Some(&from_the_start));

        assert!(!attachment.resumed);
        assert!(attachment.missed_events_dropped);
    }

    #[test]
    fn one_accounts_events_never_enter_another_accounts_channel() {
        let hub = Realtime::new();
        let mine = AccountId::new("mine");
        let theirs = AccountId::new("theirs");
        let attachment = hub.attach(mine.as_str(), None);

        hub.publish(&theirs, RpcRealtimeTopic::Library, album_state("theirs"));

        assert!(attachment.receiver.is_empty());
    }
}
