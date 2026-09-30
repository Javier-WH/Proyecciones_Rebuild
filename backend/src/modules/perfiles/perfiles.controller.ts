import { FastifyRequest, FastifyReply } from 'fastify';
import { getDbPool, query } from '../../db/mysql.js';

interface PerfilMateriaInput {
  subject_saga_id: number;
  nombre: string;
}

interface PerfilBody {
  nombre?: string;
  descripcion?: string;
  activo?: boolean;
  materias?: PerfilMateriaInput[];
}

// GET /api/perfiles — perfiles con sus materias y cuántos profesores los usan
export async function listPerfilesHandler(_request: FastifyRequest, reply: FastifyReply) {
  try {
    const perfiles = await query<any[]>(
      `SELECT p.*,
              (SELECT COUNT(*) FROM profesor_perfiles pp WHERE pp.perfil_id = p.id) AS profesores_count
       FROM perfiles p
       ORDER BY p.nombre ASC`
    );

    let materias: any[] = [];
    if (perfiles.length > 0) {
      const ids = perfiles.map((p) => p.id);
      const ph = ids.map(() => '?').join(',');
      materias = await query<any[]>(
        `SELECT perfil_id, subject_saga_id, nombre FROM perfil_materias WHERE perfil_id IN (${ph}) ORDER BY nombre ASC`,
        ids
      );
    }
    const porPerfil = new Map<number, any[]>();
    for (const m of materias) {
      const arr = porPerfil.get(m.perfil_id) || [];
      arr.push({ subject_saga_id: m.subject_saga_id, nombre: m.nombre });
      porPerfil.set(m.perfil_id, arr);
    }

    const data = perfiles.map((p) => ({ ...p, materias: porPerfil.get(p.id) || [] }));
    return reply.send({ success: true, data });
  } catch (error: any) {
    _request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error listando perfiles.' });
  }
}

// Reemplaza las materias de un perfil dentro de una transacción abierta
async function replaceMaterias(conn: any, perfilId: number, materias: PerfilMateriaInput[]) {
  await conn.query('DELETE FROM perfil_materias WHERE perfil_id = ?', [perfilId]);
  const seen = new Set<number>();
  for (const m of materias) {
    const sid = Number(m.subject_saga_id);
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    await conn.query('INSERT INTO perfil_materias (perfil_id, subject_saga_id, nombre) VALUES (?, ?, ?)', [
      perfilId,
      sid,
      String(m.nombre || '').trim() || `Materia ${sid}`,
    ]);
  }
}

export async function createPerfilHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as PerfilBody;
  const nombre = body.nombre?.trim();
  if (!nombre) {
    return reply.status(400).send({ success: false, message: 'El nombre del perfil es obligatorio.' });
  }

  const conn = await getDbPool().getConnection();
  try {
    const dup = await conn.query<any[]>('SELECT id FROM perfiles WHERE nombre = ? LIMIT 1', [nombre]);
    if (dup[0].length > 0) {
      return reply.status(400).send({ success: false, message: `Ya existe un perfil llamado "${nombre}".` });
    }

    await conn.beginTransaction();
    const ins: any = await conn.query(
      'INSERT INTO perfiles (nombre, descripcion) VALUES (?, ?)',
      [nombre, body.descripcion?.trim() || null]
    );
    const perfilId = ins[0].insertId;
    if (Array.isArray(body.materias) && body.materias.length > 0) {
      await replaceMaterias(conn, perfilId, body.materias);
    }
    await conn.commit();

    return reply.status(201).send({
      success: true,
      message: `Perfil "${nombre}" creado exitosamente.`,
      data: { id: perfilId },
    });
  } catch (error: any) {
    await conn.rollback();
    request.log.error(error);
    return reply.status(500).send({ success: false, message: `Error creando el perfil: ${error.message}` });
  } finally {
    conn.release();
  }
}

export async function updatePerfilHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as PerfilBody;

  const conn = await getDbPool().getConnection();
  try {
    const [rows] = await conn.query<any[]>('SELECT * FROM perfiles WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return reply.status(404).send({ success: false, message: 'Perfil no encontrado.' });
    }
    const current = rows[0];

    const nombre = body.nombre?.trim() || current.nombre;
    if (nombre !== current.nombre) {
      const [dup] = await conn.query<any[]>('SELECT id FROM perfiles WHERE nombre = ? AND id != ? LIMIT 1', [nombre, id]);
      if (dup.length > 0) {
        return reply.status(400).send({ success: false, message: `Ya existe un perfil llamado "${nombre}".` });
      }
    }

    await conn.beginTransaction();
    await conn.query('UPDATE perfiles SET nombre = ?, descripcion = ?, activo = ? WHERE id = ?', [
      nombre,
      body.descripcion !== undefined ? body.descripcion?.trim() || null : current.descripcion,
      body.activo !== undefined ? (body.activo ? 1 : 0) : current.activo,
      id,
    ]);
    // Solo se reemplazan las materias si el cliente envía la lista
    if (Array.isArray(body.materias)) {
      await replaceMaterias(conn, Number(id), body.materias);
    }
    await conn.commit();

    return reply.send({ success: true, message: `Perfil "${nombre}" actualizado exitosamente.` });
  } catch (error: any) {
    await conn.rollback();
    request.log.error(error);
    return reply.status(500).send({ success: false, message: `Error actualizando el perfil: ${error.message}` });
  } finally {
    conn.release();
  }
}

export async function deletePerfilHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  try {
    const rows = await query<any[]>('SELECT id, nombre FROM perfiles WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return reply.status(404).send({ success: false, message: 'Perfil no encontrado.' });
    }
    const uso = await query<any[]>('SELECT COUNT(*) AS total FROM profesor_perfiles WHERE perfil_id = ?', [id]);
    await query('DELETE FROM perfiles WHERE id = ?', [id]);
    const total = Number(uso[0]?.total || 0);
    return reply.send({
      success: true,
      message: `Perfil "${rows[0].nombre}" eliminado.${total > 0 ? ` Se desvinculó de ${total} profesor(es).` : ''}`,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error eliminando el perfil.' });
  }
}

// GET /api/perfiles/materias-catalogo — catálogo histórico de materias vistas en
// cualquier proyección (estable por subject_saga_id), para armar perfiles.
export async function catalogoMateriasHandler(_request: FastifyRequest, reply: FastifyReply) {
  try {
    const rows = await query<any[]>(
      `SELECT MIN(subject_saga_id) AS subject_saga_id, nombre
       FROM proyeccion_materias
       WHERE eliminada = 0
       GROUP BY nombre
       ORDER BY nombre ASC`
    );
    return reply.send({ success: true, data: rows });
  } catch (error: any) {
    _request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error cargando el catálogo de materias.' });
  }
}
