---
id: 2026-11-24-sonos-output-honest-takeover-live-volume-and-ssdp-discovery-on-unzen
title: "Sonos output: honest takeover, live volume, and SSDP discovery on unzen"
status: To Do
created: 2026-11-24
source: forgerie-suggestion
  01a20ec2-8207-77d9-ad68-f3f981fbb26f/51c8f0e2-605f-472a-9792-72a62f073cfb
---

Found while testing Kids Desk on 2026-11-24 (live v4 on unzen).

1. **Play cannot take over, but the error says it can.** When another app plays on the speaker, `transport.play` returns `output.rendererOwnershipLost` with "press Play to take it over explicitly". Pressing Play again returns the same error, because `ensure_stream_owner` (`services/pyxis/src/output_catalog.rs:303-420`) refuses every command while a foreign stream is PLAYING. Either add an explicit takeover (for example a `takeover` flag on play) or change the message. The test worked around it by stopping the speaker with raw SOAP first.
2. **Session volume goes stale.** Someone changed Kids Desk to 63 on the speaker, and the Pyxis session still reported 12. Output sessions do not read the renderer volume back.
3. **SSDP discovery fails on unzen.** M-SEARCH replies never arrive, which is probably the firewall: only dport 1900 is open, while replies go to an ephemeral port. Sonos currently works only through plugin config `seedHosts` (.226, .241, .216), which breaks if DHCP moves all three. The lasting fix belongs in mountainous (`modules/hosts/unzen.nix`).
4. `output.group.set` refuses with `output.groupBusy` when an existing output session (Kitchen, Living Room) owns a room in the group. In this test the plugin could not split one room out of a group.

## Context

### Why
Sonos playback works, but these four gaps make Pyxis report false state or refuse ordinary actions. The seed-host workaround breaks without any warning when DHCP moves the speakers.

### Files
- services/pyxis/src/output_catalog.rs
- services/pyxis/src/rpc/dispatch.rs
- plugins/sonos/src/topology.ts
- plugins/sonos/src/ssdp.ts

### Decisions
- Seed hosts were set as a runtime workaround; the firewall fix is not done

Suggested in Application feature list (01a20ec2-8207-77d9-ad68-f3f981fbb26f), 2026-11-24
