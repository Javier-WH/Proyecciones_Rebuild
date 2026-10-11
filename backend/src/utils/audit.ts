import { FastifyRequest } from 'fastify';
import { query } from '../db/mysql.js';

export interface AuditEntry {
  accion: string;
  entidad?: string;
  entidadId?: number | null;
  detalle?: Record<string, unknown>;
  // PNF al que pertenece el cambio: el Coordinador solo ve su PNF en
  // /api/auditoria. null = evento global (auth, usuarios, config).
  pnfSagaId?: number | null;
}

// Bitácora fire-and-forget: registra quién hizo qué y cuándo sin bloquear
// la respuesta al usuario. Un error de escritura solo se loguea — nunca
// debe romper la operación que originó el registro.
export function audit(request: FastifyRequest, entry: AuditEntry) {
  const u = request.userPayload;
  const fila = {
    user_id: u && u.id > 0 ? u.id : null,
    username: u?.username ?? null,
    role: u?.role ?? null,
    accion: entry.accion,
    entidad: entry.entidad ?? null,
    entidad_id: entry.entidadId ?? null,
    detalle: entry.detalle ? JSON.stringify(entry.detalle) : null,
    pnf_saga_id: entry.pnfSagaId ?? u?.pnf_saga_id ?? null,
  };
  query(
    `INSERT INTO audit_log (user_id, username, role, accion, entidad, entidad_id, detalle, pnf_saga_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fila.user_id,
      fila.username,
      fila.role,
      fila.accion,
      fila.entidad,
      fila.entidad_id,
      fila.detalle,
      fila.pnf_saga_id,
    ]
  ).catch((err) => request.log?.warn({ err }, 'audit_log: no se pudo registrar'));
}
