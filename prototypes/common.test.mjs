import { expect, test } from "bun:test"
import { escape as escapeHtml, sleeve } from "./common.js"

test.each([
  ["Artist & album", "Artist &amp; album"],
  ['<script>"album"</script>', "&lt;script&gt;&quot;album&quot;&lt;/script&gt;"],
  ["O'Brien", "O'Brien"],
  [42, "42"],
  [null, "null"],
  [undefined, "undefined"],
])("escapes prototype text without changing its string conversion: %s", (value, expected) => {
  expect(escapeHtml(value)).toBe(expected)
})

test("a missing cover escapes the artist and title in the blank sleeve", () => {
  const markup = sleeve({ artist: "A & B", title: '<"Album">' })

  expect(markup).toContain("<em>A &amp; B</em>")
  expect(markup).toContain("<b>&lt;&quot;Album&quot;&gt;</b>")
  expect(markup).toContain('class="sleeve blank ')
})
