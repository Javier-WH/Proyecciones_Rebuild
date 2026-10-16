import { FastifyRequest, FastifyReply } from 'fastify';
import { query, getDbPool } from '../../db/mysql.js';
import { audit } from '../../utils/audit.js';
import { periodoDeLaPeticion, periodoEsEscribible } from '../../utils/periodo.js';
import { normTxt } from '../../utils/texto.js';
import { esCoordinadorDeOtroPnf, MSG_PNF_PROHIBIDO } from '../../plugins/authGuard.js';

const normTurno = (s: any): string => normTxt(s);

// 'Noche' en la UI equivale al turno SAGA 'Nocturno'
const TURNO_EQUIV: Record<string, string> = { noche: 'nocturno' };

// Resuelve el turno de una sección contra los turnos sincronizados de SAGA:
// por saga_id si viene, si no por nombre (con equivalencias). Devuelve
// (saga_id, nombre canónico); null si no hay equivalente — nunca se asume
// Mañana: un id equivocado agenda la sección en bloques de otro turno.
function turnoCanonico(
  rows: Array<{ saga_id: number; nombre: string }>,
  sagaId: any,
  nombre: any
): { saga_id: number; nombre: string } | null {
  const sid = Number(sagaId) || 0;
  if (sid) {
    const byId = rows.find((r) => Number(r.saga_id) === sid);
    if (byId) return byId;
  }
  const clave = TURNO_EQUIV[normTurno(nombre)] ?? normTurno(nombre);
  return rows.find((r) => normTurno(r.nombre) === clave) ?? null;
}

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

  // Nota: los ids de SAGA pueden ser 0 (ej. TRAYECTO INICIAL), por eso se valida
  // presencia (null/undefined/NaN) y no verdad/falsedad.
  const faltanCampos =
    !body.nombre?.trim() ||
    !body.periodo_academico?.trim() ||
    body.pnf_saga_id == null ||
    isNaN(Number(body.pnf_saga_id)) ||
    body.trayecto_saga_id == null ||
    isNaN(Number(body.trayecto_saga_id)) ||
    body.maya_id == null ||
    isNaN(Number(body.maya_id));

  if (faltanCampos) {
    return reply.status(400).send({
      success: false,
      message: 'Faltan campos obligatorios para crear la proyección.',
    });
  }

  // El Coordinador solo puede crear proyecciones de su PNF (PNF obligatorio)
  if (esCoordinadorDeOtroPnf(user, body.pnf_saga_id)) {
    return reply.status(403).send({ success: false, message: MSG_PNF_PROHIBIDO });
  }

  const codigo = body.codigo || `PROY-${body.pnf_saga_id}-${body.trayecto_saga_id}-${body.periodo_academico}-${Date.now().toString().slice(-4)}`;

  try {
    // El periodo destino debe existir y admitir escritura (ACTIVO o
    // PLANIFICACION) — nunca un CERRADO ni un código inventado.
    if (!(await periodoEsEscribible(body.periodo_academico))) {
      return reply.status(400).send({
        success: false,
        message: 'El periodo académico indicado no existe o está cerrado.',
      });
    }

    // RF-23: Si esta proyección se crea como activa, desactivar las demás
    // proyecciones equivalentes: mismo PNF, trayecto, maya y periodo.
    await query(
      'UPDATE proyecciones SET activa = 0 WHERE pnf_saga_id = ? AND trayecto_saga_id = ? AND maya_id = ? AND periodo_academico = ?',
      [body.pnf_saga_id, body.trayecto_saga_id, body.maya_id, body.periodo_academico]
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
      const turnosDb = await query<any[]>(
        'SELECT saga_id, nombre FROM turnos WHERE saga_id IS NOT NULL'
      );
      for (const sec of body.secciones) {
        const t = turnoCanonico(turnosDb, sec.turno_saga_id, sec.turno_nombre);
        const secResult: any = await query(
          `INSERT INTO proyeccion_secciones (proyeccion_id, nombre, turno_saga_id, turno_nombre, estudiantes_estimados, maya_id, maya_descripcion)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            proyeccionId,
            sec.nombre,
            t?.saga_id ?? (Number(sec.turno_saga_id) || 0),
            t?.nombre ?? sec.turno_nombre ?? 'Mañana',
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

    audit(request, {
      accion: 'proyeccion.crear',
      entidad: 'proyeccion',
      entidadId: proyeccionId,
      detalle: {
        codigo,
        nombre: body.nombre,
        periodo: body.periodo_academico,
        secciones: body.secciones?.length ?? 0,
      },
      pnfSagaId: Number(body.pnf_saga_id),
    });
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
    // Periodo de trabajo: el ACTIVO por defecto; Master/Coordinador pueden
    // pedir uno en PLANIFICACION vía ?periodo= (los demás roles siempre
    // caen al activo — ver utils/periodo.ts).
    const { periodo: periodoQ } = request.query as { periodo?: string };
    const periodo = await periodoDeLaPeticion(user, periodoQ);

    let sql = `
      SELECT p.*, u.nombre as creador_nombre, u.apellido as creador_apellido
      FROM proyecciones p
      LEFT JOIN users u ON p.creado_por = u.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (periodo) {
      conditions.push('p.periodo_academico = ?');
      params.push(periodo);
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

    // El Coordinador solo puede editar proyecciones de su PNF
    if (esCoordinadorDeOtroPnf(user, proyeccion.pnf_saga_id)) {
      return reply.status(403).send({ success: false, message: MSG_PNF_PROHIBIDO });
    }

    const nombre = body.nombre?.trim() || proyeccion.nombre;
    const periodoAcademico = body.periodo_academico || proyeccion.periodo_academico;

    // Si se intenta mover la proyección a otro periodo, el destino debe
    // admitir escritura (ACTIVO o PLANIFICACION, nunca CERRADO).
    if (
      body.periodo_academico &&
      body.periodo_academico !== proyeccion.periodo_academico &&
      !(await periodoEsEscribible(body.periodo_academico))
    ) {
      return reply.status(400).send({
        success: false,
        message: 'El periodo académico indicado no existe o está cerrado.',
      });
    }
    const tipoProyeccion =
      body.tipo_proyeccion === 'TRIMESTRAL' || body.tipo_proyeccion === 'SEMESTRAL'
        ? body.tipo_proyeccion
        : proyeccion.tipo_proyeccion;

    await conn.beginTransaction();

    // RF-23: Si la proyección sigue activa, mantener una sola activa por
    // PNF + trayecto + maya + periodo
    if (proyeccion.activa) {
      await conn.query(
        'UPDATE proyecciones SET activa = 0 WHERE pnf_saga_id = ? AND trayecto_saga_id = ? AND maya_id = ? AND periodo_academico = ? AND id != ?',
        [proyeccion.pnf_saga_id, proyeccion.trayecto_saga_id, proyeccion.maya_id, periodoAcademico, id]
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
      const [turnosDb] = await conn.query<any[]>(
        'SELECT saga_id, nombre FROM turnos WHERE saga_id IS NOT NULL'
      );
      // Turno canónico por sección (saga_id y nombre resueltos contra SAGA)
      const turnoSecs = body.secciones.map((sec: any) => {
        const t = turnoCanonico(turnosDb, sec.turno_saga_id, sec.turno_nombre);
        return {
          sagaId: t?.saga_id ?? (Number(sec.turno_saga_id) || 0),
          nombre: t?.nombre ?? sec.turno_nombre ?? 'Mañana',
        };
      });
      const secByKey = new Map<string, any>(existingSecs.map((s) => [`${s.nombre}|${s.turno_saga_id}`, s]));
      const usedSecIds = new Set<number>();
      const secDbIds: (number | undefined)[] = new Array(body.secciones.length);

      // 1) Match por clave (nombre + turno)
      body.secciones.forEach((sec, i) => {
        const ex = secByKey.get(`${sec.nombre}|${turnoSecs[i].sagaId}`);
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
              turnoSecs[i].sagaId,
              turnoSecs[i].nombre,
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
              turnoSecs[i].sagaId,
              turnoSecs[i].nombre,
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

    audit(request, {
      accion: 'proyeccion.editar',
      entidad: 'proyeccion',
      entidadId: Number(id),
      detalle: { nombre, periodo: periodoAcademico, tipo: tipoProyeccion },
      pnfSagaId: proyeccion.pnf_saga_id,
    });
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
  const user = request.userPayload!;

  try {
    const proyList = await query<any[]>('SELECT * FROM proyecciones WHERE id = ? LIMIT 1', [id]);
    if (proyList.length === 0) {
      return reply.status(404).send({ success: false, message: 'Proyección no encontrada.' });
    }

    const proyeccion = proyList[0];
    if (esCoordinadorDeOtroPnf(user, proyeccion.pnf_saga_id)) {
      return reply.status(403).send({ success: false, message: MSG_PNF_PROHIBIDO });
    }
    const newActiveState = proyeccion.activa ? 0 : 1;

    if (newActiveState === 1) {
      // Desactivar las demás proyecciones equivalentes (mismo PNF, trayecto y maya)
      await query(
        'UPDATE proyecciones SET activa = 0 WHERE pnf_saga_id = ? AND trayecto_saga_id = ? AND maya_id = ? AND periodo_academico = ?',
        [proyeccion.pnf_saga_id, proyeccion.trayecto_saga_id, proyeccion.maya_id, proyeccion.periodo_academico]
      );
    }

    await query('UPDATE proyecciones SET activa = ? WHERE id = ?', [newActiveState, id]);
    audit(request, {
      accion: newActiveState ? 'proyeccion.activar' : 'proyeccion.desactivar',
      entidad: 'proyeccion',
      entidadId: Number(id),
      detalle: { nombre: proyeccion.nombre },
      pnfSagaId: proyeccion.pnf_saga_id,
    });
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
  const user = request.userPayload!;

  try {
    const proyList = await query<any[]>('SELECT pnf_saga_id FROM proyecciones WHERE id = ? LIMIT 1', [id]);
    if (proyList.length === 0) {
      return reply.status(404).send({ success: false, message: 'Proyección no encontrada.' });
    }
    if (esCoordinadorDeOtroPnf(user, proyList[0].pnf_saga_id)) {
      return reply.status(403).send({ success: false, message: MSG_PNF_PROHIBIDO });
    }

    await query('DELETE FROM proyecciones WHERE id = ?', [id]);
    audit(request, {
      accion: 'proyeccion.eliminar',
      entidad: 'proyeccion',
      entidadId: Number(id),
      pnfSagaId: proyList[0].pnf_saga_id,
    });
    return reply.send({ success: true, message: 'Proyección eliminada exitosamente.' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error eliminando proyección.' });
  }
}

// POST /api/proyecciones/copiar-periodo — rollover de periodo.
// Clona proyecciones + secciones + materias (y opcionalmente asignaciones)
// del periodo `periodo_origen` al periodo de trabajo de la petición
// (el ACTIVO, o el en PLANIFICACION que Master/Coordinador tenga
// seleccionado — llega como periodo_destino). Nunca copia clases
// agendadas (horario_entries) ni el estado activo/inactivo: las copias
// nacen activas. Es idempotente: proyecciones que ya existen en destino
// (mismo pnf+trayecto+maya+tipo) se omiten.
// El Coordinador solo puede copiar las proyecciones de su PNF.
export async function copiarPeriodoHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as {
    periodo_origen?: string;
    periodo_destino?: string;
    incluir_asignaciones?: boolean;
  };
  const origen = String(body.periodo_origen ?? '').trim();
  const conAsignaciones = body.incluir_asignaciones === true;
  const user = request.userPayload!;

  if (!origen) {
    return reply.status(400).send({ success: false, message: 'Debe indicar el periodo de origen.' });
  }

  try {
    const destino = await periodoDeLaPeticion(user, body.periodo_destino);
    if (!destino) {
      return reply.status(400).send({ success: false, message: 'No hay periodo de destino disponible.' });
    }
    if (origen === destino) {
      return reply.status(400).send({ success: false, message: 'El periodo de origen no puede ser el mismo de destino.' });
    }
    const origenExiste = await query<any[]>(
      'SELECT id FROM periodos_academicos WHERE codigo = ? LIMIT 1',
      [origen]
    );
    if (origenExiste.length === 0) {
      return reply.status(404).send({ success: false, message: 'El periodo de origen no existe.' });
    }

    // Proyecciones fuente (activas del periodo origen; Coord: solo las suyas)
    const esCoord = user.role === 'ADMINISTRADOR';
    const proysOrigen = await query<any[]>(
      `SELECT * FROM proyecciones
       WHERE periodo_academico = ? AND activa = 1
         ${esCoord ? 'AND pnf_saga_id = ?' : ''}
       ORDER BY id`,
      [origen, ...(esCoord ? [user.pnf_saga_id ?? -1] : [])]
    );
    if (proysOrigen.length === 0) {
      return reply.send({
        success: true,
        data: { copiadas: 0, omitidas: 0, secciones: 0, materias: 0, asignaciones: 0 },
        message: 'No hay proyecciones activas en el periodo de origen.',
      });
    }

    // Ya existentes en destino (idempotencia): mismo pnf+trayecto+maya+tipo
    const existentes = await query<any[]>(
      `SELECT pnf_saga_id, trayecto_saga_id, maya_id, tipo_proyeccion
       FROM proyecciones WHERE periodo_academico = ?`,
      [destino]
    );
    const yaEstan = new Set(
      existentes.map((e) => `${e.pnf_saga_id}|${e.trayecto_saga_id}|${e.maya_id}|${e.tipo_proyeccion}`)
    );

    const conn = await getDbPool().getConnection();
    const conteo = { copiadas: 0, omitidas: 0, secciones: 0, materias: 0, asignaciones: 0 };
    try {
      await conn.beginTransaction();
      let n = 0;
      for (const p of proysOrigen) {
        const clave = `${p.pnf_saga_id}|${p.trayecto_saga_id}|${p.maya_id}|${p.tipo_proyeccion}`;
        if (yaEstan.has(clave)) {
          conteo.omitidas++;
          continue;
        }
        yaEstan.add(clave);
        n++;
        const codigo = `PROY-${p.pnf_saga_id}-${p.trayecto_saga_id}-${destino}-${n}`.slice(0, 100);
        const [rProy] = await conn.query<any>(
          `INSERT INTO proyecciones
           (codigo, nombre, periodo_id, pnf_saga_id, pnf_nombre, trayecto_saga_id, trayecto_nombre,
            maya_id, maya_descripcion, periodo_academico, tipo_proyeccion, activa, creado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [
            codigo, p.nombre, p.periodo_id ?? null, p.pnf_saga_id, p.pnf_nombre ?? '',
            p.trayecto_saga_id, p.trayecto_nombre ?? '', p.maya_id, p.maya_descripcion ?? '',
            destino, p.tipo_proyeccion, user.id,
          ]
        );
        const proyNuevaId = rProy.insertId;
        conteo.copiadas++;

        // Secciones: mapa viejo id → nuevo id
        const seccs = await query<any[]>(
          'SELECT * FROM proyeccion_secciones WHERE proyeccion_id = ? ORDER BY id',
          [p.id]
        );
        const mapSec = new Map<number, number>();
        for (const s of seccs) {
          const [rSec] = await conn.query<any>(
            `INSERT INTO proyeccion_secciones
             (proyeccion_id, nombre, turno_saga_id, turno_nombre, estudiantes_estimados, maya_id, maya_descripcion, congelada)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              proyNuevaId, s.nombre, s.turno_saga_id, s.turno_nombre,
              s.estudiantes_estimados ?? 0, s.maya_id ?? null, s.maya_descripcion ?? null,
              s.congelada ?? 0,
            ]
          );
          mapSec.set(s.id, rSec.insertId);
          conteo.secciones++;
        }

        // Materias: mapa viejo id → nuevo id (seccion_id remapeado)
        const mats = await query<any[]>(
          'SELECT * FROM proyeccion_materias WHERE proyeccion_id = ? ORDER BY id',
          [p.id]
        );
        const mapMat = new Map<number, number>();
        for (const m of mats) {
          const secNueva = m.seccion_id != null ? mapSec.get(m.seccion_id) ?? null : null;
          const [rMat] = await conn.query<any>(
            `INSERT INTO proyeccion_materias
             (proyeccion_id, seccion_id, subject_saga_id, nombre, horas_totales, horas_semanales,
              q1, q2, q3, semestre1, semestre2, eliminada)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              proyNuevaId, secNueva, m.subject_saga_id, m.nombre,
              m.horas_totales ?? 0, m.horas_semanales ?? 0,
              m.q1 ?? 0, m.q2 ?? 0, m.q3 ?? 0, m.semestre1 ?? 0, m.semestre2 ?? 0,
              m.eliminada ?? 0,
            ]
          );
          mapMat.set(m.id, rMat.insertId);
          conteo.materias++;
        }

        // Asignaciones (opcional): remapea proyeccion/materia/seccion,
        // conserva profesor y lapso
        if (conAsignaciones) {
          const asigs = await query<any[]>(
            'SELECT * FROM proyeccion_asignaciones WHERE proyeccion_id = ? ORDER BY id',
            [p.id]
          );
          for (const a of asigs) {
            const matNueva = mapMat.get(a.materia_id);
            const secNueva = mapSec.get(a.seccion_id);
            if (!matNueva || !secNueva) continue;
            await conn.query(
              `INSERT INTO proyeccion_asignaciones (proyeccion_id, materia_id, seccion_id, trimestre, profesor_id)
               VALUES (?, ?, ?, ?, ?)`,
              [proyNuevaId, matNueva, secNueva, a.trimestre, a.profesor_id]
            );
            conteo.asignaciones++;
          }
        }
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    audit(request, {
      accion: 'proyeccion.copiar_periodo',
      entidad: 'proyeccion',
      detalle: { origen, destino, con_asignaciones: conAsignaciones, ...conteo },
      pnfSagaId: esCoord ? user.pnf_saga_id : null,
    });

    return reply.send({
      success: true,
      data: conteo,
      message:
        `Se copiaron ${conteo.copiadas} proyección(es) al periodo ${destino}` +
        (conteo.omitidas > 0 ? ` (${conteo.omitidas} ya existían)` : '') +
        `. Las clases agendadas no se copiaron.`,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error copiando el periodo.' });
  }
}
