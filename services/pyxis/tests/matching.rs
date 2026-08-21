use pyxis::db::store::{AccountId, Store};
use pyxis::matching::{Decision, MatchItem, Matcher, OverrideDecision};

fn item(id: &str, artist: &str, title: &str, duration_ms: Option<u32>) -> MatchItem {
    MatchItem {
        id: id.into(),
        artist: artist.into(),
        title: title.into(),
        album: Some("Heroes".into()),
        duration_ms,
        year: Some(1977),
    }
}

#[test]
fn identical_recordings_score_at_the_top_and_auto_accept() {
    let dir = tempfile::tempdir().expect("temp dir");
    let matcher = Matcher::open(Store::open(dir.path()).expect("store"));
    let account = AccountId::new("account-a");

    let result = matcher
        .decide(
            &account,
            &item("a", "David Bowie", "Heroes", Some(372_000)),
            &item("b", "David Bowie", "Heroes", Some(372_000)),
        )
        .expect("match");

    assert_eq!(result.decision, Decision::AutoMerge);
    assert_eq!(result.score.overall, 1000);
}

#[test]
fn punctuation_and_featured_artist_differences_still_auto_accept() {
    let dir = tempfile::tempdir().expect("temp dir");
    let matcher = Matcher::open(Store::open(dir.path()).expect("store"));
    let account = AccountId::new("account-a");
    let fixtures = [
        (
            item("a", "Simon & Garfunkel", "The Boxer", Some(310_000)),
            item("b", "Simon and Garfunkel", "The Boxer!", Some(311_000)),
        ),
        (
            item("c", "Massive Attack", "Teardrop", Some(330_000)),
            item(
                "d",
                "Massive Attack feat. Elizabeth Fraser",
                "Teardrop",
                Some(330_000),
            ),
        ),
        (
            item("e", "Björk", "Jóga", Some(305_000)),
            item("f", "Bjork", "Joga", Some(305_000)),
        ),
    ];

    for (left, right) in fixtures {
        assert_eq!(
            matcher.decide(&account, &left, &right).unwrap().decision,
            Decision::AutoMerge
        );
    }
}

#[test]
fn exact_artist_and_title_auto_merge_when_optional_album_facts_are_absent() {
    let dir = tempfile::tempdir().expect("temp dir");
    let matcher = Matcher::open(Store::open(dir.path()).expect("store"));
    let account = AccountId::new("account-a");
    let sparse = MatchItem {
        id: "manifest".into(),
        artist: "David Bowie".into(),
        title: "Heroes".into(),
        album: None,
        duration_ms: None,
        year: None,
    };
    let result = matcher
        .decide(
            &account,
            &sparse,
            &item("candidate", "David Bowie", "Heroes", None),
        )
        .expect("match");

    assert_eq!(result.decision, Decision::AutoMerge);
    assert_eq!(result.score.overall, 925);
}

#[test]
fn live_and_remaster_variants_never_auto_merge() {
    let dir = tempfile::tempdir().expect("temp dir");
    let matcher = Matcher::open(Store::open(dir.path()).expect("store"));
    let account = AccountId::new("account-a");

    for title in ["Heroes (Live)", "Heroes (2017 Remaster)"] {
        let result = matcher
            .decide(
                &account,
                &item("original", "David Bowie", "Heroes", Some(372_000)),
                &item("variant", "David Bowie", title, Some(372_000)),
            )
            .expect("match");
        assert_ne!(result.decision, Decision::AutoMerge);
    }
}

#[test]
fn duration_beyond_tolerance_rejects_even_similar_metadata() {
    let dir = tempfile::tempdir().expect("temp dir");
    let matcher = Matcher::open(Store::open(dir.path()).expect("store"));
    let account = AccountId::new("account-a");

    let result = matcher
        .decide(
            &account,
            &item("a", "David Bowie", "Heroes", Some(372_000)),
            &item("b", "David Bowie", "Heroes", Some(420_000)),
        )
        .expect("match");

    assert_eq!(result.decision, Decision::Reject);
}

#[test]
fn missing_duration_degrades_confidence_without_erroring() {
    let dir = tempfile::tempdir().expect("temp dir");
    let matcher = Matcher::open(Store::open(dir.path()).expect("store"));
    let account = AccountId::new("account-a");

    let complete = matcher
        .decide(
            &account,
            &item("a", "David Bowie", "Heroes", Some(372_000)),
            &item("b", "David Bowie", "Heroes", Some(372_000)),
        )
        .unwrap();
    let missing = matcher
        .decide(
            &account,
            &item("c", "David Bowie", "Heroes", None),
            &item("d", "David Bowie", "Heroes", Some(372_000)),
        )
        .unwrap();

    assert!(missing.score.overall < complete.score.overall);
    assert!(missing.score.overall > 0);
}

#[test]
fn manual_split_survives_restart_and_changed_candidate_metadata() {
    let dir = tempfile::tempdir().expect("temp dir");
    let account = AccountId::new("account-a");
    {
        let store = Store::open(dir.path()).expect("store");
        let matcher = Matcher::open(store.clone());
        matcher
            .set_override(
                &account,
                "track-a",
                "candidate-b",
                OverrideDecision::Split,
                "device-a",
            )
            .expect("split");
        store.close().expect("close");
    }

    let matcher = Matcher::open(Store::open(dir.path()).expect("reopen"));
    let result = matcher
        .decide(
            &account,
            &item("track-a", "David Bowie", "Heroes", Some(372_000)),
            &item("candidate-b", "David Bowie", "Heroes!!!", Some(372_001)),
        )
        .expect("match");

    assert_eq!(result.decision, Decision::ManualSplit);
}

#[test]
fn manual_merge_overrides_a_score_that_would_reject() {
    let dir = tempfile::tempdir().expect("temp dir");
    let matcher = Matcher::open(Store::open(dir.path()).expect("store"));
    let account = AccountId::new("account-a");
    matcher
        .set_override(
            &account,
            "track-a",
            "candidate-b",
            OverrideDecision::Merge,
            "device-a",
        )
        .expect("merge");

    let result = matcher
        .decide(
            &account,
            &item("track-a", "David Bowie", "Heroes", Some(372_000)),
            &item("candidate-b", "Nirvana", "Nevermind", Some(250_000)),
        )
        .expect("match");

    assert_eq!(result.decision, Decision::ManualMerge);
}
