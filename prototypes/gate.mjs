// Coverage gate for the reference set.
//
// This exists because reading does not scale. Two defects in this directory were found by
// eye, late, and only after one of them had already shipped to a designer: a shared module
// that depended on styling owned by a single page, and a chip that drifted into three
// copies. Both are mechanically detectable. Attention is not; a gate is.
//
// Run: node prototypes/gate.mjs

import { readFileSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"

const DIR = new URL(".", import.meta.url).pathname
const pages = readdirSync(DIR).filter((f) => f.endsWith(".html"))
const modules = readdirSync(DIR).filter((f) => f.endsWith(".js") && f !== "gate.mjs")

const read = (f) => readFileSync(join(DIR, f), "utf8")

// Comments are stripped before any selector parsing. Left in, they ride along into the
// reported selector and make a failure unreadable, which is the first step to it being
// ignored.
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "")
const localStyle = (html) =>
  stripComments((html.match(/<style>([\s\S]*?)<\/style>/) ?? ["", ""])[1])

// Class selectors a stylesheet defines, ignoring pseudo-elements and states.
function definedClasses(css) {
  const found = new Set()
  for (const match of css.matchAll(/(^|[\s,>])\.([a-z][a-z0-9-]*)/gm)) found.add(match[2])
  return found
}

// Classes a stylesheet *owns*, as opposed to ones it merely scopes.
//
// `.act { }` claims the action button. `.result .act { }` adjusts one in context, which is
// legitimate and must not read as a second owner — a gate that cries wolf gets muted, and
// then it protects nothing.
function ownedClasses(css) {
  const found = new Set()
  for (const match of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const selector = match[1].trim()
    if (selector.startsWith("@") || selector.includes(":root")) continue
    for (const part of selector.split(",")) {
      const compound = part.trim()
      if (!compound || /[\s>+~]/.test(compound)) continue
      for (const cls of compound.matchAll(/\.([a-z][a-z0-9-]*)/g)) found.add(cls[1])
    }
  }
  return found
}

// Class names a chunk of code or markup actually puts on an element.
function usedClasses(source) {
  const found = new Set()
  for (const match of source.matchAll(/class="([^"$]*)"/g)) {
    for (const name of match[1].split(/\s+/)) if (name) found.add(name)
  }
  for (const match of source.matchAll(/classList\.(?:add|toggle)\("([a-z0-9-]+)"/g)) {
    found.add(match[1])
  }
  return found
}

// A declaration block reduced to its property/value set, so two blocks that say the same
// thing in a different order collapse to the same signature.
function declarationSets(css, file) {
  const blocks = []
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim().replace(/\s+/g, " ")
    if (selector.startsWith("@") || selector.startsWith(":root")) continue
    const declarations = match[2]
      .split(";")
      .map((d) => d.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .sort()
    if (declarations.length >= 4) blocks.push({ file, selector, declarations })
  }
  return blocks
}

const system = stripComments(read("system.css")) + stripComments(read("reference.css"))
const systemClasses = definedClasses(system)
const failures = []

// ---------------------------------------------------------------------------
// 0. A comment welded to the text before it.
//
// Twice now, a scripted replacement has inserted a block in the middle of a selector,
// turning `nav.tabs.bare {` into `nav/* comment */ .avatar {`. The result is valid CSS with
// the wrong meaning: the rule silently becomes a descendant selector and applies nowhere.
// It cost a screenshot and a hunt to find. It costs one regex to catch.
// ---------------------------------------------------------------------------
for (const file of ["system.css", "reference.css", ...pages]) {
  const raw = read(file)
  const glued = raw.match(/\S\/\*/)
  if (glued) {
    const line = raw.slice(0, raw.indexOf(glued[0])).split("\n").length
    failures.push(
      `${file}:${line} has a comment glued to the text before it (${JSON.stringify(glued[0])}). ` +
        `A scripted edit almost certainly split a selector.`,
    )
  }
}

// ---------------------------------------------------------------------------
// 1. A shared module may not depend on styling that a page owns.
//
// rooms.js emitted class="sheet" while only b-shelves.html knew what a sheet looked like, so
// the rooms sheet was correct on one surface and broken on four. Nothing about either file,
// read alone, revealed it.
// ---------------------------------------------------------------------------
for (const file of modules) {
  for (const name of usedClasses(read(file))) {
    if (systemClasses.has(name)) continue
    const owners = pages.filter((p) => definedClasses(localStyle(read(p))).has(name))
    if (owners.length > 0) {
      failures.push(
        `${file} emits .${name}, but it is defined only in ${owners.join(", ")}. ` +
          `Shared behaviour cannot depend on one page's styling.`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 2. One class name, one owner.
// ---------------------------------------------------------------------------
const owners = new Map()
for (const file of ["system.css", "reference.css", ...pages]) {
  const css = file.endsWith(".css") ? stripComments(read(file)) : localStyle(read(file))
  for (const name of ownedClasses(css)) {
    owners.set(name, [...(owners.get(name) ?? []), file])
  }
}
for (const [name, where] of owners) {
  if (where.length > 1) {
    failures.push(`.${name} is defined in ${where.length} places: ${where.join(", ")}.`)
  }
}

// ---------------------------------------------------------------------------
// 3. No two rules may say substantially the same thing.
//
// The chip existed three times — .opts button, .chips button, .chips-row a — differing by a
// pixel of padding and a point of type. Different names, one decision.
// ---------------------------------------------------------------------------
const blocks = [
  ...declarationSets(stripComments(read("system.css")), "system.css"),
  ...declarationSets(stripComments(read("reference.css")), "reference.css"),
  ...pages.flatMap((p) => declarationSets(localStyle(read(p)), p)),
]
for (let i = 0; i < blocks.length; i++) {
  for (let j = i + 1; j < blocks.length; j++) {
    const a = blocks[i]
    const b = blocks[j]
    if (a.selector === b.selector) continue
    const shared = a.declarations.filter((d) => b.declarations.includes(d))
    const overlap = shared.length / Math.max(a.declarations.length, b.declarations.length)
    if (shared.length >= 4 && overlap >= 0.7) {
      failures.push(
        `${a.file} "${a.selector}" and ${b.file} "${b.selector}" share ` +
          `${shared.length} of their declarations. One decision, two copies.`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 4. A page may not hold a second, private component.
//
// A function that builds a reusable element is a component whether or not anyone named it.
// Listed rather than failed: some are genuinely one-surface shapes. The list is the argument.
// ---------------------------------------------------------------------------
// Compared by body, not by name. Every page legitimately has its own render(); what matters
// is whether two of them are the same code wearing different labels.
function pageFunctions(page) {
  const source = read(page)
  const found = []
  for (const match of source.matchAll(/\n\s*function\s+([A-Za-z][A-Za-z0-9]*)\s*\(/g)) {
    const start = source.indexOf("{", match.index + match[0].length - 1)
    if (start === -1) continue
    let depth = 0
    let end = start
    for (; end < source.length; end++) {
      if (source[end] === "{") depth++
      else if (source[end] === "}" && --depth === 0) break
    }
    const body = source.slice(start, end).replace(/\s+/g, " ").trim()
    if (body.length >= 160) found.push({ page, name: match[1], body })
  }
  return found
}

const functions = pages.flatMap(pageFunctions)
for (let i = 0; i < functions.length; i++) {
  for (let j = i + 1; j < functions.length; j++) {
    const a = functions[i]
    const b = functions[j]
    if (a.page === b.page) continue
    if (a.body !== b.body) continue
    failures.push(
      `${a.page} ${a.name}() and ${b.page} ${b.name}() have identical bodies. ` +
        `A unit written twice belongs in a shared module.`,
    )
  }
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n`)
  for (const line of failures) console.error(`  - ${line}`)
  console.error("")
  process.exit(1)
}
console.log(`gate: clean (${pages.length} pages, ${modules.length} shared modules)`)
