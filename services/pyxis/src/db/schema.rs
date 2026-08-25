//! Collection descriptors.
//!
//! Every domain collection is account-scoped: each record carries `accountId`, and the
//! store refuses to return a record whose `accountId` does not match the requested scope.
//! The `accounts` collection itself is the only unscoped one.
//!
//! Every syncable record carries `revision` and `updatedBy`. Both exist from the first
//! commit on purpose: retrofitting optimistic concurrency onto records that already exist
//! in the wild is far more expensive than carrying two fields nobody reads yet.
//!
//! New collections can appear after launch. ProseQL opens missing version-1 collections
//! beside existing data, while changes to an existing collection still require migrations.

use proseql_engine::descriptor::{
    CollectionDescriptor, IdStrategy, SchemaNode, StructField, ValidationMode,
};

pub const ACCOUNTS: &str = "accounts";
pub const DEVICES: &str = "devices";
pub const SESSIONS: &str = "sessions";
pub const SESSION_COMMAND_RECEIPTS: &str = "sessionCommandReceipts";
pub const ALBUMS: &str = "albums";
pub const ALBUM_SOURCE_REFS: &str = "albumSourceRefs";
pub const ALBUM_TRACKS: &str = "albumTracks";
pub const TRACKS: &str = "tracks";
pub const TRACK_CANDIDATES: &str = "trackCandidates";
pub const PLAYLISTS: &str = "playlists";
pub const STATIONS: &str = "stations";
pub const BOOKMARKS: &str = "bookmarks";
pub const FEEDBACK: &str = "feedback";
pub const LISTEN_EVENTS: &str = "listenEvents";
pub const HOT_ALBUMS: &str = "hotAlbums";
pub const SETTINGS: &str = "settings";
pub const API_TOKENS: &str = "apiTokens";
pub const PLUGIN_CREDENTIALS: &str = "pluginCredentials";
pub const MEDIA_FILES: &str = "mediaFiles";
pub const MATCH_OVERRIDES: &str = "matchOverrides";
pub const FIDELITY_UPGRADE_JOBS: &str = "fidelityUpgradeJobs";

fn field(name: &str, schema: SchemaNode) -> StructField {
    StructField {
        name: name.to_string(),
        schema,
    }
}

fn optional(schema: SchemaNode) -> SchemaNode {
    SchemaNode::Optional(Box::new(schema))
}

fn base(name: &str, fields: Vec<StructField>, append_only: bool) -> CollectionDescriptor {
    CollectionDescriptor {
        name: name.to_string(),
        schema: SchemaNode::Struct { fields },
        id_strategy: IdStrategy::Provided,
        relationships: vec![],
        indexes: vec![],
        unique_fields: vec![],
        before_create_hooks: vec![],
        after_create_hooks: vec![],
        before_update_hooks: vec![],
        after_update_hooks: vec![],
        before_delete_hooks: vec![],
        after_delete_hooks: vec![],
        on_change_hooks: vec![],
        computed_fields: vec![],
        search_index: vec![],
        id_generator: None,
        version: Some(1),
        migrations: vec![],
        append_only,
        validation_mode: ValidationMode::Strict,
    }
}

/// A collection whose records belong to exactly one account and participate in sync.
fn scoped(name: &str, mut fields: Vec<StructField>) -> CollectionDescriptor {
    fields.insert(0, field("id", SchemaNode::Str));
    fields.insert(1, field("accountId", SchemaNode::Str));
    fields.push(field("revision", SchemaNode::Num));
    fields.push(field("updatedBy", SchemaNode::Str));
    fields.push(field("updatedAt", SchemaNode::Str));
    base(name, fields, false)
}

/// A source file records collections absent from its first open as version 0. A descriptor
/// added later must remain unversioned until it has an explicit migration registry, or
/// ProseQL correctly refuses the implicit 0 -> 1 transition.
fn added_after_m1(mut descriptor: CollectionDescriptor) -> CollectionDescriptor {
    descriptor.version = None;
    descriptor
}

pub fn accounts() -> CollectionDescriptor {
    base(
        ACCOUNTS,
        vec![
            field("id", SchemaNode::Str),
            field("name", SchemaNode::Str),
            field("isDefault", SchemaNode::Bool),
            field("createdAt", SchemaNode::Str),
        ],
        false,
    )
}

pub fn devices() -> CollectionDescriptor {
    scoped(
        DEVICES,
        vec![
            field("name", SchemaNode::Str),
            field("tokenHash", SchemaNode::Str),
            field("lastSeenAt", optional(SchemaNode::Str)),
        ],
    )
}

/// A session is hosted by exactly one device. `hostDeviceId` is the owner of transport
/// truth; a position report from any other device is rejected rather than merged.
pub fn sessions() -> CollectionDescriptor {
    scoped(
        SESSIONS,
        vec![
            field("name", SchemaNode::Str),
            field("hostDeviceId", SchemaNode::Str),
            field("transport", SchemaNode::Str),
            field("positionMs", SchemaNode::Num),
            field("durationMs", optional(SchemaNode::Num)),
            field("volume", SchemaNode::Num),
            field("cursor", optional(SchemaNode::Num)),
            field("outputRef", optional(SchemaNode::Str)),
            field(
                "queue",
                SchemaNode::Array {
                    item: Box::new(SchemaNode::Str),
                },
            ),
        ],
    )
}

pub fn session_command_receipts() -> CollectionDescriptor {
    added_after_m1(scoped(
        SESSION_COMMAND_RECEIPTS,
        vec![
            field("sessionId", SchemaNode::Str),
            field("commandId", SchemaNode::Str),
            field("fingerprint", SchemaNode::Str),
            field("applied", SchemaNode::Bool),
        ],
    ))
}

pub fn albums() -> CollectionDescriptor {
    scoped(
        ALBUMS,
        vec![
            field("title", SchemaNode::Str),
            field("artist", SchemaNode::Str),
            field("normalizedTitle", SchemaNode::Str),
            field("normalizedArtist", SchemaNode::Str),
            field("placement", SchemaNode::Str),
            field("placementUpdatedAt", SchemaNode::Str),
            field("year", optional(SchemaNode::Num)),
            field("addedAt", SchemaNode::Str),
        ],
    )
}

pub fn album_source_refs() -> CollectionDescriptor {
    added_after_m1(scoped(
        ALBUM_SOURCE_REFS,
        vec![
            field("albumId", SchemaNode::Str),
            field("pluginId", SchemaNode::Str),
            field("externalId", SchemaNode::Str),
        ],
    ))
}

pub fn album_tracks() -> CollectionDescriptor {
    added_after_m1(scoped(
        ALBUM_TRACKS,
        vec![
            field("albumId", SchemaNode::Str),
            field("trackId", SchemaNode::Str),
            field("position", SchemaNode::Num),
            field("trackNumber", optional(SchemaNode::Num)),
        ],
    ))
}

pub fn tracks() -> CollectionDescriptor {
    scoped(
        TRACKS,
        vec![
            field("title", SchemaNode::Str),
            field("artist", SchemaNode::Str),
            field("durationMs", optional(SchemaNode::Num)),
            field("trackNumber", optional(SchemaNode::Num)),
            field("artworkUrl", optional(SchemaNode::Str)),
        ],
    )
}

/// A playable candidate for a track: either a plugin-resolvable reference or a local file
/// in the media store. Fidelity ranking across candidates is what lets a background
/// upgrade take effect without touching the track record.
pub fn track_candidates() -> CollectionDescriptor {
    scoped(
        TRACK_CANDIDATES,
        vec![
            field("trackId", SchemaNode::Str),
            field("kind", SchemaNode::Str),
            field("pluginId", optional(SchemaNode::Str)),
            field("externalId", optional(SchemaNode::Str)),
            field("mediaFileId", optional(SchemaNode::Str)),
            field("format", optional(SchemaNode::Str)),
            field("lossless", optional(SchemaNode::Bool)),
            field("bitrateKbps", optional(SchemaNode::Num)),
            field("sampleRateHz", optional(SchemaNode::Num)),
            field("sourcePriority", SchemaNode::Num),
            field("discoveredAt", SchemaNode::Str),
        ],
    )
}

pub fn playlists() -> CollectionDescriptor {
    scoped(
        PLAYLISTS,
        vec![
            field("title", SchemaNode::Str),
            field(
                "trackIds",
                SchemaNode::Array {
                    item: Box::new(SchemaNode::Str),
                },
            ),
        ],
    )
}

pub fn stations() -> CollectionDescriptor {
    scoped(
        STATIONS,
        vec![
            field("pluginId", SchemaNode::Str),
            field("externalId", SchemaNode::Str),
            field("name", SchemaNode::Str),
        ],
    )
}

pub fn bookmarks() -> CollectionDescriptor {
    scoped(
        BOOKMARKS,
        vec![
            field("trackId", SchemaNode::Str),
            field("createdAt", SchemaNode::Str),
        ],
    )
}

pub fn feedback() -> CollectionDescriptor {
    scoped(
        FEEDBACK,
        vec![
            field("trackId", SchemaNode::Str),
            field("rating", SchemaNode::Str),
            field("createdAt", SchemaNode::Str),
        ],
    )
}

/// Append-only. Listening history is the truth the rest of the library derives from, so
/// events are never edited: history and hot albums are projections over this log, and a
/// projection change means a rebuild rather than a migration. Append-only is also what
/// makes offline merge trivial, since two devices can only ever add.
pub fn listen_events() -> CollectionDescriptor {
    let mut descriptor = scoped(
        LISTEN_EVENTS,
        vec![
            field("kind", SchemaNode::Str),
            field("happenedAt", SchemaNode::Str),
            field("deviceId", SchemaNode::Str),
            field("trackId", optional(SchemaNode::Str)),
            field("albumId", optional(SchemaNode::Str)),
            field("sourcePluginId", optional(SchemaNode::Str)),
            field("playedMs", optional(SchemaNode::Num)),
            field("completed", optional(SchemaNode::Bool)),
            field("context", optional(SchemaNode::Str)),
            field("contextId", optional(SchemaNode::Str)),
            field("fromPlacement", optional(SchemaNode::Str)),
            field("toPlacement", optional(SchemaNode::Str)),
        ],
    );
    descriptor.append_only = true;
    descriptor
}

pub fn hot_albums() -> CollectionDescriptor {
    added_after_m1(scoped(
        HOT_ALBUMS,
        vec![
            field("albumId", SchemaNode::Str),
            field("listenCount", SchemaNode::Num),
            field("windowStart", SchemaNode::Str),
            field("computedAt", SchemaNode::Str),
        ],
    ))
}

pub fn settings() -> CollectionDescriptor {
    scoped(
        SETTINGS,
        vec![
            field("scope", SchemaNode::Str),
            field("deviceId", optional(SchemaNode::Str)),
            field("value", SchemaNode::Str),
        ],
    )
}

/// Hash-only bearer credentials for third-party clients. The plaintext token is returned
/// exactly once at creation and never enters the store.
pub fn api_tokens() -> CollectionDescriptor {
    scoped(
        API_TOKENS,
        vec![
            field("name", SchemaNode::Str),
            field("tokenHash", SchemaNode::Str),
            field(
                "scopes",
                SchemaNode::Array {
                    item: Box::new(SchemaNode::Str),
                },
            ),
            field("createdAt", SchemaNode::Str),
            field("revokedAt", optional(SchemaNode::Str)),
        ],
    )
}

/// Server-only. Credentials never cross the wire to a client and never sync to a device.
pub fn plugin_credentials() -> CollectionDescriptor {
    scoped(
        PLUGIN_CREDENTIALS,
        vec![
            field("pluginId", SchemaNode::Str),
            field("ciphertext", SchemaNode::Str),
            field("nonce", SchemaNode::Str),
        ],
    )
}

/// Server-only. Local audio in the media store, including files acquired by background
/// fidelity upgrades.
pub fn media_files() -> CollectionDescriptor {
    scoped(
        MEDIA_FILES,
        vec![
            field("path", SchemaNode::Str),
            field("bytes", SchemaNode::Num),
            field("checksum", SchemaNode::Str),
            field("format", optional(SchemaNode::Str)),
            field("lastAccessedAt", SchemaNode::Str),
            field("pinned", SchemaNode::Bool),
            field("status", SchemaNode::Str),
            field("quarantinedAt", optional(SchemaNode::Str)),
        ],
    )
}

pub fn match_overrides() -> CollectionDescriptor {
    added_after_m1(scoped(
        MATCH_OVERRIDES,
        vec![
            field("leftId", SchemaNode::Str),
            field("rightId", SchemaNode::Str),
            field("decision", SchemaNode::Str),
            field("createdAt", SchemaNode::Str),
        ],
    ))
}

/// Server-only retry state for patient background fidelity upgrades. Peer identity,
/// filenames, candidate references, and raw provider errors are deliberately never stored.
pub fn fidelity_upgrade_jobs() -> CollectionDescriptor {
    added_after_m1(scoped(
        FIDELITY_UPGRADE_JOBS,
        vec![
            field("providerId", SchemaNode::Str),
            field("trackId", SchemaNode::Str),
            field("status", SchemaNode::Str),
            field("attempts", SchemaNode::Num),
            field("nextAttemptAt", SchemaNode::Str),
            field("lastAttemptAt", optional(SchemaNode::Str)),
            field("leaseUntil", optional(SchemaNode::Str)),
            field("lastErrorCode", optional(SchemaNode::Str)),
        ],
    ))
}

/// Every collection the runtime opens.
pub fn all() -> Vec<CollectionDescriptor> {
    vec![
        accounts(),
        devices(),
        sessions(),
        session_command_receipts(),
        albums(),
        album_source_refs(),
        album_tracks(),
        tracks(),
        track_candidates(),
        playlists(),
        stations(),
        bookmarks(),
        feedback(),
        listen_events(),
        hot_albums(),
        settings(),
        api_tokens(),
        plugin_credentials(),
        media_files(),
        match_overrides(),
        fidelity_upgrade_jobs(),
    ]
}
