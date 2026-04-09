/**
 * server/db-local.ts
 * Pool de conexão MySQL local (banco sync_*) compartilhado entre módulos.
 * Substitui queryExternal do SSH tunnel — latência <10ms vs 200-800ms.
 */
import mysql from "mysql2/promise";

let _localPool: mysql.Pool | null = null;

export function getLocalPool(): mysql.Pool {
  if (!_localPool) {
    _localPool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: "Z",
    });
  }
  return _localPool;
}

export async function queryLocal<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getLocalPool();
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}
