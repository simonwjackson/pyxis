//! Realtime channel behaviour over a real WebSocket, not a mocked transport.
//!
//! Every test binds an ephemeral port and speaks the published protocol, so a change that
//! breaks third-party clients breaks these tests too.

use std::net::SocketAddr;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use pyxis::api::{router, AppState};
use pyxis::db::store::Store;
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

type Socket = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

/// Long enough to catch a real regression, short enough that a wrong assertion fails fast.
const SETTLE: Duration = Duration::from_secs(5);

struct Server {
    address: SocketAddr,
    _directory: tempfile::TempDir,
}

async fn serve() -> Server {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = AppState::open(Store::open(directory.path()).expect("store")).expect("state");
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let address = listener.local_addr().expect("address");
    tokio::spawn(async move {
        let _ = axum::serve(listener, router(state)).await;
    });
    Server {
        address,
        _directory: directory,
    }
}

async fn rpc(server: &Server, request: Value, bearer: Option<&str>) -> Value {
    let mut builder = reqwest::Client::new()
        .post(format!("http://{}/rpc", server.address))
        .header("content-type", "application/json")
        .body(request.to_string());
    if let Some(bearer) = bearer {
        builder = builder.bearer_auth(bearer);
    }
    let body = builder
        .send()
        .await
        .expect("send")
        .text()
        .await
        .expect("body");
    serde_json::from_str(&body).expect("RPC response is JSON")
}

async fn claim(server: &Server, name: &str) -> String {
    rpc(
        server,
        json!({ "_tag": "auth.device.claim", "payload": { "name": name } }),
        None,
    )
    .await["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("bearer token")
        .to_string()
}

async fn open(server: &Server) -> Socket {
    let (socket, _) = connect_async(format!("ws://{}/realtime", server.address))
        .await
        .expect("upgrade");
    socket
}

async fn hello(socket: &mut Socket, bearer: &str, topics: Value, resume: Option<&str>) {
    let mut payload = json!({ "bearerToken": bearer, "topics": topics });
    if let Some(resume) = resume {
        payload["resumeToken"] = json!(resume);
    }
    socket
        .send(Message::Text(
            json!({ "_tag": "realtime.hello", "payload": payload }).to_string(),
        ))
        .await
        .expect("send hello");
}

/// Next protocol frame, or a failure when the socket closes or stalls first.
async fn next(socket: &mut Socket) -> Option<Value> {
    loop {
        let message = tokio::time::timeout(SETTLE, socket.next()).await.ok()??;
        match message.ok()? {
            Message::Text(text) => {
                return Some(serde_json::from_str(&text).expect("realtime frame is JSON"))
            }
            Message::Close(_) => return None,
            _ => continue,
        }
    }
}

async fn add_album(server: &Server, bearer: &str, title: &str) -> String {
    rpc(
        server,
        json!({
            "_tag": "library.album.add",
            "payload": {
                "title": title,
                "artist": "David Bowie",
                "sourceReference": { "pluginId": "ytmusic", "externalId": title },
                "tracks": [{ "id": format!("track-{title}"), "title": title, "artist": "David Bowie" }]
            }
        }),
        Some(bearer),
    )
    .await["outcome"]["value"]["id"]
        .as_str()
        .expect("album id")
        .to_string()
}

#[tokio::test]
async fn a_subscriber_receives_state_published_on_its_topic() {
    let server = serve().await;
    let bearer = claim(&server, "phone").await;
    let mut socket = open(&server).await;
    hello(&mut socket, &bearer, json!(["library"]), None).await;

    let welcome = next(&mut socket).await.expect("welcome");
    assert_eq!(welcome["_tag"], "realtime.welcome");
    assert_eq!(welcome["payload"]["contractId"], "pyxis-rpc-v2");
    assert_eq!(welcome["payload"]["resumed"], false);

    add_album(&server, &bearer, "Heroes").await;

    let event = next(&mut socket).await.expect("event");
    assert_eq!(event["_tag"], "realtime.event");
    assert_eq!(event["payload"]["topic"], "library");
    assert_eq!(event["payload"]["state"]["_tag"], "library.album.state");
    assert_eq!(event["payload"]["state"]["payload"]["title"], "Heroes");
}

#[tokio::test]
async fn two_clients_on_one_account_see_the_same_published_state() {
    let server = serve().await;
    let bearer = claim(&server, "phone").await;
    let mut console = open(&server).await;
    let mut host = open(&server).await;
    hello(&mut console, &bearer, json!(["library"]), None).await;
    hello(&mut host, &bearer, json!(["library"]), None).await;
    next(&mut console).await.expect("console welcome");
    next(&mut host).await.expect("host welcome");

    add_album(&server, &bearer, "Low").await;

    let seen_by_console = next(&mut console).await.expect("console event");
    let seen_by_host = next(&mut host).await.expect("host event");
    assert_eq!(
        seen_by_console["payload"]["state"], seen_by_host["payload"]["state"],
        "both sockets must observe identical state"
    );
}

#[tokio::test]
async fn an_account_never_receives_another_accounts_events() {
    let server = serve().await;
    let mine = claim(&server, "phone").await;

    let created = rpc(
        &server,
        json!({
            "_tag": "account.create",
            "payload": { "name": "family", "deviceName": "kitchen" }
        }),
        Some(&mine),
    )
    .await;
    let theirs = created["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("second account token")
        .to_string();

    let mut watcher = open(&server).await;
    hello(&mut watcher, &theirs, json!(["library"]), None).await;
    next(&mut watcher).await.expect("welcome");

    add_album(&server, &mine, "Station to Station").await;
    // Prove the socket is live and simply had nothing of its own to receive.
    add_album(&server, &theirs, "Lodger").await;

    let event = next(&mut watcher).await.expect("event");
    assert_eq!(event["payload"]["state"]["payload"]["title"], "Lodger");
}

#[tokio::test]
async fn an_unauthenticated_socket_is_closed_with_a_typed_reason() {
    let server = serve().await;
    let mut socket = open(&server).await;
    hello(&mut socket, "not-a-real-token", json!(["library"]), None).await;

    let failure = next(&mut socket).await.expect("failure");
    assert_eq!(failure["_tag"], "realtime.failure");
    assert_eq!(failure["payload"]["code"], "auth.invalidToken");
    assert_eq!(failure["payload"]["retryable"], false);
    assert!(
        next(&mut socket).await.is_none(),
        "the socket must close after a terminal failure"
    );
}

#[tokio::test]
async fn a_socket_that_never_says_hello_is_rejected_before_subscribing() {
    let server = serve().await;
    let bearer = claim(&server, "phone").await;
    let mut socket = open(&server).await;
    socket
        .send(Message::Text(
            json!({
                "_tag": "realtime.subscribe",
                "payload": { "topics": ["library"] }
            })
            .to_string(),
        ))
        .await
        .expect("send");

    let failure = next(&mut socket).await.expect("failure");
    assert_eq!(failure["payload"]["code"], "realtime.helloRequired");
    let _ = bearer;
}

#[tokio::test]
async fn a_token_without_the_topic_scope_is_refused_rather_than_silently_narrowed() {
    let server = serve().await;
    let device = claim(&server, "phone").await;
    let issued = rpc(
        &server,
        json!({
            "_tag": "auth.token.create",
            "payload": { "name": "automation", "scopes": ["library:read"] }
        }),
        Some(&device),
    )
    .await;
    let api_token = issued["outcome"]["value"]["bearerToken"]
        .as_str()
        .expect("api token")
        .to_string();

    let mut allowed = open(&server).await;
    hello(&mut allowed, &api_token, json!(["library"]), None).await;
    assert_eq!(
        next(&mut allowed).await.expect("welcome")["_tag"],
        "realtime.welcome"
    );

    let mut refused = open(&server).await;
    hello(&mut refused, &api_token, json!(["sessions"]), None).await;
    let failure = next(&mut refused).await.expect("failure");
    assert_eq!(failure["payload"]["code"], "auth.insufficientScope");
}

#[tokio::test]
async fn reconnecting_with_a_resume_token_replays_state_missed_while_disconnected() {
    let server = serve().await;
    let bearer = claim(&server, "phone").await;
    let mut socket = open(&server).await;
    hello(&mut socket, &bearer, json!(["library"]), None).await;
    let welcome = next(&mut socket).await.expect("welcome");
    let resume = welcome["payload"]["resumeToken"]
        .as_str()
        .expect("resume token")
        .to_string();

    socket.close(None).await.expect("close");
    add_album(&server, &bearer, "Hunky Dory").await;

    let mut resumed = open(&server).await;
    hello(&mut resumed, &bearer, json!(["library"]), Some(&resume)).await;
    let welcome = next(&mut resumed).await.expect("welcome");
    assert_eq!(welcome["payload"]["resumed"], true);
    assert_eq!(welcome["payload"]["missedEventsDropped"], false);

    let replayed = next(&mut resumed).await.expect("replayed event");
    assert_eq!(
        replayed["payload"]["state"]["payload"]["title"], "Hunky Dory",
        "state published while the socket was down must arrive on reconnect"
    );
}

#[tokio::test]
async fn a_resume_token_from_a_previous_process_reports_dropped_state() {
    let server = serve().await;
    let bearer = claim(&server, "phone").await;
    let mut socket = open(&server).await;
    hello(
        &mut socket,
        &bearer,
        json!(["library"]),
        Some("01JQEXAMPLEEPOCHNOTOURS:0"),
    )
    .await;

    let welcome = next(&mut socket).await.expect("welcome");
    assert_eq!(welcome["payload"]["resumed"], false);
    assert_eq!(
        welcome["payload"]["missedEventsDropped"], true,
        "an unusable resume point must be reported, never silently ignored"
    );
}

#[tokio::test]
async fn unsubscribing_stops_delivery_without_closing_the_socket() {
    let server = serve().await;
    let bearer = claim(&server, "phone").await;
    let mut socket = open(&server).await;
    hello(&mut socket, &bearer, json!(["library", "sessions"]), None).await;
    next(&mut socket).await.expect("welcome");

    socket
        .send(Message::Text(
            json!({
                "_tag": "realtime.unsubscribe",
                "payload": { "topics": ["library"] }
            })
            .to_string(),
        ))
        .await
        .expect("unsubscribe");

    // Wait for the acknowledgement rather than assuming the server won a race.
    let acknowledged = next(&mut socket).await.expect("subscription acknowledged");
    assert_eq!(acknowledged["_tag"], "realtime.subscribed");
    assert_eq!(acknowledged["payload"]["topics"], json!(["sessions"]));

    add_album(&server, &bearer, "Blackstar").await;
    let created = rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Desk" } }),
        Some(&bearer),
    )
    .await;
    assert_eq!(created["outcome"]["status"], "ready");

    let event = next(&mut socket).await.expect("event");
    assert_eq!(
        event["payload"]["topic"], "sessions",
        "the unsubscribed topic must not be delivered"
    );
}

#[tokio::test]
async fn a_session_is_reachable_only_while_its_host_holds_a_socket() {
    let server = serve().await;
    let bearer = claim(&server, "phone").await;
    let mut socket = open(&server).await;
    hello(&mut socket, &bearer, json!(["sessions"]), None).await;
    next(&mut socket).await.expect("welcome");

    // The welcome frame is a happens-before edge: the host is already reachable.
    let created = rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Desk" } }),
        Some(&bearer),
    )
    .await;
    assert_eq!(created["outcome"]["value"]["reachable"], true);

    socket.close(None).await.expect("close");
    let mut gone_from_the_console_view = false;
    for _ in 0..50 {
        tokio::time::sleep(Duration::from_millis(20)).await;
        let listed = rpc(
            &server,
            json!({ "_tag": "session.list", "payload": {} }),
            Some(&bearer),
        )
        .await;
        if listed["outcome"]["value"]
            .as_array()
            .expect("list")
            .is_empty()
        {
            gone_from_the_console_view = true;
            break;
        }
    }
    assert!(
        gone_from_the_console_view,
        "an offline host's session must not be offered as somewhere to send a command"
    );

    // The session still exists. It is just not somewhere a command can land.
    let durable = rpc(
        &server,
        json!({ "_tag": "session.list", "payload": { "includeUnreachable": true } }),
        Some(&bearer),
    )
    .await;
    assert_eq!(durable["outcome"]["value"][0]["name"], "Desk");
    assert_eq!(durable["outcome"]["value"][0]["reachable"], false);
}

#[tokio::test]
async fn a_host_disconnecting_fans_out_its_new_reachability() {
    let server = serve().await;
    let bearer = claim(&server, "phone").await;

    let mut host = open(&server).await;
    hello(&mut host, &bearer, json!(["sessions"]), None).await;
    next(&mut host).await.expect("host welcome");
    let created = rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Desk" } }),
        Some(&bearer),
    )
    .await;
    assert_eq!(created["outcome"]["value"]["reachable"], true);

    // A different device on the same account, so the host's refcount is its own.
    let console_bearer = claim(&server, "console").await;
    let mut console = open(&server).await;
    hello(&mut console, &console_bearer, json!(["sessions"]), None).await;
    next(&mut console).await.expect("console welcome");

    host.close(None).await.expect("close");

    let departure = next(&mut console).await.expect("departure event");
    assert_eq!(departure["payload"]["topic"], "sessions");
    assert_eq!(
        departure["payload"]["state"]["payload"]["reachable"], false,
        "a console must learn the host went away without polling"
    );
}

#[tokio::test]
async fn a_second_socket_from_one_device_keeps_the_host_reachable() {
    let server = serve().await;
    let bearer = claim(&server, "phone").await;
    let mut first = open(&server).await;
    hello(&mut first, &bearer, json!(["sessions"]), None).await;
    next(&mut first).await.expect("welcome");
    let mut second = open(&server).await;
    hello(&mut second, &bearer, json!(["sessions"]), None).await;
    next(&mut second).await.expect("welcome");

    rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Desk" } }),
        Some(&bearer),
    )
    .await;

    first.close(None).await.expect("close");
    tokio::time::sleep(Duration::from_millis(200)).await;

    let listed = rpc(
        &server,
        json!({ "_tag": "session.list", "payload": {} }),
        Some(&bearer),
    )
    .await;
    assert_eq!(
        listed["outcome"]["value"][0]["reachable"], true,
        "closing one of two client tabs must not strand a playing session"
    );
}

#[tokio::test]
async fn a_console_command_reaches_the_host_and_the_host_applies_it() {
    let server = serve().await;
    let host_bearer = claim(&server, "desk").await;
    let console_bearer = claim(&server, "phone").await;

    let mut host = open(&server).await;
    hello(&mut host, &host_bearer, json!(["sessions"]), None).await;
    next(&mut host).await.expect("host welcome");
    let created = rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Desk" } }),
        Some(&host_bearer),
    )
    .await;
    let session_id = created["outcome"]["value"]["id"]
        .as_str()
        .expect("session id")
        .to_string();
    rpc(
        &server,
        json!({
            "_tag": "session.command.run",
            "payload": {
                "sessionId": session_id,
                "command": { "_tag": "queue.add", "payload": { "trackIds": ["track-1"] } }
            }
        }),
        Some(&host_bearer),
    )
    .await;
    rpc(
        &server,
        json!({
            "_tag": "session.command.run",
            "payload": {
                "sessionId": session_id,
                "command": { "_tag": "transport.play", "payload": {} }
            }
        }),
        Some(&host_bearer),
    )
    .await;

    let mut console = open(&server).await;
    hello(&mut console, &console_bearer, json!(["sessions"]), None).await;
    next(&mut console).await.expect("console welcome");

    let host_only = rpc(
        &server,
        json!({
            "_tag": "session.command.send",
            "payload": {
                "sessionId": session_id,
                "command": {
                    "_tag": "position.report",
                    "payload": { "positionMs": 90000 }
                }
            }
        }),
        Some(&console_bearer),
    )
    .await;
    assert_eq!(
        host_only["outcome"]["status"], "hostOnly",
        "a console must not launder a false position report through the host"
    );

    let dispatched = rpc(
        &server,
        json!({
            "_tag": "session.command.send",
            "payload": {
                "sessionId": session_id,
                "commandId": "01CONSOLE",
                "command": { "_tag": "transport.pause", "payload": {} }
            }
        }),
        Some(&console_bearer),
    )
    .await;
    assert_eq!(
        dispatched["outcome"]["status"], "dispatched",
        "the core routes the command; only the host can say what its audio did"
    );
    let conflicting = rpc(
        &server,
        json!({
            "_tag": "session.command.send",
            "payload": {
                "sessionId": session_id,
                "commandId": "01CONSOLE",
                "command": { "_tag": "transport.play", "payload": {} }
            }
        }),
        Some(&console_bearer),
    )
    .await;
    assert_eq!(conflicting["outcome"]["status"], "unavailable");
    assert_eq!(
        conflicting["outcome"]["value"]["code"],
        "session.commandIdConflict"
    );

    // The host receives the directive addressed to it.
    let directive = loop {
        let frame = next(&mut host).await.expect("host frame");
        if frame["_tag"] == "realtime.command" {
            break frame;
        }
    };
    assert_eq!(directive["payload"]["sessionId"], session_id);
    assert_eq!(directive["payload"]["directiveId"], "01CONSOLE");
    assert_eq!(directive["payload"]["command"]["_tag"], "transport.pause");

    // The host applies it, which is what makes the state change real.
    let applied = rpc(
        &server,
        json!({
            "_tag": "session.command.run",
            "payload": {
                "sessionId": session_id,
                "commandId": directive["payload"]["directiveId"].clone(),
                "command": directive["payload"]["command"].clone()
            }
        }),
        Some(&host_bearer),
    )
    .await;
    assert_eq!(applied["outcome"]["value"]["transport"], "paused");

    let observed = loop {
        let frame = next(&mut console).await.expect("console frame");
        if frame["payload"]["state"]["payload"]["transport"] == json!("paused") {
            break frame;
        }
    };
    assert_eq!(observed["payload"]["state"]["payload"]["id"], session_id);
}

#[tokio::test]
async fn two_consoles_driving_one_session_observe_the_same_state() {
    let server = serve().await;
    let host_bearer = claim(&server, "desk").await;
    let mut host = open(&server).await;
    hello(&mut host, &host_bearer, json!(["sessions"]), None).await;
    next(&mut host).await.expect("welcome");
    let created = rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Desk" } }),
        Some(&host_bearer),
    )
    .await;
    let session_id = created["outcome"]["value"]["id"]
        .as_str()
        .expect("session id")
        .to_string();

    let mut consoles = Vec::new();
    let mut console_bearers = Vec::new();
    for name in ["phone", "tablet"] {
        let bearer = claim(&server, name).await;
        let mut socket = open(&server).await;
        hello(&mut socket, &bearer, json!(["sessions"]), None).await;
        next(&mut socket).await.expect("welcome");
        consoles.push(socket);
        console_bearers.push(bearer);
    }

    // Both consoles drive the one session, and the host applies each directive.
    for (index, bearer) in console_bearers.iter().enumerate() {
        let volume = 40 + index as u64;
        let sent = rpc(
            &server,
            json!({
                "_tag": "session.command.send",
                "payload": {
                    "sessionId": session_id,
                    "command": { "_tag": "volume.set", "payload": { "volume": volume } }
                }
            }),
            Some(bearer),
        )
        .await;
        assert_eq!(sent["outcome"]["status"], "dispatched");

        let directive = loop {
            let frame = next(&mut host).await.expect("host frame");
            if frame["_tag"] == "realtime.command" {
                break frame;
            }
        };
        rpc(
            &server,
            json!({
                "_tag": "session.command.run",
                "payload": {
                    "sessionId": session_id,
                    "command": directive["payload"]["command"].clone()
                }
            }),
            Some(&host_bearer),
        )
        .await;
    }

    // Each console must end up describing the session the same way.
    let mut settled = Vec::new();
    for console in &mut consoles {
        let final_state = loop {
            let frame = next(console).await.expect("event");
            if frame["payload"]["state"]["payload"]["volume"] == json!(41) {
                break frame["payload"]["state"].clone();
            }
        };
        settled.push(final_state);
    }
    assert_eq!(
        settled[0], settled[1],
        "every console must converge on one description of the session"
    );
}

#[tokio::test]
async fn one_console_press_is_applied_once_even_with_two_tabs_open() {
    let server = serve().await;
    let host_bearer = claim(&server, "desk").await;
    let console_bearer = claim(&server, "phone").await;

    let mut first_tab = open(&server).await;
    hello(&mut first_tab, &host_bearer, json!(["sessions"]), None).await;
    next(&mut first_tab).await.expect("welcome");
    let mut second_tab = open(&server).await;
    hello(&mut second_tab, &host_bearer, json!(["sessions"]), None).await;
    next(&mut second_tab).await.expect("welcome");

    let session_id = rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Desk" } }),
        Some(&host_bearer),
    )
    .await["outcome"]["value"]["id"]
        .as_str()
        .expect("session id")
        .to_string();

    rpc(
        &server,
        json!({
            "_tag": "session.command.send",
            "payload": {
                "sessionId": session_id,
                "command": { "_tag": "queue.add", "payload": { "trackIds": ["track-1"] } }
            }
        }),
        Some(&console_bearer),
    )
    .await;

    let mut directives = 0;
    for tab in [&mut first_tab, &mut second_tab] {
        // Drain briefly: a duplicate would arrive on the other tab.
        while let Ok(Some(frame)) = tokio::time::timeout(Duration::from_millis(300), tab.next())
            .await
            .map(|message| {
                message
                    .and_then(|message| message.ok())
                    .and_then(|message| {
                        message
                            .into_text()
                            .ok()
                            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
                    })
            })
        {
            if frame["_tag"] == "realtime.command" {
                directives += 1;
            }
        }
    }
    assert_eq!(
        directives, 1,
        "a second open tab must not turn one queue.add into two tracks"
    );
}

#[tokio::test]
async fn handoff_refuses_to_overwrite_a_target_that_is_already_playing() {
    let server = serve().await;
    let desk_bearer = claim(&server, "desk").await;
    let kitchen_bearer = claim(&server, "kitchen").await;

    let mut desk = open(&server).await;
    hello(&mut desk, &desk_bearer, json!(["sessions"]), None).await;
    next(&mut desk).await.expect("welcome");
    let mut kitchen = open(&server).await;
    hello(&mut kitchen, &kitchen_bearer, json!(["sessions"]), None).await;
    next(&mut kitchen).await.expect("welcome");

    let source = rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Desk" } }),
        Some(&desk_bearer),
    )
    .await["outcome"]["value"]["id"]
        .as_str()
        .expect("source id")
        .to_string();
    let target = rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Kitchen" } }),
        Some(&kitchen_bearer),
    )
    .await["outcome"]["value"]["id"]
        .as_str()
        .expect("target id")
        .to_string();

    for (session, bearer, track) in [
        (&source, &desk_bearer, "track-mine"),
        (&target, &kitchen_bearer, "track-theirs"),
    ] {
        rpc(
            &server,
            json!({
                "_tag": "session.command.run",
                "payload": {
                    "sessionId": session,
                    "command": { "_tag": "queue.add", "payload": { "trackIds": [track] } }
                }
            }),
            Some(bearer),
        )
        .await;
    }

    let refused = rpc(
        &server,
        json!({
            "_tag": "session.handoff",
            "payload": { "sessionId": source, "targetSessionId": target }
        }),
        Some(&desk_bearer),
    )
    .await;
    assert_eq!(
        refused["outcome"]["status"], "targetBusy",
        "moving your music must not erase what somebody else is listening to"
    );

    let untouched = rpc(
        &server,
        json!({ "_tag": "session.state.get", "payload": { "sessionId": target } }),
        Some(&kitchen_bearer),
    )
    .await;
    assert_eq!(
        untouched["outcome"]["value"]["queue"],
        json!(["track-theirs"])
    );
}

#[tokio::test]
async fn commanding_an_unreachable_session_is_refused_rather_than_queued() {
    let server = serve().await;
    let host_bearer = claim(&server, "desk").await;
    let console_bearer = claim(&server, "phone").await;

    let mut host = open(&server).await;
    hello(&mut host, &host_bearer, json!(["sessions"]), None).await;
    next(&mut host).await.expect("welcome");
    let created = rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Desk" } }),
        Some(&host_bearer),
    )
    .await;
    let session_id = created["outcome"]["value"]["id"]
        .as_str()
        .expect("session id")
        .to_string();
    host.close(None).await.expect("close");

    let mut refused = json!(null);
    for _ in 0..50 {
        tokio::time::sleep(Duration::from_millis(20)).await;
        refused = rpc(
            &server,
            json!({
                "_tag": "session.command.send",
                "payload": {
                    "sessionId": session_id,
                    "command": { "_tag": "transport.play", "payload": {} }
                }
            }),
            Some(&console_bearer),
        )
        .await;
        if refused["outcome"]["status"] == json!("unreachable") {
            break;
        }
    }
    assert_eq!(
        refused["outcome"]["status"], "unreachable",
        "a command that cannot arrive now must not be applied later"
    );

    let unknown = rpc(
        &server,
        json!({
            "_tag": "session.command.send",
            "payload": {
                "sessionId": "no-such-session",
                "command": { "_tag": "transport.play", "payload": {} }
            }
        }),
        Some(&console_bearer),
    )
    .await;
    assert_eq!(
        unknown["outcome"]["status"], "unknownSession",
        "an unknown session is a different answer from an unreachable one"
    );
}

#[tokio::test]
async fn handoff_moves_the_queue_and_leaves_the_source_empty() {
    let server = serve().await;
    let desk_bearer = claim(&server, "desk").await;
    let kitchen_bearer = claim(&server, "kitchen").await;

    let mut desk = open(&server).await;
    hello(&mut desk, &desk_bearer, json!(["sessions"]), None).await;
    next(&mut desk).await.expect("welcome");
    let mut kitchen = open(&server).await;
    hello(&mut kitchen, &kitchen_bearer, json!(["sessions"]), None).await;
    next(&mut kitchen).await.expect("welcome");

    let source = rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Desk" } }),
        Some(&desk_bearer),
    )
    .await["outcome"]["value"]["id"]
        .as_str()
        .expect("source id")
        .to_string();
    let target = rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Kitchen" } }),
        Some(&kitchen_bearer),
    )
    .await["outcome"]["value"]["id"]
        .as_str()
        .expect("target id")
        .to_string();

    rpc(
        &server,
        json!({
            "_tag": "session.command.run",
            "payload": {
                "sessionId": source,
                "command": {
                    "_tag": "queue.add",
                    "payload": { "trackIds": ["track-1", "track-2"] }
                }
            }
        }),
        Some(&desk_bearer),
    )
    .await;

    let moved = rpc(
        &server,
        json!({
            "_tag": "session.handoff",
            "payload": { "sessionId": source, "targetSessionId": target }
        }),
        Some(&desk_bearer),
    )
    .await;

    // The source host is told directly to stop, not only through the sessions topic.
    let told_to_stop = loop {
        let frame = next(&mut desk).await.expect("desk frame");
        if frame["_tag"] == "realtime.command" {
            break frame;
        }
    };
    assert_eq!(told_to_stop["payload"]["command"]["_tag"], "transport.stop");
    assert_eq!(told_to_stop["payload"]["sessionId"], source);
    assert_eq!(moved["outcome"]["status"], "ready");
    assert_eq!(moved["outcome"]["value"]["id"], target);
    assert_eq!(
        moved["outcome"]["value"]["queue"],
        json!(["track-1", "track-2"])
    );
    assert_eq!(moved["outcome"]["value"]["cursor"], 0);

    let emptied = rpc(
        &server,
        json!({ "_tag": "session.state.get", "payload": { "sessionId": source } }),
        Some(&desk_bearer),
    )
    .await;
    assert_eq!(
        emptied["outcome"]["value"]["queue"],
        json!([]),
        "leaving the queue behind is how a listener ends up with two rooms playing"
    );
    assert_eq!(emptied["outcome"]["value"]["transport"], "stopped");
}

#[tokio::test]
async fn handoff_to_an_unreachable_device_is_refused() {
    let server = serve().await;
    let desk_bearer = claim(&server, "desk").await;
    let kitchen_bearer = claim(&server, "kitchen").await;

    let mut desk = open(&server).await;
    hello(&mut desk, &desk_bearer, json!(["sessions"]), None).await;
    next(&mut desk).await.expect("welcome");

    let source = rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Desk" } }),
        Some(&desk_bearer),
    )
    .await["outcome"]["value"]["id"]
        .as_str()
        .expect("source id")
        .to_string();
    // The kitchen never connected, so it cannot receive what is playing.
    let target = rpc(
        &server,
        json!({ "_tag": "session.create", "payload": { "name": "Kitchen" } }),
        Some(&kitchen_bearer),
    )
    .await["outcome"]["value"]["id"]
        .as_str()
        .expect("target id")
        .to_string();

    let refused = rpc(
        &server,
        json!({
            "_tag": "session.handoff",
            "payload": { "sessionId": source, "targetSessionId": target }
        }),
        Some(&desk_bearer),
    )
    .await;
    assert_eq!(refused["outcome"]["status"], "targetUnreachable");

    // The mirror case: a source that cannot be told to stop may still be playing.
    desk.close(None).await.expect("close");
    let mut kitchen = open(&server).await;
    hello(&mut kitchen, &kitchen_bearer, json!(["sessions"]), None).await;
    next(&mut kitchen).await.expect("welcome");
    let mut source_refused = json!(null);
    for _ in 0..50 {
        tokio::time::sleep(Duration::from_millis(20)).await;
        source_refused = rpc(
            &server,
            json!({
                "_tag": "session.handoff",
                "payload": { "sessionId": source, "targetSessionId": target }
            }),
            Some(&kitchen_bearer),
        )
        .await;
        if source_refused["outcome"]["status"] == json!("sourceUnreachable") {
            break;
        }
    }
    assert_eq!(
        source_refused["outcome"]["status"], "sourceUnreachable",
        "a host that cannot be stopped must not have its queue moved away"
    );

    let itself = rpc(
        &server,
        json!({
            "_tag": "session.handoff",
            "payload": { "sessionId": source, "targetSessionId": source }
        }),
        Some(&desk_bearer),
    )
    .await;
    assert_eq!(itself["outcome"]["status"], "sameSession");
}
