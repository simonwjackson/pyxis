import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { DB_DIR } from "@shared/db/config.js";
import { Schema } from "effect";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type PlaybackOutputSelection =
  | { readonly type: "none"; readonly updatedAt: number }
  | {
      readonly type: "browser";
      readonly clientId: string;
      readonly updatedAt: number;
    }
  | {
      readonly type: "sonos";
      readonly roomUuid: string;
      readonly updatedAt: number;
    };

const PersistedSelectionSchema = Schema.Union([
  Schema.Struct({ type: Schema.Literal("none"), updatedAt: Schema.Number }),
  Schema.Struct({
    type: Schema.Literal("browser"),
    clientId: Schema.String.check(Schema.isMinLength(1)),
    updatedAt: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal("sonos"),
    roomUuid: Schema.String.check(Schema.isMinLength(1)),
    updatedAt: Schema.Number,
  }),
]);

export const PLAYBACK_OUTPUT_PATH = join(DB_DIR, "playback-output.yaml");

export function loadPlaybackOutputSelection(
  filePath = PLAYBACK_OUTPUT_PATH,
): PlaybackOutputSelection {
  if (!existsSync(filePath)) return { type: "none", updatedAt: 0 };
  try {
    return Schema.decodeUnknownSync(PersistedSelectionSchema)(
      parseYaml(readFileSync(filePath, "utf8")),
    );
  } catch {
    return { type: "none", updatedAt: 0 };
  }
}

export function savePlaybackOutputSelection(
  selection: PlaybackOutputSelection,
  filePath = PLAYBACK_OUTPUT_PATH,
): void {
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, stringifyYaml(selection, { lineWidth: 0 }), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      // Preserve the original persistence error.
    }
    throw error;
  }
}
