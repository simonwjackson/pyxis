import { expect, it } from "vitest"
import { readNotices } from "./library"

it("reads a dropped write with its reason", () => {
  expect(readNotices([{ id: "n3", kind: "dropped", writeId: "w1", reason: "rejected" }])).toEqual([
    { kind: "dropped", id: "n3", reason: "rejected" },
  ])
})
