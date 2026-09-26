import mysql, { Pool } from 'mysql2/promise';
import { env } from '../config/env.js';

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10, // Optimizado para servidor de 4GB RAM
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
  }
  return pool;
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T> {
  const dbPool = getDbPool();
  const [rows] = await dbPool.execute(sql, params);
  return rows as T;
}
