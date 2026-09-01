use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::db::store::AccountId;

#[derive(Debug, thiserror::Error)]
pub enum ArtworkStoreError {
    #[error("album artwork could not be written: {0}")]
    Write(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredArtwork {
    pub url: String,
    pub revision: u64,
    pub updated_by: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArtworkFile {
    accounts: HashMap<String, HashMap<String, StoredArtwork>>,
}

#[derive(Clone)]
pub struct AlbumArtworkStore {
    path: PathBuf,
    state: Arc<Mutex<ArtworkFile>>,
}

impl AlbumArtworkStore {
    pub fn open(state_dir: &Path) -> Self {
        let path = state_dir.join("cache").join("album-artwork.json");
        let state = match std::fs::read(&path) {
            Ok(bytes) => match serde_json::from_slice(&bytes) {
                Ok(state) => state,
                Err(error) => recover_corrupt(&path, &error.to_string()),
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => ArtworkFile::default(),
            Err(error) => recover_corrupt(&path, &error.to_string()),
        };
        AlbumArtworkStore {
            path,
            state: Arc::new(Mutex::new(state)),
        }
    }

    pub fn get(&self, account: &AccountId, album_id: &str) -> Option<StoredArtwork> {
        self.state
            .lock()
            .expect("album artwork store poisoned")
            .accounts
            .get(account.as_str())
            .and_then(|albums| albums.get(album_id))
            .cloned()
    }

    pub fn list(&self, account: &AccountId) -> HashMap<String, StoredArtwork> {
        self.state
            .lock()
            .expect("album artwork store poisoned")
            .accounts
            .get(account.as_str())
            .cloned()
            .unwrap_or_default()
    }

    pub fn put(
        &self,
        account: &AccountId,
        album_id: &str,
        artwork: StoredArtwork,
    ) -> Result<(), ArtworkStoreError> {
        let mut state = self.state.lock().expect("album artwork store poisoned");
        let mut candidate = state.clone();
        candidate
            .accounts
            .entry(account.as_str().into())
            .or_default()
            .insert(album_id.into(), artwork);
        persist(&self.path, &candidate)?;
        *state = candidate;
        Ok(())
    }

    pub fn remove(&self, account: &AccountId, album_id: &str) -> Result<bool, ArtworkStoreError> {
        let mut state = self.state.lock().expect("album artwork store poisoned");
        let mut candidate = state.clone();
        let removed = candidate
            .accounts
            .get_mut(account.as_str())
            .and_then(|albums| albums.remove(album_id))
            .is_some();
        if !removed {
            return Ok(false);
        }
        if candidate
            .accounts
            .get(account.as_str())
            .is_some_and(HashMap::is_empty)
        {
            candidate.accounts.remove(account.as_str());
        }
        persist(&self.path, &candidate)?;
        *state = candidate;
        Ok(true)
    }
}

fn persist(path: &Path, state: &ArtworkFile) -> Result<(), ArtworkStoreError> {
    let parent = path
        .parent()
        .ok_or_else(|| ArtworkStoreError::Write("artwork path has no parent".into()))?;
    std::fs::create_dir_all(parent).map_err(|error| ArtworkStoreError::Write(error.to_string()))?;
    let temp = parent.join(format!(".album-artwork-{}.tmp", Ulid::new()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|error| ArtworkStoreError::Write(error.to_string()))?;
        let bytes = serde_json::to_vec_pretty(state)
            .map_err(|error| ArtworkStoreError::Write(error.to_string()))?;
        file.write_all(&bytes)
            .and_then(|_| file.write_all(b"\n"))
            .and_then(|_| file.sync_all())
            .map_err(|error| ArtworkStoreError::Write(error.to_string()))?;
        std::fs::rename(&temp, path)
            .map_err(|error| ArtworkStoreError::Write(error.to_string()))?;
        OpenOptions::new()
            .read(true)
            .open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|error| ArtworkStoreError::Write(error.to_string()))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temp);
    }
    result
}

fn recover_corrupt(path: &Path, reason: &str) -> ArtworkFile {
    let quarantine = path.with_file_name(format!("album-artwork.corrupt-{}.json", Ulid::new()));
    match std::fs::rename(path, &quarantine) {
        Ok(()) => tracing::warn!(
            path = %path.display(),
            quarantine = %quarantine.display(),
            %reason,
            "album artwork cache was corrupt and has been quarantined"
        ),
        Err(error) => tracing::warn!(
            path = %path.display(),
            %reason,
            quarantine_error = %error,
            "album artwork cache could not be read or quarantined; starting without artwork"
        ),
    }
    ArtworkFile::default()
}
