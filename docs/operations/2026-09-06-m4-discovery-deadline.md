# Sonos discovery deadline and host discovery health

## User outcome and current scope

The user confirmed: **“they are no longer blinking but the buttons are disabled.”**
This accepts the retained-row presentation in deployed `6334018`, not Sonos connectivity.
Public session reads still show availability changing without queue/transport revisions.
Do not re-enable controls from cached truth or treat their disabled state as the defect.

`f95ed257fe2e7cd5be70e94b50203ee066f5768b` is a reviewed, committed discovery-helper deadline
correction. Its immutable package and host flake check pass; the package is
`/nix/store/9541j8ypc3bpjq4p8ip8v1hbla5kp4w1-pyxis-2.0.0`. It is **not deployed**;
production remains `6334018`. Host discovery health and a separate intermittent Kitchen
position-read timeout remain open. No speaker playback, queue, grouping, or volume command
was issued in this investigation. No production configuration was read/decrypted or changed.

## Stage-localized reproduction

A separate SonosController used production Bun 1.3.13, Avahi 0.8 and four explicit diagnostic
seed addresses—not an assertion about production config. Its fetch guard admitted only known
private endpoints, identity-checked descriptions, and exact topology/transport/position read
SOAP envelopes. Pure negative probes did not perform network I/O. Logs omit stream URIs and
response bodies.

With discovery budget 2500 ms and request budget 3000 ms:

- Six discovery stages took **15600, 2625, 3756, 9000, 14289, 27391 ms**.
- Description/topology headers and bodies otherwise completed quickly.
- Two Kitchen GetPositionInfo calls timed out before headers at 3000–3001 ms.
- Living Room position reads succeeded. Its hardware Paused state at 107 seconds is separate
  from its stopped/empty saved core session; no attempt was made to alter it.

A separate exact Avahi-child trace showed spawn returning promptly, the 2500 ms timer firing
on time, and `kill()` returning immediately. The default SIGTERM still left stdout/exit pending
for seconds. This is not merely an inferred slow dispatch stage. A private-helper SIGKILL
comparison completed stdout/exit at **2501–2504 ms** across three runs. All three had zero stdout
bytes: bounding discovery cannot create absent or late results.

Independent code reconnaissance also located public-call queueing behind the single plugin
supervisor, and repeated discovery inside each state read. Public discovery bypasses output
mutexes but can queue behind monitor calls in that supervisor. These verified mechanisms do not
measure the share of previous public 25.9/29.9-second timings attributable to each stage.

## Bounded correction

At deadline, force-kill only the ephemeral read-only Avahi helper. Drain its pipe and await its
exit. Preserve complete newline-terminated records; discard an interrupted final suffix rather
than treating a truncated valid address as a discovered target. Normal early-exit output remains
unchanged. There is no cached-topology authority, grace period, runtime/header change, or larger
configured timeout.

Three tests cover a real Bun child ignoring SIGTERM, normal early completion, and interrupted
last-line handling. The deadline and partial-record cases failed before their corrections.
Independent review found no blockers. Full verification passed **248 client tests and 74
plugin/SDK tests**, scoped Rust/contract/type/lint/shell/PWA/package and host-flake gates. Initial
test stream typings were corrected before these final gates. Default `just verify` still stops
at **25 prototype errors and 16 warnings**; aggregate tests use explicit Node 22.22.1. Flake
verification does not cover incompatible systems.

Repeating the guarded controller probe against the corrected source bounded all six discovery
stages to **2501–2505 ms**. The total probe fell from 79 seconds to 18.5 seconds. Kitchen still
had one GetPositionInfo timeout; a second Kitchen read and both Living Room reads succeeded.
This proves the deadline correction, not restored physical control availability.

A separate bounded paired-HTTP comparison ran default, no-reuse and Connection:close requests
under both Bun and Node. **All variants, including defaults, succeeded.** It does not justify
a permanent keepalive/header/runtime workaround for Kitchen.

## Host-level finding and next action

The host's existing Avahi daemon was using **99.7–100.2% of one CPU core** in repeated samples.
Even read-only D-Bus GetVersionString calls took **289, 1065 and 2671 ms**. It reports Avahi 0.8.
The service is active, but activity alone does not demonstrate healthy discovery. A nearby
pressure sample showed I/O full-stall avg10 0.03%; do not attribute this to unrelated Nix work.

The daemon's CPU use and slow replies are concrete evidence. Why it is spinning, and whether
it also explains Kitchen's HTTP timeout, are not established. Avahi 0.8 source explicitly
flushes service output; no stdout-buffering workaround was added.

Ask permission before restarting this **shared host discovery service**. A restart may briefly
interrupt LAN service discovery for other applications. It is not a queue/playback command and
is not a NixOS switch, but it extends beyond restarting Pyxis alone. After approval, recheck
bounded discovery and saved-session availability read-only, deploy the exact reviewed Pyxis
revision only after checking live playback, and retain any remaining failures. Do not claim
Sonos playback acceptance or issue an unsolicited playback test.

Evidence is retained under `~/.local/state/pyxis-diagnostics/sonos-deadline-evidence/`. All diagnostic
helper processes completed; no diagnostic browser was started in this pass. Historical failed
unintended queue-clear evidence remains in the preceding handoff/Sonos report and is not erased
by this pass's read-only scope.
