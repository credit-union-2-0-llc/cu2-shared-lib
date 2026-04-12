/**
 * PostgreSQL connection pool with slow query logging and transaction support.
 *
 * Factory-based pool management with configurable timeouts, automatic slow
 * query detection, and a higher-order transaction wrapper that handles
 * BEGIN/COMMIT/ROLLBACK automatically.
 *
 * Extracted from: trendforge-execution/src/db/client.ts
 *
 * Usage:
 *   import { createDbPool } from '@cu2/shared-lib/db';
 *
 *   const db = createDbPool({
 *     connectionString: process.env.DATABASE_URL!,
 *     ssl: process.env.NODE_ENV === 'production',
 *   });
 *
 *   // Simple query
 *   const { rows } = await db.query<User>('SELECT * FROM users WHERE id = $1', [id]);
 *
 *   // Transaction
 *   const order = await db.withTransaction(async (client) => {
 *     const { rows: [order] } = await client.query(
 *       'INSERT INTO orders (user_id) VALUES ($1) RETURNING *', [userId]
 *     );
 *     await client.query(
 *       'INSERT INTO order_items (order_id, product_id) VALUES ($1, $2)', [order.id, productId]
 *     );
 *     return order;
 *   });
 *
 *   // Shutdown
 *   await db.close();
 *
 * @requires pg (optional peer dep)
 */

// ---------- Types ----------

export interface DbPoolOptions {
  /** PostgreSQL connection string. */
  connectionString: string;
  /** Max connections in the pool. Default: 10 */
  max?: number;
  /** Idle timeout in ms. Default: 30000 */
  idleTimeoutMillis?: number;
  /** Connection timeout in ms. Default: 5000 */
  connectionTimeoutMillis?: number;
  /** Enable SSL. Pass true for { rejectUnauthorized: true }, or false to disable. Default: false */
  ssl?: boolean | { rejectUnauthorized: boolean };
  /** Slow query threshold in ms. Queries above this log a warning. Default: 2000 */
  slowQueryThresholdMs?: number;
  /** Logger instance. Defaults to console. */
  logger?: {
    info(msg: string, meta?: unknown): void;
    warn(msg: string, meta?: unknown): void;
    error(msg: string, meta?: unknown): void;
  };
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

/** A pg PoolClient-compatible interface for use within transactions. */
export interface TransactionClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface DbPool {
  /** Execute a query on the pool. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Run multiple queries in a transaction. Auto-rolls back on error. */
  withTransaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T>;
  /** Close the pool. */
  close(): Promise<void>;
}

// ---------- Factory ----------

export function createDbPool(options: DbPoolOptions): DbPool {
  const log = options.logger ?? console;
  const slowThreshold = options.slowQueryThresholdMs ?? 2000;

  let pool: unknown = null;

  function getPool(): {
    query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
    connect(): Promise<{
      query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
      release(): void;
    }>;
    on(event: string, handler: (err: Error) => void): void;
    end(): Promise<void>;
  } {
    if (!pool) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Pool } = require('pg');
        const sslConfig = options.ssl === true
          ? { rejectUnauthorized: true }
          : options.ssl || false;

        pool = new Pool({
          connectionString: options.connectionString,
          max: options.max ?? 10,
          idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
          connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
          ssl: sslConfig,
        });

        (pool as { on(event: string, handler: (err: Error) => void): void }).on(
          'error',
          (err: Error) => log.error('Unexpected DB pool error', { error: err.message }),
        );
      } catch {
        throw new Error('pg is required. Install it: npm install pg');
      }
    }
    return pool as ReturnType<typeof getPool>;
  }

  return {
    async query<T = Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      const p = getPool();
      const start = Date.now();
      try {
        const result = await p.query(text, params);
        const duration = Date.now() - start;
        if (duration > slowThreshold) {
          log.warn('Slow query detected', { duration, query: text.slice(0, 120) });
        }
        return { rows: result.rows as T[], rowCount: result.rowCount };
      } catch (err) {
        log.error('DB query error', {
          error: (err as Error).message,
          query: text.slice(0, 120),
        });
        throw err;
      }
    },

    async withTransaction<T>(
      fn: (client: TransactionClient) => Promise<T>,
    ): Promise<T> {
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client as unknown as TransactionClient);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async close(): Promise<void> {
      if (pool) {
        await getPool().end();
        pool = null;
      }
    },
  };
}
