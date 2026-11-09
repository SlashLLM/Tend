import { PGlite, type Transaction } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

export type Q = Pick<Transaction, 'query' | 'exec'>;

/** Boot an in-memory Postgres with the Supabase shim + every migration applied. */
export async function createTestDb() {
  const db = await PGlite.create({ extensions: { vector } });
  await db.exec(readFileSync(join(ROOT, 'tests', 'supabase-shim.sql'), 'utf8'));
  const dir = join(ROOT, 'migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(dir, f), 'utf8'));
    } catch (e) {
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    }
  }

  /** Run `fn` as an authenticated user (RLS applies). Rolls back on error. */
  async function as<T>(userId: string, fn: (q: Q) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
      await tx.exec('set local role authenticated');
      return fn(tx);
    });
  }

  /** Convenience: run one query as a user and return rows. */
  async function q<T = Record<string, unknown>>(userId: string, sql: string, params: unknown[] = []) {
    return as(userId, async (tx) => (await tx.query<T>(sql, params)).rows);
  }

  return { db, as, q };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;
