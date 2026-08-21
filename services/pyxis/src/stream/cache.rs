//! Ephemeral remote-byte cache and per-candidate fetch deduplication.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tokio::sync::Mutex;
use ulid::Ulid;

#[derive(Clone)]
pub struct StreamCache {
    root: PathBuf,
    locks: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
}

impl StreamCache {
    pub fn open(state_dir: &Path) -> std::io::Result<Self> {
        let root = state_dir.join("cache").join("streams");
        std::fs::create_dir_all(&root)?;
        Ok(StreamCache {
            root,
            locks: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub fn path(&self, key: &str) -> PathBuf {
        self.root
            .join(blake3::hash(key.as_bytes()).to_hex().as_str())
    }

    pub fn temporary(&self, key: &str) -> PathBuf {
        self.root.join(format!(
            ".{}-{}.partial",
            blake3::hash(key.as_bytes()).to_hex(),
            Ulid::new()
        ))
    }

    pub async fn lock_for(&self, key: &str) -> Arc<Mutex<()>> {
        self.locks
            .lock()
            .await
            .entry(key.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}
