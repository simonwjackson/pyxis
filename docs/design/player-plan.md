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

## The HMR failure, and how my first account of it was wrong

I reported that part add/delete reloaded the page in two runs of three. Reproducing it properly
corrected that in three ways, and each correction matters more than the original finding:

- **Add was never broken. Delete was.** My harness collapsed add and delete into one stage and
  read the workspace only afterwards, so it could not tell them apart.
- **It was not intermittent.** The "one in three passed" was my measurement racing the
  navigation. With a settle before reading, the failure is three of three, byte-identical.
- **Object count and coordinates survived the reload**, because the board is restored from
  persisted surface state. Only the post-placement `window` sentinel, which cannot be restored,
  exposed the destroyed document. A gate asserting on placed objects alone would have passed a
  broken build.

Root cause: part wrappers are deliberately excluded from React Fast Refresh, so a part module
accepts nothing. On unlink Vite fed the deleted module to `updateModules`, propagation
dead-ended, and Vite escalated to a full reload — undoing the surgical removal message Caliper
had already sent. Add was unaffected only because the module was not yet in the graph.

It was never caught because the existing gate's part path sits outside the Vite root, where
Vite's unlink handler never runs. The gate covered the one path structurally incapable of
showing the bug.

Fixed in the Caliper repo and verified six consecutive runs, with a new in-project regression
gate. Tracked as `01M1YJC05DJKWFQ6KBYKZ2Z2XD`.

## What parity actually means

The reference client exposes **42 capabilities that must be replaced** before it can retire,
plus 14 that are protocol-harness only and must *not* be rebuilt as product UI, and 6 already
live below the UI in the reused worker layer. The survey corrected the count of shapes from
nine to twelve.

Three of the 42 are not ports but missing verbs, and need product decisions before milestone 3
is scoped: **adding a found source album to your library does not exist anywhere today**;
**multi-account does not exist** (one hardcoded device name, one implicit account); and **listen
history is written but never read** — the core builds a Hot projection that no client renders,
so History is new construction rather than replacement.

Still open: template and page layers (`gate:product` reports both); touch behaviour and
physical-device rendering; and every product mechanism — nothing here plays audio, reads the
library, connects a source, or pairs a device.

**Nobody has looked at the ten organisms rendered.** They are discoverable, typed and tested,
but their visual claims rest on ported CSS rather than on seeing them, and that is exactly the
kind of "equivalent by construction" argument this project has already rejected once.

Two gate rules were narrowed after they rejected correct code: list rendering via `.map`, and
`useRef`/`useId` below a binding. Both narrowings are pinned by negative tests. The genuinely
contested part is untouched and still needs a decision — whether a stateful compound widget may
own `useState` and its own context below a binding. Until that is settled, modal sheets
(`PlayerSheet`, `RoomsSheet`) cannot be written, because `showModal()` needs an effect.

## The persistent bar, reviewed as rendered boxes

The bar was drawn, measured and changed in one pass. Five widths of the real component in a real
browser (900, 560, 412, 320, 260px, dark and light, plus an in-place render at 412×760) are the
only reason the following were found: jsdom has no layout engine, and all of them were invisible
to 256 passing tests.

What the bar now is:

- **The title is the loudest thing on it.** Body size and strong weight, with the room readout as
  a muted second line behind the artist. It previously spent its largest, bordered, highest
  contrast surface on the session's name — in practice this device's own UA-derived name, telling
  a person where they already were.
- **A position rule along the top edge.** Full bleed, 3px, drawn through `Progress` with a `rule`
  size. It costs no width, so it survives every container size unchanged. Offered only when the
  length is known, because a rule at zero claims a definite answer nobody has.
- **A room is a control only when there is somewhere to take it.** With no handler it is a readout
  and becomes part of the detail line, first so that a narrow bar truncates the room and not the
  artist. As an `Action` with no `onClick` it was a focusable, enabled button that could not act.
- **The row stacks instead of squeezing.** `--px-bar-copy-min` is the width the copy refuses to be
  measured below; when the basis plus the controls exceed the line, the controls wrap to their own
  row. Measured: one row (69–71px) at 900, 560 and 412; one row with a truncated title at 320; two
  rows at 260. No width removes a control, and no width has ever overflowed its strip.

Two defects the renders exposed, both older than this change and both invisible to the tests:

1. **A cover drawn larger than the box holding it.** `Artwork`'s image and fallback were grid items,
   so the fallback's words sized the box's row: a 44×44 bar artwork measured 44×62, painting the
   cover over the copy and past the bottom of the strip. Fixed by positioning the children
   absolutely and clipping the box, so nothing inside an artwork can size it.
2. **A 312px copy block inside a 288px row.** `min-inline-size: 0` had been dropped from
   `.px-bar-open`, so its own content set an automatic minimum; with the row aligned to its end,
   the excess was pushed out of the *left* edge and the cover was drawn outside the bar entirely.

Deferred, found here and not done here:

- **Nothing opens the full player.** `App.binding.tsx` passes no `onOpenPlayer`, so the bar body
  is a plain `div` and `PlayerSheet` — which already has a scrubber, elapsed and remaining — is
  unreachable from anywhere. The bar is the obvious way in.
- **The position rule does not seek.** It is a `<progress>`, read-through only. Seeking needs a
  range input, a thumb and a gesture mapped to the container's own width.
- **The compact room control is quiet enough to be missed.** Dot plus muted label, no plate: it
  reads as a readout that happens to be tappable. A cast-style mark would say so better, and the
  icon set has no such mark yet.
