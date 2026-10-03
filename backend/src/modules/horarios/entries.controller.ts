import { FastifyRequest, FastifyReply } from 'fastify';
import { query, getDbPool } from '../../db/mysql.js';
import {
  cargarEntries,
  conflictoEn,
  aulasOcupadas,
  elegirAula,
  lapsosRivales,
  LapsoRef,
  TipoProyeccion,
  EntryRow,
} from './scheduler.service.js';

async function periodoActivo(): Promise<string | null> {
  const rows = await query<any[]>(
    "SELECT codigo FROM periodos_academicos WHERE estado = 'ACTIVO' ORDER BY id DESC LIMIT 1"
  );
  return rows[0]?.codigo ?? null;
}

const ENTRY_SELECT = `
  SELECT e.id, e.periodo_academico, e.tipo_proyeccion, e.trimestre,
         e.materia_id, m.nombre AS materia_nombre, m.horas_semanales,
         e.seccion_id, s.nombre AS seccion_nombre, s.turno_saga_id, s.turno_nombre,
         e.profesor_id, pf.nombres AS prof_nombres, pf.apellidos AS prof_apellidos,
         e.dia_semana, e.bloque_id, e.aula_id,
         a.codigo AS aula_codigo, a.nombre AS aula_nombre,
         b.orden AS bloque_orden, b.hora_inicio, b.hora_fin, b.es_receso, b.turno_id,
         t.nombre AS turno_bloque_nombre, pr.pnf_saga_id
  FROM horario_entries e
  JOIN proyeccion_materias m ON m.id = e.materia_id
  JOIN proyeccion_secciones s ON s.id = e.seccion_id
  LEFT JOIN profesores pf ON pf.id = e.profesor_id
  JOIN aulas a ON a.id = e.aula_id
  JOIN turno_bloques b ON b.id = e.bloque_id
  JOIN turnos t ON t.id = b.turno_id
  JOIN proyecciones pr ON pr.id = m.proyeccion_id`;

// GET /api/horarios/entries?periodo=&tipo=&trimestre=
// Devuelve las clases agendadas del lapso pedido y de los lapsos rivales
// (necesarias en el cliente para saber qué aulas/profesores están ocupados).
export async function listEntriesHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.userPayload!;
  const { periodo, tipo, trimestre } = request.query as {
    periodo?: string;
    tipo?: string;
    trimestre?: string;
  };
  const tipoVal: TipoProyeccion = tipo === 'SEMESTRAL' ? 'SEMESTRAL' : 'TRIMESTRAL';
  const n = Number(trimestre) || 1;
  try {
    const periodoCodigo = periodo || (await periodoActivo());
    if (!periodoCodigo) {
      return reply.send({ success: true, data: { periodo: null, entries: [], rivales: [] } });
    }
    const rivales = lapsosRivales(tipoVal, n);
    const cond = rivales.map(() => '(e.tipo_proyeccion = ? AND e.trimestre = ?)').join(' OR ');
    const params: any[] = rivales.flatMap((l) => [l.tipo, l.n]);
    let sql = `${ENTRY_SELECT}
      WHERE e.periodo_academico = ? AND (${cond})`;
    params.unshift(periodoCodigo);
    if (user.role === 'REGULAR' && user.pnf_saga_id) {
      sql += ' AND pr.pnf_saga_id = ?';
      params.push(user.pnf_saga_id);
    }
    sql += ' ORDER BY e.dia_semana, b.hora_inicio';
    const entries = await query<any[]>(sql, params);
    return reply.send({ success: true, data: { periodo: periodoCodigo, rivales, entries } });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error cargando el horario.' });
  }
}

interface EntryBody {
  entry_id?: number;
  materia_id: number;
  seccion_id: number;
  trimestre: number;
  dia_semana: number;
  bloque_id: number;
  aula_id?: number | null;
}

// Resuelve y valida la unidad agendable (materia × sección × lapso) y el slot destino.
// Devuelve null si hay error (ya respondido) o el contexto listo para insertar/mover.
async function resolverSlot(
  request: FastifyRequest,
  reply: FastifyReply,
  body: EntryBody
): Promise<{
  periodo: string;
  tipo: TipoProyeccion;
  trimestre: number;
  pnfSagaId: number;
  profesorId: number | null;
  bloque: any;
  turno: any;
  rivales: LapsoRef[];
  entries: EntryRow[];
} | null> {
  const user = request.userPayload!;
  const materiaId = Number(body.materia_id);
  const seccionId = Number(body.seccion_id);
  const trimestre = Number(body.trimestre);
  const dia = Number(body.dia_semana);
  const bloqueId = Number(body.bloque_id);

  const mat = await query<any[]>(
    `SELECT m.id, m.proyeccion_id, m.seccion_id AS materia_seccion, m.eliminada,
            pr.tipo_proyeccion, pr.periodo_academico, pr.pnf_saga_id, pr.activa
     FROM proyeccion_materias m JOIN proyecciones pr ON pr.id = m.proyeccion_id
     WHERE m.id = ? LIMIT 1`,
    [materiaId]
  );
  if (mat.length === 0 || mat[0].eliminada) {
    reply.status(404).send({ success: false, message: 'Materia no encontrada.' });
    return null;
  }
  const m = mat[0];
  if (!m.activa) {
    reply.status(400).send({ success: false, message: 'La proyección de esta materia está inactiva.' });
    return null;
  }
  const sec = await query<any[]>(
    'SELECT id, proyeccion_id, nombre, turno_saga_id, turno_nombre FROM proyeccion_secciones WHERE id = ? LIMIT 1',
    [seccionId]
  );
  if (sec.length === 0 || sec[0].proyeccion_id !== m.proyeccion_id) {
    reply.status(400).send({ success: false, message: 'La sección no pertenece a la proyección de la materia.' });
    return null;
  }
  if (m.materia_seccion !== null && m.materia_seccion !== seccionId) {
    reply.status(400).send({ success: false, message: 'Esta materia es exclusiva de otra sección.' });
    return null;
  }
  if (user.role === 'REGULAR' && user.pnf_saga_id && Number(user.pnf_saga_id) !== Number(m.pnf_saga_id)) {
    reply.status(403).send({ success: false, message: 'Solo puede agendar materias de su PNF.' });
    return null;
  }

  const s = sec[0];
  const turnos = await query<any[]>(
    'SELECT id, nombre, dias_semana, activo FROM turnos WHERE saga_id = ? LIMIT 1',
    [s.turno_saga_id]
  );
  if (turnos.length === 0) {
    reply.status(400).send({
      success: false,
      message: `El turno '${s.turno_nombre}' de la sección no está configurado. Configúralo en Turnos y Bloques.`,
    });
    return null;
  }
  const turno = turnos[0];
  const bloqueRows = await query<any[]>(
    'SELECT id, turno_id, orden, hora_inicio, hora_fin, es_receso FROM turno_bloques WHERE id = ? LIMIT 1',
    [bloqueId]
  );
  if (bloqueRows.length === 0) {
    reply.status(404).send({ success: false, message: 'Bloque horario no encontrado.' });
    return null;
  }
  const bloque = bloqueRows[0];
  if (bloque.turno_id !== turno.id) {
    reply.status(400).send({
      success: false,
      message: `La sección es de turno '${s.turno_nombre}': solo puede usar sus propios bloques.`,
    });
    return null;
  }
  if (bloque.es_receso) {
    reply.status(400).send({ success: false, message: 'No se puede agendar en un bloque de receso.' });
    return null;
  }
  const diasPermitidos = String(turno.dias_semana)
    .split(',')
    .map((d: string) => parseInt(d, 10));
  if (!diasPermitidos.includes(dia)) {
    reply.status(400).send({
      success: false,
      message: `El turno '${turno.nombre}' no tiene habilitado ese día de la semana.`,
    });
    return null;
  }

  // Profesor actual según la asignación vigente (puede ser NULL = sin profesor)
  const asig = await query<any[]>(
    'SELECT profesor_id FROM proyeccion_asignaciones WHERE materia_id = ? AND seccion_id = ? AND trimestre = ? LIMIT 1',
    [materiaId, seccionId, trimestre]
  );
  const profesorId = asig[0]?.profesor_id ?? null;

  const rivales = lapsosRivales(m.tipo_proyeccion, trimestre);
  const entries = await cargarEntries(
    m.periodo_academico,
    rivales,
    ', (SELECT nombre FROM proyeccion_materias WHERE id = e.materia_id) AS materia_nombre, (SELECT nombre FROM proyeccion_secciones WHERE id = e.seccion_id) AS seccion_nombre, (SELECT codigo FROM aulas WHERE id = e.aula_id) AS aula_codigo'
  );

  return {
    periodo: m.periodo_academico,
    tipo: m.tipo_proyeccion,
    trimestre,
    pnfSagaId: m.pnf_saga_id,
    profesorId,
    bloque,
    turno,
    rivales,
    entries,
  };
}

// PUT /api/horarios/entries — crea una clase nueva o mueve una existente.
// aula_id omitido → auto-asigna el aula libre más adecuada.
export async function upsertEntryHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as EntryBody;
  const entryId = body.entry_id ? Number(body.entry_id) : null;

  try {
    const ctx = await resolverSlot(request, reply, body);
    if (!ctx) return;
    const { bloque, entries, profesorId, periodo, tipo, trimestre, pnfSagaId } = ctx;
    const dia = Number(body.dia_semana);
    const seccionId = Number(body.seccion_id);

    // Aula: la pedida, la existente (si sigue libre) o auto-asignación
    const aulas = await query<any[]>('SELECT id, codigo, tipo, activa, pnf_saga_id FROM aulas WHERE activa = 1');
    let aulaId: number | null = body.aula_id ? Number(body.aula_id) : null;

    if (aulaId !== null && !aulas.some((a) => a.id === aulaId)) {
      return reply.status(400).send({ success: false, message: 'El aula indicada no existe o está inactiva.' });
    }

    const usoPorAula = new Map<number, number>();
    for (const e of entries) usoPorAula.set(e.aula_id, (usoPorAula.get(e.aula_id) ?? 0) + 1);

    const ocupadas = aulasOcupadas(entries, dia, bloque.hora_inicio, bloque.hora_fin, entryId ?? undefined);
    if (aulaId === null && entryId) {
      const actual = await query<any[]>('SELECT aula_id FROM horario_entries WHERE id = ?', [entryId]);
      if (actual.length > 0 && !ocupadas.has(actual[0].aula_id)) aulaId = actual[0].aula_id;
    }
    if (aulaId === null) {
      aulaId = elegirAula(aulas, ocupadas, usoPorAula, pnfSagaId);
      if (aulaId === null) {
        return reply.status(409).send({
          success: false,
          message: 'No hay aulas libres en ese bloque y día.',
        });
      }
    }

    // Conflictos: aula, sección y profesor en slots traslapados (lapsos rivales incluidos)
    const choque = conflictoEn(
      entries,
      dia,
      bloque.hora_inicio,
      bloque.hora_fin,
      { aula_id: aulaId, seccion_id: seccionId, profesor_id: profesorId },
      entryId ?? undefined
    );
    if (choque) {
      let msg = 'Conflicto de horario.';
      if (choque.aula_id === aulaId) {
        msg = `El aula ${choque.aula_codigo ?? aulaId} ya está ocupada por '${choque.materia_nombre ?? 'otra clase'}' (${choque.seccion_nombre ?? ''}) a esa hora.`;
      } else if (choque.seccion_id === seccionId) {
        msg = `La sección ya tiene '${choque.materia_nombre ?? 'otra clase'}' agendada a esa hora.`;
      } else if (profesorId && choque.profesor_id === profesorId) {
        msg = `El profesor ya tiene '${choque.materia_nombre ?? 'otra clase'}' (${choque.seccion_nombre ?? ''}) a esa hora.`;
      }
      return reply.status(409).send({ success: false, message: msg });
    }

    if (entryId) {
      await query(
        `UPDATE horario_entries
         SET materia_id = ?, seccion_id = ?, trimestre = ?, profesor_id = ?, dia_semana = ?, bloque_id = ?, aula_id = ?
         WHERE id = ?`,
        [Number(body.materia_id), seccionId, trimestre, profesorId, dia, Number(body.bloque_id), aulaId, entryId]
      );
    } else {
      await query(
        `INSERT INTO horario_entries
         (periodo_academico, tipo_proyeccion, trimestre, materia_id, seccion_id, profesor_id, dia_semana, bloque_id, aula_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [periodo, tipo, trimestre, Number(body.materia_id), seccionId, profesorId, dia, Number(body.bloque_id), aulaId]
      );
    }

    return reply.send({ success: true, message: 'Clase agendada.', data: { aula_id: aulaId } });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error agendando la clase.' });
  }
}

// POST /api/horarios/entries/swap — intercambia día/bloque/aula entre dos
// clases conservando materia, sección, profesor y demás datos de cada una.
export async function swapEntriesHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as { entry_id_a?: number; entry_id_b?: number };
  const idA = Number(body.entry_id_a);
  const idB = Number(body.entry_id_b);
  if (!Number.isInteger(idA) || !Number.isInteger(idB) || idA <= 0 || idB <= 0 || idA === idB) {
    return reply
      .status(400)
      .send({ success: false, message: 'Se requieren dos clases distintas para intercambiar.' });
  }
  const conn = await getDbPool().getConnection();
  try {
    const [rows] = await conn.execute<any[]>(
      `SELECT en.id, en.dia_semana, en.bloque_id, en.aula_id, pr.pnf_saga_id
       FROM horario_entries en
       JOIN proyeccion_materias m ON m.id = en.materia_id
       JOIN proyecciones pr ON pr.id = m.proyeccion_id
       WHERE en.id IN (?, ?)`,
      [idA, idB]
    );
    if (rows.length !== 2) {
      return reply
        .status(404)
        .send({ success: false, message: 'Una de las clases ya no existe. Recarga el horario.' });
    }
    const user = request.userPayload!;
    if (
      user.role === 'REGULAR' &&
      user.pnf_saga_id &&
      rows.some((r) => Number(r.pnf_saga_id) !== Number(user.pnf_saga_id))
    ) {
      return reply
        .status(403)
        .send({ success: false, message: 'Solo puede modificar clases de su PNF.' });
    }
    const a = rows.find((r) => Number(r.id) === idA)!;
    const b = rows.find((r) => Number(r.id) === idB)!;

    // Las claves únicas (sección/aula/profesor por día+bloque) impiden mover A
    // al slot de B mientras B siga ahí: se estaciona A en dia_semana = 0 (valor
    // que la app nunca usa) dentro de una transacción y luego se ubica en el
    // slot de B.
    await conn.beginTransaction();
    await conn.execute('UPDATE horario_entries SET dia_semana = 0 WHERE id = ?', [idA]);
    await conn.execute(
      'UPDATE horario_entries SET dia_semana = ?, bloque_id = ?, aula_id = ? WHERE id = ?',
      [a.dia_semana, a.bloque_id, a.aula_id, idB]
    );
    await conn.execute(
      'UPDATE horario_entries SET dia_semana = ?, bloque_id = ?, aula_id = ? WHERE id = ?',
      [b.dia_semana, b.bloque_id, b.aula_id, idA]
    );
    await conn.commit();
    return reply.send({ success: true, message: 'Clases intercambiadas.' });
  } catch (error: any) {
    try {
      await conn.rollback();
    } catch {
      // no había transacción activa
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      return reply.status(409).send({
        success: false,
        message:
          'No se puede intercambiar: el profesor, el aula o la sección ya tiene otra clase en el bloque destino.',
      });
    }
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error intercambiando las clases.' });
  } finally {
    conn.release();
  }
}

// DELETE /api/horarios/entries/:id
export async function deleteEntryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  try {
    const e = await query<any[]>(
      `SELECT pr.pnf_saga_id FROM horario_entries en
       JOIN proyeccion_materias m ON m.id = en.materia_id
       JOIN proyecciones pr ON pr.id = m.proyeccion_id WHERE en.id = ?`,
      [Number(id)]
    );
    if (e.length === 0) return reply.status(404).send({ success: false, message: 'Clase no encontrada.' });
    const user = request.userPayload!;
    if (user.role === 'REGULAR' && user.pnf_saga_id && Number(user.pnf_saga_id) !== Number(e[0].pnf_saga_id)) {
      return reply.status(403).send({ success: false, message: 'Solo puede modificar clases de su PNF.' });
    }
    await query('DELETE FROM horario_entries WHERE id = ?', [Number(id)]);
    return reply.send({ success: true, message: 'Clase desagendada.' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error eliminando la clase.' });
  }
}

// Lapsos en los que se dicta una materia según su régimen
function lapsosDeMateria(m: any, tipo: string): number[] {
  const lapsos =
    tipo === 'SEMESTRAL'
      ? [m.semestre1 ? 1 : 0, m.semestre2 ? 2 : 0].filter(Boolean)
      : [m.q1 ? 1 : 0, m.q2 ? 2 : 0, m.q3 ? 3 : 0].filter(Boolean);
  return lapsos.length > 0 ? lapsos : [1];
}

// POST /api/horarios/generar — generación greedy del horario de un lapso.
// modo 'completar' (default): agenda solo las horas faltantes.
// modo 'regenerar': borra las entries del ámbito y recalcula todo.
export async function generarHorarioHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.userPayload!;
  const body = request.body as {
    periodo?: string;
    tipo?: string;
    trimestre?: number;
    pnf_saga_id?: number;
    modo?: 'completar' | 'regenerar';
  };
  const tipo: TipoProyeccion = body.tipo === 'SEMESTRAL' ? 'SEMESTRAL' : 'TRIMESTRAL';
  const trimestre = Number(body.trimestre) || 1;
  const modo = body.modo === 'regenerar' ? 'regenerar' : 'completar';
  const pnfFiltro = user.role === 'REGULAR' && user.pnf_saga_id ? user.pnf_saga_id : body.pnf_saga_id;

  try {
    const periodo = body.periodo || (await periodoActivo());
    if (!periodo) return reply.status(400).send({ success: false, message: 'No hay periodo académico activo.' });

    if (modo === 'regenerar') {
      let del = `DELETE en FROM horario_entries en
        JOIN proyeccion_materias m ON m.id = en.materia_id
        JOIN proyecciones pr ON pr.id = m.proyeccion_id
        WHERE en.periodo_academico = ? AND en.tipo_proyeccion = ? AND en.trimestre = ?`;
      const params: any[] = [periodo, tipo, trimestre];
      if (pnfFiltro) {
        del += ' AND pr.pnf_saga_id = ?';
        params.push(pnfFiltro);
      }
      await query(del, params);
    }

    // Unidades asignables del lapso
    let sql = `
      SELECT pr.id AS proyeccion_id, pr.tipo_proyeccion, pr.pnf_saga_id,
             m.id AS materia_id, m.nombre AS materia_nombre, m.horas_semanales,
             m.q1, m.q2, m.q3, m.semestre1, m.semestre2, m.seccion_id AS materia_seccion_id,
             s.id AS seccion_id, s.nombre AS seccion_nombre, s.turno_saga_id, s.turno_nombre,
             a.profesor_id
      FROM proyecciones pr
      JOIN proyeccion_materias m ON m.proyeccion_id = pr.id AND m.eliminada = 0
      JOIN proyeccion_secciones s
        ON s.proyeccion_id = pr.id AND (m.seccion_id IS NULL OR m.seccion_id = s.id)
      LEFT JOIN proyeccion_asignaciones a
        ON a.materia_id = m.id AND a.seccion_id = s.id AND a.trimestre = ?
      WHERE pr.activa = 1 AND pr.periodo_academico = ? AND pr.tipo_proyeccion = ?`;
    const params: any[] = [trimestre, periodo, tipo];
    if (pnfFiltro) {
      sql += ' AND pr.pnf_saga_id = ?';
      params.push(pnfFiltro);
    }
    const filas = (await query<any[]>(sql, params)).filter((f) =>
      lapsosDeMateria(f, f.tipo_proyeccion).includes(trimestre)
    );

    if (filas.length === 0) {
      return reply.send({
        success: true,
        message: 'No hay materias para agendar en ese lapso.',
        data: { agendadas: 0, pendientes: [] },
      });
    }

    const rivales = lapsosRivales(tipo, trimestre);
    const entries = await cargarEntries(periodo, rivales);

    // Reglas de generación automática configurables
    const cfgRows = await query<any[]>(
      'SELECT min_horas_bloque, max_horas_dia FROM horario_config WHERE id = 1'
    );
    const minBloque = Math.max(1, Number(cfgRows[0]?.min_horas_bloque) || 2);
    const maxDia = Math.max(minBloque, Number(cfgRows[0]?.max_horas_dia) || 3);
    const aulas = await query<any[]>('SELECT id, codigo, tipo, activa, pnf_saga_id FROM aulas WHERE activa = 1');
    if (aulas.length === 0) {
      return reply.status(400).send({
        success: false,
        message: 'No hay aulas activas registradas. Crea aulas primero.',
      });
    }

    // Turnos/bloques disponibles por saga_id
    const turnosRows = await query<any[]>('SELECT id, saga_id, nombre, dias_semana, activo FROM turnos');
    const turnoBySaga = new Map(turnosRows.map((t) => [t.saga_id, t]));
    const bloquesRows = await query<any[]>(
      'SELECT id, turno_id, orden, hora_inicio, hora_fin, es_receso FROM turno_bloques ORDER BY orden'
    );
    const bloquesPorTurno = new Map<number, any[]>();
    for (const b of bloquesRows) {
      const arr = bloquesPorTurno.get(b.turno_id) || [];
      arr.push(b);
      bloquesPorTurno.set(b.turno_id, arr);
    }

    // Horas ya agendadas por unidad (para modo completar)
    const agendaPorUnidad = new Map<string, EntryRow[]>();
    for (const e of entries) {
      if (e.hora_inicio === undefined) continue;
      const k = `${e.materia_id}:${e.seccion_id}`;
      const arr = agendaPorUnidad.get(k) || [];
      arr.push(e);
      agendaPorUnidad.set(k, arr);
    }

    const usoPorAula = new Map<number, number>();
    for (const e of entries) usoPorAula.set(e.aula_id, (usoPorAula.get(e.aula_id) ?? 0) + 1);

    // Unidad con su turno resuelto; orden: más restringidas primero
    interface Unidad {
      materia_id: number;
      seccion_id: number;
      materia_nombre: string;
      seccion_nombre: string;
      profesor_id: number | null;
      pnf_saga_id: number;
      horas: number;
      faltan: number;
      turno: any;
      bloques: any[];
      dias: number[];
      slotsLibres: number;
    }
    const unidades: Unidad[] = [];
    const pendientes: any[] = [];
    for (const f of filas) {
      const turno = turnoBySaga.get(f.turno_saga_id);
      if (!turno) {
        pendientes.push({
          materia_nombre: f.materia_nombre,
          seccion_nombre: f.seccion_nombre,
          faltan: f.horas_semanales,
          motivo: `Turno '${f.turno_nombre}' sin configurar`,
        });
        continue;
      }
      const bloques = (bloquesPorTurno.get(turno.id) || []).filter((b) => !b.es_receso);
      const dias = String(turno.dias_semana).split(',').map(Number);
      const ya = (agendaPorUnidad.get(`${f.materia_id}:${f.seccion_id}`) || []).length;
      const faltan = Math.max(0, f.horas_semanales - ya);
      if (bloques.length === 0 || dias.length === 0) {
        if (faltan > 0) {
          pendientes.push({
            materia_nombre: f.materia_nombre,
            seccion_nombre: f.seccion_nombre,
            faltan,
            motivo: 'El turno no tiene bloques o días configurados',
          });
        }
        continue;
      }
      if (faltan === 0) continue;
      unidades.push({
        materia_id: f.materia_id,
        seccion_id: f.seccion_id,
        materia_nombre: f.materia_nombre,
        seccion_nombre: f.seccion_nombre,
        profesor_id: f.profesor_id ?? null,
        pnf_saga_id: f.pnf_saga_id,
        horas: f.horas_semanales,
        faltan,
        turno,
        bloques,
        dias,
        slotsLibres: 0,
      });
    }

    // Estima slots libres por unidad para ordenar (más restringida primero)
    for (const u of unidades) {
      let libres = 0;
      for (const dia of u.dias) {
        for (const b of u.bloques) {
          if (!conflictoEn(entries, dia, b.hora_inicio, b.hora_fin, { seccion_id: u.seccion_id })) libres++;
        }
      }
      u.slotsLibres = libres;
    }
    unidades.sort((a, b) => a.slotsLibres - b.slotsLibres || b.faltan - a.faltan);

    let agendadas = 0;
    const aInsertar: any[] = [];
    for (const u of unidades) {
      // Horas ya agendadas por día (para respetar max_horas_dia en modo completar)
      const usadasPorDia = new Map<number, number>();
      const diasUsados = new Set<number>();
      for (const e of agendaPorUnidad.get(`${u.materia_id}:${u.seccion_id}`) || []) {
        usadasPorDia.set(e.dia_semana, (usadasPorDia.get(e.dia_semana) ?? 0) + 1);
        diasUsados.add(e.dia_semana);
      }

      // Divide las horas faltantes en sesiones de tamaño [minBloque, maxDia]
      const sesiones: number[] = [];
      let restantes = u.faltan;
      while (restantes > 0) {
        let s = Math.min(maxDia, restantes);
        if (restantes - s > 0 && restantes - s < minBloque) s = restantes - minBloque;
        if (s < minBloque) break; // remanente imposible según las reglas
        sesiones.push(s);
        restantes -= s;
      }
      sesiones.sort((a, b) => b - a); // runs grandes primero (más difíciles de encajar)

      let sinEncajar = restantes; // horas que no pudieron formar sesión válida

      // Coloca cada sesión como un run de bloques consecutivos en un mismo día,
      // mismo aula. Dos pasadas: primero días nuevos para la materia, luego cualquiera.
      for (const s of sesiones) {
        let colocada = false;
        for (const soloDiasNuevos of [true, false]) {
          if (colocada) break;
          for (const dia of u.dias) {
            if (colocada) break;
            if (soloDiasNuevos && diasUsados.has(dia)) continue;
            if ((usadasPorDia.get(dia) ?? 0) + s > maxDia) continue;
            // Ventanas de s bloques consecutivos (por orden, sin receso intermedio)
            for (let k = 0; k + s <= u.bloques.length && !colocada; k++) {
              const ventana = u.bloques.slice(k, k + s);
              if (!ventana.every((b, j) => b.orden === ventana[0].orden + j)) continue;
              // Sección y profesor libres en toda la ventana
              let choque = false;
              const ocupadasRun = new Set<number>();
              for (const b of ventana) {
                if (
                  conflictoEn(entries, dia, b.hora_inicio, b.hora_fin, {
                    seccion_id: u.seccion_id,
                    profesor_id: u.profesor_id,
                  })
                ) {
                  choque = true;
                  break;
                }
                for (const a of aulasOcupadas(entries, dia, b.hora_inicio, b.hora_fin)) {
                  ocupadasRun.add(a);
                }
              }
              if (choque) continue;
              const aulaId = elegirAula(aulas, ocupadasRun, usoPorAula, u.pnf_saga_id);
              if (aulaId === null) continue;
              for (const b of ventana) {
                const nueva: EntryRow = {
                  id: -(aInsertar.length + 1), // id temporal en memoria
                  materia_id: u.materia_id,
                  seccion_id: u.seccion_id,
                  profesor_id: u.profesor_id,
                  dia_semana: dia,
                  bloque_id: b.id,
                  aula_id: aulaId,
                  hora_inicio: b.hora_inicio,
                  hora_fin: b.hora_fin,
                };
                entries.push(nueva);
                aInsertar.push(nueva);
              }
              usoPorAula.set(aulaId, (usoPorAula.get(aulaId) ?? 0) + s);
              usadasPorDia.set(dia, (usadasPorDia.get(dia) ?? 0) + s);
              diasUsados.add(dia);
              agendadas += s;
              colocada = true;
            }
          }
        }
        if (!colocada) sinEncajar += s;
      }

      if (sinEncajar > 0) {
        pendientes.push({
          materia_nombre: u.materia_nombre,
          seccion_nombre: u.seccion_nombre,
          faltan: sinEncajar,
          motivo:
            sinEncajar < minBloque
              ? `Resto de ${sinEncajar}h menor al mínimo por bloque (${minBloque}h)`
              : `Sin run de ${minBloque}-${maxDia} bloques libres (choque de aula, sección o profesor)`,
        });
      }
    }

    for (const e of aInsertar) {
      await query(
        `INSERT INTO horario_entries
         (periodo_academico, tipo_proyeccion, trimestre, materia_id, seccion_id, profesor_id, dia_semana, bloque_id, aula_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [periodo, tipo, trimestre, e.materia_id, e.seccion_id, e.profesor_id, e.dia_semana, e.bloque_id, e.aula_id]
      );
    }

    return reply.send({
      success: true,
      message: `Horario generado: ${agendadas} clases agendadas${pendientes.length > 0 ? `, ${pendientes.length} unidades con horas pendientes` : ''}.`,
      data: { agendadas, pendientes },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error generando el horario.' });
  }
}
