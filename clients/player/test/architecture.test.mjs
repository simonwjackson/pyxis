import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { audit, inspectModule, inspectPart } from "./architecture.mjs"

test("new UI cannot import old components", () => {
  assert.ok(
    inspectModule(
      "/system-next/Action.tsx",
      'import { Old } from "../../../app/src/reference/Console"',
    ).errors.includes("old-ui-import"),
  )
})
test("state aliases cannot hide below the binding", () => {
  assert.ok(
    inspectModule(
      "/shapes/Album.tsx",
      'import { client as data } from "../../worker/client"',
    ).errors.includes("state-below-binding"),
  )
  // useContext itself is permitted below a binding: a compound widget reads its own context,
  // which is ephemeral and local. What stays forbidden is where a FOREIGN context comes from,
  // and that is caught at the import rather than at the hook.
  assert.deepEqual(
    inspectModule("/system-next/Row.tsx", "const open = React.useContext(RowContext)").errors,
    [],
  )
  assert.ok(
    inspectModule(
      "/system-next/Row.tsx",
      'import { LibraryContext } from "../bindings/Library.binding.tsx"\nconst d = React.useContext(LibraryContext)',
    ).errors.includes("state-below-binding"),
  )
  assert.deepEqual(
    inspectModule("/bindings/Stacks.binding.tsx", "const data = React.useContext(Context)").errors,
    [],
  )
})
test("only a named composition root may import a binding", () => {
  const source = 'import { Foundations } from "../bindings/Foundations.binding.tsx"'
  assert.ok(inspectModule("/preview/mount.tsx", source).errors.includes("state-below-binding"))
  assert.deepEqual(
    inspectModule("/preview/mount.tsx", source, { compositionRoot: true }).errors,
    [],
  )
})
test("shapes cannot add raw layout or styling", () => {
  assert.ok(
    inspectModule(
      "/shapes/Album.tsx",
      "export function Album() { return <div style={{gap: 7}}/> }",
    ).errors.includes("raw-shape-layout"),
  )
  assert.deepEqual(
    inspectModule("/shapes/Album.tsx", "export function Album() { return <Row/> }").errors,
    [],
  )
})
test("private, arrow and nested presentational functions count", () => {
  assert.ok(
    inspectModule(
      "/system-next/Row.tsx",
      "function Row() { const Hidden = () => <span/>; return <Hidden/> }",
    ).errors.includes("multiple-components"),
  )
  // Generics are not JSX and imported names need not resemble filenames.
  assert.equal(
    inspectModule(
      "/system-next/Row.tsx",
      "const rows: Array<string> = []; export function Row() { return <p/> }",
    ).components,
    1,
  )
})
test("parts need a default, static name and a sealed imported atom root", () => {
  assert.deepEqual(inspectPart("Action.atom.part.tsx", "export const Wrong = () => <div/>"), [
    "part-default",
    "part-name",
    "atom-unsealed",
  ])
  assert.ok(
    inspectPart(
      "Action.atom.part.tsx",
      'import {Action} from "./Action"; export const name="Action"; export default function Part(){return <Action><span/></Action>}',
    ).includes("atom-unsealed"),
  )
  assert.deepEqual(
    inspectPart(
      "Action.atom.part.tsx",
      'import {Action} from "./Action"; export const name="Action"; export default function Part(){return <Action label="Play"/>}',
    ),
    [],
  )
})
test("filesystem coverage catches added units and reports every missing product layer", () => {
  const root = mkdtempSync(join(tmpdir(), "pyxis-architecture-"))
  try {
    mkdirSync(join(root, "src/system-next"), { recursive: true })
    writeFileSync(
      join(root, "src/system-next/Missing.tsx"),
      "export function Missing(){return <button/>}",
    )
    const failures = audit({ root, partsRoot: root, product: true })
    assert.ok(failures.includes("part-coverage:src/system-next/Missing.tsx:0"))
    assert.deepEqual(
      failures.filter((f) => f.startsWith("missing-layer:")),
      ["atom", "molecule", "organism", "page", "template"].map((l) => `missing-layer:${l}`),
    )
    writeFileSync(join(root, "src/system-next/raw.css"), ".button { padding: 7px; color: #fff; }")
    assert.ok(audit({ root, partsRoot: root }).includes("raw-design-value:src/system-next/raw.css"))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
test("only the token source may hold raw design values", () => {
  const root = mkdtempSync(join(tmpdir(), "pyxis-architecture-"))
  try {
    mkdirSync(join(root, "src/system-next"), { recursive: true })
    const raw = ".x { padding: 7px; color: #fff; }"
    // Splitting one stylesheet into many must not become a way to opt out of the check. The
    // exemption names one path, so a lookalike suffix and a copy in another directory both fail.
    writeFileSync(join(root, "src/system-next/tokens.css"), raw)
    writeFileSync(join(root, "src/system-next/Action.tokens.css"), raw)
    mkdirSync(join(root, "src/shapes"), { recursive: true })
    writeFileSync(join(root, "src/shapes/tokens.css"), raw)
    const failures = audit({ root, partsRoot: root })
    assert.ok(!failures.includes("raw-design-value:src/system-next/tokens.css"))
    assert.ok(failures.includes("raw-design-value:src/system-next/Action.tokens.css"))
    assert.ok(failures.includes("raw-design-value:src/shapes/tokens.css"))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a render callback is allowed but a nested component is still caught", () => {
  // The ordinary list idiom. Rejecting this forced every list component into a manual loop,
  // which is worse code for no architectural gain.
  assert.deepEqual(
    inspectModule(
      "/system-next/Wall.tsx",
      "export function Wall({ items }) { return <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul> }",
    ).errors,
    [],
  )
  // The rule it exists to enforce must still bite: a second declared component in one file.
  assert.ok(
    inspectModule(
      "/system-next/Wall.tsx",
      "function Tile() { return <li /> }\nexport function Wall() { return <ul><Tile /></ul> }",
    ).errors.includes("multiple-components"),
  )
  // Including one hidden inside another component rather than at the top level.
  assert.ok(
    inspectModule(
      "/system-next/Wall.tsx",
      "export function Wall() { const Tile = () => <li />; return <ul><Tile /></ul> }",
    ).errors.includes("multiple-components"),
  )
})

test("a widget may own ephemeral state but may not reach outside the tree", () => {
  // Interaction state is born in the component and dies with it. A dialog's openness is not
  // shared truth, and forbidding it bought no safety while making modals unwritable.
  for (const local of [
    "useState",
    "useReducer",
    "useEffect",
    "useContext",
    "createContext",
    "useRef",
    "useId",
  ])
    assert.deepEqual(
      inspectModule("/system-next/Sheet.tsx", `const x = React.${local}(arg)`).errors,
      [],
      `${local} cannot reach outside the component tree and must be allowed`,
    )
  // Reaching outside it is the thing that creates a second reader of shared truth.
  for (const external of ["fetch", "createStore", "useSyncExternalStore"])
    assert.ok(
      inspectModule("/system-next/Sheet.tsx", `const x = ${external}(arg)`).errors.includes(
        "state-below-binding",
      ),
      `${external} reads outside the tree and must stay forbidden`,
    )
})

test("ephemeral state cannot be used to smuggle shared truth downward", () => {
  // The permission above is only safe because these remain closed. If any of them opens, a
  // widget can hold real application state in useState and the binding rule is dead.
  for (const source of [
    'import { client } from "../../worker/client"',
    'import { useLibrary } from "../bindings/useLibrary.binding.tsx"',
    'import { AlbumView } from "../model/album.ts"',
  ])
    assert.ok(
      inspectModule("/system-next/Sheet.tsx", source).errors.includes("state-below-binding"),
      `${source} must stay forbidden below a binding`,
    )
  for (const global of ["localStorage", "sessionStorage", "indexedDB", "location"])
    assert.ok(
      inspectModule(
        "/system-next/Sheet.tsx",
        `const [x] = React.useState(${global}.foo)`,
      ).errors.includes("state-below-binding"),
      `${global} must stay forbidden even inside an allowed hook`,
    )
})
