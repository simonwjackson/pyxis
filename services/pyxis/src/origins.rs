//! Browser origin policy for web apps served from another origin.
//!
//! The core answers browsers on its own origin by default. An operator may name further
//! exact origins, for example a car dashboard PWA, that may call `/rpc`, read
//! `/stream/:trackId` and open `/realtime`. There is no wildcard: a `*` would let any page
//! a person visits drive their music service with a token it phished or guessed.
//!
//! Credentials are a bearer header, never cookies, so the allowlist never sends
//! `Access-Control-Allow-Credentials`. A cross-origin client must send the header itself
//! and must not ask the browser to attach cookies.

use std::collections::BTreeSet;
use std::fmt;
use std::str::FromStr;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::header::{self, HeaderMap, HeaderValue};
use axum::http::uri::Authority;
use axum::http::{Method, StatusCode};
use axum::middleware::Next;
use axum::response::Response;

/// Request headers a cross-origin client may send. `x-pyxis-contract` is required on every
/// authenticated RPC, so leaving it out would make the allowlist useless for `/rpc`.
const ALLOW_HEADERS: &str = "authorization, content-type, range, x-pyxis-contract";

/// Response headers a cross-origin client may read. Range playback needs the first two,
/// and offline caching keys bytes by the resolved candidate.
const EXPOSE_HEADERS: &str = "content-range, accept-ranges, content-length, x-pyxis-candidate-id";

/// Ten minutes. Long enough to avoid a preflight per seek, short enough that removing an
/// origin from the allowlist takes effect soon after a restart.
const PREFLIGHT_MAX_AGE_SECONDS: &str = "600";

/// Exact browser origins allowed besides the core's own. Empty by default.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AllowedOrigins(Arc<BTreeSet<String>>);

/// Why a configured origin was refused at startup.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OriginError(String);

impl fmt::Display for OriginError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for OriginError {}

impl FromStr for AllowedOrigins {
    type Err = OriginError;

    /// Parse a comma-separated list such as `https://vela.example,http://car.local:8080`.
    ///
    /// Every entry must already be in the serialized form a browser sends in `Origin`:
    /// scheme, host and a non-default port, with no path. Requiring that form, rather than
    /// normalizing anything that parses, keeps the configured string identical to what is
    /// compared at request time, so what an operator reads is what is enforced.
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let mut origins = BTreeSet::new();
        for entry in value
            .split(',')
            .map(str::trim)
            .filter(|entry| !entry.is_empty())
        {
            origins.insert(serialized_origin(entry)?);
        }
        Ok(AllowedOrigins(Arc::new(origins)))
    }
}

fn serialized_origin(entry: &str) -> Result<String, OriginError> {
    if entry == "*" {
        return Err(OriginError(
            "allowed origin '*' is refused; name each origin exactly".to_string(),
        ));
    }
    let url = reqwest::Url::parse(entry)
        .map_err(|error| OriginError(format!("allowed origin '{entry}' is not a URL: {error}")))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(OriginError(format!(
            "allowed origin '{entry}' must use http or https"
        )));
    }
    let serialized = url.origin().ascii_serialization();
    if !serialized.eq_ignore_ascii_case(entry) {
        return Err(OriginError(format!(
            "allowed origin '{entry}' is not an exact origin; write '{serialized}'"
        )));
    }
    Ok(serialized)
}

impl AllowedOrigins {
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = &str> {
        self.0.iter().map(String::as_str)
    }

    /// Exact byte comparison against the `Origin` header. Browsers always send the
    /// serialized form, so a lookalike such as another port, scheme or a suffixed host
    /// never matches.
    pub fn contains(&self, origin: &str) -> bool {
        self.0.contains(origin)
    }

    /// Whether a realtime upgrade carrying these headers may proceed.
    ///
    /// Browsers do not preflight WebSockets, and any page can open one to any host, so the
    /// `Origin` header is the only signal that a page on another site is connecting.
    /// Non-browser clients send no `Origin` and keep working. A same-origin page is
    /// recognized by its `Origin` naming the `Host` it connected to, which survives the
    /// tailnet edge because that proxy does not rewrite `Host`.
    pub fn allows_socket(&self, headers: &HeaderMap) -> bool {
        let Some(origin) = headers.get(header::ORIGIN) else {
            return true;
        };
        let Ok(origin) = origin.to_str() else {
            return false;
        };
        self.contains(origin) || same_origin(origin, headers.get(header::HOST))
    }
}

fn same_origin(origin: &str, host: Option<&HeaderValue>) -> bool {
    let Some(host) = host
        .and_then(|host| host.to_str().ok())
        .and_then(|host| host.parse::<Authority>().ok())
    else {
        return false;
    };
    let Ok(origin) = reqwest::Url::parse(origin) else {
        return false;
    };
    if !matches!(origin.scheme(), "http" | "https") {
        return false;
    }
    let (Some(origin_host), Some(origin_port)) =
        (origin.host_str(), origin.port_or_known_default())
    else {
        return false;
    };
    // The core cannot see the scheme behind a TLS-terminating edge, so a `Host` without a
    // port is taken to mean the default port of the origin's scheme.
    let default_port = if origin.scheme() == "https" { 443 } else { 80 };
    let host_port = host.port_u16().unwrap_or(default_port);
    origin_host.eq_ignore_ascii_case(host.host()) && origin_port == host_port
}

/// CORS state for one route: the allowlist and the methods that route serves.
#[derive(Debug, Clone)]
pub struct Cors {
    origins: AllowedOrigins,
    methods: &'static str,
}

impl Cors {
    pub fn new(origins: AllowedOrigins, methods: &'static str) -> Self {
        Cors { origins, methods }
    }
}

/// Answer preflight and decorate responses for allowlisted origins.
///
/// A request from any other origin passes through untouched, so the browser refuses to
/// hand the response to that page. With an empty allowlist this layer changes nothing.
pub async fn cors(State(cors): State<Cors>, request: Request, next: Next) -> Response {
    if cors.origins.is_empty() {
        return next.run(request).await;
    }
    let allowed = request
        .headers()
        .get(header::ORIGIN)
        .filter(|origin| {
            origin
                .to_str()
                .is_ok_and(|origin| cors.origins.contains(origin))
        })
        .cloned();

    let preflight = request.method() == Method::OPTIONS
        && request
            .headers()
            .contains_key(header::ACCESS_CONTROL_REQUEST_METHOD);
    let mut response = match (&allowed, preflight) {
        (Some(_), true) => {
            let mut response = Response::new(Body::empty());
            *response.status_mut() = StatusCode::NO_CONTENT;
            let headers = response.headers_mut();
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_METHODS,
                HeaderValue::from_static(cors.methods),
            );
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                HeaderValue::from_static(ALLOW_HEADERS),
            );
            headers.insert(
                header::ACCESS_CONTROL_MAX_AGE,
                HeaderValue::from_static(PREFLIGHT_MAX_AGE_SECONDS),
            );
            response
        }
        _ => next.run(request).await,
    };

    let headers = response.headers_mut();
    // Responses differ by origin once any origin is allowed, so shared caches must key on
    // it even when this particular origin was refused.
    headers.append(header::VARY, HeaderValue::from_static("origin"));
    if let Some(origin) = allowed {
        headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
        if !preflight {
            headers.insert(
                header::ACCESS_CONTROL_EXPOSE_HEADERS,
                HeaderValue::from_static(EXPOSE_HEADERS),
            );
        }
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    fn origins(value: &str) -> AllowedOrigins {
        value.parse().expect("valid origins")
    }

    fn headers(origin: Option<&str>, host: Option<&str>) -> HeaderMap {
        let mut headers = HeaderMap::new();
        if let Some(origin) = origin {
            headers.insert(header::ORIGIN, origin.parse().expect("origin header"));
        }
        if let Some(host) = host {
            headers.insert(header::HOST, host.parse().expect("host header"));
        }
        headers
    }

    #[test]
    fn an_empty_setting_allows_no_other_origin() {
        assert!(origins("").is_empty());
        assert!(origins(" , ").is_empty());
    }

    #[test]
    fn a_list_parses_exact_origins_and_ignores_spacing() {
        let parsed = origins("https://vela.example, http://car.local:8080");

        assert_eq!(
            parsed.iter().collect::<Vec<_>>(),
            vec!["http://car.local:8080", "https://vela.example"]
        );
    }

    #[test]
    fn host_case_is_normalized_to_what_browsers_send() {
        assert!(origins("https://Vela.Example").contains("https://vela.example"));
    }

    #[test]
    fn wildcards_paths_default_ports_and_other_schemes_are_refused() {
        for (entry, hint) in [
            ("*", "name each origin exactly"),
            ("https://vela.example/", "write 'https://vela.example'"),
            ("https://vela.example/app", "write 'https://vela.example'"),
            ("https://vela.example:443", "write 'https://vela.example'"),
            ("https://user@vela.example", "write 'https://vela.example'"),
            ("ftp://vela.example", "must use http or https"),
            ("null", "is not a URL"),
            ("vela.example", "is not a URL"),
        ] {
            let error = entry.parse::<AllowedOrigins>().expect_err(entry);
            assert!(error.to_string().contains(hint), "{entry}: {error}");
        }
    }

    #[test]
    fn lookalike_origins_do_not_match() {
        let allowed = origins("https://vela.example");

        for lookalike in [
            "http://vela.example",
            "https://vela.example:8443",
            "https://vela.example.evil.test",
            "https://evilvela.example",
            "https://vela.example/",
            "null",
        ] {
            assert!(!allowed.contains(lookalike), "{lookalike}");
        }
    }

    #[test]
    fn sockets_without_an_origin_are_non_browser_clients_and_stay_allowed() {
        assert!(AllowedOrigins::default().allows_socket(&headers(None, Some("127.0.0.1:4488"))));
    }

    #[test]
    fn same_origin_sockets_are_allowed_with_an_empty_allowlist() {
        let empty = AllowedOrigins::default();

        assert!(empty.allows_socket(&headers(
            Some("http://127.0.0.1:4488"),
            Some("127.0.0.1:4488")
        )));
        assert!(empty.allows_socket(&headers(
            Some("https://pyxis.tailnet.ts.net"),
            Some("pyxis.tailnet.ts.net")
        )));
        assert!(empty.allows_socket(&headers(
            Some("https://pyxis.tailnet.ts.net"),
            Some("PYXIS.tailnet.ts.net:443")
        )));
    }

    #[test]
    fn foreign_and_malformed_socket_origins_are_refused() {
        let allowed = origins("https://vela.example");

        for (origin, host) in [
            (Some("https://evil.test"), Some("pyxis.tailnet.ts.net")),
            (
                Some("https://pyxis.tailnet.ts.net:8443"),
                Some("pyxis.tailnet.ts.net"),
            ),
            (Some("http://127.0.0.1:5173"), Some("127.0.0.1:4488")),
            (Some("null"), Some("pyxis.tailnet.ts.net")),
            (Some("https://evil.test"), None),
        ] {
            assert!(!allowed.allows_socket(&headers(origin, host)), "{origin:?}");
        }
    }

    #[test]
    fn allowlisted_socket_origins_are_allowed_from_any_host() {
        assert!(origins("https://vela.example").allows_socket(&headers(
            Some("https://vela.example"),
            Some("pyxis.tailnet.ts.net")
        )));
    }
}
