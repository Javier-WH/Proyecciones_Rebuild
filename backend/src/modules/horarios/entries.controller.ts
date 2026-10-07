import { FastifyRequest, FastifyReply } from 'fastify';
import { query, getDbPool } from '../../db/mysql.js';
import {
  cargarEntries,
  cargarAulasActivas,
  conflictoEn,
  normMateria,
  aulasOcupadas,
  elegirAula,
  lapsosRivales,
  lapsosTotales,
  seTraslapan,
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

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const hhmm = (h: any) => String(h ?? '').slice(0, 5);
// Antepone 'PNF' solo si el nombre no lo trae ya ('P.N.F. en Informática')
const pnfLbl = (n: any) =>
  n && /p\.?\s?n\.?\s?f\.?/i.test(String(n)) ? String(n) : `PNF ${n ?? '—'}`;

// ER_DUP_ENTRY trae en sqlMessage el nombre de la clave única que falló
// (uq_aula / uq_seccion / uq_profesor): lo usamos para titular el conflicto.
const TITULOS_DUP = {
  aula: 'Conflicto de Aula',
  seccion: 'Conflicto de Sección',
  profesor: 'Conflicto de Profesor',
} as const;
function msgDupEntry(e: any, descripcion: string): string {
  const m = /uq_(aula|seccion|profesor)/i.exec(String(e?.sqlMessage ?? e?.message ?? ''));
  const titulo = m
    ? TITULOS_DUP[m[1].toLowerCase() as keyof typeof TITULOS_DUP]
    : 'Conflicto de horario';
  return `${titulo}\n${descripcion}`;
}

// Slot de profesor_disponibilidad que traslapa ese día+bloque (la tabla
// registra los rangos en que el profesor NO está disponible), o null.
async function bloqueoProfesor(
  profesorId: number | null,
  dia: number,
  bloqueId: number
): Promise<{ hi: string; hf: string } | null> {
  if (!profesorId) return null;
  const rows = await query<any[]>(
    `SELECT TIME_FORMAT(d.hora_inicio, '%H:%i') AS hi, TIME_FORMAT(d.hora_fin, '%H:%i') AS hf
     FROM profesor_disponibilidad d
     JOIN turno_bloques b ON b.id = ?
     WHERE d.profesor_id = ? AND d.dia_semana = ?
       AND d.hora_inicio < b.hora_fin AND d.hora_fin > b.hora_inicio
     LIMIT 1`,
    [bloqueId, profesorId, dia]
  );
  return rows[0] ?? null;
}

const msgProfNoDisponible = (materia: string, dia: number, hi: string, hf: string) =>
  `Profesor no disponible\nEl profesor de '${materia}' no está disponible ` +
  `el ${DIAS[dia] || dia} de ${hi} a ${hf}.`;

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
    // Rol docente con cédula vinculada (invitado o cuenta PROFESOR): solo sus clases.
    if (user.role === 'PROFESOR' && user.profesor_cedula) {
      const prof = await query<any[]>('SELECT id FROM profesores WHERE cedula = ? LIMIT 1', [
        user.profesor_cedula,
      ]);
      sql += ' AND e.profesor_id = ?';
      params.push(prof[0]?.id ?? -1);
    }
    sql += ' ORDER BY e.dia_semana, b.hora_inicio';
    const entries = await query<any[]>(sql, params);
    return reply.send({ success: true, data: { periodo: periodoCodigo, rivales, entries } });
  } catch (error: any) {
    request.log.error(error);
    return reply
      .status(500)
      .send({ success: false, message: 'Error interno\nNo se pudo cargar el horario.' });
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
  forzar?: boolean; // guardar aunque haya conflictos por solape (auditoría los marca)
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
  materiaNombre: string;
  pnfNombre: string;
  seccionNombre: string;
  turnoNombre: string;
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
    `SELECT m.id, m.proyeccion_id, m.seccion_id AS materia_seccion, m.eliminada, m.nombre AS materia_nombre,
            pr.tipo_proyeccion, pr.periodo_academico, pr.pnf_saga_id, pr.pnf_nombre, pr.activa
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

  // Solo lapsos de traslape TOTAL: los parciales (T2↔semestres) se permiten —
  // el cliente los muestra como advertencia verde, no como conflicto.
  const rivales = lapsosTotales(m.tipo_proyeccion, trimestre);
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
    materiaNombre: m.materia_nombre ?? 'materia',
    pnfNombre: m.pnf_nombre ?? '—',
    seccionNombre: s.nombre,
    turnoNombre: s.turno_nombre,
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
    const {
      bloque, entries, profesorId, periodo, tipo, trimestre, pnfSagaId,
      materiaNombre, pnfNombre, seccionNombre, turnoNombre,
    } = ctx;
    const dia = Number(body.dia_semana);
    const seccionId = Number(body.seccion_id);
    const forzar = !!body.forzar;
    const cuandoTxt = `el ${DIAS[dia] || dia} a las ${hhmm(bloque.hora_inicio)}`;

    // Aula: la pedida, la existente (si sigue libre) o auto-asignación
    const aulas = await cargarAulasActivas();
    let aulaId: number | null = body.aula_id ? Number(body.aula_id) : null;

    if (aulaId !== null && !aulas.some((a) => a.id === aulaId)) {
      return reply.status(400).send({ success: false, message: 'El aula indicada no existe o está inactiva.' });
    }

    const usoPorAula = new Map<number, number>();
    for (const e of entries) usoPorAula.set(e.aula_id, (usoPorAula.get(e.aula_id) ?? 0) + 1);

    const ocupadas = aulasOcupadas(entries, dia, bloque.hora_inicio, bloque.hora_fin, entryId ?? undefined);

    // Herencia de aula: si el destino queda contiguo a otra hora de la misma
    // materia y profesor en la sección (bloque anterior o siguiente sin receso
    // de por medio), se usa el aula de la vecina para que formen un solo bloque.
    let aulaHeredada = false;
    if (aulaId === null) {
      const bloquesTurno = await query<any[]>(
        'SELECT id, orden, es_receso FROM turno_bloques WHERE turno_id = ? ORDER BY orden',
        [bloque.turno_id]
      );
      const bIdx = bloquesTurno.findIndex((b) => Number(b.id) === Number(body.bloque_id));
      const vecinos: number[] = [];
      for (let i = bIdx - 1; i >= 0; i--) {
        if (!bloquesTurno[i].es_receso) {
          vecinos.push(bloquesTurno[i].id);
          break;
        }
      }
      for (let i = bIdx + 1; i < bloquesTurno.length; i++) {
        if (!bloquesTurno[i].es_receso) {
          vecinos.push(bloquesTurno[i].id);
          break;
        }
      }
      if (vecinos.length > 0) {
        const vec = await query<any[]>(
          `SELECT e.id, e.aula_id FROM horario_entries e
           WHERE e.bloque_id IN (${vecinos.map(() => '?').join(',')}) AND e.dia_semana = ?
             AND e.materia_id = ? AND e.seccion_id = ?
             AND e.periodo_academico = ? AND e.tipo_proyeccion = ? AND e.trimestre = ?
             AND e.profesor_id <=> ?
           LIMIT 1`,
          [...vecinos, dia, Number(body.materia_id), seccionId, periodo, tipo, trimestre, profesorId]
        );
        if (vec.length > 0 && Number(vec[0].id) !== entryId) {
          aulaId = Number(vec[0].aula_id);
          aulaHeredada = true;
        }
      }
    }
    if (aulaId === null && entryId) {
      const actual = await query<any[]>('SELECT aula_id FROM horario_entries WHERE id = ?', [entryId]);
      if (actual.length > 0 && (!ocupadas.has(actual[0].aula_id) || forzar)) aulaId = actual[0].aula_id;
    }
    if (aulaId === null) {
      // Con forzar se ignora la ocupación y se toma el aula menos usada; el
      // solape resultante lo marca la auditoría con el punto rojo.
      aulaId = elegirAula(
        aulas,
        forzar ? new Set<number>() : ocupadas,
        usoPorAula,
        pnfSagaId,
        materiaNombre
      );
      if (aulaId === null) {
        return reply.status(409).send({
          success: false,
          message:
            `Sin aulas libres\nNo se encuentran aulas libres para la materia '${materiaNombre}', ` +
            `del ${pnfLbl(pnfNombre)}, de la sección ${seccionNombre}, del turno ${turnoNombre}, ${cuandoTxt}.`,
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
      const soloChoqueAula =
        choque.aula_id === aulaId &&
        choque.seccion_id !== seccionId &&
        (!profesorId || choque.profesor_id !== profesorId);
      const choqueExacto =
        choque.dia_semana === dia &&
        choque.bloque_id === Number(body.bloque_id) &&
        choque.tipo_proyeccion === tipo &&
        Number(choque.trimestre) === trimestre;
      // Choque exacto de sección: físicamente imposible (uq_seccion sigue
      // activa). Los de aula y profesor ya no tienen clave única — se
      // validan aquí: con `forzar` se guardan y la auditoría los marca;
      // sin `forzar` se rechazan.
      const exactoImposible = choqueExacto && choque.seccion_id === seccionId;
      const permitido =
        !exactoImposible && (forzar || (aulaHeredada && soloChoqueAula && !choqueExacto));
      if (!permitido) {
        const otra = choque.materia_nombre ?? 'otra clase';
        let msg = `Conflicto de horario\nNo se puede agendar '${materiaNombre}' ${cuandoTxt}.`;
        if (choque.aula_id === aulaId) {
          msg = `Conflicto de Aula\nLa materia '${materiaNombre}' del ${pnfLbl(pnfNombre)} del turno ${turnoNombre} ` +
            `tiene asignada el aula ${choque.aula_codigo ?? aulaId}, que ya está ocupando la materia ` +
            `'${otra}' (sección ${choque.seccion_nombre ?? '—'}) ${cuandoTxt}.`;
        } else if (choque.seccion_id === seccionId) {
          msg = `Conflicto de Sección\nLa sección ${seccionNombre} ya tiene '${otra}' agendada ${cuandoTxt}.`;
        } else if (profesorId && choque.profesor_id === profesorId) {
          msg = `Conflicto de Profesor\nLa materia '${materiaNombre}' del ${pnfLbl(pnfNombre)} del turno ${turnoNombre} ` +
            `tiene un profesor que ya está dando '${otra}' (sección ${choque.seccion_nombre ?? '—'}) ${cuandoTxt}.`;
        }
        return reply.status(409).send({ success: false, message: msg });
      }
    }

    // Disponibilidad del profesor en el slot destino: sin `forzar` se rechaza;
    // con `forzar` se guarda y la auditoría lo marca con el punto rojo.
    if (!forzar && profesorId) {
      const nd = await bloqueoProfesor(profesorId, dia, Number(body.bloque_id));
      if (nd) {
        return reply.status(409).send({
          success: false,
          message: msgProfNoDisponible(materiaNombre, dia, nd.hi, nd.hf),
        });
      }
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
    if (error?.code === 'ER_DUP_ENTRY') {
      return reply.status(409).send({
        success: false,
        message: msgDupEntry(
          error,
          'Ya existe una clase con esa aula, sección o profesor en el mismo bloque.'
        ),
      });
    }
    return reply
      .status(500)
      .send({ success: false, message: 'Error interno\nNo se pudo agendar la clase.' });
  }
}

// POST /api/horarios/entries/swap — intercambia día/bloque/aula entre dos
// clases conservando materia, sección, profesor y demás datos de cada una.
export async function swapEntriesHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as {
    entry_id_a?: number;
    entry_id_b?: number;
    forzar?: boolean; // admite choque exacto de profesor (auditoría lo marca)
  };
  const idA = Number(body.entry_id_a);
  const idB = Number(body.entry_id_b);
  const forzar = !!body.forzar;
  if (!Number.isInteger(idA) || !Number.isInteger(idB) || idA <= 0 || idB <= 0 || idA === idB) {
    return reply
      .status(400)
      .send({ success: false, message: 'Se requieren dos clases distintas para intercambiar.' });
  }
  const conn = await getDbPool().getConnection();
  try {
    const [rows] = await conn.execute<any[]>(
      `SELECT en.id, en.dia_semana, en.bloque_id, en.aula_id, en.materia_id,
              en.seccion_id, en.profesor_id, en.periodo_academico,
              en.tipo_proyeccion, en.trimestre, pr.pnf_saga_id, m.nombre AS materia_nombre
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

    // Choque exacto de profesor (mismo lapso, día y bloque): ya no hay clave
    // única — se valida en código. Con `forzar` se permite y la auditoría lo
    // marca con el punto rojo.
    if (!forzar) {
      const profOcupado = async (profId: number | null, e: (typeof rows)[number], dest: (typeof rows)[number]) => {
        if (profId === null) return false;
        const [p] = await conn.execute<any[]>(
          `SELECT id FROM horario_entries
           WHERE periodo_academico = ? AND tipo_proyeccion = ? AND trimestre = ?
             AND dia_semana = ? AND bloque_id = ? AND profesor_id = ?
             AND id NOT IN (?, ?)
           LIMIT 1`,
          [
            e.periodo_academico, e.tipo_proyeccion, e.trimestre,
            dest.dia_semana, dest.bloque_id, profId, idA, idB,
          ]
        );
        return p.length > 0;
      };
      // Choque exacto de aula: uq_aula ya no existe — se valida en código.
      const aulaOcupada = async (e: (typeof rows)[number], dest: (typeof rows)[number]) => {
        const [p] = await conn.execute<any[]>(
          `SELECT id FROM horario_entries
           WHERE periodo_academico = ? AND tipo_proyeccion = ? AND trimestre = ?
             AND dia_semana = ? AND bloque_id = ? AND aula_id = ?
             AND id NOT IN (?, ?)
           LIMIT 1`,
          [
            e.periodo_academico, e.tipo_proyeccion, e.trimestre,
            dest.dia_semana, dest.bloque_id, dest.aula_id, idA, idB,
          ]
        );
        return p.length > 0;
      };
      if (await aulaOcupada(a, b) || await aulaOcupada(b, a)) {
        return reply.status(409).send({
          success: false,
          message: 'Conflicto de Aula\nEl aula del bloque destino ya está ocupada por otra clase.',
        });
      }
      if (await profOcupado(a.profesor_id, a, b)) {
        return reply.status(409).send({
          success: false,
          message: 'Conflicto de Profesor\nEl profesor ya tiene otra clase en el bloque destino.',
        });
      }
      if (await profOcupado(b.profesor_id, b, a)) {
        return reply.status(409).send({
          success: false,
          message: 'Conflicto de Profesor\nEl profesor ya tiene otra clase en el bloque destino.',
        });
      }
      // Disponibilidad de cada profesor en el slot al que quedaría
      const ndA = await bloqueoProfesor(a.profesor_id, b.dia_semana, Number(b.bloque_id));
      if (ndA) {
        return reply.status(409).send({
          success: false,
          message: msgProfNoDisponible(a.materia_nombre, b.dia_semana, ndA.hi, ndA.hf),
        });
      }
      const ndB = await bloqueoProfesor(b.profesor_id, a.dia_semana, Number(a.bloque_id));
      if (ndB) {
        return reply.status(409).send({
          success: false,
          message: msgProfNoDisponible(b.materia_nombre, a.dia_semana, ndB.hi, ndB.hf),
        });
      }
    }

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

    // Herencia de aula tras el intercambio: si en su nueva posición la clase
    // queda contigua a otra de la misma materia, sección y profesor (bloque
    // anterior o siguiente sin contar recesos), toma el aula de la vecina para
    // que se fusionen en un solo bloque. Si esa aula está ocupada por otra
    // clase en horario traslapado, se guarda igual y la auditoría lo marca.
    const heredarAulaVecina = async (
      entry: (typeof rows)[number],
      dia: number,
      bloqueId: number
    ) => {
      const [bl] = await conn.execute<any[]>(
        'SELECT turno_id FROM turno_bloques WHERE id = ?',
        [bloqueId]
      );
      if (bl.length === 0) return;
      const [bloquesTurno] = await conn.execute<any[]>(
        'SELECT id, es_receso FROM turno_bloques WHERE turno_id = ? ORDER BY orden',
        [bl[0].turno_id]
      );
      const idx = bloquesTurno.findIndex((x) => Number(x.id) === Number(bloqueId));
      if (idx < 0) return;
      const vecinos: number[] = [];
      for (let i = idx - 1; i >= 0; i--) {
        if (!bloquesTurno[i].es_receso) {
          vecinos.push(bloquesTurno[i].id);
          break;
        }
      }
      for (let i = idx + 1; i < bloquesTurno.length; i++) {
        if (!bloquesTurno[i].es_receso) {
          vecinos.push(bloquesTurno[i].id);
          break;
        }
      }
      if (vecinos.length === 0) return;
      const [vec] = await conn.execute<any[]>(
        `SELECT id, aula_id FROM horario_entries
         WHERE bloque_id IN (${vecinos.map(() => '?').join(',')}) AND dia_semana = ?
           AND materia_id = ? AND seccion_id = ? AND profesor_id <=> ?
           AND periodo_academico = ? AND tipo_proyeccion = ? AND trimestre = ?
           AND id <> ?
         LIMIT 1`,
        [
          ...vecinos, dia, entry.materia_id, entry.seccion_id, entry.profesor_id,
          entry.periodo_academico, entry.tipo_proyeccion, entry.trimestre, entry.id,
        ]
      );
      if (vec.length > 0) {
        await conn.execute('UPDATE horario_entries SET aula_id = ? WHERE id = ?', [
          vec[0].aula_id,
          entry.id,
        ]);
      }
    };

    await heredarAulaVecina(a, b.dia_semana, b.bloque_id);
    await heredarAulaVecina(b, a.dia_semana, a.bloque_id);

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
        message: msgDupEntry(
          error,
          'No se puede intercambiar: el profesor, el aula o la sección ya tiene otra clase en el bloque destino.'
        ),
      });
    }
    request.log.error(error);
    return reply
      .status(500)
      .send({ success: false, message: 'Error interno\nNo se pudo intercambiar las clases.' });
  } finally {
    conn.release();
  }
}

// POST /api/horarios/entries/aula-grupo — cambia el aula de todo el bloque
// fusionado: el run de bloques contiguos (sin receso) de la misma
// materia+sección+profesor en el mismo día y lapso.
export async function cambiarAulaGrupoHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as { entry_id?: number; aula_id?: number; forzar?: boolean };
  const entryId = Number(body.entry_id);
  const aulaId = Number(body.aula_id);
  const forzar = !!body.forzar;
  if (!Number.isInteger(entryId) || entryId <= 0 || !Number.isInteger(aulaId) || aulaId <= 0) {
    return reply
      .status(400)
      .send({ success: false, message: 'Parámetros inválidos para cambiar el aula.' });
  }
  try {
    const rows = await query<any[]>(
      `SELECT en.id, en.periodo_academico, en.tipo_proyeccion, en.trimestre,
              en.materia_id, en.seccion_id, en.profesor_id, en.dia_semana,
              en.bloque_id, b.turno_id, pr.pnf_saga_id,
              m.nombre AS materia_nombre, s.nombre AS seccion_nombre
       FROM horario_entries en
       JOIN turno_bloques b ON b.id = en.bloque_id
       JOIN proyeccion_materias m ON m.id = en.materia_id
       JOIN proyeccion_secciones s ON s.id = en.seccion_id
       JOIN proyecciones pr ON pr.id = m.proyeccion_id
       WHERE en.id = ?`,
      [entryId]
    );
    if (rows.length === 0) {
      return reply
        .status(404)
        .send({ success: false, message: 'La clase ya no existe. Recarga el horario.' });
    }
    const base = rows[0];
    const user = request.userPayload!;
    if (
      user.role === 'REGULAR' &&
      user.pnf_saga_id &&
      Number(base.pnf_saga_id) !== Number(user.pnf_saga_id)
    ) {
      return reply
        .status(403)
        .send({ success: false, message: 'Solo puede modificar clases de su PNF.' });
    }
    const aula = await query<any[]>(
      'SELECT id, nombre FROM aulas WHERE id = ? AND activa = 1',
      [aulaId]
    );
    if (aula.length === 0) {
      return reply
        .status(400)
        .send({ success: false, message: 'El aula indicada no existe o está inactiva.' });
    }

    // Run contiguo (sin receso) de la misma materia+sección+profesor ese día;
    // todos sus bloques son del turno del bloque base, como en la fusión
    // visual de la grilla.
    const bloquesTurno = await query<any[]>(
      'SELECT id, orden, es_receso, hora_inicio, hora_fin FROM turno_bloques WHERE turno_id = ? ORDER BY orden',
      [base.turno_id]
    );
    const candidatas = await query<any[]>(
      `SELECT en.id, en.bloque_id
       FROM horario_entries en
       WHERE en.periodo_academico = ? AND en.tipo_proyeccion = ? AND en.trimestre = ?
         AND en.dia_semana = ? AND en.materia_id = ? AND en.seccion_id = ?
         AND en.profesor_id <=> ?`,
      [
        base.periodo_academico, base.tipo_proyeccion, base.trimestre,
        base.dia_semana, base.materia_id, base.seccion_id, base.profesor_id,
      ]
    );
    const bloquePorId = new Map(bloquesTurno.map((b) => [Number(b.id), b]));
    const entryPorBloque = new Map(candidatas.map((c) => [Number(c.bloque_id), c]));
    const ordenados = bloquesTurno.filter((b) => !b.es_receso).map((b) => Number(b.id));
    const idxBase = ordenados.indexOf(Number(base.bloque_id));
    const runIds = new Set<number>([entryId]);
    for (let i = idxBase - 1; i >= 0; i--) {
      const c = entryPorBloque.get(ordenados[i]);
      if (!c) break;
      runIds.add(Number(c.id));
    }
    for (let i = idxBase + 1; i < ordenados.length; i++) {
      const c = entryPorBloque.get(ordenados[i]);
      if (!c) break;
      runIds.add(Number(c.id));
    }

    // Conflicto: el aula ocupada en el rango horario de algún bloque del run
    // por una clase fuera del run (lapso y lapsos de traslape total).
    const rivales = lapsosTotales(base.tipo_proyeccion, base.trimestre);
    const todas = (await cargarEntries(base.periodo_academico, rivales)).filter(
      (e) => !runIds.has(Number(e.id))
    );
    const detalles: string[] = [];
    for (const id of runIds) {
      const c = candidatas.find((x) => Number(x.id) === id);
      const bl = bloquePorId.get(Number(c?.bloque_id ?? base.bloque_id));
      if (!bl) continue;
      const choque = conflictoEn(todas, base.dia_semana, bl.hora_inicio, bl.hora_fin, {
        aula_id: aulaId,
      });
      if (choque) {
        detalles.push(
          `a las ${hhmm(bl.hora_inicio)} la ocupa '${choque.materia_nombre ?? 'otra clase'}' ` +
            `(sección ${choque.seccion_nombre ?? '—'})`
        );
      }
    }
    if (detalles.length > 0 && !forzar) {
      return reply.status(409).send({
        success: false,
        message:
          `Conflicto de Aula\nEl aula ${aula[0].nombre} no está libre en todo el bloque: ` +
          `el ${DIAS[base.dia_semana] || base.dia_semana} ${detalles.join('; ')}.`,
      });
    }

    await query(
      `UPDATE horario_entries SET aula_id = ? WHERE id IN (${[...runIds].map(() => '?').join(',')})`,
      [aulaId, ...runIds]
    );
    return reply.send({
      success: true,
      message: `Aula actualizada en ${runIds.size} bloque(s).`,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply
      .status(500)
      .send({ success: false, message: 'Error interno\nNo se pudo cambiar el aula.' });
  }
}

// POST /api/horarios/entries/move-group — mueve un bloque de varias horas
// seguidas (misma sección y turno) al bloque destino indicado. Las clases de la
// sección que ocupen los slots destino se reubican en los slots que deja libre
// el grupo (intercambio por desplazamiento, conservando el aula de cada slot).
export async function moveGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as {
    entry_ids?: number[];
    dia_semana?: number;
    bloque_id?: number;
    forzar?: boolean; // guardar aunque haya solapes de aula (auditoría los marca)
  };
  const ids = [...new Set((body.entry_ids ?? []).map(Number))].filter(
    (n) => Number.isInteger(n) && n > 0
  );
  const dia = Number(body.dia_semana);
  const bloqueId = Number(body.bloque_id);
  const forzar = !!body.forzar;
  if (ids.length === 0 || !Number.isInteger(dia) || !Number.isInteger(bloqueId) || bloqueId <= 0) {
    return reply
      .status(400)
      .send({ success: false, message: 'Parámetros inválidos para mover el bloque.' });
  }

  const conn = await getDbPool().getConnection();
  try {
    const [rows] = await conn.execute<any[]>(
      `SELECT en.id, en.seccion_id, en.dia_semana, en.bloque_id, en.aula_id, en.profesor_id,
              en.materia_id, en.periodo_academico, en.tipo_proyeccion, en.trimestre,
              b.orden, b.turno_id, pr.pnf_saga_id, m.nombre AS materia_nombre
       FROM horario_entries en
       JOIN turno_bloques b ON b.id = en.bloque_id
       JOIN proyeccion_materias m ON m.id = en.materia_id
       JOIN proyecciones pr ON pr.id = m.proyeccion_id
       WHERE en.id IN (${ids.map(() => '?').join(',')})
       ORDER BY b.orden`,
      ids
    );
    if (rows.length !== ids.length) {
      return reply
        .status(404)
        .send({ success: false, message: 'Alguna de las clases ya no existe. Recarga el horario.' });
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
    const run = rows;
    if (run.some((r) => r.seccion_id !== run[0].seccion_id || r.turno_id !== run[0].turno_id)) {
      return reply.status(400).send({
        success: false,
        message: 'Solo se pueden mover juntas clases de la misma sección y turno.',
      });
    }
    const turnoId = run[0].turno_id;
    const { periodo_academico: periodo, tipo_proyeccion: tipo, trimestre } = run[0];

    const [turnoRows] = await conn.execute<any[]>(
      'SELECT dias_semana FROM turnos WHERE id = ? LIMIT 1',
      [turnoId]
    );
    if (!String(turnoRows[0]?.dias_semana ?? '').split(',').map(Number).includes(dia)) {
      return reply
        .status(400)
        .send({ success: false, message: 'Ese día no está habilitado para el turno.' });
    }

    // N bloques consecutivos sin receso a partir del destino
    const [todos] = await conn.execute<any[]>(
      'SELECT id, orden, es_receso, hora_inicio, hora_fin FROM turno_bloques WHERE turno_id = ? ORDER BY orden',
      [turnoId]
    );
    const idx = todos.findIndex((b) => Number(b.id) === bloqueId);
    const destinos = idx < 0 ? [] : todos.slice(idx, idx + run.length);
    if (destinos.length < run.length || destinos.some((b) => b.es_receso)) {
      return reply.status(400).send({
        success: false,
        message: `No cabe: se necesitan ${run.length} bloques seguidos sin receso desde ahí.`,
      });
    }
    const runIds = new Set(run.map((r) => Number(r.id)));
    const destinoIds = destinos.map((b) => Number(b.id));
    const destSet = new Set(destinoIds.map((bid) => `${dia}:${bid}`));

    // Ocupantes del destino del mismo lapso y sección: se desplazan al origen.
    // (Entradas de otras secciones o lapsos rivales pueden coexistir en la
    // celda; no se tocan, pero cuentan para la ocupación de aulas.)
    const [ocupantes] = await conn.execute<any[]>(
      `SELECT en.id, en.dia_semana, en.bloque_id, en.aula_id, en.seccion_id,
              en.materia_id, en.profesor_id, m.nombre AS materia_nombre
       FROM horario_entries en
       JOIN proyeccion_materias m ON m.id = en.materia_id
       WHERE en.periodo_academico = ? AND en.tipo_proyeccion = ? AND en.trimestre = ?
         AND en.dia_semana = ? AND en.bloque_id IN (${destinoIds.map(() => '?').join(',')})`,
      [periodo, tipo, trimestre, dia, ...destinoIds]
    );
    const foraneos = ocupantes.filter(
      (o) => !runIds.has(Number(o.id)) && Number(o.seccion_id) === Number(run[0].seccion_id)
    );

    // Slots de origen que no forman parte del destino: ahí se reubican los foráneos
    const origenLibres = run.filter((r) => !destSet.has(`${r.dia_semana}:${r.bloque_id}`));
    if (foraneos.length > origenLibres.length) {
      return reply.status(409).send({
        success: false,
        message: 'No hay espacio para reubicar las clases que ocupan el destino.',
      });
    }

    // Aulas ocupadas por rango horario (lapso + rivales de traslape total),
    // excluyendo lo movido
    const rivales = lapsosTotales(tipo, trimestre);
    const todas = await cargarEntries(periodo, rivales);
    const movidos = new Set([...runIds, ...foraneos.map((f) => Number(f.id))]);
    const resto = todas.filter((e) => !movidos.has(Number(e.id)));
    const aulas = await cargarAulasActivas();
    const usoPorAula = new Map<number, number>();
    for (const e of resto) usoPorAula.set(e.aula_id, (usoPorAula.get(e.aula_id) ?? 0) + 1);

    // Aulas ocupadas en el slot EXACTO (mismo lapso, día y bloque): se
    // prefieren otras para no crear duplicados exactos (uq_aula ya no
    // existe; cualquier solape restante lo marca la auditoría).
    const exactOcup = (diaN: number, bloqueIdN: number) =>
      new Set(
        resto
          .filter(
            (e) =>
              e.dia_semana === diaN &&
              Number(e.bloque_id) === bloqueIdN &&
              e.tipo_proyeccion === tipo &&
              Number(e.trimestre) === Number(trimestre)
          )
          .map((e) => Number(e.aula_id))
      );

    const foraneoPorSlot = new Map<number, any>(foraneos.map((f) => [Number(f.bloque_id), f]));
    const asignRun: { id: number; aula: number }[] = [];
    for (const [i, r] of run.entries()) {
      const dest = destinos[i];
      const fora = foraneoPorSlot.get(Number(dest.id));
      const ocupadas = aulasOcupadas(resto, dia, dest.hora_inicio, dest.hora_fin);
      // En slot ocupado: el aula del foráneo (intercambio). En slot vacío:
      // conservar la propia si sigue libre, si no, auto-asignar la menos usada.
      // Con `forzar` se conservan las aulas aunque queden solapadas (la
      // auditoría marca el conflicto) y el fallback toma la menos usada.
      let aulaId: number | null = fora ? Number(fora.aula_id) : null;
      if (aulaId !== null && ocupadas.has(aulaId) && !forzar) aulaId = null;
      if (aulaId === null && (!ocupadas.has(Number(r.aula_id)) || forzar)) {
        aulaId = Number(r.aula_id);
      }
      if (aulaId === null) {
        aulaId = elegirAula(
          aulas,
          forzar ? new Set<number>() : ocupadas,
          usoPorAula,
          run[0].pnf_saga_id,
          r.materia_nombre
        );
        if (aulaId === null) {
          return reply.status(409).send({
            success: false,
            message: `No hay aula libre para el bloque ${i + 1} del grupo.`,
          });
        }
      }
      // Evita crear duplicados exactos de aula (uq_aula ya no existe): si el
      // aula elegida está ocupada en ese mismo bloque del mismo lapso se
      // toma otra (idealmente libre; si no, la menos usada — el solape lo
      // marca la auditoría).
      const exactas = exactOcup(dia, Number(dest.id));
      if (exactas.has(aulaId)) {
        aulaId =
          elegirAula(aulas, exactas, usoPorAula, run[0].pnf_saga_id, r.materia_nombre) ?? aulaId;
      }
      asignRun.push({ id: Number(r.id), aula: aulaId });
      usoPorAula.set(aulaId, (usoPorAula.get(aulaId) ?? 0) + 1);
    }

    // Choque exacto de profesor (mismo lapso, día y bloque): uq_profesor ya no
    // existe como clave única — se valida en código. Sin `forzar` se rechaza;
    // con `forzar` se guarda y la auditoría lo marca con el punto rojo.
    const profExacto = (diaN: number, bloqueIdN: number, profId: number | null) =>
      profId !== null &&
      resto.some(
        (e) =>
          e.dia_semana === diaN &&
          Number(e.bloque_id) === bloqueIdN &&
          e.tipo_proyeccion === tipo &&
          Number(e.trimestre) === Number(trimestre) &&
          e.profesor_id !== null &&
          Number(e.profesor_id) === Number(profId)
      );
    if (!forzar) {
      if (run.some((r, i) => profExacto(dia, Number(destinos[i].id), r.profesor_id))) {
        return reply.status(409).send({
          success: false,
          message:
            'Conflicto de Profesor\nEl profesor ya tiene otra clase en alguno de los bloques destino.',
        });
      }
      const foraChoca = foraneos.some((f, j) => {
        const s = origenLibres[j];
        return s && profExacto(s.dia_semana, Number(s.bloque_id), f.profesor_id);
      });
      if (foraChoca) {
        return reply.status(409).send({
          success: false,
          message:
            'Conflicto de Profesor\nLa clase desplazada al origen choca con otra del mismo profesor.',
        });
      }
      // Disponibilidad: el profesor del grupo en cada bloque destino y el de
      // cada clase desplazada en el slot de origen al que quedaría.
      for (const [i, r] of run.entries()) {
        const nd = await bloqueoProfesor(r.profesor_id, dia, Number(destinos[i].id));
        if (nd) {
          return reply.status(409).send({
            success: false,
            message: msgProfNoDisponible(r.materia_nombre ?? 'la clase', dia, nd.hi, nd.hf),
          });
        }
      }
      for (const [j, f] of foraneos.entries()) {
        const s = origenLibres[j];
        const nd = s
          ? await bloqueoProfesor(f.profesor_id, s.dia_semana, Number(s.bloque_id))
          : null;
        if (nd) {
          return reply.status(409).send({
            success: false,
            message: msgProfNoDisponible(
              f.materia_nombre ?? 'la clase desplazada',
              s.dia_semana,
              nd.hi,
              nd.hf
            ),
          });
        }
      }
    }

    // Las claves únicas por (día, bloque) impiden mover en dos pasos: todo lo
    // afectado se estaciona en días negativos distintos (-1, -2, …) dentro de
    // una transacción. No puede ser el mismo día para todos: dos clases de la
    // misma sección con el mismo bloque_id en días distintos chocarían en la
    // clave única al estacionarse juntas en dia_semana = 0.
    await conn.beginTransaction();
    const todosIds = [...runIds, ...foraneos.map((f) => Number(f.id))];
    for (const [i, id] of todosIds.entries()) {
      await conn.execute('UPDATE horario_entries SET dia_semana = ? WHERE id = ?', [
        -(i + 1),
        id,
      ]);
    }
    for (const [i, r] of run.entries()) {
      await conn.execute(
        'UPDATE horario_entries SET dia_semana = ?, bloque_id = ?, aula_id = ? WHERE id = ?',
        [dia, destinoIds[i], asignRun[i].aula, r.id]
      );
    }
    for (const [j, f] of foraneos.entries()) {
      const s = origenLibres[j];
      // El aula del slot origen puede estar ocupada exacta por otra sección:
      // en ese caso se conserva la propia del desplazado o se elige otra.
      let aulaDest = Number(s.aula_id);
      const exactas = exactOcup(s.dia_semana, Number(s.bloque_id));
      if (exactas.has(aulaDest)) {
        aulaDest = !exactas.has(Number(f.aula_id))
          ? Number(f.aula_id)
          : (elegirAula(aulas, exactas, usoPorAula, run[0].pnf_saga_id, f.materia_nombre) ?? aulaDest);
      }
      await conn.execute(
        'UPDATE horario_entries SET dia_semana = ?, bloque_id = ?, aula_id = ? WHERE id = ?',
        [s.dia_semana, s.bloque_id, aulaDest, f.id]
      );
    }

    // Herencia de aula tras el movimiento: si una clase reubicada queda
    // contigua a otra de la misma materia, sección y profesor (bloque
    // anterior o siguiente sin contar recesos), toma el aula de la vecina
    // para que se fusionen en un solo bloque. Si esa aula está ocupada en
    // horario traslapado se guarda igual y la auditoría lo marca; un choque
    // exacto revienta por clave única y hace rollback.
    const bloqueVecino = (i: number, dir: -1 | 1): number | null => {
      for (let k = i + dir; k >= 0 && k < todos.length; k += dir) {
        if (!todos[k].es_receso) return Number(todos[k].id);
      }
      return null;
    };
    const buscarAulaVecina = async (
      bloquesCandidatos: (number | null)[],
      diaN: number,
      materiaId: number,
      seccionId: number,
      profesorId: number | null,
      excluirIds: number[]
    ): Promise<number | null> => {
      for (const bid of bloquesCandidatos) {
        if (bid === null) continue;
        const [v] = await conn.execute<any[]>(
          `SELECT aula_id FROM horario_entries
           WHERE bloque_id = ? AND dia_semana = ? AND seccion_id = ?
             AND materia_id = ? AND profesor_id <=> ?
             AND periodo_academico = ? AND tipo_proyeccion = ? AND trimestre = ?
             AND id NOT IN (${excluirIds.map(() => '?').join(',')})
           LIMIT 1`,
          [
            bid, diaN, seccionId, materiaId, profesorId,
            periodo, tipo, trimestre, ...excluirIds,
          ]
        );
        if (v.length > 0) return Number(v[0].aula_id);
      }
      return null;
    };

    // El grupo movido: se mira el bloque anterior al primero y el siguiente
    // al último (fuera del destino). Si alguno tiene la misma materia, todo
    // el grupo toma ese aula y se fusiona con la vecina.
    const extPrev = bloqueVecino(idx, -1);
    const extNext = bloqueVecino(idx + destinos.length - 1, 1);
    const aulaFusion = await buscarAulaVecina(
      [extPrev, extNext],
      dia,
      Number(run[0].materia_id),
      Number(run[0].seccion_id),
      run[0].profesor_id,
      [...runIds]
    );
    if (aulaFusion !== null) {
      const idsMat = run
        .filter(
          (r) =>
            Number(r.materia_id) === Number(run[0].materia_id) &&
            (r.profesor_id === null || run[0].profesor_id === null
              ? r.profesor_id === run[0].profesor_id
              : Number(r.profesor_id) === Number(run[0].profesor_id))
        )
        .map((r) => Number(r.id));
      await conn.execute(
        `UPDATE horario_entries SET aula_id = ? WHERE id IN (${idsMat.map(() => '?').join(',')})`,
        [aulaFusion, ...idsMat]
      );
    }

    // Las clases desplazadas al origen: cada una revisa sus nuevos vecinos.
    for (const [j, f] of foraneos.entries()) {
      const s = origenLibres[j];
      const iS = todos.findIndex((t) => Number(t.id) === Number(s.bloque_id));
      if (iS < 0) continue;
      const av = await buscarAulaVecina(
        [bloqueVecino(iS, -1), bloqueVecino(iS, 1)],
        s.dia_semana,
        Number(f.materia_id),
        Number(f.seccion_id),
        f.profesor_id,
        [Number(f.id)]
      );
      if (av !== null) {
        await conn.execute('UPDATE horario_entries SET aula_id = ? WHERE id = ?', [av, f.id]);
      }
    }

    await conn.commit();
    return reply.send({
      success: true,
      message:
        foraneos.length > 0
          ? `Bloque movido; ${foraneos.length} clase${foraneos.length === 1 ? '' : 's'} reubicada${foraneos.length === 1 ? '' : 's'}.`
          : 'Bloque movido.',
    });
  } catch (error: any) {
    try {
      await conn.rollback();
    } catch {
      // no había transacción activa
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      return reply.status(409).send({
        success: false,
        message: msgDupEntry(
          error,
          'No se puede mover: el profesor, el aula o la sección ya tiene otra clase en el bloque destino.'
        ),
      });
    }
    request.log.error(error);
    return reply
      .status(500)
      .send({ success: false, message: 'Error interno\nNo se pudo mover el bloque.' });
  } finally {
    conn.release();
  }
}

// POST /api/horarios/entries/schedule-group — agenda en bloque todas las horas
// pendientes de una materia arrastrada desde "Materias pendientes": ocupa los
// bloques consecutivos sin receso a partir del destino, todas en el mismo aula.
export async function scheduleGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as {
    materia_id?: number;
    seccion_id?: number;
    trimestre?: number;
    dia_semana?: number;
    bloque_id?: number;
  };
  try {
    const ctx = await resolverSlot(request, reply, {
      materia_id: body.materia_id,
      seccion_id: body.seccion_id,
      trimestre: body.trimestre,
      dia_semana: body.dia_semana,
      bloque_id: body.bloque_id,
    } as EntryBody);
    if (!ctx) return;
    const { bloque, entries, profesorId, periodo, tipo, trimestre, pnfSagaId } = ctx;
    const materiaId = Number(body.materia_id);
    const seccionId = Number(body.seccion_id);
    const dia = Number(body.dia_semana);

    // Horas restantes de la materia en el lapso
    const matRows = await query<any[]>(
      'SELECT horas_semanales FROM proyeccion_materias WHERE id = ? LIMIT 1',
      [materiaId]
    );
    const agendadas = entries.filter(
      (e) =>
        e.materia_id === materiaId &&
        e.seccion_id === seccionId &&
        e.tipo_proyeccion === tipo &&
        Number(e.trimestre) === trimestre
    ).length;
    const faltan = Math.max(0, Number(matRows[0]?.horas_semanales ?? 0) - agendadas);
    if (faltan === 0) {
      return reply
        .status(400)
        .send({ success: false, message: 'La materia ya tiene todas sus horas agendadas.' });
    }

    // N bloques consecutivos sin receso a partir del destino
    const todos = await query<any[]>(
      'SELECT id, orden, es_receso, hora_inicio, hora_fin FROM turno_bloques WHERE turno_id = ? ORDER BY orden',
      [bloque.turno_id]
    );
    const idx = todos.findIndex((b) => Number(b.id) === Number(body.bloque_id));
    const destinos = idx < 0 ? [] : todos.slice(idx, idx + faltan);
    if (destinos.length < faltan || destinos.some((b) => b.es_receso)) {
      return reply.status(400).send({
        success: false,
        message: `No cabe: se necesitan ${faltan} bloques seguidos sin receso desde ahí.`,
      });
    }

    // La sección no puede tener ya clases en esos bloques (mismo lapso)
    const destinoIds = new Set(destinos.map((b) => Number(b.id)));
    const ocupadaSeccion = entries.find(
      (e) =>
        e.seccion_id === seccionId &&
        e.dia_semana === dia &&
        destinoIds.has(e.bloque_id) &&
        e.tipo_proyeccion === tipo &&
        Number(e.trimestre) === trimestre
    );
    if (ocupadaSeccion) {
      const ocupantes = entries.filter(
        (e) =>
          e.seccion_id === seccionId &&
          e.dia_semana === dia &&
          destinoIds.has(e.bloque_id) &&
          e.tipo_proyeccion === tipo &&
          Number(e.trimestre) === trimestre
      );
      const lista = ocupantes
        .map((o: any) => `'${o.materia_nombre ?? 'una clase'}' a las ${hhmm(o.hora_inicio)}`)
        .join(', ');
      return reply.status(409).send({
        success: false,
        message:
          `Destino ocupado\nLa sección ${ctx.seccionNombre} ya tiene ${lista} el ${DIAS[dia] || dia}.`,
      });
    }

    // Un solo aula para todo el bloque: preferir las ya usadas por la materia,
    // luego la que menos choques tenga en los slots destino.
    const aulas = await cargarAulasActivas();
    const usoPorAula = new Map<number, number>();
    for (const e of entries) usoPorAula.set(e.aula_id, (usoPorAula.get(e.aula_id) ?? 0) + 1);
    const preferidas = [
      ...new Set(
        entries
          .filter(
            (e) =>
              e.materia_id === materiaId &&
              e.seccion_id === seccionId &&
              e.tipo_proyeccion === tipo &&
              Number(e.trimestre) === trimestre
          )
          .map((e) => Number(e.aula_id))
      ),
    ];
    const restantes = aulas
      .map((a) => Number(a.id))
      .filter((id) => !preferidas.includes(id))
      .sort((a, b) => (usoPorAula.get(a) ?? 0) - (usoPorAula.get(b) ?? 0));
    // Primero las aulas que declaran esta materia como preferida, luego las
    // ya usadas por la materia y por último el resto por menor uso.
    const prefNom = normMateria(ctx.materiaNombre);
    const prefMat = aulas
      .filter((a) => (a.materias_pref as Set<string>)?.has(prefNom))
      .map((a) => Number(a.id));
    const candidatas = [
      ...new Set([...prefMat, ...preferidas, ...restantes]),
    ];
    let aulaId: number | null = null;
    let minConflictos = Infinity;
    for (const c of candidatas) {
      const conflictos = destinos.filter((d) =>
        aulasOcupadas(entries, dia, d.hora_inicio, d.hora_fin).has(c)
      ).length;
      if (conflictos === 0) {
        aulaId = c;
        break;
      }
      if (conflictos < minConflictos) {
        minConflictos = conflictos;
        aulaId = c;
      }
    }
    if (aulaId === null) {
      return reply
        .status(409)
        .send({ success: false, message: 'No hay aulas activas registradas.' });
    }

    // Choque exacto de profesor (uq_profesor ya no existe: se valida en
    // código). Los traslapados se guardan y los marca la auditoría.
    if (profesorId !== null) {
      const profOcup = entries.find(
        (e) =>
          e.dia_semana === dia &&
          e.tipo_proyeccion === tipo &&
          Number(e.trimestre) === Number(trimestre) &&
          e.profesor_id !== null &&
          Number(e.profesor_id) === Number(profesorId) &&
          destinos.some((d) => Number(d.id) === Number(e.bloque_id))
      );
      if (profOcup) {
        return reply.status(409).send({
          success: false,
          message:
            `Conflicto de Profesor\nEl profesor ya tiene otra clase el ${DIAS[dia] || dia} ` +
            'en alguno de esos bloques.',
        });
      }
      // Disponibilidad del profesor en cada bloque destino
      for (const d of destinos) {
        const nd = await bloqueoProfesor(profesorId, dia, Number(d.id));
        if (nd) {
          return reply.status(409).send({
            success: false,
            message: msgProfNoDisponible(ctx.materiaNombre, dia, nd.hi, nd.hf),
          });
        }
      }
    }

    // Insertar las N clases en transacción (todo o nada). Los choques de aula
    // o profesor por horas traslapadas se guardan y los marca la auditoría;
    // un choque exacto de aula o sección hace rollback por las claves únicas.
    const conn = await getDbPool().getConnection();
    try {
      await conn.beginTransaction();
      for (const dest of destinos) {
        await conn.execute(
          `INSERT INTO horario_entries
           (periodo_academico, tipo_proyeccion, trimestre, materia_id, seccion_id, profesor_id, dia_semana, bloque_id, aula_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [periodo, tipo, trimestre, materiaId, seccionId, profesorId, dia, dest.id, aulaId]
        );
      }
      await conn.commit();
    } catch (e: any) {
      try {
        await conn.rollback();
      } catch {
        // no había transacción activa
      }
      if (e?.code === 'ER_DUP_ENTRY') {
        return reply.status(409).send({
          success: false,
          message: msgDupEntry(
            e,
            `La materia '${ctx.materiaNombre}' choca con otra clase el ${DIAS[dia] || dia}: ` +
              'el aula, la sección o el profesor ya está ocupado en alguno de esos bloques.'
          ),
        });
      }
      throw e;
    } finally {
      conn.release();
    }

    return reply.send({
      success: true,
      message: `Bloque de ${faltan}h agendado.`,
      data: { agendadas: faltan, aula_id: aulaId },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply
      .status(500)
      .send({ success: false, message: 'Error interno\nNo se pudo agendar el bloque.' });
  }
}

// POST /api/horarios/entries/unschedule — desagenda varias clases de una vez
// (p. ej. arrastrar un bloque de varias horas a "Materias pendientes").
export async function unscheduleEntriesHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as { entry_ids?: number[] };
  const ids = [...new Set((body.entry_ids ?? []).map(Number))].filter(
    (n) => Number.isInteger(n) && n > 0
  );
  if (ids.length === 0) {
    return reply
      .status(400)
      .send({ success: false, message: 'Se esperaba una lista de clases a desagendar.' });
  }
  try {
    const user = request.userPayload!;
    if (user.role === 'REGULAR' && user.pnf_saga_id) {
      const rows = await query<any[]>(
        `SELECT en.id FROM horario_entries en
         JOIN proyeccion_materias m ON m.id = en.materia_id
         JOIN proyecciones pr ON pr.id = m.proyeccion_id
         WHERE en.id IN (${ids.map(() => '?').join(',')}) AND pr.pnf_saga_id = ?`,
        [...ids, Number(user.pnf_saga_id)]
      );
      if (rows.length !== ids.length) {
        return reply
          .status(403)
          .send({ success: false, message: 'Solo puede modificar clases de su PNF.' });
      }
    }
    const r = await query<any>(
      `DELETE FROM horario_entries WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const n = r?.affectedRows ?? 0;
    return reply.send({
      success: true,
      message: `${n} clase${n === 1 ? '' : 's'} desagendada${n === 1 ? '' : 's'}.`,
      data: { eliminadas: n },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply
      .status(500)
      .send({ success: false, message: 'Error interno\nNo se pudo desagendar las clases.' });
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
    return reply
      .status(500)
      .send({ success: false, message: 'Error interno\nNo se pudo eliminar la clase.' });
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
        ON s.proyeccion_id = pr.id
        AND (
          m.seccion_id = s.id
          OR (
            m.seccion_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM proyeccion_materias pm
              WHERE pm.proyeccion_id = pr.id AND pm.seccion_id = s.id AND pm.eliminada = 0
            )
          )
        )
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

    // El generador evita solo traslapes totales; los parciales (T2↔semestre)
    // quedan permitidos y se avisan en la UI.
    const rivales = lapsosTotales(tipo, trimestre);
    const entries = await cargarEntries(periodo, rivales);

    // Slots en que cada profesor NO está disponible (tabla = bloqueos).
    const dispRows = await query<any[]>(
      `SELECT profesor_id, dia_semana,
              TIME_FORMAT(hora_inicio, '%H:%i:%s') AS hora_inicio,
              TIME_FORMAT(hora_fin, '%H:%i:%s') AS hora_fin
       FROM profesor_disponibilidad`
    );
    const bloqueosPorProf = new Map<number, Map<number, { hi: string; hf: string }[]>>();
    for (const r of dispRows) {
      const porDia = bloqueosPorProf.get(Number(r.profesor_id)) ?? new Map();
      const arr = porDia.get(Number(r.dia_semana)) ?? [];
      arr.push({ hi: String(r.hora_inicio), hf: String(r.hora_fin) });
      porDia.set(Number(r.dia_semana), arr);
      bloqueosPorProf.set(Number(r.profesor_id), porDia);
    }
    // true si el profesor marcó ese slot (o uno traslapado) como no disponible
    const profBloqueado = (
      profId: number | null,
      dia: number,
      hi: string,
      hf: string
    ): boolean => {
      if (profId === null) return false;
      const rs = bloqueosPorProf.get(profId)?.get(dia);
      return !!rs?.some((r) => r.hi < hf && r.hf > hi);
    };

    // Reglas de generación automática configurables
    const cfgRows = await query<any[]>(
      'SELECT min_horas_bloque, max_horas_dia FROM horario_config WHERE id = 1'
    );
    const minBloque = Math.max(1, Number(cfgRows[0]?.min_horas_bloque) || 2);
    const maxDia = Math.max(minBloque, Number(cfgRows[0]?.max_horas_dia) || 3);
    const aulas = await cargarAulasActivas();
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
          if (
            !conflictoEn(entries, dia, b.hora_inicio, b.hora_fin, { seccion_id: u.seccion_id }) &&
            !profBloqueado(u.profesor_id, dia, b.hora_inicio, b.hora_fin)
          )
            libres++;
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
              // Sección y profesor libres en toda la ventana, y el profesor
              // disponible (sin bloqueo de disponibilidad en ese horario)
              let choque = false;
              const ocupadasRun = new Set<number>();
              for (const b of ventana) {
                if (
                  conflictoEn(entries, dia, b.hora_inicio, b.hora_fin, {
                    seccion_id: u.seccion_id,
                    profesor_id: u.profesor_id,
                  }) ||
                  profBloqueado(u.profesor_id, dia, b.hora_inicio, b.hora_fin)
                ) {
                  choque = true;
                  break;
                }
                for (const a of aulasOcupadas(entries, dia, b.hora_inicio, b.hora_fin)) {
                  ocupadasRun.add(a);
                }
              }
              if (choque) continue;
              const aulaId = elegirAula(
                aulas,
                ocupadasRun,
                usoPorAula,
                u.pnf_saga_id,
                u.materia_nombre
              );
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
              : `Sin run de ${minBloque}-${maxDia} bloques libres (choque de aula, sección, profesor o su disponibilidad)`,
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
    return reply
      .status(500)
      .send({ success: false, message: 'Error interno\nNo se pudo generar el horario.' });
  }
}

// POST /api/horarios/entries/resolver-aulas — autosoluciona los conflictos de
// aula del período activo. Por cada par de clases que chocan en el mismo aula
// se conserva el run "mejor ubicado" (materia preferida del aula, PNF dueño,
// run más largo) y el otro run se mueve COMPLETO (misma materia+sección+
// profesor en bloques contiguos del día) a un aula libre, eligiendo primero
// aulas preferidas de la materia, luego las del PNF de la clase y por último
// AULA_REGULAR con balanceo de uso — el mismo orden que usa el generador.
export async function resolverAulasHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const user = request.userPayload!;
    const periodo = await periodoActivo();
    if (!periodo) {
      return reply.send({ success: false, message: 'No hay período académico activo.' });
    }
    const [aulas, rows, bloquesTurno] = await Promise.all([
      cargarAulasActivas(),
      query<any[]>(
        `SELECT e.id, e.tipo_proyeccion, e.trimestre, e.materia_id, e.seccion_id,
                e.profesor_id, e.dia_semana, e.bloque_id, e.aula_id,
                b.turno_id, b.orden, b.es_receso, b.hora_inicio, b.hora_fin,
                pr.pnf_saga_id, m.nombre AS materia_nombre, s.nombre AS seccion_nombre
         FROM horario_entries e
         JOIN turno_bloques b ON b.id = e.bloque_id
         JOIN proyeccion_materias m ON m.id = e.materia_id
         JOIN proyeccion_secciones s ON s.id = e.seccion_id
         JOIN proyecciones pr ON pr.id = m.proyeccion_id
         WHERE e.periodo_academico = ?`,
        [periodo]
      ),
      query<any[]>('SELECT id, turno_id, orden, es_receso FROM turno_bloques'),
    ]);
    const aulaPorId = new Map(aulas.map((a: any) => [Number(a.id), a]));

    // Relación de traslape TOTAL entre lapsos (mismo criterio que la auditoría)
    const total = (x: any, y: any) =>
      lapsosTotales(x.tipo_proyeccion as TipoProyeccion, Number(x.trimestre)).some(
        (l) => l.tipo === y.tipo_proyeccion && l.n === Number(y.trimestre)
      );

    // Bloques no-receso de cada turno ordenados, para expandir runs contiguos.
    const ordenPorTurno = new Map<number, number[]>();
    {
      const porTurno = new Map<number, any[]>();
      for (const b of bloquesTurno) {
        if (b.es_receso) continue;
        const arr = porTurno.get(Number(b.turno_id)) ?? [];
        arr.push(b);
        porTurno.set(Number(b.turno_id), arr);
      }
      for (const [t, arr] of porTurno) {
        ordenPorTurno.set(
          t,
          arr.sort((x, y) => x.orden - y.orden).map((x) => Number(x.id))
        );
      }
    }

    // Grupo agendable: misma materia+sección+profesor ese día y lapso. El run
    // son sus bloques contiguos (sin receso) — lo mismo que mueve aula-grupo.
    const grupoDe = (e: any) =>
      `${e.tipo_proyeccion}|${e.trimestre}|${e.dia_semana}|${e.materia_id}|${e.seccion_id}|${e.profesor_id ?? 'x'}`;
    const porGrupo = new Map<string, Map<number, any>>();
    for (const e of rows) {
      let m = porGrupo.get(grupoDe(e));
      if (!m) porGrupo.set(grupoDe(e), (m = new Map()));
      m.set(Number(e.bloque_id), e);
    }
    const runCache = new Map<number, any[]>();
    const runDe = (entry: any): any[] => {
      const hit = runCache.get(Number(entry.id));
      if (hit) return hit;
      const porBloque = porGrupo.get(grupoDe(entry));
      const orden = ordenPorTurno.get(Number(entry.turno_id)) ?? [];
      const idx = orden.indexOf(Number(entry.bloque_id));
      const run = [entry];
      if (porBloque && idx >= 0) {
        for (let i = idx - 1; i >= 0; i--) {
          const c = porBloque.get(orden[i]);
          if (!c) break;
          run.unshift(c);
        }
        for (let i = idx + 1; i < orden.length; i++) {
          const c = porBloque.get(orden[i]);
          if (!c) break;
          run.push(c);
        }
      }
      for (const c of run) runCache.set(Number(c.id), run);
      return run;
    };

    const matDe = (run: any[]) => normMateria(run[0].materia_nombre);
    const pnfDe = (run: any[]) =>
      run[0].pnf_saga_id != null ? Number(run[0].pnf_saga_id) : null;

    // ¿Está el aula libre en TODOS los slots del run? Solo bloquean las clases
    // de lapsos con traslape total; las parciales/sin relación no estorban.
    const aulaLibrePara = (aulaId: number, run: any[]) => {
      const ids = new Set(run.map((x) => Number(x.id)));
      for (const e of run) {
        for (const o of rows) {
          if (ids.has(Number(o.id))) continue;
          if (Number(o.aula_id) !== aulaId || o.dia_semana !== e.dia_semana) continue;
          if (!total(e, o)) continue;
          if (seTraslapan(e.hora_inicio, e.hora_fin, o.hora_inicio, o.hora_fin)) return false;
        }
      }
      return true;
    };

    const usoPorAula = new Map<number, number>();
    for (const e of rows) {
      const id = Number(e.aula_id);
      usoPorAula.set(id, (usoPorAula.get(id) ?? 0) + 1);
    }

    // Mejor aula libre para el run: preferida de la materia → del PNF →
    // AULA_REGULAR → menos uso → código (mismo orden que elegirAula).
    const aulaPara = (run: any[]): number | null => {
      const mat = matDe(run);
      const pnf = pnfDe(run);
      const libres = aulas.filter((a: any) => aulaLibrePara(Number(a.id), run));
      if (libres.length === 0) return null;
      libres.sort((x: any, y: any) => {
        const mx = x.materias_pref?.has(mat) ? 0 : 1;
        const my = y.materias_pref?.has(mat) ? 0 : 1;
        if (mx !== my) return mx - my;
        const px = pnf != null && Number(x.pnf_saga_id) === pnf ? 0 : 1;
        const py = pnf != null && Number(y.pnf_saga_id) === pnf ? 0 : 1;
        if (px !== py) return px - py;
        const tx = x.tipo === 'AULA_REGULAR' ? 0 : 1;
        const ty = y.tipo === 'AULA_REGULAR' ? 0 : 1;
        if (tx !== ty) return tx - ty;
        const ux = usoPorAula.get(Number(x.id)) ?? 0;
        const uy = usoPorAula.get(Number(y.id)) ?? 0;
        if (ux !== uy) return ux - uy;
        return String(x.codigo).localeCompare(String(y.codigo));
      });
      return Number(libres[0].id);
    };

    // Qué tan "bien ubicado" está un run en su aula actual: la materia la
    // prefiere, es de su PNF, o el run es largo (mover menos bloques).
    const bienUbicado = (run: any[], aulaId: number) => {
      const a = aulaPorId.get(aulaId);
      return (
        (a?.materias_pref?.has(matDe(run)) ? 4 : 0) +
        (pnfDe(run) != null && Number(a?.pnf_saga_id) === pnfDe(run) ? 2 : 0) +
        Math.min(run.length, 9) / 10
      );
    };

    // Primer par de clases que chocan por aula (mismo aula+día, solape real y
    // lapsos de traslape total), saltando los ya marcados como sin solución.
    const trabados = new Set<string>();
    const buscarChoque = (): [any, any] | null => {
      const porSlot = new Map<string, any[]>();
      for (const e of rows) {
        const k = `${e.aula_id}|${e.dia_semana}`;
        const g = porSlot.get(k);
        if (g) g.push(e);
        else porSlot.set(k, [e]);
      }
      for (const g of porSlot.values()) {
        for (let i = 0; i < g.length; i++) {
          for (let j = i + 1; j < g.length; j++) {
            const [a, b] = [g[i], g[j]];
            if (!total(a, b)) continue;
            if (!seTraslapan(a.hora_inicio, a.hora_fin, b.hora_inicio, b.hora_fin)) continue;
            const k = Number(a.id) < Number(b.id) ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
            if (trabados.has(k)) continue;
            return [a, b];
          }
        }
      }
      return null;
    };

    const detalles: string[] = [];
    let movidas = 0;
    let runsMovidos = 0;
    for (let iter = 0; iter < 500; iter++) {
      const par = buscarChoque();
      if (!par) break;
      const [a, b] = par;
      const pk = Number(a.id) < Number(b.id) ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
      const ra = runDe(a);
      const rb = runDe(b);
      if (ra === rb) {
        trabados.add(pk);
        continue;
      }
      const aulaId = Number(a.aula_id);
      const sa = bienUbicado(ra, aulaId);
      const sb = bienUbicado(rb, aulaId);
      // Se mueve el run peor ubicado; en empate, el más corto.
      let candidatos =
        sa === sb
          ? ra.length <= rb.length
            ? [ra, rb]
            : [rb, ra]
          : sa < sb
            ? [ra, rb]
            : [rb, ra];
      if (user.role === 'REGULAR' && user.pnf_saga_id) {
        candidatos = candidatos.filter((r) => pnfDe(r) === Number(user.pnf_saga_id));
      }
      let movido = false;
      for (const r of candidatos) {
        const destino = aulaPara(r);
        if (destino == null) continue;
        const ids = r.map((x) => Number(x.id));
        await query(
          `UPDATE horario_entries SET aula_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
          [destino, ...ids]
        );
        for (const x of r) x.aula_id = destino;
        usoPorAula.set(destino, (usoPorAula.get(destino) ?? 0) + ids.length);
        movidas += ids.length;
        runsMovidos++;
        movido = true;
        break;
      }
      if (movido) {
        // Un movimiento puede liberar el aula que faltaba a un choque trabado.
        trabados.clear();
      } else {
        trabados.add(pk);
        detalles.push(
          `'${a.materia_nombre}' (${a.seccion_nombre}) vs '${b.materia_nombre}' ` +
            `(${b.seccion_nombre}) en ${aulaPorId.get(aulaId)?.codigo ?? aulaId}, ` +
            `${DIAS[a.dia_semana] || a.dia_semana} ${hhmm(a.hora_inicio)}`
        );
      }
    }

    return reply.send({
      success: true,
      message:
        movidas === 0 && detalles.length === 0
          ? 'No había conflictos de aula.'
          : `Se reubicaron ${runsMovidos} bloque(s) de materia (${movidas} clases)` +
            (detalles.length > 0 ? `; ${detalles.length} conflicto(s) quedaron sin aula libre.` : '.'),
      data: { movidas, runs: runsMovidos, sin_solucion: detalles.length, detalles },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply
      .status(500)
      .send({ success: false, message: 'Error interno\nNo se pudieron resolver los conflictos.' });
  }
}
