use serde::{Deserialize, Serialize};

use super::placement::Placement;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceReference {
    pub plugin_id: String,
    pub external_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrackInput {
    /// Reuse an opaque core id returned by source search, or leave absent for a new id.
    pub id: Option<String>,
    pub title: String,
    pub artist: String,
    pub duration_ms: Option<u32>,
    pub track_number: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlbumInput {
    pub title: String,
    pub artist: String,
    pub year: Option<u32>,
    pub source_reference: Option<SourceReference>,
    pub tracks: Vec<TrackInput>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub duration_ms: Option<u32>,
    pub track_number: Option<u32>,
    pub artwork_url: Option<String>,
    pub revision: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Album {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub year: Option<u32>,
    pub placement: Placement,
    pub placement_updated_at: String,
    pub added_at: String,
    pub revision: u64,
    pub tracks: Vec<Track>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AlbumRecord {
    pub id: String,
    pub account_id: String,
    pub title: String,
    pub artist: String,
    pub normalized_title: String,
    pub normalized_artist: String,
    pub placement: Placement,
    pub placement_updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<u32>,
    pub added_at: String,
    pub revision: u64,
    pub updated_by: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrackRecord {
    pub id: String,
    pub account_id: String,
    pub title: String,
    pub artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_number: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork_url: Option<String>,
    pub revision: u64,
    pub updated_by: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AlbumTrackRecord {
    pub id: String,
    pub account_id: String,
    pub album_id: String,
    pub track_id: String,
    pub position: u32,
    pub revision: u64,
    pub updated_by: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SourceReferenceRecord {
    pub id: String,
    pub account_id: String,
    pub album_id: String,
    pub plugin_id: String,
    pub external_id: String,
    pub revision: u64,
    pub updated_by: String,
    pub updated_at: String,
}

pub(crate) fn normalize(value: &str) -> String {
    let mut result = String::new();
    let mut pending_space = false;
    for character in value.trim().chars().flat_map(char::to_lowercase) {
        if character.is_alphanumeric() {
            if pending_space && !result.is_empty() {
                result.push(' ');
            }
            result.push(character);
            pending_space = false;
        } else {
            pending_space = true;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalization_removes_punctuation_and_collapses_spacing() {
        assert_eq!(normalize("  Life  on Mars? "), "life on mars");
    }
}
