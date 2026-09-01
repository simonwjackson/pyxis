# Album artwork cache

Album artwork is rebuildable source metadata. Pyxis stores it in
`$XDG_DATA_HOME/pyxis/cache/album-artwork.json`, outside the main ProseQL source.

The separate file is deliberate. The current native ProseQL runtime rewrites the complete
configured source after each mutation. An older Pyxis binary does not know a new collection
name and would therefore remove that collection during a rollback. The sidecar survives an
old binary and becomes visible again when the artwork-aware version returns.

The cache is account-scoped and keyed by the opaque album id. Writes replace the file through
an atomic rename. The library album revision remains in ProseQL and increases when artwork
changes, so realtime and offline clients still use the normal aggregate revision gate.

Artwork is not a credential or the only copy of user data. Pyxis quarantines an unreadable
sidecar and starts without artwork, so damaged rebuildable metadata cannot stop playback. If
the sidecar is lost, run `tools/backfill-library-artwork` to rebuild it through each album's
stored source reference. A sidecar write failure returns an error. A retry is safe and fills
the missing cache entry.
