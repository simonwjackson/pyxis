use std::collections::BTreeSet;

use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatchItem {
    pub id: String,
    pub artist: String,
    pub title: String,
    pub album: Option<String>,
    pub duration_ms: Option<u32>,
    pub year: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MatchScore {
    pub overall: u16,
    pub artist: u16,
    pub title: u16,
    pub album: Option<u16>,
    pub duration: Option<u16>,
    pub year: Option<u16>,
    pub coverage: u16,
    pub variant_conflict: bool,
}

pub fn score(left: &MatchItem, right: &MatchItem) -> MatchScore {
    let artist = similarity(
        &normalize_artist(&left.artist),
        &normalize_artist(&right.artist),
    );
    let title = similarity(&normalize(&left.title), &normalize(&right.title));
    let album = left
        .album
        .as_deref()
        .zip(right.album.as_deref())
        .map(|(left, right)| similarity(&normalize(left), &normalize(right)));
    let (duration, duration_conflict) = duration_score(left.duration_ms, right.duration_ms);
    let year = left
        .year
        .zip(right.year)
        .map(|(left, right)| year_score(left, right));
    let variant_conflict = variants(&left.title) != variants(&right.title);

    let mut weighted = u64::from(artist) * 350 + u64::from(title) * 400;
    let mut available_weight = 750_u64;
    if let Some(album) = album {
        weighted += u64::from(album) * 100;
        available_weight += 100;
    }
    if let Some(duration) = duration {
        weighted += u64::from(duration) * 100;
        available_weight += 100;
    }
    if let Some(year) = year {
        weighted += u64::from(year) * 50;
        available_weight += 50;
    }
    let base = weighted / available_weight;
    let coverage = available_weight;
    // Missing metadata lowers confidence without turning absence into disagreement. With
    // one missing 10% field an otherwise exact match scores 950 rather than 1000.
    let confidence_factor = 500 + coverage / 2;
    let mut overall = base * confidence_factor / 1000;
    if artist == 1000 && title == 1000 && !variant_conflict && !duration_conflict {
        // A reacquisition manifest intentionally carries only the stable core identity.
        // Exact artist/title remains auto-mergeable, but stays below a fully described
        // 1000-point match when album, duration, or year are absent.
        overall = overall.max(925);
    }
    if variant_conflict {
        overall = overall.saturating_sub(200);
    }
    if duration_conflict {
        overall = overall.min(650);
    }

    MatchScore {
        overall: u16::try_from(overall).unwrap_or(1000),
        artist,
        title,
        album,
        duration,
        year,
        coverage: u16::try_from(coverage).unwrap_or(1000),
        variant_conflict,
    }
}

fn normalize(value: &str) -> String {
    let mut result = String::new();
    let mut pending_space = false;
    for character in value
        .nfkd()
        .filter(|character| !is_combining_mark(*character))
        .flat_map(char::to_lowercase)
    {
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

fn normalize_artist(value: &str) -> String {
    let normalized = normalize(value);
    let primary = [" featuring ", " feat ", " ft "]
        .into_iter()
        .filter_map(|separator| normalized.find(separator))
        .min()
        .map_or(normalized.as_str(), |index| &normalized[..index]);
    primary
        .strip_prefix("the ")
        .unwrap_or(primary)
        .replace(" and ", " ")
}

fn variants(value: &str) -> BTreeSet<&'static str> {
    let normalized = normalize(value);
    [
        "live",
        "remaster",
        "remastered",
        "remix",
        "acoustic",
        "demo",
        "instrumental",
        "radio edit",
    ]
    .into_iter()
    .filter(|variant| normalized.contains(variant))
    .collect()
}

fn similarity(left: &str, right: &str) -> u16 {
    if left.is_empty() || right.is_empty() {
        return 0;
    }
    (strsim::jaro_winkler(left, right) * 1000.0).round() as u16
}

fn duration_score(left: Option<u32>, right: Option<u32>) -> (Option<u16>, bool) {
    let Some((left, right)) = left.zip(right) else {
        return (None, false);
    };
    let difference = left.abs_diff(right);
    match difference {
        0..=2_000 => (Some(1000), false),
        2_001..=5_000 => (Some(850), false),
        5_001..=10_000 => (Some(600), false),
        _ => (Some(0), true),
    }
}

fn year_score(left: u32, right: u32) -> u16 {
    match left.abs_diff(right) {
        0 => 1000,
        1 => 800,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn artist_normalization_handles_articles_conjunctions_and_features() {
        assert_eq!(normalize_artist("The Simon & Garfunkel"), "simon garfunkel");
        assert_eq!(
            normalize_artist("Massive Attack feat. Elizabeth Fraser"),
            "massive attack"
        );
    }
}
