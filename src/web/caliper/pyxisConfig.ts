export interface PyxisCaliperScreenConfig {
  readonly id: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly bezel?: boolean;
  readonly label?: string;
  readonly role?: "primary" | "secondary";
}

export interface PyxisCaliperDeviceConfig {
  readonly id: string;
  readonly name: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly bezel?: boolean;
  readonly screens?: readonly PyxisCaliperScreenConfig[];
}

export interface PyxisCaliperKnob {
  readonly id: string;
  readonly label: string;
  readonly cssVar: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
  readonly unit?: string;
}

export const PYXIS_HERO_DEVICE_ID = "sony-nw-a306";

export const PYXIS_DEFAULT_PX_PER_MM = 4;

/**
 * Sony Walkman NW-A306 target screen.
 *
 * The product target is the player's 3.6in 16:9 display in portrait. Caliper
 * owns the physical frame; Pyxis owns the CSS knobs that make the app's real
 * responsive recipes tolerable at that true size.
 */
export const PYXIS_CALIPER_DEVICES = [
  {
    id: PYXIS_HERO_DEVICE_ID,
    name: "Sony Walkman NW-A306",
    widthMm: 44.8,
    heightMm: 79.7,
    bezel: true,
  },
  {
    id: "compact-phone",
    name: "Compact phone",
    widthMm: 62,
    heightMm: 134,
    bezel: true,
  },
  {
    id: "desktop-browser",
    name: "Desktop browser",
    widthMm: 270,
    heightMm: 152,
    bezel: false,
  },
] as const satisfies readonly PyxisCaliperDeviceConfig[];

export const PYXIS_CALIPER_KNOBS = [
  {
    id: "font-size",
    label: "Font size",
    cssVar: "--pyxis-font-size",
    min: 12,
    max: 18,
    step: 0.25,
    default: 16,
    unit: "px",
  },
  {
    id: "page-padding-block",
    label: "Page padding y",
    cssVar: "--pyxis-page-padding-block",
    min: 0.75,
    max: 3,
    step: 0.125,
    default: 2.5,
    unit: "rem",
  },
  {
    id: "page-padding-inline",
    label: "Page padding x",
    cssVar: "--pyxis-page-padding-inline",
    min: 0.5,
    max: 2,
    step: 0.125,
    default: 1,
    unit: "rem",
  },
  {
    id: "page-padding-inline-wide",
    label: "Wide padding x",
    cssVar: "--pyxis-page-padding-inline-wide",
    min: 1,
    max: 4,
    step: 0.125,
    default: 2,
    unit: "rem",
  },
  {
    id: "title-scale",
    label: "Title scale",
    cssVar: "--pyxis-title-scale",
    min: 0.6,
    max: 1.3,
    step: 0.025,
    default: 1,
  },
] as const satisfies readonly PyxisCaliperKnob[];
