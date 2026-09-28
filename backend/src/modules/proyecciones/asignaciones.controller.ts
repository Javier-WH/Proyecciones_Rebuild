import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../db/mysql.js';

interface AsignacionBody {
  proyeccion_id: number;
  materia_id: number;
  seccion_id: number;
  trimestre: number;
  profesor_id: number | null;
  // true = aplicar la asignación a todos los lapsos en que se dicta la materia
  todos_lapsos?: boolean;
}

// Lapsos en los que una materia se dicta, según el régimen de su proyección
function lapsosDeMateria(m: any, tipo: string): number[] {
  let lapsos: number[];
  if (tipo === 'SEMESTRAL') {
    lapsos = [m.semestre1 ? 1 : 0, m.semestre2 ? 2 : 0].filter(Boolean);
  } else {
    lapsos = [m.q1 ? 1 : 0, m.q2 ? 2 : 0, m.q3 ? 3 : 0].filter(Boolean);
  }
  return lapsos.length > 0 ? lapsos : [1];
}

// GET /api/proyecciones/carga-docente?periodo=&pnf_saga_id=
// Filas asignables (materia x sección x lapso) cruzadas con su asignación actual.
export async function cargaDocenteHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.userPayload!;
  const { periodo, pnf_saga_id } = request.query as { periodo?: string; pnf_saga_id?: string };

  try {
    let periodoCodigo = periodo;
    if (!periodoCodigo) {
      const activo = await query<any[]>(
        "SELECT codigo FROM periodos_academicos WHERE estado = 'ACTIVO' ORDER BY id DESC LIMIT 1"
      );
      if (activo.length === 0) {
        return reply.send({ success: true, data: { periodo: null, rows: [] } });
      }
      periodoCodigo = activo[0].codigo;
    }

    // 1. Filas asignables: materias x secciones de proyecciones activas del periodo
    let sql = `
      SELECT
        pr.id AS proyeccion_id, pr.nombre AS proyeccion_nombre, pr.tipo_proyeccion,
        pr.pnf_saga_id, pr.pnf_nombre, pr.trayecto_nombre,
        m.id AS materia_id, m.nombre AS materia_nombre, m.horas_semanales,
        m.q1, m.q2, m.q3, m.semestre1, m.semestre2, m.seccion_id AS materia_seccion_id,
        s.id AS seccion_id, s.nombre AS seccion_nombre, s.turno_nombre
      FROM proyecciones pr
      JOIN proyeccion_materias m ON m.proyeccion_id = pr.id AND m.eliminada = 0
      JOIN proyeccion_secciones s
        ON s.proyeccion_id = pr.id AND (m.seccion_id IS NULL OR m.seccion_id = s.id)
      WHERE pr.activa = 1 AND pr.periodo_academico = ?
    `;
    const params: any[] = [periodoCodigo];

    if (user.role === 'REGULAR' && user.pnf_saga_id) {
      sql += ' AND pr.pnf_saga_id = ?';
      params.push(user.pnf_saga_id);
    } else if (pnf_saga_id) {
      sql += ' AND pr.pnf_saga_id = ?';
      params.push(Number(pnf_saga_id));
    }
    sql += ' ORDER BY pr.pnf_nombre, pr.trayecto_saga_id, m.nombre, s.nombre';

    const filas = await query<any[]>(sql, params);

    // 2. Asignaciones existentes de esas proyecciones + datos del profesor
    const proyIds = [...new Set(filas.map((f) => f.proyeccion_id))];
    const asigMap = new Map<string, any>();

    if (proyIds.length > 0) {
      const placeholders = proyIds.map(() => '?').join(',');
      const asignaciones = await query<any[]>(
        `SELECT a.id, a.materia_id, a.seccion_id, a.trimestre, a.profesor_id,
                pf.nombres, pf.apellidos, pf.cedula, pf.nacionalidad, pf.sexo, pf.foto_url, pf.activo,
                tc.nombre AS contrato_nombre, tc.horas_semanales AS contrato_horas
         FROM proyeccion_asignaciones a
         JOIN profesores pf ON pf.id = a.profesor_id
         LEFT JOIN tipos_contrato tc ON tc.id = pf.tipo_contrato_id
         WHERE a.proyeccion_id IN (${placeholders})`,
        proyIds
      );
      for (const a of asignaciones) {
        asigMap.set(`${a.materia_id}:${a.seccion_id}:${a.trimestre}`, a);
      }
    }

    // 3. Expandir por lapso y cruzar con asignaciones
    const rows: any[] = [];
    for (const f of filas) {
      for (const lapso of lapsosDeMateria(f, f.tipo_proyeccion)) {
        const asig = asigMap.get(`${f.materia_id}:${f.seccion_id}:${lapso}`);
        rows.push({
          asignacion_id: asig?.id ?? null,
          proyeccion_id: f.proyeccion_id,
          proyeccion_nombre: f.proyeccion_nombre,
          pnf_saga_id: f.pnf_saga_id,
          pnf_nombre: f.pnf_nombre,
          trayecto_nombre: f.trayecto_nombre,
          materia_id: f.materia_id,
          materia_nombre: f.materia_nombre,
          horas_semanales: f.horas_semanales,
          tipo_proyeccion: f.tipo_proyeccion,
          seccion_id: f.seccion_id,
          seccion_nombre: f.seccion_nombre,
          turno_nombre: f.turno_nombre,
          trimestre: lapso,
          profesor_id: asig?.profesor_id ?? null,
          prof_nombres: asig?.nombres ?? null,
          prof_apellidos: asig?.apellidos ?? null,
          prof_cedula: asig?.cedula ?? null,
          prof_nacionalidad: asig?.nacionalidad ?? null,
          prof_sexo: asig?.sexo ?? null,
          prof_foto_url: asig?.foto_url ?? null,
          prof_activo: asig?.activo ?? null,
          contrato_nombre: asig?.contrato_nombre ?? null,
          contrato_horas: asig?.contrato_horas ?? null,
        });
      }
    }

    return reply.send({ success: true, data: { periodo: periodoCodigo, rows } });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error cargando la carga docente.' });
  }
}

// PUT /api/proyecciones/asignaciones — asigna o quita (profesor_id=null) un profesor
export async function upsertAsignacionHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.userPayload!;
  const body = request.body as AsignacionBody;

  const proyeccionId = Number(body.proyeccion_id);
  const materiaId = Number(body.materia_id);
  const seccionId = Number(body.seccion_id);
  const trimestre = Number(body.trimestre) || 1;
  const profesorId = body.profesor_id ? Number(body.profesor_id) : null;

  if (!proyeccionId || !materiaId || !seccionId) {
    return reply.status(400).send({ success: false, message: 'proyeccion_id, materia_id y seccion_id son obligatorios.' });
  }

  try {
    // Validar que la materia y la sección pertenezcan a la proyección
    const val = await query<any[]>(
      `SELECT p.pnf_saga_id, p.periodo_academico, p.tipo_proyeccion,
              (SELECT COUNT(*) FROM proyeccion_materias m
                WHERE m.id = ? AND m.proyeccion_id = p.id AND (m.seccion_id IS NULL OR m.seccion_id = ?)) AS materia_ok,
              (SELECT COUNT(*) FROM proyeccion_secciones s
                WHERE s.id = ? AND s.proyeccion_id = p.id) AS seccion_ok
       FROM proyecciones p WHERE p.id = ? LIMIT 1`,
      [materiaId, seccionId, seccionId, proyeccionId]
    );
    if (val.length === 0) {
      return reply.status(404).send({ success: false, message: 'Proyección no encontrada.' });
    }
    if (!val[0].materia_ok || !val[0].seccion_ok) {
      return reply.status(400).send({ success: false, message: 'La materia o la sección no pertenecen a la proyección.' });
    }

    if (user.role === 'REGULAR' && user.pnf_saga_id && Number(user.pnf_saga_id) !== Number(val[0].pnf_saga_id)) {
      return reply.status(403).send({ success: false, message: 'Solo puede asignar profesores en su PNF.' });
    }

    // Lapsos objetivo: solo el lapso indicado, o todos los lapsos de la materia
    // cuando el cliente agrupa (todos_lapsos = true).
    const termino = val[0].tipo_proyeccion === 'SEMESTRAL' ? 'semestres' : 'trimestres';
    let lapsos = [trimestre];
    if (body.todos_lapsos) {
      const m = await query<any[]>(
        'SELECT q1, q2, q3, semestre1, semestre2 FROM proyeccion_materias WHERE id = ? LIMIT 1',
        [materiaId]
      );
      if (m.length > 0) lapsos = lapsosDeMateria(m[0], val[0].tipo_proyeccion);
    }

    if (profesorId === null) {
      const ph = lapsos.map(() => '?').join(',');
      await query(
        `DELETE FROM proyeccion_asignaciones WHERE materia_id = ? AND seccion_id = ? AND trimestre IN (${ph})`,
        [materiaId, seccionId, ...lapsos]
      );
      return reply.send({
        success: true,
        message:
          lapsos.length > 1
            ? `Asignación eliminada en ${lapsos.length} ${termino}. La materia quedó sin profesor.`
            : 'Asignación eliminada. La materia quedó sin profesor.',
      });
    }

    const prof = await query<any[]>('SELECT id, activo, nombres, apellidos FROM profesores WHERE id = ? LIMIT 1', [
      profesorId,
    ]);
    if (prof.length === 0) {
      return reply.status(404).send({ success: false, message: 'Profesor no encontrado.' });
    }
    if (!prof[0].activo) {
      return reply.status(400).send({ success: false, message: 'No se puede asignar un profesor desactivado.' });
    }

    for (const lapso of lapsos) {
      await query(
        `INSERT INTO proyeccion_asignaciones (proyeccion_id, materia_id, seccion_id, trimestre, profesor_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE profesor_id = VALUES(profesor_id)`,
        [proyeccionId, materiaId, seccionId, lapso, profesorId]
      );
    }

    // Carga resultante del profesor en el periodo (para feedback de sobrecarga)
    const carga = await query<any[]>(
      `SELECT COALESCE(SUM(m.horas_semanales), 0) AS total
       FROM proyeccion_asignaciones a
       JOIN proyeccion_materias m ON m.id = a.materia_id
       JOIN proyecciones p ON p.id = a.proyeccion_id AND p.periodo_academico = ?
       WHERE a.profesor_id = ?`,
      [val[0].periodo_academico, profesorId]
    );

    return reply.send({
      success: true,
      message:
        lapsos.length > 1
          ? `Materia asignada a ${prof[0].apellidos}, ${prof[0].nombres} en ${lapsos.length} ${termino}.`
          : `Materia asignada a ${prof[0].apellidos}, ${prof[0].nombres}.`,
      data: { profesor_id: profesorId, horas_asignadas: carga[0]?.total ?? 0 },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error procesando la asignación.' });
  }
}
