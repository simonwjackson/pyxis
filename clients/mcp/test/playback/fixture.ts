import { mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../../../", import.meta.url))
export function buildLab() {
  const build = Bun.spawnSync(["cargo", "build", "--locked", "--bin", "pyxis-plugin-laboratory"], {
    cwd: root,
  })
  if (!build.success) throw Error(build.stderr.toString())
}
const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`
export function topology(grouped: boolean) {
  const group = (ids: string[]) => ({
    id: ids.join("/"),
    coordinatorName: ids[0],
    coordinatorId: ids[0],
    rooms: ids.map((id, i) => ({
      id,
      name: `Room ${id}`,
      address: "127.0.0.1",
      locationUrl: "http://127.0.0.1:1",
      coordinator: i === 0,
    })),
  })
  return {
    groups: grouped ? [group(["A", "B"])] : [group(["A"]), group(["B"])],
    authoritative: true,
    refreshedAt: 1,
  }
}
export async function installLab(dir: string) {
  const plugins = join(dir, "plugins")
  await mkdir(plugins)
  const lab = resolve(
    root,
    process.env.CARGO_TARGET_DIR ?? "target",
    "debug/pyxis-plugin-laboratory",
  )
  await writeFile(join(dir, "topology"), JSON.stringify(topology(false)))
  const script = (id: string, body: string) =>
    writeFile(join(plugins, `pyxis-plugin-${id}`), `#!/bin/sh\n${body}\n`, { mode: 0o700 })
  await script(
    "sonos",
    `export PYXIS_LAB_ID=sonos PYXIS_LAB_CAPABILITY=output\nexport PYXIS_LAB_OUTPUT_TOPOLOGY_FILE=${quote(join(dir, "topology"))} PYXIS_LAB_GROUP_RESULT_FILE=${quote(join(dir, "group"))} PYXIS_LAB_OUTPUT_STATE_FILE=${quote(join(dir, "state"))}\nexec ${quote(lab)}`,
  )
  await script(
    "catalog",
    `exec ${quote(process.execPath)} ${quote(join(import.meta.dir, "source.ts"))}`,
  )
}
