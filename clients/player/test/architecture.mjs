import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const player = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repository = resolve(player, "../..")
const partPattern = /\.(atom|molecule|organism|template|page)\.part\.tsx$/
const TOKEN_SOURCE = "src/system-next/tokens.css"
export function walk(root) {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    // Generated outputs and dependencies have no authored visual surface.
    if (["node_modules", ".git", "dist", "coverage", ".worktree"].includes(entry.name)) return []
    const path = join(root, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}
const parse = (file, text) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const visit = (node, fn) => {
  fn(node)
  ts.forEachChild(node, (child) => visit(child, fn))
}
const isJsx = (node) =>
  ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)
const isFunction = (node) =>
  ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
function returnsJsx(node) {
  if (!node.body) return false
  if (isJsx(node.body)) return true
  let found = false
  const scan = (child) => {
    if (isFunction(child)) return // A nested component is counted on its own, not on the parent.
    if (isJsx(child)) found = true
    ts.forEachChild(child, scan)
  }
  scan(node.body)
  return found
}
function importedNames(ast) {
  const names = new Set()
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node)) continue
    if (node.importClause?.name) names.add(node.importClause.name.text)
    const bindings = node.importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings))
      for (const item of bindings.elements) names.add(item.name.text)
  }
  return names
}
export function inspectPart(file, text) {
  const ast = parse(file, text)
  const errors = []
  const exported = ast.statements.filter((node) =>
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
  )
  const defaultNode =
    exported.find((node) => node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) ??
    ast.statements.find(ts.isExportAssignment)
  if (!defaultNode) errors.push("part-default")
  if (
    !exported.some(
      (node) =>
        ts.isVariableStatement(node) &&
        node.declarationList.declarations.some(
          (d) =>
            d.name.getText(ast) === "name" &&
            d.initializer &&
            ts.isStringLiteral(d.initializer) &&
            d.initializer.text.trim(),
        ),
    )
  )
    errors.push("part-name")
  if (file.endsWith(".atom.part.tsx")) {
    const roots = []
    if (defaultNode)
      visit(defaultNode, (node) => {
        if (ts.isReturnStatement(node) && node.expression)
          roots.push(
            ts.isParenthesizedExpression(node.expression)
              ? node.expression.expression
              : node.expression,
          )
        if (ts.isArrowFunction(node) && isJsx(node.body)) roots.push(node.body)
      })
    const names = importedNames(ast)
    if (
      roots.length !== 1 ||
      !ts.isJsxSelfClosingElement(roots[0]) ||
      !ts.isIdentifier(roots[0].tagName) ||
      !names.has(roots[0].tagName.text)
    )
      errors.push("atom-unsealed")
  }
  return errors
}
// A composition root mounts the tree and is allowed to import a binding. Nothing else below a
// binding may reach for state. Listed explicitly so the allowance is a decision, not a gap.
export const COMPOSITION_ROOTS = new Set(["src/main.tsx", "src/preview/mount.tsx"])
// THE STATE RULE, and the conflict it settles.
//
// atomic-decomp says the binding is the sole state reader. The react skill says a compound
// widget's Root owns all state and its parts read that widget's context. Read as "no hook below
// a binding" the two are irreconcilable, and the cost is real: no modal dialog, because
// showModal() needs an effect and a ref; no aria-describedby, because that needs a generated id;
// no compound widget at all.
//
// They reconcile once you notice both rules are about the SOURCE of state, not the name of the
// hook. What must never happen below a binding is reaching OUTSIDE the component tree -- to the
// server, the worker, the URL, storage, or a global store -- because that creates a second
// reader of shared truth, and two readers disagree. Ephemeral interaction state that is born
// in the component and dies with it is not shared truth: a dialog's openness, a hover, which
// tab of a widget is showing.
//
// So the ban is placed on external sources rather than on hooks. These three calls each reach
// outside the tree and stay forbidden below a binding. Everything else React offers --
// useState, useReducer, useEffect, useContext, createContext, refs, ids, memo -- is allowed,
// because the import ban and the global ban below already make it impossible for them to read
// anything but local, ephemeral state. A widget cannot smuggle the library in through useState
// when it cannot import the worker, touch localStorage, or call fetch.
export const EXTERNAL_STATE = new Set(["fetch", "createStore", "useSyncExternalStore"])
export function inspectModule(file, text, { compositionRoot = false } = {}) {
  const ast = parse(file, text)
  const errors = []
  const functions = []
  const binding = file.endsWith(".binding.tsx") || compositionRoot
  const system = file.replaceAll("\\", "/").includes("/system-next/")
  const shape = file.replaceAll("\\", "/").includes("/shapes/")
  visit(ast, (node) => {
    // A render callback is not a component: it has no name, no props contract and no part.
    // Only declared functions count, so the ordinary items.map(item => <Row/>) idiom is allowed
    // while a private or nested component declaration is still caught.
    const renderCallback =
      node.parent && ts.isCallExpression(node.parent) && node.parent.arguments.includes(node)
    if (isFunction(node) && returnsJsx(node) && !renderCallback) functions.push(node)
    if (
      ts.isStringLiteral(node) &&
      (ts.isImportDeclaration(node.parent) ||
        ts.isExportDeclaration(node.parent) ||
        (ts.isCallExpression(node.parent) &&
          node.parent.expression.kind === ts.SyntaxKind.ImportKeyword))
    ) {
      if (/(?:reference|prototypes|system-current)(?:\/|$)/.test(node.text))
        errors.push("old-ui-import")
      // Below bindings, all edge imports (including aliases and pure helper wrappers) are forbidden.
      if (!binding && /(?:worker|rpc|pwa|\/model|\/bindings)(?:\/|$)/.test(node.text))
        errors.push("state-below-binding")
    }
    if (!binding && ts.isCallExpression(node)) {
      const name = node.expression.getText(ast).split(".").at(-1)
      if (EXTERNAL_STATE.has(name ?? "")) errors.push("state-below-binding")
    }
    if (
      !binding &&
      ts.isIdentifier(node) &&
      ["localStorage", "sessionStorage", "indexedDB", "location", "navigator"].includes(node.text)
    )
      errors.push("state-below-binding")
    if (shape && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
      if (/^[a-z]/.test(node.tagName.getText(ast))) errors.push("raw-shape-layout")
      if (
        node.attributes.properties.some(
          (p) => ts.isJsxAttribute(p) && ["style", "className"].includes(p.name.getText(ast)),
        )
      )
        errors.push("raw-shape-layout")
    }
  })
  if (functions.length > 1) errors.push("multiple-components")
  if (functions.length && !system && !shape && !binding) errors.push("unclassified-component")
  return { errors: [...new Set(errors)], components: functions.length }
}
export function audit({ root = player, partsRoot = repository, product = false } = {}) {
  const failures = []
  const files = walk(join(root, "src"))
  const layers = new Set(files.flatMap((file) => file.match(partPattern)?.[1] ?? []))
  // Foundations are an explicit milestone, not a full-screen coverage waiver. --product
  // requires all layers even before screens exist. Every page triggers that requirement too.
  const required =
    product || layers.has("page")
      ? ["atom", "molecule", "organism", "template", "page"]
      : ["atom", "molecule"]
  for (const layer of required) if (!layers.has(layer)) failures.push(`missing-layer:${layer}`)
  for (const file of files.filter(
    (f) => /\.tsx?$/.test(f) && !/\.(test|part)\.tsx?$/.test(f) && !partPattern.test(f),
  )) {
    const relative_ = relative(root, file).replaceAll("\\", "/")
    const result = inspectModule(file, readFileSync(file, "utf8"), {
      compositionRoot: COMPOSITION_ROOTS.has(relative_),
    })
    for (const error of result.errors) failures.push(`${error}:${relative(root, file)}`)
    // Binding and mount are composition/lifecycle edges, not separate visual units. Their
    // rendered shapes must have parts; no other file/directory is excused from coverage.
    if (result.components && !file.endsWith(".binding.tsx") && !COMPOSITION_ROOTS.has(relative_)) {
      const siblings = files.filter(
        (p) => partPattern.test(p) && p.replace(partPattern, ".tsx") === file,
      )
      if (siblings.length !== 1)
        failures.push(`part-coverage:${relative(root, file)}:${siblings.length}`)
    }
  }
  for (const file of walk(partsRoot).filter((f) => partPattern.test(f))) {
    for (const error of inspectPart(file, readFileSync(file, "utf8")))
      failures.push(`${error}:${relative(partsRoot, file)}`)
    if (!existsSync(file.replace(partPattern, ".tsx")))
      failures.push(`orphan-part:${relative(partsRoot, file)}`)
  }
  // One file may hold raw design values, because defining them is its job. The exemption is an
  // exact path, not a suffix: a component cannot opt out by naming its stylesheet *tokens.css.
  for (const file of files.filter(
    (f) => f.endsWith(".css") && relative(root, f).replaceAll("\\", "/") !== TOKEN_SOURCE,
  )) {
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    if (/(?:#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch)a?\(|\b\d+(?:\.\d+)?(?:px|rem)\b)/i.test(text))
      failures.push(`raw-design-value:${relative(root, file)}`)
    if (/scale\(|100cqw\s*\//.test(text)) failures.push(`reference-zoom:${relative(root, file)}`)
  }
  return failures.sort()
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = audit({ product: process.argv.includes("--product") })
  console.log(failures.length ? failures.join("\n") : "Player architecture: clean")
  process.exitCode = failures.length ? 1 : 0
}
