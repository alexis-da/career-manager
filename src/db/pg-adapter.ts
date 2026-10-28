import { PrismaPg } from "@prisma/adapter-pg";

type PgDriverAdapter = Awaited<ReturnType<PrismaPg["connect"]>>;
type PgTransaction = Awaited<ReturnType<PgDriverAdapter["startTransaction"]>>;

/**
 * PrismaPg whose interactive transactions send one query at a time on their connection. Within a transaction, Prisma's
 * engine loads the relations of a select with queries of their own, started together, and code may start several
 * queries at once: all go to the transaction's one pg connection, where pg 8 queues them with a deprecation warning and
 * pg 9 will refuse them. They are chained here instead, in the order they were sent, which is the order pg's queue ran
 * them in: the same queries, in the same order, with the same results. Outside a transaction, each query takes a
 * connection of the pool of its own, and nothing waits.
 */
export class SequentialPrismaPg extends PrismaPg {
  override async connect(): Promise<PgDriverAdapter> {
    return withSequentialTransactions(await super.connect());
  }

  override async connectToShadowDb(): Promise<PgDriverAdapter> {
    return withSequentialTransactions(await super.connectToShadowDb());
  }
}

function withSequentialTransactions(adapter: PgDriverAdapter): PgDriverAdapter {
  const startTransaction = adapter.startTransaction.bind(adapter);
  adapter.startTransaction = async (isolationLevel) => oneQueryAtATime(await startTransaction(isolationLevel));
  return adapter;
}

/**
 * A transaction whose queries each wait for the one sent before to settle, failed or not, as in pg's queue. Its
 * savepoints go through executeRaw, so through the queue too.
 */
function oneQueryAtATime(transaction: PgTransaction): PgTransaction {
  let previous: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(send: () => Promise<T>): Promise<T> => {
    const sent = previous.then(send, send);
    previous = sent.catch(() => undefined);
    return sent;
  };
  const queryRaw = transaction.queryRaw.bind(transaction);
  const executeRaw = transaction.executeRaw.bind(transaction);
  transaction.queryRaw = (query) => inTurn(() => queryRaw(query));
  transaction.executeRaw = (query) => inTurn(() => executeRaw(query));
  return transaction;
}
