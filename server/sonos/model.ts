export type SonosDevice = {
  readonly uuid: string;
  readonly name: string;
  readonly model: string | null;
  readonly address: string;
  readonly locationUrl: string;
};

export type SonosRoom = SonosDevice & {
  readonly isCoordinator: boolean;
};

export type SonosGroup = {
  readonly id: string;
  readonly coordinatorUuid: string;
  readonly coordinatorName: string;
  readonly rooms: readonly SonosRoom[];
};

export type SonosTopology = {
  readonly enabled: boolean;
  readonly available: boolean;
  readonly groups: readonly SonosGroup[];
  readonly refreshedAt: number | null;
};

export function normalizeSonosUuid(value: string): string {
  return value.replace(/^uuid:/i, "").replace(/_MR$/i, "");
}
