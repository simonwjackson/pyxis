//! One process owns one ProseQL store.
//!
//! `proseql-native` documents multiple runtimes over the same path as unsupported. This
//! advisory kernel lock makes a second server fail before it opens the database, rather
//! than letting two processes race durable writes.

use std::fs::{File, OpenOptions};
use std::path::Path;

use anyhow::{Context, Result};
use fs2::FileExt;

pub struct InstanceLock {
    file: File,
}

impl InstanceLock {
    pub fn acquire(state_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(state_dir)
            .with_context(|| format!("create state directory {}", state_dir.display()))?;
        let path = state_dir.join("instance.lock");
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(&path)
            .with_context(|| format!("open instance lock {}", path.display()))?;

        file.try_lock_exclusive()
            .with_context(|| format!("another Pyxis server owns {}", path.display()))?;

        Ok(InstanceLock { file })
    }
}

impl Drop for InstanceLock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn releases_the_lock_when_the_owner_drops() {
        let dir = tempfile::tempdir().expect("temp dir");
        let first = InstanceLock::acquire(dir.path()).expect("first lock");

        let error = InstanceLock::acquire(dir.path())
            .err()
            .expect("second lock must fail");
        assert!(error.to_string().contains("another Pyxis server owns"));

        drop(first);
        InstanceLock::acquire(dir.path()).expect("lock after owner dropped");
    }
}
