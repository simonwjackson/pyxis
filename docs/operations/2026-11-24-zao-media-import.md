# 2026-11-24: recover zao local audio on unzen

This procedure is prepared, **not run**. It imports current-v2 track IDs only.
Use a package built with `media import-local`; do not run the old installed binary.

1. Finish staging `/var/lib/pyxis/import-zao-20261124/manifest.json` and `files/`.
   Each entry's `file` is a plain filename beneath `files/`, not a path or symlink.
2. Stop the Pyxis core through its mountainous deployment unit. Back up
   `/var/lib/pyxis/data` while stopped. Keep staging unchanged until both runs finish.
   Run as the state-directory owner, with `ffprobe` on PATH (the package provides it).
3. Inspect the proposed recovery:

   ```sh
   pyxis media import-local --state-dir /var/lib/pyxis/data \
     --manifest /var/lib/pyxis/import-zao-20261124/manifest.json --dry-run
   ```

4. Read the JSON, then import:

   ```sh
   pyxis media import-local --state-dir /var/lib/pyxis/data \
     --manifest /var/lib/pyxis/import-zao-20261124/manifest.json
   ```

5. Save the JSON. Re-run to check `imported: 0`, then restart the core.
   Review every skip; the manifest's 298 entries are not a promised import count.

Both modes require an existing database and `instance.lock`, and refuse a running
server. Dry run creates no files, updates no records and does not quarantine corrupt
local files. It reports `wouldImport` / `wouldImportBytes`; `imported` / `bytes` stay
zero. `skipped` counts reasons; `skips` identifies every skipped track and filename.

Imports verify SHA-256 and bytes on a private temporary copy, probe format/fidelity,
then use the upgrader's recording/duration matcher and `Media::import_local_candidate`.
Dry run reads the staged source directly. Equal/better checksum-valid local copies
are skipped; remote copies do not block recovery. Deleted library albums are skipped,
even when orphan track rows remain. No files are moved from staging or deleted from
the existing media store. Writes use `operator:zao-import-20261124`.

**Budget decision:** the 50 GiB limit is the automatic Soulseek acquisition policy in
`fidelity_upgrades.rs`, not a `Media` import limit. This command does not apply it or
evict existing audio. Cost: recovery needs free disk space for the imported bytes and
one temporary source copy. Later automatic acquisition can still evict unpinned files.
Lossless imports satisfy the job with the normal seven-day recheck; lossy imports keep
the normal retry schedule. Re-runs also repair unsatisfied jobs for existing lossless
copies. Storage failures exit nonzero; prior per-track commits remain. Fix the error
and re-run. There is no extra receipt, checkpoint or persistent import state.
