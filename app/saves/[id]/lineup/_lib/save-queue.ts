/**
 * The line-up editor's saves (docs/design/effectif-adjoint.md § 1.3 to 1.6), pure: one on its way at a time, the latest
 * gesture's state waiting its turn in place of any older one, a save the network lost tried again after 2, 5 then 15 s
 * before « Réessayer » is offered, and nothing more sent once a refusal blocks the editor (a conflict with another tab, a
 * match waiting live, the line-up given back to the assistant). The editor keeps one in a ref and runs what it says.
 */

/** The tries again of a save the network lost, before « Réessayer » is offered (§ 1.4). */
export const RETRY_DELAYS_MS: readonly number[] = [2_000, 5_000, 15_000];

/** A save the editor has to send: the line-up after a gesture, or the assistant's formation and instruction. */
export type SaveJob<S> = { kind: "lineup" | "plan"; state: S };

export type SaveQueue<S> = {
  pending: SaveJob<S> | null; // the latest save waiting its turn
  sending: boolean; // one on its way
  failed: SaveJob<S> | null; // the last one lost, sent again at its retry or by « Réessayer »
  tries: number; // the tries again of the one lost so far
  blocked: boolean; // nothing more is sent until the line-up is read again
};

export function emptyQueue<S>(): SaveQueue<S> {
  return { pending: null, sending: false, failed: null, tries: 0, blocked: false };
}

/**
 * A save to send: the latest replaces any waiting, and starts its tries afresh. A line-up with an empty slot is never
 * sent (`complete` false, § 1.2): the last complete eleven stays the next match's. Nothing waits once blocked.
 */
export function enqueue<S>(queue: SaveQueue<S>, job: SaveJob<S>, complete: boolean): SaveQueue<S> {
  if ((job.kind === "lineup" && !complete) || queue.blocked) {
    return queue;
  }
  return { ...queue, pending: job, tries: 0 };
}

/**
 * The save to send now, if any: one at a time, none while blocked. Taken from the queue, then on its way, in place of
 * the one lost if any: the latest state, which a retry still due would only send again.
 */
export function nextToSend<S>(queue: SaveQueue<S>): { queue: SaveQueue<S>; job: SaveJob<S> | null } {
  if (queue.sending || queue.blocked || queue.pending === null) {
    return { queue, job: null };
  }
  return { queue: { ...queue, pending: null, sending: true, failed: null }, job: queue.pending };
}

/** The save on its way answered, whatever the answer: saved, unchanged, or refused. */
export function answered<S>(queue: SaveQueue<S>): SaveQueue<S> {
  return { ...queue, sending: false, failed: null, tries: 0 };
}

/**
 * Nothing more is sent, until the editor starts again from the line-up read anew: a refusal that says so (another tab, a
 * match live, § 1.5 and 1.7), or the line-up given back to the assistant. A save already on its way still answers.
 */
export function blocked<S>(queue: SaveQueue<S>): SaveQueue<S> {
  return { ...queue, pending: null, failed: null, tries: 0, blocked: true };
}

/** Whatever was blocked is free again: « Rendre la main » refused, the editor goes on as it was. */
export function unblocked<S>(queue: SaveQueue<S>): SaveQueue<S> {
  return { ...queue, blocked: false };
}

/**
 * The save on its way lost (the network, the lock's wait, the server): tried again after 2, 5 then 15 s, then left to
 * « Réessayer » (`retryIn` null). A new version of the game is never tried again: its page has to be loaded anew.
 */
export function lost<S>(queue: SaveQueue<S>, job: SaveJob<S>, newVersion: boolean): { queue: SaveQueue<S>; retryIn: number | null } {
  const retryIn = newVersion ? null : (RETRY_DELAYS_MS.at(queue.tries) ?? null);
  return {
    queue: { ...queue, sending: false, failed: job, tries: retryIn === null ? 0 : queue.tries + 1 },
    retryIn,
  };
}

/** A retry due: a newer gesture's state waiting goes in place of the one lost, else the one lost again. */
export function retryDue<S>(queue: SaveQueue<S>): SaveQueue<S> {
  if (queue.blocked) {
    return queue;
  }
  return { ...queue, pending: queue.pending ?? queue.failed };
}

/** « Réessayer »: the editor's latest state, sent afresh, the one lost forgotten. */
export function retried<S>(queue: SaveQueue<S>, job: SaveJob<S>, complete: boolean): SaveQueue<S> {
  return enqueue({ ...queue, failed: null }, job, complete);
}

/** A save on its way, waiting its turn or lost: the status line's `data-busy`, and what makes leaving the page ask first. */
export function busyOf<S>(queue: SaveQueue<S>): boolean {
  return queue.sending || queue.pending !== null || queue.failed !== null;
}
