#!/usr/bin/env python3
"""Harvest real album covers for the prototypes.

`art/` is deliberately not committed: it is ~42MB of third-party image data that can be
regenerated from the public API at any time. Run this against a live Pyxis to repopulate
it, then the prototypes render real covers instead of blank sleeves.

    nix run nixpkgs#python3 -- prototypes/harvest-art.py

Requires a running Pyxis on BASE with the YouTube Music plugin installed.
"""

import json
import re
import sys
import unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock

BASE = "http://127.0.0.1:4488"
ROOT = Path(__file__).resolve().parent
ART = ROOT / "art"


def rpc(tag, payload, token=None):
    request = urllib.request.Request(
        f"{BASE}/rpc",
        data=json.dumps({"_tag": tag, "payload": payload}).encode(),
        headers={"content-type": "application/json"},
    )
    if token:
        request.add_header("authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read())


def normalize(value):
    value = unicodedata.normalize("NFKD", value).lower()
    value = re.sub(r"[^a-z0-9 ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def upscale(url):
    return re.sub(r"=w\d+-h\d+", "=w600-h600", url)


def main():
    ART.mkdir(parents=True, exist_ok=True)
    albums = json.loads((ROOT / "data" / "albums.json").read_text())
    token = rpc("auth.device.claim", {"name": "art harvest"})["outcome"]["value"]["bearerToken"]
    covers = {}
    lock = Lock()

    def handle(album):
        path = ART / f"{album['id']}.jpg"
        if path.exists() and path.stat().st_size > 900:
            with lock:
                covers[album["id"]] = path.name
            return
        try:
            outcome = rpc(
                "source.album.search",
                {"pluginId": "ytmusic", "query": f"{album['artist']} {album['title']}"},
                token,
            )["outcome"]
            if outcome["status"] != "ready":
                return
            wanted = (normalize(album["artist"]), normalize(album["title"]))
            results = outcome["value"]
            exact = [
                entry
                for entry in results
                if (normalize(entry["artist"]), normalize(entry["title"])) == wanted
            ]
            title_only = [entry for entry in results if normalize(entry["title"]) == wanted[1]]
            best = next(
                (entry for entry in (exact + title_only + results) if entry.get("artworkUrl")),
                None,
            )
            if best is None:
                return
            urllib.request.urlretrieve(upscale(best["artworkUrl"]), path)
            if path.stat().st_size < 900:
                path.unlink(missing_ok=True)
                return
            with lock:
                covers[album["id"]] = path.name
        except Exception as error:  # throwaway tool: skip and continue
            print(f"skip {album['artist']} — {album['title']}: {error}", file=sys.stderr)

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(handle, albums))

    (ROOT / "data" / "art.json").write_text(json.dumps(covers, indent=0))
    print(json.dumps({"albums": len(albums), "covers": len(covers)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
