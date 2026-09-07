# Sonos discovery follow-up

**Later update:** the user identified device entries flashing in/out. The deployed `6334018`
visibility correction is documented in [the output-visibility report](2026-09-06-m4-output-visibility.md).
It retains unavailable rows but does not resolve the discovery/state-request failures below.

## Scope

The user resolved the browser-handoff report by identifying the wrong initiating device and
asked to move on. This pass resumes the remaining Sonos report. It performs only public
reads, identity-checked HTTP device descriptions and `GetZoneGroupState`, plus selected
process/network metadata inspection. It does not decrypt or change configuration, restart
the service, or issue playback, queue, grouping, or volume commands.

Runtime remains `560b53099ccc66a00b9918d7396fc4326d72e742`, bundle `index-EelMZonK.js`.
The prior accidental failed queue-clear request remains documented in the earlier report;
this pass does not erase or repeat it.

## Observations

1. Sonos was live/configured. Kitchen was stopped/unreachable with 42 tracks, revision 21.
   Living Room was stopped/unreachable with an empty queue, revision 33.
2. Public `output.targets.list` for Sonos returned `unavailable` after **25.903 seconds**:
   `sonos.unavailable`, `no Sonos room answered topology refresh`, retryable.
3. The multicast and Kitchen routes used the LAN interface, Avahi was active, and the live
   plugin used Bun **1.3.13** with Avahi on PATH and no proxy environment variables present.
   This does not establish that multicast replies reach the application.
4. A bounded probe imported the actual `sendSoapAction` implementation and checked each
   device UDN before allowing a topology POST. Its fetch guard allowed only device-description
   GETs and `GetZoneGroupState` on the two known room addresses. Two rounds per room returned
   all four groups under **both** Bun 1.3.13 and Node 22.22.1:

   | Runtime | Kitchen, description + topology | Living Room, description + topology |
   | --- | --- | --- |
   | Bun 1.3.13 | 36 / 50 ms | 60 / 70 ms |
   | Node 22.22.1 | 111 / 56 ms | 34 / 25 ms |

   Responses used `Connection: close`; description bodies were chunked and topology bodies
   had Content-Length. No header workaround was supplied and no signed media URI was logged.
5. A repeat public discovery returned **ready after 29.862 seconds**, with authoritative
   topology containing Basement, Kids Desk, Kitchen, and Living Room as standalone coordinators.
   A concurrent IPv4-only socket sampler found no matching samples; it did not cover IPv6
   sockets or guarantee observation of short connections, so it establishes no absence of I/O.
6. A later public read at 21:04 local time showed both saved rooms reachable again. Their
   stopped transport, revisions 21/33, and queues 42/empty were unchanged.

## Conclusions and limits

Discovery is intermittent and the public calls are slow despite fast direct topology replies
in this sample. The public timings include any request queueing, plugin dispatch, discovery,
and network work; that time has not yet been isolated by stage. This pass does not establish
a Bun-specific defect, a configuration error, or a permanent fix. Later recovery is an
observation, not Sonos playback acceptance.

The user's exact Sonos action/room is still unknown. Next distinguish discovery/direct room
playback from browser-to-Sonos handoff, which the current contract explicitly refuses.
Any physical playback test must be explicitly scoped and authorized; do not clear a queue,
regroup speakers, or infer authorization from a room selection alone.

Sanitized probe source and results are retained under
`~/.local/state/pyxis-diagnostics/sonos-discovery-evidence/`. No runtime code changed; browser
responsiveness acceptance and the remaining physical M3 checks are separate.
