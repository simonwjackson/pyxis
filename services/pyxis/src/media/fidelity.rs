//! Audio-quality ordering.
//!
//! Quality is the first decision, not source preference: lossless beats lossy, then higher
//! bitrate, then higher sample rate. Locality and source priority are tie-breakers applied
//! by the candidate resolver only after two candidates have equal fidelity.

use std::cmp::Ordering;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fidelity {
    pub lossless: bool,
    pub bitrate_kbps: Option<u32>,
    pub sample_rate_hz: Option<u32>,
}

impl Fidelity {
    fn key(self) -> (bool, u32, u32) {
        (
            self.lossless,
            self.bitrate_kbps.unwrap_or_default(),
            self.sample_rate_hz.unwrap_or_default(),
        )
    }
}

impl Ord for Fidelity {
    fn cmp(&self, other: &Self) -> Ordering {
        self.key().cmp(&other.key())
    }
}

impl PartialOrd for Fidelity {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lossless_beats_any_lossy_bitrate() {
        assert!(
            Fidelity {
                lossless: true,
                bitrate_kbps: Some(1),
                sample_rate_hz: Some(44_100),
            } > Fidelity {
                lossless: false,
                bitrate_kbps: Some(u32::MAX),
                sample_rate_hz: Some(192_000),
            }
        );
    }

    #[test]
    fn bitrate_precedes_sample_rate() {
        assert!(
            Fidelity {
                lossless: false,
                bitrate_kbps: Some(320),
                sample_rate_hz: Some(44_100),
            } > Fidelity {
                lossless: false,
                bitrate_kbps: Some(256),
                sample_rate_hz: Some(192_000),
            }
        );
    }
}
