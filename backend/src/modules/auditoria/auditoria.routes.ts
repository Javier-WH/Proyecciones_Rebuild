import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../db/mysql.js';
import { authenticate, authorizeRoles } from '../../plugins/authGuard.js';

// GET /api/auditoria — bitácora de cambios del sistema.
// Master la ve completa; Coordinador solo los registros de su PNF.
// Filtros: ?entidad=, ?accion=, ?pnf_saga_id=, ?username=, ?desde=, ?hasta=, ?limite=
async function listAuditoriaHandler(request: FastifyRequest, reply: FastifyReply) {
  const q = request.query as Record<string, string | undefined>;
  const where: string[] = [];
  const params: unknown[] = [];

  const pnf = request.userPayload?.pnf_saga_id;
  if (request.userPayload?.role === 'ADMINISTRADOR') {
    // El Coordinador solo ve los movimientos de su PNF; si no tiene
    // PNF asociado no ve nada (los registros globales son de Master).
    where.push('pnf_saga_id = ?');
    params.push(pnf ?? -1);
  } else if (q.pnf_saga_id) {
    where.push('pnf_saga_id = ?');
    params.push(Number(q.pnf_saga_id));
  }
  if (q.entidad) {
    where.push('entidad = ?');
    params.push(q.entidad);
  }
  if (q.accion) {
    where.push('accion = ?');
    params.push(q.accion);
  }
  if (q.username) {
    where.push('username LIKE ?');
    params.push(`%${q.username}%`);
  }
  if (q.desde) {
    where.push('created_at >= ?');
    params.push(`${q.desde} 00:00:00`);
  }
  if (q.hasta) {
    where.push('created_at <= ?');
    params.push(`${q.hasta} 23:59:59`);
  }

  // Paginación simple: límite acotado y desplazamiento opcional.
  const limite = Math.min(Math.max(parseInt(q.limite ?? '100', 10) || 100, 1), 500);
  const offset = Math.max(parseInt(q.offset ?? '0', 10) || 0, 0);

  const sql = `
    SELECT id, user_id, username, role, accion, entidad, entidad_id,
           detalle, pnf_saga_id, created_at
    FROM audit_log
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT ? OFFSET ?`;
  const rows = await query<any[]>(sql, [...params, limite, offset]);

  return reply.send({
    success: true,
    data: rows.map((r) => ({
      ...r,
      detalle: typeof r.detalle === 'string' ? safeParse(r.detalle) : r.detalle,
    })),
  });
}

function safeParse(txt: string) {
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

export async function auditoriaRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/',
    { preHandler: [authenticate, authorizeRoles('SUPER_USUARIO', 'ADMINISTRADOR')] },
    listAuditoriaHandler
  );
}
