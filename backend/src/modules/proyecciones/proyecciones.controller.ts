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
    let sql = `
      SELECT p.*, u.nombre as creador_nombre, u.apellido as creador_apellido 
      FROM proyecciones p
      LEFT JOIN users u ON p.creado_por = u.id
    `;
    const params: any[] = [];

    // Si el usuario es regular (coordinador PNF), filtrar solo su PNF
    if (user.role === 'REGULAR' && user.pnf_saga_id) {
      sql += ' WHERE p.pnf_saga_id = ?';
      params.push(user.pnf_saga_id);
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

    // Reemplazar secciones si fueron enviadas (cada una puede traer su propia maya y materias)
    if (Array.isArray(body.secciones) || Array.isArray(body.materias)) {
      await conn.query('DELETE FROM proyeccion_materias WHERE proyeccion_id = ?', [id]);
    }

    if (Array.isArray(body.secciones)) {
      await conn.query('DELETE FROM proyeccion_secciones WHERE proyeccion_id = ?', [id]);
      for (const sec of body.secciones) {
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

        if (sec.materias && sec.materias.length > 0) {
          for (const mat of sec.materias) {
            await conn.query(
              `INSERT INTO proyeccion_materias (proyeccion_id, seccion_id, subject_saga_id, nombre, horas_totales, horas_semanales, q1, q2, q3, semestre1, semestre2, eliminada)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
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

    // Reemplazar materias generales si fueron enviadas
    if (Array.isArray(body.materias)) {
      for (const mat of body.materias) {
        await conn.query(
          `INSERT INTO proyeccion_materias (proyeccion_id, seccion_id, subject_saga_id, nombre, horas_totales, horas_semanales, q1, q2, q3, semestre1, semestre2, eliminada)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
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
