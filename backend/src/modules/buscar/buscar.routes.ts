import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../db/mysql.js';
import { periodoActivo } from '../../utils/periodo.js';
import { authenticate } from '../../plugins/authGuard.js';

// GET /api/buscar?q=texto — buscador global (Ctrl+K).
// Devuelve coincidencias agrupadas: profesores, aulas, secciones del periodo
// activo y materias proyectadas. El Coordinador ve solo secciones de su PNF
// y profesores de su PNF o sin PNF (mismo alcance que el resto del sistema).
async function buscarHandler(request: FastifyRequest, reply: FastifyReply) {
  const q = String((request.query as any).q ?? '').trim();
  if (q.length < 2) {
    return reply.send({ success: true, data: { profesores: [], aulas: [], secciones: [], materias: [] } });
  }
  const like = `%${q}%`;
  const user = request.userPayload!;
  const esCoord = user.role === 'ADMINISTRADOR';
  const pnf = user.pnf_saga_id ?? -1;
  const digits = q.replace(/\D/g, '');

  try {
    const periodo = await periodoActivo();

    const profesores = await query<any[]>(
      `SELECT id, cedula, nombres, apellidos, pnf_nombre
       FROM profesores
       WHERE activo = 1
         AND (CONCAT(nombres, ' ', apellidos) LIKE ? OR CONCAT(apellidos, ' ', nombres) LIKE ?
              ${digits.length >= 3 ? 'OR cedula LIKE ?' : ''})
         ${esCoord ? 'AND (pnf_saga_id = ? OR pnf_saga_id IS NULL)' : ''}
       ORDER BY apellidos, nombres
       LIMIT 8`,
      [like, like, ...(digits.length >= 3 ? [`%${digits}%`] : []), ...(esCoord ? [pnf] : [])]
    );

    const aulas = await query<any[]>(
      `SELECT id, codigo, nombre, tipo, capacidad
       FROM aulas
       WHERE activa = 1 AND (codigo LIKE ? OR nombre LIKE ?)
       ORDER BY codigo
       LIMIT 8`,
      [like, like]
    );

    let secciones: any[] = [];
    let materias: any[] = [];
    if (periodo) {
      secciones = await query<any[]>(
        `SELECT s.id, s.nombre, s.turno_nombre,
                p.pnf_nombre, p.trayecto_nombre, p.tipo_proyeccion,
                MAX(m.q1) AS q1, MAX(m.q2) AS q2, MAX(m.q3) AS q3,
                MAX(m.semestre1) AS sem1, MAX(m.semestre2) AS sem2
         FROM proyeccion_secciones s
         JOIN proyecciones p ON p.id = s.proyeccion_id
         LEFT JOIN proyeccion_materias m
           ON m.proyeccion_id = p.id AND m.eliminada = 0
           AND (m.seccion_id = s.id OR m.seccion_id IS NULL)
         WHERE p.activa = 1 AND p.periodo_academico = ?
           AND s.nombre LIKE ?
           ${esCoord ? 'AND p.pnf_saga_id = ?' : ''}
         GROUP BY s.id
         ORDER BY s.nombre
         LIMIT 8`,
        [periodo, like, ...(esCoord ? [pnf] : [])]
      );

      materias = await query<any[]>(
        `SELECT DISTINCT m.id, m.nombre, p.pnf_nombre, p.trayecto_nombre
         FROM proyeccion_materias m
         JOIN proyecciones p ON p.id = m.proyeccion_id
         WHERE p.activa = 1 AND p.periodo_academico = ? AND m.eliminada = 0
           AND m.nombre LIKE ?
           ${esCoord ? 'AND p.pnf_saga_id = ?' : ''}
         ORDER BY m.nombre
         LIMIT 8`,
        [periodo, like, ...(esCoord ? [pnf] : [])]
      );
    }

    // Lapso donde la sección tiene materias (para aterrizar el horario)
    const lapsoDe = (s: any) => {
      if (s.tipo_proyeccion === 'SEMESTRAL') {
        return `SEMESTRAL:${s.sem1 ? 1 : s.sem2 ? 2 : 1}`;
      }
      return `TRIMESTRAL:${s.q1 ? 1 : s.q2 ? 2 : s.q3 ? 3 : 1}`;
    };

    return reply.send({
      success: true,
      data: {
        profesores: profesores.map((p) => ({
          id: p.id,
          cedula: p.cedula,
          nombre: `${p.apellidos}, ${p.nombres}`,
          pnf_nombre: p.pnf_nombre,
        })),
        aulas: aulas.map((a) => ({
          id: a.id,
          codigo: a.codigo,
          nombre: a.nombre,
          tipo: a.tipo,
          capacidad: a.capacidad,
        })),
        secciones: secciones.map((s) => ({
          id: s.id,
          nombre: s.nombre,
          turno_nombre: s.turno_nombre,
          pnf_nombre: s.pnf_nombre,
          trayecto_nombre: s.trayecto_nombre,
          lapso: lapsoDe(s),
        })),
        materias: materias.map((m) => ({
          id: m.id,
          nombre: m.nombre,
          pnf_nombre: m.pnf_nombre,
          trayecto_nombre: m.trayecto_nombre,
        })),
      },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error en la búsqueda.' });
  }
}

export async function buscarRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [authenticate] }, buscarHandler);
}
