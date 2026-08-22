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
    let mut unreachable = false;
    for _ in 0..50 {
        tokio::time::sleep(Duration::from_millis(20)).await;
        let listed = rpc(
            &server,
            json!({ "_tag": "session.list", "payload": {} }),
            Some(&bearer),
        )
        .await;
        if listed["outcome"]["value"][0]["reachable"] == json!(false) {
            unreachable = true;
            break;
        }
    }
    assert!(
        unreachable,
        "a host that dropped its socket must stop being reachable"
    );
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
