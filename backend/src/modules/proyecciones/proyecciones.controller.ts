import { FastifyRequest, FastifyReply } from 'fastify';
import { query, getDbPool } from '../../db/mysql.js';

interface CreateProyeccionBody {
  codigo: string;
  nombre: string;
  pnf_saga_id: number;
  pnf_nombre: string;
  trayecto_saga_id: number;
  trayecto_nombre: string;
  maya_id: number;
  maya_descripcion: string;
  periodo_academico: string;
  tipo_proyeccion: 'TRIMESTRAL' | 'SEMESTRAL';
  secciones?: Array<{
    nombre: string;
    turno_saga_id: number;
    turno_nombre: string;
    estudiantes_estimados?: number;
    maya_id?: number | null;
    maya_descripcion?: string;
    materias?: Array<{
      subject_saga_id: number;
      nombre: string;
      horas_totales: number;
      horas_semanales: number;
      q1: boolean;
      q2: boolean;
      q3: boolean;
      semestre1: boolean;
      semestre2: boolean;
      eliminada?: boolean;
    }>;
  }>;
  materias?: Array<{
    subject_saga_id: number;
    nombre: string;
    horas_totales: number;
    horas_semanales: number;
    q1: boolean;
    q2: boolean;
    q3: boolean;
    semestre1: boolean;
    semestre2: boolean;
    eliminada?: boolean;
  }>;
}

export async function createProyeccionHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.userPayload!;
  const body = request.body as CreateProyeccionBody;

  if (!body.nombre || !body.pnf_saga_id || !body.trayecto_saga_id || !body.maya_id || !body.periodo_academico) {
    return reply.status(400).send({
      success: false,
      message: 'Faltan campos obligatorios para crear la proyección.',
    });
  }

  // Si el usuario es regular (coordinador PNF), validar que pertenezca a ese PNF
  if (user.role === 'REGULAR' && user.pnf_saga_id && Number(user.pnf_saga_id) !== Number(body.pnf_saga_id)) {
    return reply.status(403).send({
      success: false,
      message: 'Solo tiene permisos para crear proyecciones en su PNF asignado.',
    });
  }

  const codigo = body.codigo || `PROY-${body.pnf_saga_id}-${body.trayecto_saga_id}-${body.periodo_academico}-${Date.now().toString().slice(-4)}`;

  try {
    // RF-23: Si esta proyección se crea como activa, desactivar las demás proyecciones del mismo PNF y periodo
    await query(
      'UPDATE proyecciones SET activa = 0 WHERE pnf_saga_id = ? AND periodo_academico = ?',
      [body.pnf_saga_id, body.periodo_academico]
    );

    // 1. Insertar proyección
    const insertResult: any = await query(
      `INSERT INTO proyecciones 
       (codigo, nombre, pnf_saga_id, pnf_nombre, trayecto_saga_id, trayecto_nombre, maya_id, maya_descripcion, periodo_academico, tipo_proyeccion, activa, creado_por) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        codigo,
        body.nombre,
        body.pnf_saga_id,
        body.pnf_nombre || '',
        body.trayecto_saga_id,
        body.trayecto_nombre || '',
        body.maya_id,
        body.maya_descripcion || '',
        body.periodo_academico,
        body.tipo_proyeccion || 'TRIMESTRAL',
        user.id,
      ]
    );

    const proyeccionId = insertResult.insertId;

    // 2. Insertar secciones si fueron enviadas (cada una puede tener su propia maya y materias)
    if (body.secciones && body.secciones.length > 0) {
      for (const sec of body.secciones) {
        const secResult: any = await query(
          `INSERT INTO proyeccion_secciones (proyeccion_id, nombre, turno_saga_id, turno_nombre, estudiantes_estimados, maya_id, maya_descripcion)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            proyeccionId,
            sec.nombre,
            sec.turno_saga_id || 1,
            sec.turno_nombre || 'Mañana',
            sec.estudiantes_estimados || 30,
            sec.maya_id || null,
            sec.maya_descripcion || null,
          ]
        );

        // Materias específicas de esta sección (pensum diferente al de la proyección)
        if (sec.materias && sec.materias.length > 0) {
          for (const mat of sec.materias) {
            await query(
              `INSERT INTO proyeccion_materias (proyeccion_id, seccion_id, subject_saga_id, nombre, horas_totales, horas_semanales, q1, q2, q3, semestre1, semestre2, eliminada)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                proyeccionId,
                secResult.insertId,
                mat.subject_saga_id,
                mat.nombre,
                mat.horas_totales || 0,
                mat.horas_semanales || 0,
                mat.q1 ? 1 : 0,
                mat.q2 ? 1 : 0,
                mat.q3 ? 1 : 0,
                mat.semestre1 ? 1 : 0,
                mat.semestre2 ? 1 : 0,
                mat.eliminada ? 1 : 0,
              ]
            );
          }
        }
      }
    }

    // 3. Insertar materias generales de la proyección si fueron enviadas
    if (body.materias && body.materias.length > 0) {
      for (const mat of body.materias) {
        await query(
          `INSERT INTO proyeccion_materias (proyeccion_id, seccion_id, subject_saga_id, nombre, horas_totales, horas_semanales, q1, q2, q3, semestre1, semestre2, eliminada)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            proyeccionId,
            mat.subject_saga_id,
            mat.nombre,
            mat.horas_totales || 0,
            mat.horas_semanales || 0,
            mat.q1 ? 1 : 0,
            mat.q2 ? 1 : 0,
            mat.q3 ? 1 : 0,
            mat.semestre1 ? 1 : 0,
            mat.semestre2 ? 1 : 0,
            mat.eliminada ? 1 : 0,
          ]
        );
      }
    }

    return reply.status(201).send({
      success: true,
      message: 'Proyección académica creada exitosamente.',
      data: { proyeccionId, codigo },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: `Error al crear la proyección: ${error.message || 'Error de base de datos'}`,
    });
  }
}

export async function listProyeccionesHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.userPayload!;

  try {
    // Solo mostrar proyecciones del periodo académico actualmente ACTIVO
    const periodoActivo = await query<any[]>(
      "SELECT codigo FROM periodos_academicos WHERE estado = 'ACTIVO' ORDER BY id DESC LIMIT 1"
    );

    let sql = `
      SELECT p.*, u.nombre as creador_nombre, u.apellido as creador_apellido 
      FROM proyecciones p
      LEFT JOIN users u ON p.creado_por = u.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (periodoActivo.length > 0) {
      conditions.push('p.periodo_academico = ?');
      params.push(periodoActivo[0].codigo);
    }

    // Si el usuario es regular (coordinador PNF), filtrar solo su PNF
    if (user.role === 'REGULAR' && user.pnf_saga_id) {
      conditions.push('p.pnf_saga_id = ?');
      params.push(user.pnf_saga_id);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY p.id DESC';

    const proyecciones = await query(sql, params);
    return reply.send({ success: true, data: proyecciones });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error listando proyecciones.' });
  }
}

export async function getProyeccionDetailHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };

  try {
    const proyList = await query<any[]>('SELECT * FROM proyecciones WHERE id = ? LIMIT 1', [id]);
    if (proyList.length === 0) {
      return reply.status(404).send({ success: false, message: 'Proyección no encontrada.' });
    }

    const proyeccion = proyList[0];
    const materias = await query('SELECT * FROM proyeccion_materias WHERE proyeccion_id = ?', [id]);
    const secciones = await query('SELECT * FROM proyeccion_secciones WHERE proyeccion_id = ?', [id]);

    return reply.send({
      success: true,
      data: {
        ...proyeccion,
        materias,
        secciones,
      },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error recuperando detalle de proyección.' });
  }
}

export async function updateProyeccionHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.userPayload!;
  const { id } = request.params as { id: string };
  const body = request.body as Partial<CreateProyeccionBody>;

  const conn = await getDbPool().getConnection();

  try {
    const [proyRows] = await conn.query<any[]>('SELECT * FROM proyecciones WHERE id = ? LIMIT 1', [id]);
    if (proyRows.length === 0) {
      return reply.status(404).send({ success: false, message: 'Proyección no encontrada.' });
    }
    const proyeccion = proyRows[0];

    // Si el usuario es regular (coordinador PNF), validar que la proyección pertenezca a su PNF
    if (user.role === 'REGULAR' && user.pnf_saga_id && Number(user.pnf_saga_id) !== Number(proyeccion.pnf_saga_id)) {
      return reply.status(403).send({
        success: false,
        message: 'Solo tiene permisos para editar proyecciones de su PNF asignado.',
      });
    }

    const nombre = body.nombre?.trim() || proyeccion.nombre;
    const periodoAcademico = body.periodo_academico || proyeccion.periodo_academico;
    const tipoProyeccion =
      body.tipo_proyeccion === 'TRIMESTRAL' || body.tipo_proyeccion === 'SEMESTRAL'
        ? body.tipo_proyeccion
        : proyeccion.tipo_proyeccion;

    await conn.beginTransaction();

    // RF-23: Si la proyección sigue activa, mantener una sola activa por PNF y periodo
    if (proyeccion.activa) {
      await conn.query(
        'UPDATE proyecciones SET activa = 0 WHERE pnf_saga_id = ? AND periodo_academico = ? AND id != ?',
        [proyeccion.pnf_saga_id, periodoAcademico, id]
      );
    }

    await conn.query(
      'UPDATE proyecciones SET nombre = ?, periodo_academico = ?, tipo_proyeccion = ? WHERE id = ?',
      [nombre, periodoAcademico, tipoProyeccion, id]
    );

    // Diff quirúrgico: actualizar/insertar en vez de borrar y recrear, para no
    // perder las asignaciones de profesores (proyeccion_asignaciones tiene
    // ON DELETE CASCADE sobre materia_id y seccion_id). Identidad lógica:
    //   sección  -> (nombre, turno_saga_id), con fallback por posición
    //   materia  -> (subject_saga_id, seccion_id)
    const upsertMaterias = async (seccionDbId: number | null, mats: any[]) => {
      const [existingMats] = await conn.query<any[]>(
        'SELECT id, subject_saga_id FROM proyeccion_materias WHERE proyeccion_id = ? AND seccion_id <=> ?',
        [id, seccionDbId]
      );
      const bySubject = new Map<number, any>();
      for (const m of existingMats) {
        if (!bySubject.has(m.subject_saga_id)) bySubject.set(m.subject_saga_id, m);
      }
      const keepIds = new Set<number>();

      for (const mat of mats) {
        const ex = bySubject.get(mat.subject_saga_id);
        if (ex && !keepIds.has(ex.id)) {
          keepIds.add(ex.id);
          await conn.query(
            `UPDATE proyeccion_materias SET nombre = ?, horas_totales = ?, horas_semanales = ?,
             q1 = ?, q2 = ?, q3 = ?, semestre1 = ?, semestre2 = ?, eliminada = ? WHERE id = ?`,
            [
              mat.nombre,
              mat.horas_totales || 0,
              mat.horas_semanales || 0,
              mat.q1 ? 1 : 0,
              mat.q2 ? 1 : 0,
              mat.q3 ? 1 : 0,
              mat.semestre1 ? 1 : 0,
              mat.semestre2 ? 1 : 0,
              mat.eliminada ? 1 : 0,
              ex.id,
            ]
          );
        } else {
          await conn.query(
            `INSERT INTO proyeccion_materias (proyeccion_id, seccion_id, subject_saga_id, nombre, horas_totales, horas_semanales, q1, q2, q3, semestre1, semestre2, eliminada)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              seccionDbId,
              mat.subject_saga_id,
              mat.nombre,
              mat.horas_totales || 0,
              mat.horas_semanales || 0,
              mat.q1 ? 1 : 0,
              mat.q2 ? 1 : 0,
              mat.q3 ? 1 : 0,
              mat.semestre1 ? 1 : 0,
              mat.semestre2 ? 1 : 0,
              mat.eliminada ? 1 : 0,
            ]
          );
        }
      }

      // Solo se eliminan (y desasignan) las materias que realmente se quitaron
      const deleteIds = existingMats.filter((m) => !keepIds.has(m.id)).map((m) => m.id);
      if (deleteIds.length > 0) {
        await conn.query(
          `DELETE FROM proyeccion_materias WHERE id IN (${deleteIds.map(() => '?').join(',')})`,
          deleteIds
        );
      }
    };

    if (Array.isArray(body.secciones)) {
      const [existingSecs] = await conn.query<any[]>(
        'SELECT id, nombre, turno_saga_id FROM proyeccion_secciones WHERE proyeccion_id = ?',
        [id]
      );
      const secByKey = new Map<string, any>(existingSecs.map((s) => [`${s.nombre}|${s.turno_saga_id}`, s]));
      const usedSecIds = new Set<number>();
      const secDbIds: (number | undefined)[] = new Array(body.secciones.length);

      // 1) Match por clave (nombre + turno)
      body.secciones.forEach((sec, i) => {
        const ex = secByKey.get(`${sec.nombre}|${sec.turno_saga_id || 1}`);
        if (ex && !usedSecIds.has(ex.id)) {
          secDbIds[i] = ex.id;
          usedSecIds.add(ex.id);
        }
      });

      // 2) Fallback por posición para secciones renombradas (preserva asignaciones)
      const leftoverSecs = existingSecs.filter((s) => !usedSecIds.has(s.id));
      let li = 0;
      body.secciones.forEach((_sec, i) => {
        if (secDbIds[i] === undefined && li < leftoverSecs.length) {
          secDbIds[i] = leftoverSecs[li].id;
          usedSecIds.add(leftoverSecs[li].id);
          li++;
        }
      });

      // 3) Actualizar o insertar secciones y hacer diff de sus materias
      for (const [i, sec] of body.secciones.entries()) {
        let seccionDbId = secDbIds[i];
        if (seccionDbId !== undefined) {
          await conn.query(
            `UPDATE proyeccion_secciones SET nombre = ?, turno_saga_id = ?, turno_nombre = ?, estudiantes_estimados = ?, maya_id = ?, maya_descripcion = ? WHERE id = ?`,
            [
              sec.nombre,
              sec.turno_saga_id || 1,
              sec.turno_nombre || 'Mañana',
              sec.estudiantes_estimados || 30,
              sec.maya_id || null,
              sec.maya_descripcion || null,
              seccionDbId,
            ]
          );
        } else {
          const [secResult] = await conn.query<any>(
            `INSERT INTO proyeccion_secciones (proyeccion_id, nombre, turno_saga_id, turno_nombre, estudiantes_estimados, maya_id, maya_descripcion)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              sec.nombre,
              sec.turno_saga_id || 1,
              sec.turno_nombre || 'Mañana',
              sec.estudiantes_estimados || 30,
              sec.maya_id || null,
              sec.maya_descripcion || null,
            ]
          );
          seccionDbId = secResult.insertId;
        }

        // Si la sección trae materias (pensum propio), diff; si no, no se tocan
        if (Array.isArray(sec.materias)) {
          await upsertMaterias(seccionDbId!, sec.materias);
        }
      }

      // 4) Eliminar solo las secciones que se quitaron (sus materias exclusivas
      //    y asignaciones se limpian por cascada/limpieza explícita)
      const deleteSecIds = existingSecs.filter((s) => !usedSecIds.has(s.id)).map((s) => s.id);
      if (deleteSecIds.length > 0) {
        const ph = deleteSecIds.map(() => '?').join(',');
        await conn.query(`DELETE FROM proyeccion_materias WHERE seccion_id IN (${ph})`, deleteSecIds);
        await conn.query(`DELETE FROM proyeccion_secciones WHERE id IN (${ph})`, deleteSecIds);
      }
    }

    // Diff de materias generales (seccion_id NULL) si fueron enviadas
    if (Array.isArray(body.materias)) {
      await upsertMaterias(null, body.materias);
    }

    await conn.commit();

    return reply.send({
      success: true,
      message: 'Proyección actualizada correctamente.',
    });
  } catch (error: any) {
    try { await conn.rollback(); } catch (_) { /* conexión ya liberada o sin transacción */ }
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: `Error actualizando la proyección: ${error.message || 'Error de base de datos'}`,
    });
  } finally {
    conn.release();
  }
}

export async function toggleActiveProyeccionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };

  try {
    const proyList = await query<any[]>('SELECT * FROM proyecciones WHERE id = ? LIMIT 1', [id]);
    if (proyList.length === 0) {
      return reply.status(404).send({ success: false, message: 'Proyección no encontrada.' });
    }

    const proyeccion = proyList[0];
    const newActiveState = proyeccion.activa ? 0 : 1;

    if (newActiveState === 1) {
      // Desactivar las demás proyecciones del mismo PNF
      await query(
        'UPDATE proyecciones SET activa = 0 WHERE pnf_saga_id = ? AND periodo_academico = ?',
        [proyeccion.pnf_saga_id, proyeccion.periodo_academico]
      );
    }

    await query('UPDATE proyecciones SET activa = ? WHERE id = ?', [newActiveState, id]);

    return reply.send({
      success: true,
      message: `Proyección ${newActiveState === 1 ? 'activada' : 'desactivada'} correctamente.`,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error cambiando estado de proyección.' });
  }
}

export async function deleteProyeccionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };

  try {
    await query('DELETE FROM proyecciones WHERE id = ?', [id]);
    return reply.send({ success: true, message: 'Proyección eliminada exitosamente.' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error eliminando proyección.' });
  }
}
