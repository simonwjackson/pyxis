# Product client

## Decisions confirmed by the user

- Build `clients/player/` beside the existing client using React, Vite and TypeScript.
- Retire the reference UI once the product covers its functionality. Preserve and reuse the
  worker/RPC/PWA data plane; no data migrations and no copied playback authority.
- Plain CSS and tokens, no old UI imports. Shared new visual decisions live in `system-next/`.
- First milestone: atoms and molecules across surfaces, not a first production vertical slice.
- Wire real Caliper previews through an external profile, not merely author part files.
- Real client-side routes when screens arrive; the persistent player sits outside the outlet.
- Local development only. The live service, tailnet serving and Nix deployment are untouched.
- Freeze each prototype when its production surface lands, not all of them up front.

These decisions extend the rewrite plan's deliberate UI exclusion. That plan still owns
service and data-plane work; its reference-client rules are not an exemption for the new UI.

## Milestones

1. **Foundations** (this change): shared atoms and molecules, a part beside each, architecture
   and authoring gates proven by negative tests, an intrinsic token substrate, and a real
   Caliper session proving discovery, contracts, controls and HMR.
2. **Screens:** organisms, templates and page shapes with required edge-state variations,
   reviewed both alone and in place, bound once to the existing worker and renderer. No timers
   pretending to connect a source, pair a device, or play music.
3. **Parity and retirement:** prove real online/offline/session/account/source/output journeys,
   preserve durable worker state, replace the old renderer, and retire the reference UI only
   after functionality has transferred.

The ordinary gate checks the layers being delivered. `gate:product` always demands all five,
including before they exist, so missing layers stay visible as unfinished work rather than
being quietly excused. A foundation specimen is never relabelled a page to make coverage
look complete.

## What the gates check

`clients/player/test/architecture.mjs` was written and observed failing before any component
existed. Its first full-product run reported exactly five failures: `missing-layer:atom`,
`molecule`, `organism`, `page`, `template`. Seven meta-tests in `architecture.test.mjs` prove
each rule bites: a component with no part, a private or nested presentational function, an
unsealed atom root, a part missing its default or `name`, an old-UI import, state read below a
binding (including via an aliased import), raw layout or styling inside a shape, and a raw hex
or pixel value in CSS. Coverage walks the directory rather than listing files, so a component
added tomorrow is included the moment it lands.

Two allowances are named in code with their reasons rather than left implicit: `.binding.tsx`
files and the two composition roots (`src/main.tsx`, `src/preview/mount.tsx`) may import a
binding, because wiring the object graph is their job.

## What was built

Ten system atoms, eight system molecules, one thin `AlbumTile` shape, each with a sibling
part. The inventory came from the prototype's literal control, artwork, field, row and notice
signatures, not from its exported utility functions — an exported helper is not a visual unit.
Tokens and palette originate in the approved prototype design; muted text contrast was raised
and touch targets given a 44px floor while porting.

Styling is co-located: each component owns `<Component>.css` beside its `.tsx`, so parallel
authors never meet in one stylesheet. `base.css` keeps only the rules whose declaration block is
genuinely shared — the `px-` reset and the control surface behind `Action`, `IconButton`,
`ChoiceChip` and `CoverButton` — because splitting those would write one decision four times.
`tokens.css` stays the single source of raw values and is the only file the raw-design-value
check exempts; that exemption is now an exact path rather than a filename suffix, so a component
cannot opt out by calling its stylesheet `*.tokens.css`. An eighth meta-test proves it.

`mountFoundations` is the consumer's public mount API. Production and Caliper mount the same
components through it. It performs no RPC and no worker call, and says so on screen.

## Verified

Baseline and comparison were taken in the same working directory, inside `nix develop`, with
the work moved aside and `bun.lock` restored for the "before" half: **261 tests before, 261
after, zero failures both, identical failure sets by name.** An earlier baseline was discarded
as untrustworthy: it was taken outside the devshell, where the ProseQL closure is unlinked, and
reported 253 tests because eight real-WASM cases silently skipped.

Repo typecheck, player typecheck, 10 component tests, 8 gate meta-tests, the architecture gate,
the prototype style gate and `biome check` on the new tree all pass.

The CSS split was verified as a rewrite, not a rewrite plus a silent edit: the 60 rule blocks in
the old stylesheet appear exactly once across the 19 new files, with none lost, added or
duplicated, compared after normalising selector and declaration order. HMR was measured on
Vite's own update socket, before and after the split, over the same module graph Caliper serves.
Editing `Action.css`, `base.css`, `tokens.css` or `preview.css` produces a hot update and never a
full reload — the same result the single stylesheet gave, so a live session still survives a CSS
edit. This measured the Vite mechanism, not a browser session; the earlier sentinel evidence
remains the only end-to-end proof.

A real Caliper session (external profile at `~/.config/caliper/profiles/9f4f090d31e196f7/`,
nothing added to the checkout) confirmed:

- the surface mounts and renders real content, asserted by visible text, not by mounting;
- five sampled parts are discovered from source with no manifest, glob or bundle;
- the sealed contract is generated from the real TypeScript: placing `Progress` yields
  `Percentage for Progress`, `type=range`, `min=0 max=100 step=1`, matching the declared
  `NumericRange<0, 100, 1>`;
- **true size reflows rather than zooms** — at 320px and 900px the type stays 13px, the row
  grows taller when narrow (272×108 → 852×72), the search form wraps (132px → 78px tall), and
  the cover holds its intrinsic 156px;
- the registered `@property --px-type-base` is picked up as a canvas tunable, with `--px-cover`
  and `--px-duration` read from source.

## Not verified, and one real failure

**Part add/delete fails the HMR release gate.** Across three consecutive runs, component,
prop-type and CSS edits preserved the sentinel, object count and coordinates every time. Adding
a `*.part.tsx` emitted `[vite] page reload` and destroyed the session in two of three runs; the
one apparent pass was a race where the check ran before the navigation landed. The consumer has
no HMR handler, no glob and no bridge, so this is not consumer-side. Caliper's own
`verify:amaze-hmr` covers the `sourcePartBridges` path, which uses a different watcher, so the
in-project path looks ungated for this category. Tracked as `01M1YJC05DJKWFQ6KBYKZ2Z2XD`.

Still open: organism, template and page layers (`gate:product` reports all three); touch
behaviour and physical-device rendering; and every product mechanism — nothing here plays
audio, reads the library, connects a source, or pairs a device.
