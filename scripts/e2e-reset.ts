/**
 * Runs before each end-to-end series (npm run test:e2e): stops any server listening on the tests' port and empties
 * their build directory, so that Playwright never reuses a stale test server (reuseExistingServer), which has been seen
 * to answer 404 on every page of a save. The next run starts its own server, on a fresh build. On Windows through
 * netstat and taskkill (the whole process tree: npm, next, its workers), elsewhere through lsof and kill.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

/** The port and build directory of the test server: playwright.config.ts. */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const DIST_DIR = ".next-e2e";

/** The processes listening on a TCP port. */
function listeningProcesses(port: number): number[] {
  if (process.platform === "win32") {
    // « TCP    0.0.0.0:3100    0.0.0.0:0    LISTENING    23896 », IPv4 and IPv6 alike.
    const lines = execFileSync("netstat", ["-ano"], { encoding: "utf8" }).split(/\r?\n/);
    const pids = lines
      .map((line) => line.trim().split(/\s+/))
      .filter((columns) => columns[0] === "TCP" && columns[1]?.endsWith(`:${port}`) && columns[3] === "LISTENING")
      .map((columns) => Number(columns[4]));
    return [...new Set(pids)].filter((pid) => pid > 0);
  }
  try {
    return execFileSync("lsof", ["-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" })
      .split(/\s+/)
      .filter((pid) => pid !== "")
      .map(Number);
  } catch {
    // lsof exits with 1 when nothing listens.
    return [];
  }
}

function stop(pid: number): void {
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(pid, "SIGTERM");
  }
}

const pids = listeningProcesses(PORT);
for (const pid of pids) {
  stop(pid);
}
// The stopped server may hold its files a moment longer: a few retries.
rmSync(DIST_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log(
  `E2E: ${pids.length === 0 ? `nothing listened on ${PORT}` : `stopped ${pids.join(", ")} on ${PORT}`}, ${DIST_DIR} emptied.`,
);
