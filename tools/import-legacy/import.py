#!/usr/bin/env nix-shell
#! nix-shell -i python3 -p python3 python3Packages.pyyaml
"""Ephemeral v1 -> v2 album reacquisition.

Reads only artist/title from the live v1 albums YAML. Every album is searched, scored,
fetched and added through public v2 RPCs. No legacy ids, source refs, tracks, placements,
or listen events cross the boundary.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

LEGACY_ALBUMS = Path(
    os.environ.get("PYXIS_LEGACY_ALBUMS", "/var/lib/pyxis/pyxis/db/albums.yaml")
)
ORIGIN = os.environ.get("PYXIS_IMPORT_ORIGIN", "http://127.0.0.1:4491")
STATE = Path(os.environ.get("PYXIS_IMPORT_STATE", "/tmp/pyxis-v2-import-state.json"))
REQUEST_DELAY_SECONDS = 0.35


class RpcError(RuntimeError):
    pass


@dataclass(frozen=True)
class Album:
    artist: str
    title: str

    @property
    def key(self) -> str:
        return f"{self.artist}\0{self.title}"


def read_manifest() -> list[Album]:
    if os.access(LEGACY_ALBUMS, os.R_OK):
        raw = LEGACY_ALBUMS.read_text()
    else:
        result = subprocess.run(
            ["sudo", "cat", str(LEGACY_ALBUMS)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        raw = result.stdout
    source = yaml.safe_load(raw)
    if not isinstance(source, dict):
        raise RuntimeError("legacy albums YAML is not a mapping")
    albums: list[Album] = []
    for value in source.values():
        if not isinstance(value, dict):
            continue
        artist = value.get("artist")
        title = value.get("title")
        if isinstance(artist, str) and artist.strip() and isinstance(title, str) and title.strip():
            albums.append(Album(artist.strip(), title.strip()))
    albums.sort(key=lambda album: (album.artist.casefold(), album.title.casefold()))
    return albums


class Api:
    def __init__(self) -> None:
        self.token: str | None = None

    def rpc(self, tag: str, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if self.token is not None:
            headers["Authorization"] = "Bearer " + self.token
        request = urllib.request.Request(
            ORIGIN + "/rpc",
            data=json.dumps({"_tag": tag, "payload": payload}).encode(),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                value = json.load(response)
        except urllib.error.HTTPError as error:
            raise RpcError(f"{tag} HTTP {error.code}: {error.read().decode()}") from error
        if value.get("_tag") == "rpc.failure":
            raise RpcError(f"{tag}: {value['outcome']['value']['message']}")
        if value.get("_tag") != tag:
            raise RpcError(f"{tag}: response tag was {value.get('_tag')}")
        outcome = value.get("outcome")
        if not isinstance(outcome, dict):
            raise RpcError(f"{tag}: missing outcome")
        return outcome

    def claim(self) -> None:
        outcome = self.rpc("auth.device.claim", {"name": "v1 album reacquisition"})
        if outcome.get("status") != "ready":
            raise RpcError(f"device claim: {outcome}")
        self.token = outcome["value"]["bearerToken"]


def load_state() -> dict[str, Any]:
    if not STATE.exists():
        return {"resolved": {}, "unresolved": {}, "failed": {}}
    return json.loads(STATE.read_text())


def save_state(state: dict[str, Any]) -> None:
    temporary = STATE.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")
    temporary.replace(STATE)


def retry(operation, attempts: int = 3):
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return operation()
        except (RpcError, urllib.error.URLError, TimeoutError) as error:
            last = error
            if attempt + 1 < attempts:
                time.sleep(2**attempt)
    assert last is not None
    raise last


def score(api: Api, album: Album, candidate: dict[str, Any]) -> dict[str, Any]:
    outcome = api.rpc(
        "matching.evaluate",
        {
            "left": {"id": album.key, "artist": album.artist, "title": album.title},
            "right": {
                "id": candidate["externalId"],
                "artist": candidate["artist"],
                "title": candidate["title"],
                **({"year": candidate["year"]} if "year" in candidate else {}),
            },
        },
    )
    if outcome.get("status") != "ready":
        raise RpcError(f"matching.evaluate: {outcome}")
    return outcome["value"]


def resolve(api: Api, album: Album) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    search = api.rpc(
        "source.album.search",
        {"pluginId": "ytmusic", "query": f"{album.artist} {album.title}"},
    )
    if search.get("status") != "ready":
        raise RpcError(f"source.album.search: {search}")
    ranked: list[dict[str, Any]] = []
    for candidate in search["value"]:
        match = score(api, album, candidate)
        ranked.append({"candidate": candidate, "match": match})
    ranked.sort(key=lambda item: item["match"]["score"]["overall"], reverse=True)
    if not ranked or ranked[0]["match"]["decision"] not in ("autoMerge", "manualMerge"):
        return None, ranked[:5]
    return ranked[0]["candidate"], ranked[:5]


def import_album(api: Api, album: Album, candidate: dict[str, Any]) -> str:
    details = api.rpc(
        "source.album.get",
        {"pluginId": "ytmusic", "externalId": candidate["externalId"]},
    )
    if details.get("status") != "ready":
        raise RpcError(f"source.album.get: {details}")
    value = details["value"]
    added = api.rpc(
        "library.album.add",
        {
            "title": value["title"],
            "artist": value["artist"],
            **({"year": value["year"]} if "year" in value else {}),
            "sourceReference": {
                "pluginId": value["sourcePluginId"],
                "externalId": value["externalId"],
            },
            "tracks": [
                {
                    "id": track["id"],
                    "title": track["title"],
                    "artist": track["artist"],
                    **({"durationMs": track["durationMs"]} if "durationMs" in track else {}),
                    **({"trackNumber": track["trackNumber"]} if "trackNumber" in track else {}),
                }
                for track in value["tracks"]
            ],
        },
    )
    if added.get("status") != "ready":
        raise RpcError(f"library.album.add: {added}")
    return added["value"]["id"]


def main() -> int:
    albums = read_manifest()
    if "--manifest-only" in sys.argv:
        print(json.dumps({"albums": len(albums)}))
        return 0
    state = load_state()
    api = Api()
    api.claim()
    existing = api.rpc("library.albums.list", {})
    if existing.get("status") != "ready":
        raise RpcError(f"library.albums.list: {existing}")
    existing_pairs = {
        (entry["artist"].casefold(), entry["title"].casefold()) for entry in existing["value"]
    }

    print(f"Manifest: {len(albums)} albums; existing v2: {len(existing_pairs)}")
    for index, album in enumerate(albums, start=1):
        if album.key in state["resolved"]:
            continue
        if (album.artist.casefold(), album.title.casefold()) in existing_pairs:
            state["resolved"][album.key] = {"albumId": "existing", "exactExisting": True}
            save_state(state)
            continue
        try:
            candidate, ranked = retry(lambda: resolve(api, album))
            if candidate is None:
                state["unresolved"][album.key] = {
                    "artist": album.artist,
                    "title": album.title,
                    "candidates": ranked,
                }
            else:
                album_id = retry(lambda: import_album(api, album, candidate))
                state["resolved"][album.key] = {
                    "albumId": album_id,
                    "artist": album.artist,
                    "title": album.title,
                    "resolvedTitle": candidate["title"],
                    "resolvedArtist": candidate["artist"],
                    "score": ranked[0]["match"]["score"]["overall"],
                }
                state["unresolved"].pop(album.key, None)
                state["failed"].pop(album.key, None)
        except Exception as error:  # recorded for explicit review and retry
            state["failed"][album.key] = {
                "artist": album.artist,
                "title": album.title,
                "error": str(error),
            }
        save_state(state)
        print(
            f"[{index}/{len(albums)}] resolved={len(state['resolved'])} "
            f"unresolved={len(state['unresolved'])} failed={len(state['failed'])}",
            flush=True,
        )
        time.sleep(REQUEST_DELAY_SECONDS)

    print(json.dumps({key: len(value) for key, value in state.items()}, sort_keys=True))
    return 0 if not state["failed"] else 2


if __name__ == "__main__":
    sys.exit(main())
