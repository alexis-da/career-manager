// Logs of long server operations (save creation): real elapsed time, never game time, and errors in one readable line.

export type PhaseTimer = {
  mark: (phase: string) => void; // closes the phase running since the last mark
  elapsed: () => number; // milliseconds since the start
  summary: () => string; // « read 230 ms, players 1 200 ms »
};

export function phaseTimer(): PhaseTimer {
  const start = performance.now();
  let last = start;
  const phases: string[] = [];
  return {
    mark: (phase) => {
      const now = performance.now();
      phases.push(`${phase} ${Math.round(now - last)} ms`);
      last = now;
    },
    elapsed: () => Math.round(performance.now() - start),
    summary: () => phases.join(", "),
  };
}

/** An error in one line: its name, its code when it has one (a Prisma error's P2028), its message's first line. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const code = "code" in error && typeof error.code === "string" ? ` [${error.code}]` : "";
  const message = error.message.trim().split("\n").filter((line) => line.trim() !== "").at(-1) ?? "";
  return `${error.name}${code}: ${message}`;
}
