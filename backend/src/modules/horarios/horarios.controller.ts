import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../db/mysql.js';
import { sagaService } from '../saga/saga.service.js';

const TIPOS_AULA = ['AULA_REGULAR', 'LABORATORIO', 'TALLER', 'AUDITORIO', 'INSTALACION_DEPORTIVA', 'SALA_LECTURA'] as const;
const HORA_RE = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// Resuelve el nombre de un PNF: primero en la tabla local `pnf`, luego en SAGA.
async function resolvePnfNombre(pnfSagaId: number | null): Promise<string | null> {
  if (!pnfSagaId) return null;
  const local = await query<any[]>('SELECT nombre FROM pnf WHERE saga_id = ? LIMIT 1', [pnfSagaId]);
  if (local.length > 0) return local[0].nombre;
  const programas = await sagaService.getProgramas();
  const found = programas?.find((p) => Number(p.id) === Number(pnfSagaId));
  return found ? found.programa : null;
}

// ---------------------------------------------------------------------------
// AULAS
// ---------------------------------------------------------------------------

// GET /api/horarios/aulas
export async function listAulasHandler(_request: FastifyRequest, reply: FastifyReply) {
  try {
    const aulas = await query<any[]>(
      `SELECT a.*, (SELECT COUNT(*) FROM horario_entries e WHERE e.aula_id = a.id) AS en_uso
       FROM aulas a ORDER BY a.codigo`
    );
    return reply.send({ success: true, data: aulas });
  } catch (error: any) {
    return reply.status(500).send({ success: false, message: 'Error cargando aulas.' });
  }
}

interface AulaBody {
  codigo?: string;
  nombre?: string;
  capacidad?: number;
  ubicacion?: string | null;
  tipo?: string;
  pnf_saga_id?: number | null;
  activa?: boolean | number;
}

function validarAula(body: AulaBody): string | null {
  if (!body.codigo?.trim()) return 'El código del aula es obligatorio.';
  if (!body.nombre?.trim()) return 'El nombre del aula es obligatorio.';
  if (body.tipo && !TIPOS_AULA.includes(body.tipo as any)) return 'Tipo de aula inválido.';
  return null;
}

// POST /api/horarios/aulas
export async function createAulaHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as AulaBody;
  const error = validarAula(body);
  if (error) return reply.status(400).send({ success: false, message: error });
  try {
    const pnfId = body.pnf_saga_id ? Number(body.pnf_saga_id) : null;
    const pnfNombre = await resolvePnfNombre(pnfId);
    const r = await query<any>(
      'INSERT INTO aulas (codigo, nombre, capacidad, ubicacion, tipo, pnf_saga_id, pnf_nombre, activa) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        body.codigo!.trim().toUpperCase(),
        body.nombre!.trim(),
        body.capacidad ?? 30,
        body.ubicacion?.trim() || null,
        body.tipo || 'AULA_REGULAR',
        pnfId,
        pnfNombre,
        body.activa === undefined ? 1 : body.activa ? 1 : 0,
      ]
    );
    return reply.send({ success: true, message: 'Aula creada.', data: { id: r.insertId } });
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') {
      return reply.status(409).send({ success: false, message: `Ya existe un aula con el código '${body.codigo}'.` });
    }
    return reply.status(500).send({ success: false, message: 'Error creando el aula.' });
  }
}

// PUT /api/horarios/aulas/:id
export async function updateAulaHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as AulaBody;
  const error = validarAula(body);
  if (error) return reply.status(400).send({ success: false, message: error });
  try {
    const pnfId = body.pnf_saga_id ? Number(body.pnf_saga_id) : null;
    const pnfNombre = await resolvePnfNombre(pnfId);
    await query(
      'UPDATE aulas SET codigo = ?, nombre = ?, capacidad = ?, ubicacion = ?, tipo = ?, pnf_saga_id = ?, pnf_nombre = ?, activa = ? WHERE id = ?',
      [
        body.codigo!.trim().toUpperCase(),
        body.nombre!.trim(),
        body.capacidad ?? 30,
        body.ubicacion?.trim() || null,
        body.tipo || 'AULA_REGULAR',
        pnfId,
        pnfNombre,
        body.activa === undefined ? 1 : body.activa ? 1 : 0,
        Number(id),
      ]
    );
    return reply.send({ success: true, message: 'Aula actualizada.' });
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') {
      return reply.status(409).send({ success: false, message: `Ya existe un aula con el código '${body.codigo}'.` });
    }
    return reply.status(500).send({ success: false, message: 'Error actualizando el aula.' });
  }
}

// DELETE /api/horarios/aulas/:id — borrado físico si no tiene clases; si las tiene, se desactiva
export async function deleteAulaHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  try {
    const uso = await query<any[]>(
      'SELECT COUNT(*) AS n FROM horario_entries WHERE aula_id = ?',
      [Number(id)]
    );
    if (uso[0].n > 0) {
      await query('UPDATE aulas SET activa = 0 WHERE id = ?', [Number(id)]);
      return reply.send({
        success: true,
        message: 'El aula tiene clases agendadas; se desactivó en lugar de eliminarse.',
      });
    }
    await query('DELETE FROM aulas WHERE id = ?', [Number(id)]);
    return reply.send({ success: true, message: 'Aula eliminada.' });
  } catch (e: any) {
    return reply.status(500).send({ success: false, message: 'Error eliminando el aula.' });
  }
}

// ---------------------------------------------------------------------------
// PNFs (catálogo completo del sistema: SAGA + los ya referenciados en la app)
// ---------------------------------------------------------------------------

// GET /api/horarios/pnfs
export async function listPnfsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const map = new Map<number, string>();
    try {
      const programas = await sagaService.getProgramas();
      for (const p of programas ?? []) map.set(Number(p.id), p.programa);
    } catch {
      // SAGA caído: se usan solo los PNFs referenciados localmente
    }
    const locales = await query<any[]>(
      `SELECT DISTINCT pnf_saga_id AS id, pnf_nombre AS nombre FROM profesores WHERE pnf_saga_id IS NOT NULL
       UNION
       SELECT DISTINCT pnf_saga_id, pnf_nombre FROM proyecciones WHERE pnf_saga_id IS NOT NULL
       UNION
       SELECT DISTINCT pnf_saga_id, pnf_nombre FROM aulas WHERE pnf_saga_id IS NOT NULL`
    );
    for (const l of locales) if (l.id != null && !map.has(l.id)) map.set(l.id, l.nombre || `PNF #${l.id}`);

    // Colores identificativos persistidos localmente por PNF
    const colores = await query<any[]>('SELECT saga_id, color FROM pnf WHERE color IS NOT NULL');
    const colorMap = new Map<number, string>();
    for (const c of colores) if (c.saga_id != null && c.color) colorMap.set(Number(c.saga_id), c.color);

    const data = [...map.entries()]
      .map(([id, nombre]) => ({ id, nombre, color: colorMap.get(id) ?? null }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    return reply.send({ success: true, data });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error cargando PNFs.' });
  }
}

// PUT /api/horarios/pnfs/:sagaId/color
// Asigna (o quita, con color null) el color identificativo de un PNF.
export async function updatePnfColorHandler(request: FastifyRequest, reply: FastifyReply) {
  const { sagaId } = request.params as { sagaId: string };
  const body = request.body as { nombre?: string; color?: string | null };
  const pnfSagaId = Number(sagaId);
  if (isNaN(pnfSagaId)) {
    return reply.status(400).send({ success: false, message: 'sagaId inválido.' });
  }

  // Validar formato #RRGGBB; null/'' vacío = sin color
  const color = body.color?.trim() || null;
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return reply.status(400).send({ success: false, message: 'Color inválido. Use formato #RRGGBB.' });
  }

  try {
    // El color es el único atributo local que se configura aquí; el nombre se
    // mantiene como cache (nunca se pisa con vacío).
    await query(
      `INSERT INTO pnf (saga_id, nombre, color) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         color = VALUES(color),
         nombre = IF(nombre = '' AND VALUES(nombre) != '', VALUES(nombre), nombre)`,
      [pnfSagaId, body.nombre?.trim() || `PNF #${pnfSagaId}`, color]
    );
    return reply.send({ success: true, data: { id: pnfSagaId, color }, message: 'Color del PNF actualizado.' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error guardando el color del PNF.' });
  }
}

// ---------------------------------------------------------------------------
// TURNOS Y BLOQUES
// ---------------------------------------------------------------------------

// Sincroniza los turnos de la API SAGA hacia la tabla local (upsert por saga_id)
async function syncTurnosDesdeSaga(): Promise<void> {
  const sagaTurnos = await sagaService.getTurnos();
  if (!sagaTurnos || sagaTurnos.length === 0) return;
  for (const t of sagaTurnos) {
    await query(
      `INSERT INTO turnos (saga_id, nombre) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)`,
      [t.id, t.turno]
    );
  }
}

// GET /api/horarios/turnos — sincroniza con SAGA (si está disponible) y devuelve
// cada turno con sus bloques horarios ordenados
export async function listTurnosHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    try {
      await syncTurnosDesdeSaga();
    } catch {
      // SAGA caído: se devuelven solo los turnos locales
    }
    const turnos = await query<any[]>(
      'SELECT id, saga_id, nombre, dias_semana, activo FROM turnos ORDER BY nombre'
    );
    const bloques = await query<any[]>(
      'SELECT id, turno_id, orden, hora_inicio, hora_fin, es_receso FROM turno_bloques ORDER BY turno_id, orden'
    );
    const porTurno = new Map<number, any[]>();
    for (const b of bloques) {
      const arr = porTurno.get(b.turno_id) || [];
      arr.push(b);
      porTurno.set(b.turno_id, arr);
    }
    return reply.send({
      success: true,
      data: turnos.map((t) => ({ ...t, bloques: porTurno.get(t.id) || [] })),
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error cargando turnos.' });
  }
}

// POST /api/horarios/turnos — turno local (saga_id NULL)
export async function createTurnoHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as { nombre?: string; dias_semana?: string };
  if (!body.nombre?.trim()) {
    return reply.status(400).send({ success: false, message: 'El nombre del turno es obligatorio.' });
  }
  const dias = validarDias(body.dias_semana);
  if (dias === null) {
    return reply.status(400).send({ success: false, message: 'dias_semana inválido (CSV de 1-7).' });
  }
  try {
    const r = await query<any>(
      'INSERT INTO turnos (saga_id, nombre, dias_semana) VALUES (NULL, ?, ?)',
      [body.nombre.trim(), dias]
    );
    return reply.send({ success: true, message: 'Turno creado.', data: { id: r.insertId } });
  } catch (e: any) {
    return reply.status(500).send({ success: false, message: 'Error creando el turno.' });
  }
}

function validarDias(csv: string | undefined): string | null {
  if (csv === undefined) return '1,2,3,4,5';
  const dias = csv
    .split(',')
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => d >= 1 && d <= 7);
  if (dias.length === 0) return null;
  return [...new Set(dias)].sort((a, b) => a - b).join(',');
}

// PUT /api/horarios/turnos/:id — nombre, dias_semana, activo
export async function updateTurnoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as { nombre?: string; dias_semana?: string; activo?: boolean | number };
  if (body.nombre !== undefined && !body.nombre.trim()) {
    return reply.status(400).send({ success: false, message: 'El nombre del turno no puede quedar vacío.' });
  }
  const dias = validarDias(body.dias_semana);
  if (dias === null) {
    return reply.status(400).send({ success: false, message: 'dias_semana inválido (CSV de 1-7).' });
  }
  try {
    await query(
      'UPDATE turnos SET nombre = COALESCE(?, nombre), dias_semana = ?, activo = COALESCE(?, activo) WHERE id = ?',
      [body.nombre?.trim() ?? null, dias, body.activo === undefined ? null : body.activo ? 1 : 0, Number(id)]
    );
    return reply.send({ success: true, message: 'Turno actualizado.' });
  } catch (e: any) {
    return reply.status(500).send({ success: false, message: 'Error actualizando el turno.' });
  }
}

// DELETE /api/horarios/turnos/:id — solo turnos locales (saga_id NULL)
export async function deleteTurnoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  try {
    const t = await query<any[]>('SELECT saga_id FROM turnos WHERE id = ?', [Number(id)]);
    if (t.length === 0) return reply.status(404).send({ success: false, message: 'Turno no encontrado.' });
    if (t[0].saga_id !== null) {
      return reply.status(400).send({
        success: false,
        message: 'Los turnos provenientes de SAGA no se pueden eliminar (solo desactivar).',
      });
    }
    await query('DELETE FROM turnos WHERE id = ?', [Number(id)]);
    return reply.send({ success: true, message: 'Turno eliminado.' });
  } catch (e: any) {
    return reply.status(500).send({ success: false, message: 'Error eliminando el turno.' });
  }
}

interface BloqueBody {
  hora_inicio?: string;
  hora_fin?: string;
  es_receso?: boolean | number;
}

// PUT /api/horarios/turnos/:id/bloques — reemplazo en lote de la lista ordenada
export async function replaceBloquesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as { bloques?: BloqueBody[] };
  const bloques = body.bloques;
  if (!Array.isArray(bloques)) {
    return reply.status(400).send({ success: false, message: 'Se esperaba un array de bloques.' });
  }
  for (const [i, b] of bloques.entries()) {
    if (!b.hora_inicio || !b.hora_fin || !HORA_RE.test(b.hora_inicio) || !HORA_RE.test(b.hora_fin)) {
      return reply.status(400).send({
        success: false,
        message: `Bloque ${i + 1}: hora_inicio y hora_fin son obligatorios en formato HH:MM.`,
      });
    }
    if (b.hora_inicio >= b.hora_fin) {
      return reply.status(400).send({
        success: false,
        message: `Bloque ${i + 1}: la hora de inicio debe ser menor que la de fin.`,
      });
    }
  }
  try {
    const t = await query<any[]>('SELECT id FROM turnos WHERE id = ?', [Number(id)]);
    if (t.length === 0) return reply.status(404).send({ success: false, message: 'Turno no encontrado.' });

    // Si hay clases agendadas en bloques que van a desaparecer, no permitir el reemplazo
    const uso = await query<any[]>(
      `SELECT COUNT(*) AS n FROM horario_entries e
       JOIN turno_bloques b ON b.id = e.bloque_id WHERE b.turno_id = ?`,
      [Number(id)]
    );
    if (uso[0].n > 0) {
      const clases = await query<any[]>(
        `SELECT e.id, m.nombre AS materia_nombre, s.nombre AS seccion_nombre,
                e.dia_semana, b.hora_inicio, b.hora_fin, a.codigo AS aula_codigo
         FROM horario_entries e
         JOIN turno_bloques b ON b.id = e.bloque_id
         JOIN proyeccion_materias m ON m.id = e.materia_id
         JOIN proyeccion_secciones s ON s.id = e.seccion_id
         JOIN aulas a ON a.id = e.aula_id
         WHERE b.turno_id = ?
         ORDER BY e.dia_semana, b.orden
         LIMIT 100`,
        [Number(id)]
      );
      return reply.status(409).send({
        success: false,
        message: 'Este turno tiene clases agendadas en sus bloques. Desagenda esas clases antes de modificar los bloques.',
        data: { total: uso[0].n, clases },
      });
    }

    await query('DELETE FROM turno_bloques WHERE turno_id = ?', [Number(id)]);
    for (const [i, b] of bloques.entries()) {
      await query(
        'INSERT INTO turno_bloques (turno_id, orden, hora_inicio, hora_fin, es_receso) VALUES (?, ?, ?, ?, ?)',
        [Number(id), i + 1, b.hora_inicio, b.hora_fin, b.es_receso ? 1 : 0]
      );
    }
    return reply.send({ success: true, message: 'Bloques actualizados.' });
  } catch (e: any) {
    request.log.error(e);
    return reply.status(500).send({ success: false, message: 'Error guardando los bloques.' });
  }
}

// DELETE /api/horarios/turnos/:id/entries — desagenda todas las clases del turno
export async function deleteTurnoEntriesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  try {
    const r = await query<any>(
      `DELETE e FROM horario_entries e
       JOIN turno_bloques b ON b.id = e.bloque_id WHERE b.turno_id = ?`,
      [Number(id)]
    );
    const n = r?.affectedRows ?? 0;
    return reply.send({
      success: true,
      message: `${n} clase${n === 1 ? '' : 's'} desagendada${n === 1 ? '' : 's'}.`,
      data: { eliminadas: n },
    });
  } catch (e: any) {
    request.log.error(e);
    return reply.status(500).send({ success: false, message: 'Error desagendando las clases.' });
  }
}

// GET /api/horarios/config — reglas de generación automática (cualquier usuario)
export async function getConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const rows = await query<any[]>(
      'SELECT min_horas_bloque, max_horas_dia FROM horario_config WHERE id = 1'
    );
    const c = rows[0] ?? { min_horas_bloque: 2, max_horas_dia: 3 };
    return reply.send({ success: true, data: c });
  } catch (e: any) {
    request.log.error(e);
    return reply.status(500).send({ success: false, message: 'Error cargando la configuración.' });
  }
}

// PUT /api/horarios/config — actualiza las reglas de generación automática
export async function updateConfigHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as { min_horas_bloque?: number; max_horas_dia?: number };
  const min = Number(body.min_horas_bloque);
  const max = Number(body.max_horas_dia);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < 1) {
    return reply.status(400).send({
      success: false,
      message: 'Los valores deben ser enteros mayores o iguales a 1.',
    });
  }
  if (min > max) {
    return reply.status(400).send({
      success: false,
      message: 'Las horas mínimas por bloque no pueden superar el máximo por día.',
    });
  }
  try {
    await query(
      'INSERT INTO horario_config (id, min_horas_bloque, max_horas_dia) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE min_horas_bloque = VALUES(min_horas_bloque), max_horas_dia = VALUES(max_horas_dia)',
      [min, max]
    );
    return reply.send({ success: true, message: 'Configuración de horarios actualizada.' });
  } catch (e: any) {
    request.log.error(e);
    return reply.status(500).send({ success: false, message: 'Error guardando la configuración.' });
  }
}
