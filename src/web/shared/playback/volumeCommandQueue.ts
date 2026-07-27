export type VolumeCommandOutcome<Value> =
  | { readonly _tag: "Success"; readonly value: Value }
  | { readonly _tag: "Failure"; readonly cause: unknown };

type VolumeCommandSettlement<Value> = {
  readonly volume: number;
  readonly outcome: VolumeCommandOutcome<Value>;
  readonly isLatest: boolean;
};

type VolumeCommandQueueOptions<Value> = {
  readonly send: (volume: number) => Promise<VolumeCommandOutcome<Value>>;
  readonly onSettled: (settlement: VolumeCommandSettlement<Value>) => void;
};

type VolumeCommand = {
  readonly id: number;
  readonly volume: number;
};

export type VolumeCommandQueue = {
  readonly enqueue: (volume: number) => void;
};

export function createVolumeCommandQueue<Value>({
  send,
  onSettled,
}: VolumeCommandQueueOptions<Value>): VolumeCommandQueue {
  let latestId = 0;
  let active = false;
  let queued: VolumeCommand | null = null;

  const run = async (command: VolumeCommand): Promise<void> => {
    let outcome: VolumeCommandOutcome<Value>;
    try {
      outcome = await send(command.volume);
    } catch (cause) {
      outcome = { _tag: "Failure", cause };
    }

    onSettled({
      volume: command.volume,
      outcome,
      isLatest: command.id === latestId,
    });

    const next = queued;
    queued = null;
    if (next) await run(next);
    else active = false;
  };

  return {
    enqueue: (volume) => {
      const command = { id: ++latestId, volume };
      if (active) {
        queued = command;
        return;
      }

      active = true;
      void run(command);
    },
  };
}
