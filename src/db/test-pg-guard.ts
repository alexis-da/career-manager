import { appendFileSync } from "node:fs";
import pg from "pg";
import { expect } from "vitest";

/**
 * Setup of every Vitest run (vitest.config.mts, vitest.slow.config.mts): a query sent on a pg connection that is
 * still busy with another one fails at once, with the stack of its sender. pg 8 queues such a query, with a deprecation
 * warning shown once a process and only from the third at once; pg 9 will refuse it. It comes from several queries
 * started together (Promise.all) in an interactive transaction or on a test's own client, which hold one connection:
 * they must follow one another. With PG_PARALLEL_QUERY_TRACE=<file>, each case is written there instead, to find them
 * all in one run.
 */

type ClientQueue = { _activeQuery: unknown; _queryQueue: unknown[] };

const TRACE_FILE = process.env.PG_PARALLEL_QUERY_TRACE;

const query = pg.Client.prototype.query;

pg.Client.prototype.query = function guardedQuery(this: pg.Client, ...args: unknown[]): unknown {
  // pg's own fields: its public getters for them are deprecated too. No query running is null, or undefined before a
  // fresh connection's first one.
  const { _activeQuery, _queryQueue } = this as unknown as ClientQueue;
  if ((_activeQuery !== null && _activeQuery !== undefined) || _queryQueue.length > 0) {
    const error = new Error(
      "A query was sent on a pg connection still busy with another one: in a transaction or on one client, queries must follow one another.",
    );
    if (TRACE_FILE === undefined) {
      throw error;
    }
    // Prisma's engine breaks the async stack: the test and the two queries' SQL say where it comes from.
    const sql = (value: unknown): string => {
      const text = typeof value === "string" ? value : (value as { text?: unknown } | null)?.text;
      return typeof text === "string" ? text.replace(/\s+/g, " ").slice(0, 160) : "?";
    };
    const { testPath, currentTestName } = expect.getState();
    appendFileSync(
      TRACE_FILE,
      `test: ${testPath ?? "?"} > ${currentTestName ?? "?"}\nbusy with: ${sql(_activeQuery ?? _queryQueue[0])}\nsent: ${sql(args[0])}\n${error.stack ?? error.message}\n----\n`,
    );
  }
  return Reflect.apply(query, this, args);
} as typeof query;
