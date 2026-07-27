import { describe, expect, test } from "bun:test";
import {
  createVolumeCommandQueue,
  type VolumeCommandOutcome,
} from "./volumeCommandQueue";

type Deferred = {
  readonly volume: number;
  readonly resolve: (outcome: VolumeCommandOutcome<number>) => void;
};

describe("createVolumeCommandQueue", () => {
  test("serializes writes and coalesces queued changes to the latest volume", async () => {
    const started: number[] = [];
    const deferred: Deferred[] = [];
    const settled: Array<{
      readonly volume: number;
      readonly outcome: VolumeCommandOutcome<number>;
      readonly isLatest: boolean;
    }> = [];
    const queue = createVolumeCommandQueue<number>({
      send: (volume) => {
        started.push(volume);
        return new Promise((resolve) => deferred.push({ volume, resolve }));
      },
      onSettled: (result) => settled.push(result),
    });

    queue.enqueue(20);
    queue.enqueue(30);
    queue.enqueue(40);
    await Promise.resolve();

    expect(started).toEqual([20]);
    deferred[0]?.resolve({ _tag: "Success", value: 20 });
    await Promise.resolve();
    expect(started).toEqual([20, 40]);
    expect(settled[0]).toEqual({
      volume: 20,
      outcome: { _tag: "Success", value: 20 },
      isLatest: false,
    });

    deferred[1]?.resolve({ _tag: "Success", value: 40 });
    await Promise.resolve();
    expect(settled).toHaveLength(2);
    expect(settled[1]).toEqual({
      volume: 40,
      outcome: { _tag: "Success", value: 40 },
      isLatest: true,
    });
  });
});
