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

// Resuelve el periodo que debe usar una petición.
//
// El sistema opera sobre el periodo ACTIVO por defecto, pero Master y
// Coordinador pueden seleccionar un periodo en PLANIFICACION para preparar
// la carga del próximo lapso (la selección es por usuario, en el cliente,
// y llega como ?periodo=<codigo> o body.periodo).
//
// Reglas:
//   - Sin código solicitado          → periodo activo.
//   - Master/Coordinador + código que existe como ACTIVO o PLANIFICACION
//                                    → ese código.
//   - Otros roles, o código inexistente/CERRADO
//                                    → periodo activo (el parámetro se
//                                      ignora silenciosamente: un usuario
//                                      regular nunca sale del activo).
export async function periodoDeLaPeticion(
  user: { role: string },
  solicitado?: string | null
): Promise<string | null> {
  const puedeSeleccionar = user.role === 'SUPER_USUARIO' || user.role === 'ADMINISTRADOR';
  const codigo = (solicitado ?? '').trim();
  if (puedeSeleccionar && codigo) {
    const rows = await query<any[]>(
      "SELECT codigo FROM periodos_academicos WHERE codigo = ? AND estado IN ('ACTIVO', 'PLANIFICACION') LIMIT 1",
      [codigo]
    );
    if (rows.length > 0) return rows[0].codigo;
  }
  return periodoActivo();
}

// Valida que un código de periodo sea escribible: existe y está ACTIVO o
// en PLANIFICACION (nunca CERRADO ni inexistente). Se usa en las
// escrituras que reciben periodo_academico en el body.
export async function periodoEsEscribible(codigo: string): Promise<boolean> {
  const rows = await query<any[]>(
    "SELECT id FROM periodos_academicos WHERE codigo = ? AND estado IN ('ACTIVO', 'PLANIFICACION') LIMIT 1",
    [codigo.trim()]
  );
  return rows.length > 0;
}
