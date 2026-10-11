import { query } from '../db/mysql.js';

// Código del periodo académico activo (el más reciente si hubiera varios),
// o null si no hay ninguno. Compartido por los módulos que consultan el
// periodo vigente.
export async function periodoActivo(): Promise<string | null> {
  const rows = await query<any[]>(
    "SELECT codigo FROM periodos_academicos WHERE estado = 'ACTIVO' ORDER BY id DESC LIMIT 1"
  );
  return rows[0]?.codigo ?? null;
}
