import { describe, expect, it } from "vitest";
import {
  answered,
  blocked,
  busyOf,
  emptyQueue,
  enqueue,
  lost,
  nextToSend,
  retried,
  retryDue,
  RETRY_DELAYS_MS,
  unblocked,
  type SaveJob,
  type SaveQueue,
} from "./save-queue";

const lineup = (state: string): SaveJob<string> => ({ kind: "lineup", state });
const plan = (state: string): SaveJob<string> => ({ kind: "plan", state });

/** Sends what waits, as the editor does: the job on its way, and the queue after it. */
const send = (queue: SaveQueue<string>): [SaveQueue<string>, SaveJob<string> | null] => {
  const next = nextToSend(queue);
  return [next.queue, next.job];
};

describe("the line-up editor's saves", () => {
  it("sends each gesture at once, one at a time: three quick gestures make two requests, the latest state second", () => {
    let queue = enqueue(emptyQueue<string>(), lineup("A"), true);
    let job: SaveJob<string> | null;
    [queue, job] = send(queue);
    expect(job).toEqual(lineup("A"));
    expect(busyOf(queue)).toBe(true);

    // Two more gestures while A is on its way: B is replaced by C, nothing sent before A answers.
    queue = enqueue(queue, lineup("B"), true);
    [queue, job] = send(queue);
    expect(job).toBeNull();
    queue = enqueue(queue, lineup("C"), true);

    queue = answered(queue);
    [queue, job] = send(queue);
    expect(job).toEqual(lineup("C"));
    queue = answered(queue);
    [queue, job] = send(queue);
    expect(job).toBeNull();
    expect(busyOf(queue)).toBe(false);
  });

  it("never sends an eleven with an empty slot, but sends the assistant's formation and instruction whatever it shows", () => {
    expect(enqueue(emptyQueue<string>(), lineup("ten men"), false)).toEqual(emptyQueue());
    // The one waiting stays: the last complete eleven, the next match's.
    const waiting = enqueue(emptyQueue<string>(), lineup("eleven"), true);
    expect(enqueue(waiting, lineup("ten men"), false).pending).toEqual(lineup("eleven"));
    expect(enqueue(emptyQueue<string>(), plan("3-5-2"), false).pending).toEqual(plan("3-5-2"));
  });

  it("tries a lost save again after 2, 5 then 15 s, then leaves it to « Réessayer », still busy", () => {
    let queue: SaveQueue<string>;
    let job: SaveJob<string> | null;
    [queue, job] = send(enqueue(emptyQueue<string>(), lineup("A"), true));
    const delays: (number | null)[] = [];
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      if (job === null) {
        throw new Error("A save is on its way");
      }
      const step = lost(queue, job, false);
      delays.push(step.retryIn);
      queue = step.queue;
      if (step.retryIn !== null) {
        [queue, job] = send(retryDue(queue));
        expect(job).toEqual(lineup("A"));
      }
    }
    expect(delays).toEqual([2_000, 5_000, 15_000, null]);
    // Lost for good: nothing on its way, the page's leave guard still up.
    expect(queue).toMatchObject({ sending: false, failed: lineup("A"), tries: 0 });
    expect(busyOf(queue)).toBe(true);

    // « Réessayer » sends the editor's latest state, the one lost forgotten; its answer ends the lot.
    [queue, job] = send(retried(queue, lineup("B"), true));
    expect(job).toEqual(lineup("B"));
    expect(queue.failed).toBeNull();
    queue = answered(queue);
    expect(busyOf(queue)).toBe(false);
  });

  it("sends a newer gesture in place of the one lost, and a retry still due then sends nothing more", () => {
    let queue: SaveQueue<string>;
    let job: SaveJob<string> | null;
    [queue, job] = send(enqueue(emptyQueue<string>(), lineup("A"), true));
    queue = lost(queue, lineup("A"), false).queue;
    // A gesture meanwhile goes at once, its tries afresh.
    queue = enqueue(queue, lineup("B"), true);
    expect(queue.tries).toBe(0);
    [queue, job] = send(queue);
    expect(job).toEqual(lineup("B"));
    // A's retry, due while B is on its way: nothing to send again.
    [queue, job] = send(retryDue(queue));
    expect(job).toBeNull();
    queue = answered(queue);
    [queue, job] = send(retryDue(queue));
    expect(job).toBeNull();
    expect(busyOf(queue)).toBe(false);
  });

  it("never tries a new version of the game again: its page has to be loaded anew", () => {
    const [queue] = send(enqueue(emptyQueue<string>(), lineup("A"), true));
    const step = lost(queue, lineup("A"), true);
    expect(step.retryIn).toBeNull();
    expect(step.queue.failed).toEqual(lineup("A"));
  });

  it("sends nothing more once blocked, the save on its way still answering; free again, it goes on", () => {
    let queue: SaveQueue<string>;
    let job: SaveJob<string> | null;
    [queue, job] = send(enqueue(emptyQueue<string>(), lineup("A"), true));
    queue = enqueue(queue, lineup("B"), true);
    // Another tab, a match live, or the line-up given back: B is dropped, A still on its way.
    queue = blocked(queue);
    expect(queue).toMatchObject({ pending: null, sending: true, blocked: true });
    expect(enqueue(queue, lineup("C"), true)).toBe(queue);
    queue = answered(queue);
    [queue, job] = send(retryDue(queue));
    expect(job).toBeNull();
    expect(busyOf(queue)).toBe(false);

    // « Rendre la main » refused: the editor's latest state goes again.
    [queue, job] = send(enqueue(unblocked(queue), lineup("C"), true));
    expect(job).toEqual(lineup("C"));
  });
});
