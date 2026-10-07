import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../db/mysql.js';
import { sagaService } from '../saga/saga.service.js';
import fs from 'fs';
import path from 'path';

interface ProfesorBody {
  cedula?: string;
  nombres?: string;
  apellidos?: string;
  nacionalidad?: string;
  sexo?: string;
  email?: string;
  telefono?: string;
  pnf_saga_id?: number | null;
  pnf_nombre?: string;
  tipo_contrato_id?: number | null;
}

interface TipoContratoBody {
  nombre?: string;
  descripcion?: string;
  horas_semanales?: number;
  activo?: boolean;
}

const MAX_FOTO_BYTES = 2 * 1024 * 1024; // 2 MB de foto decodificada
const FOTOS_DIR = path.join(process.cwd(), 'public', 'profesores');

function normalizeCedula(raw: any): string {
  return String(raw ?? '')
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase();
}

function normalizeNacionalidad(raw: any): string {
  const n = String(raw ?? 'V').trim().toUpperCase();
  return n.length > 0 ? n.charAt(0) : 'V';
}

function normalizeSexo(raw: any): string | null {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return null;
  if (s.startsWith('F')) return 'F';
  if (s.startsWith('M')) return 'M';
  return s.charAt(0);
}

// Resuelve el nombre de un PNF: primero en la tabla local `pnf`, luego en SAGA.
async function resolvePnfNombre(pnfSagaId: number | null): Promise<string> {
  if (!pnfSagaId) return '';
  const local = await query<any[]>('SELECT nombre FROM pnf WHERE saga_id = ? LIMIT 1', [pnfSagaId]);
  if (local.length > 0) return local[0].nombre;
  const programas = await sagaService.getProgramas();
  const found = programas?.find((p) => Number(p.id) === Number(pnfSagaId));
  return found ? found.programa : '';
}

// Sincroniza el catálogo de tipos de contrato desde SAGA (/dedicaciones).
// Retorna la cantidad sincronizada y si el endpoint respondió.
async function syncTiposContratoDesdeSaga(): Promise<{ synced: boolean; count: number }> {
  const dedicaciones = await sagaService.getDedicaciones();
  if (!dedicaciones || !Array.isArray(dedicaciones) || dedicaciones.length === 0) {
    return { synced: false, count: 0 };
  }

  let count = 0;
  for (const d of dedicaciones) {
    const sagaId = Number(d.id ?? d.dedicacion_id ?? d.codigo);
    if (!sagaId) continue;
    const nombre = String(d.dedicacion ?? d.nombre ?? d.descripcion ?? d.name ?? `Dedicación ${sagaId}`).trim();
    const descripcion = d.descripcion && String(d.descripcion) !== nombre ? String(d.descripcion) : null;
    const horas = Number(d.horas ?? d.horas_semanales ?? d.horasSemanales ?? 40) || 40;

    const existing = await query<any[]>('SELECT id FROM tipos_contrato WHERE saga_id = ? LIMIT 1', [sagaId]);
    if (existing.length > 0) {
      await query('UPDATE tipos_contrato SET nombre = ?, descripcion = ? WHERE id = ?', [nombre, descripcion, existing[0].id]);
    } else {
      await query('INSERT INTO tipos_contrato (saga_id, nombre, descripcion, horas_semanales) VALUES (?, ?, ?, ?)', [
        sagaId,
        nombre,
        descripcion,
        horas,
      ]);
    }
    count++;
  }
  return { synced: true, count };
}

// Garantiza que exista un tipo_contrato local para un dedicacion_id de SAGA;
// si no existe, crea un placeholder editable y retorna el id local.
async function ensureTipoContrato(sagaId: number, cache: Map<number, number>): Promise<number | null> {
  if (!sagaId) return null;
  if (cache.has(sagaId)) return cache.get(sagaId)!;

  const existing = await query<any[]>('SELECT id FROM tipos_contrato WHERE saga_id = ? LIMIT 1', [sagaId]);
  if (existing.length > 0) {
    cache.set(sagaId, existing[0].id);
    return existing[0].id;
  }

  const insert: any = await query(
    'INSERT INTO tipos_contrato (saga_id, nombre, descripcion, horas_semanales) VALUES (?, ?, ?, ?)',
    [sagaId, `Dedicación SAGA #${sagaId}`, 'Importado automáticamente desde SAGA. Edite el nombre y las horas.', 40]
  );
  cache.set(sagaId, insert.insertId);
  return insert.insertId;
}

// ---------------------------------------------------------------------------
// PROFESORES
// ---------------------------------------------------------------------------

export async function listProfesoresHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.userPayload!;
  const { incluir_inactivos, pnf_saga_id, search, para_asignacion } = request.query as {
    incluir_inactivos?: string;
    pnf_saga_id?: string;
    search?: string;
    para_asignacion?: string;
  };

  try {
    let sql = `
      SELECT p.*, tc.nombre AS tipo_contrato_nombre, tc.horas_semanales AS tipo_contrato_horas
      FROM profesores p
      LEFT JOIN tipos_contrato tc ON p.tipo_contrato_id = tc.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (incluir_inactivos !== '1' && incluir_inactivos !== 'true') {
      conditions.push('p.activo = 1');
    }

    // Coordinadores (REGULAR) solo ven profesores de su PNF asignado,
    // salvo cuando el listado se usa para asignar materias (docencia multi-PNF)
    const esParaAsignacion = para_asignacion === '1' || para_asignacion === 'true';
    if (user.role === 'REGULAR' && user.pnf_saga_id && !esParaAsignacion) {
      conditions.push('p.pnf_saga_id = ?');
      params.push(user.pnf_saga_id);
    } else if (pnf_saga_id) {
      conditions.push('p.pnf_saga_id = ?');
      params.push(Number(pnf_saga_id));
    }

    if (search) {
      conditions.push('(p.nombres LIKE ? OR p.apellidos LIKE ? OR p.cedula LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY p.apellidos ASC, p.nombres ASC';

    const profesores = await query(sql, params);
    return reply.send({ success: true, data: profesores });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error listando profesores.' });
  }
}

export async function getProfesorHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };

  try {
    const rows = await query<any[]>(
      `SELECT p.*, tc.nombre AS tipo_contrato_nombre, tc.horas_semanales AS tipo_contrato_horas
       FROM profesores p
       LEFT JOIN tipos_contrato tc ON p.tipo_contrato_id = tc.id
       WHERE p.id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return reply.status(404).send({ success: false, message: 'Profesor no encontrado.' });
    }
    return reply.send({ success: true, data: rows[0] });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error recuperando profesor.' });
  }
}

export async function createProfesorHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.userPayload!;
  const body = request.body as ProfesorBody;

  const cedula = normalizeCedula(body.cedula);
  if (!cedula || !body.nombres?.trim() || !body.apellidos?.trim()) {
    return reply.status(400).send({
      success: false,
      message: 'Cédula, nombres y apellidos son obligatorios.',
    });
  }

  try {
    const existing = await query<any[]>('SELECT id FROM profesores WHERE cedula = ? LIMIT 1', [cedula]);
    if (existing.length > 0) {
      return reply.status(400).send({
        success: false,
        message: `Ya existe un profesor registrado con la cédula ${cedula}.`,
      });
    }

    // Un coordinador solo puede inscribir profesores en su propio PNF
    const pnfSagaId = user.role === 'REGULAR' && user.pnf_saga_id ? user.pnf_saga_id : body.pnf_saga_id || null;
    const pnfNombre = body.pnf_nombre?.trim() || (await resolvePnfNombre(pnfSagaId ? Number(pnfSagaId) : null));

    const insert: any = await query(
      `INSERT INTO profesores
       (cedula, nombres, apellidos, nacionalidad, sexo, email, telefono, pnf_saga_id, pnf_nombre, tipo_contrato_id, origen, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LOCAL', 1)`,
      [
        cedula,
        body.nombres.trim(),
        body.apellidos.trim(),
        normalizeNacionalidad(body.nacionalidad),
        normalizeSexo(body.sexo),
        body.email?.trim() || null,
        body.telefono?.trim() || null,
        pnfSagaId,
        pnfNombre,
        body.tipo_contrato_id || null,
      ]
    );

    return reply.status(201).send({
      success: true,
      message: 'Profesor registrado exitosamente.',
      data: { id: insert.insertId },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: `Error registrando profesor: ${error.message}` });
  }
}

export async function updateProfesorHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.userPayload!;
  const { id } = request.params as { id: string };
  const body = request.body as ProfesorBody;

  try {
    const rows = await query<any[]>('SELECT * FROM profesores WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return reply.status(404).send({ success: false, message: 'Profesor no encontrado.' });
    }
    const current = rows[0];

    const cedula = body.cedula !== undefined ? normalizeCedula(body.cedula) : current.cedula;
    if (!cedula) {
      return reply.status(400).send({ success: false, message: 'La cédula no puede quedar vacía.' });
    }

    const dup = await query<any[]>('SELECT id FROM profesores WHERE cedula = ? AND id != ? LIMIT 1', [cedula, id]);
    if (dup.length > 0) {
      return reply.status(400).send({ success: false, message: `La cédula ${cedula} ya está asignada a otro profesor.` });
    }

    // Un coordinador no puede reasignar el profesor fuera de su PNF
    let pnfSagaId = body.pnf_saga_id !== undefined ? body.pnf_saga_id : current.pnf_saga_id;
    if (user.role === 'REGULAR' && user.pnf_saga_id) {
      pnfSagaId = user.pnf_saga_id;
    }
    const pnfNombre =
      body.pnf_nombre?.trim() ||
      (pnfSagaId !== current.pnf_saga_id ? await resolvePnfNombre(Number(pnfSagaId) || null) : current.pnf_nombre);

    await query(
      `UPDATE profesores SET
        cedula = ?, nombres = ?, apellidos = ?, nacionalidad = ?, sexo = ?,
        email = ?, telefono = ?, pnf_saga_id = ?, pnf_nombre = ?, tipo_contrato_id = ?
       WHERE id = ?`,
      [
        cedula,
        body.nombres?.trim() || current.nombres,
        body.apellidos?.trim() || current.apellidos,
        body.nacionalidad !== undefined ? normalizeNacionalidad(body.nacionalidad) : current.nacionalidad,
        body.sexo !== undefined ? normalizeSexo(body.sexo) : current.sexo,
        body.email !== undefined ? body.email?.trim() || null : current.email,
        body.telefono !== undefined ? body.telefono?.trim() || null : current.telefono,
        pnfSagaId,
        pnfNombre,
        body.tipo_contrato_id !== undefined ? body.tipo_contrato_id : current.tipo_contrato_id,
        id,
      ]
    );

    return reply.send({ success: true, message: 'Profesor actualizado exitosamente.' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: `Error actualizando profesor: ${error.message}` });
  }
}

// Soft delete: activa/desactiva al profesor sin borrar el registro
export async function toggleActivoProfesorHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };

  try {
    const rows = await query<any[]>('SELECT id, activo FROM profesores WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return reply.status(404).send({ success: false, message: 'Profesor no encontrado.' });
    }

    const nuevoEstado = rows[0].activo ? 0 : 1;
    await query('UPDATE profesores SET activo = ? WHERE id = ?', [nuevoEstado, id]);

    return reply.send({
      success: true,
      message: nuevoEstado ? 'Profesor reactivado exitosamente.' : 'Profesor desactivado exitosamente.',
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error cambiando estado del profesor.' });
  }
}

// Foto del profesor: se recibe como data URL base64 para no requerir @fastify/multipart
export async function uploadFotoProfesorHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { foto } = request.body as { foto?: string };

  if (!foto) {
    return reply.status(400).send({ success: false, message: 'No se recibió ninguna imagen.' });
  }

  const match = foto.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/s);
  if (!match) {
    return reply.status(400).send({
      success: false,
      message: 'Formato de imagen no válido. Use JPG, PNG o WEBP.',
    });
  }

  const ext = match[1] === 'jpg' ? 'jpeg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');

  if (buffer.length === 0 || buffer.length > MAX_FOTO_BYTES) {
    return reply.status(400).send({
      success: false,
      message: 'La imagen excede el tamaño máximo permitido de 2 MB.',
    });
  }

  try {
    const rows = await query<any[]>('SELECT id, foto_url FROM profesores WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return reply.status(404).send({ success: false, message: 'Profesor no encontrado.' });
    }

    if (!fs.existsSync(FOTOS_DIR)) {
      fs.mkdirSync(FOTOS_DIR, { recursive: true });
    }

    const filename = `prof-${id}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(FOTOS_DIR, filename), buffer);

    // Eliminar foto anterior si era un archivo local gestionado por la app
    const prevUrl = rows[0].foto_url as string | null;
    if (prevUrl && prevUrl.startsWith('/public/profesores/')) {
      const prevPath = path.join(process.cwd(), 'public', 'profesores', path.basename(prevUrl));
      if (fs.existsSync(prevPath)) fs.unlinkSync(prevPath);
    }

    const fotoUrl = `/public/profesores/${filename}`;
    await query('UPDATE profesores SET foto_url = ? WHERE id = ?', [fotoUrl, id]);

    return reply.send({ success: true, message: 'Foto actualizada exitosamente.', data: { foto_url: fotoUrl } });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error guardando la foto del profesor.' });
  }
}

export async function deleteFotoProfesorHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };

  try {
    const rows = await query<any[]>('SELECT id, foto_url FROM profesores WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return reply.status(404).send({ success: false, message: 'Profesor no encontrado.' });
    }

    const prevUrl = rows[0].foto_url as string | null;
    if (prevUrl && prevUrl.startsWith('/public/profesores/')) {
      const prevPath = path.join(process.cwd(), 'public', 'profesores', path.basename(prevUrl));
      if (fs.existsSync(prevPath)) fs.unlinkSync(prevPath);
    }

    await query('UPDATE profesores SET foto_url = NULL WHERE id = ?', [id]);
    return reply.send({ success: true, message: 'Foto eliminada. Se mostrará el placeholder según el sexo.' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error eliminando la foto.' });
  }
}

// Sincronización de profesores con la API SAGA (upsert por cédula)
export async function syncProfesoresHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const teachers = await sagaService.getTeachers();
    if (!teachers || !Array.isArray(teachers)) {
      return reply.status(503).send({
        success: false,
        message: 'La API SAGA no está disponible o no retornó profesores. Verifique la conexión.',
      });
    }

    // Mapa saga_id -> nombre para resolver pnf_nombre (programa_id del profesor)
    const pnfMap = new Map<number, string>();
    const pnfLocales = await query<any[]>('SELECT saga_id, nombre FROM pnf');
    pnfLocales.forEach((p) => pnfMap.set(p.saga_id, p.nombre));
    if (pnfMap.size === 0) {
      const programas = await sagaService.getProgramas();
      programas?.forEach((p) => pnfMap.set(p.id, p.programa));
    }

    // Sincronizar catálogo de dedicaciones si el endpoint existe en la API
    await syncTiposContratoDesdeSaga();
    const tiposCache = new Map<number, number>();
    const tipos = await query<any[]>('SELECT id, saga_id FROM tipos_contrato WHERE saga_id IS NOT NULL');
    tipos.forEach((t) => tiposCache.set(t.saga_id, t.id));

    let nuevos = 0;
    let actualizados = 0;
    let omitidos = 0;

    for (const t of teachers) {
      const cedula = normalizeCedula(t.CedulaProfesor);
      if (!cedula) {
        omitidos++;
        continue;
      }

      const tipoContratoId = t.dedicacion_id ? await ensureTipoContrato(Number(t.dedicacion_id), tiposCache) : null;
      const pnfSagaId = t.programa_id ? Number(t.programa_id) : null;
      const pnfNombre = pnfSagaId ? pnfMap.get(pnfSagaId) || '' : null;
      const nacionalidad = t.Nacionalidad ? normalizeNacionalidad(t.Nacionalidad) : 'V';
      const sexo = normalizeSexo(t.sexo);
      const email = t.email1 || t.email2 || null;
      const telefono = t.tlfMovil || null;

      const existing = await query<any[]>('SELECT id, activo, pnf_saga_id, tipo_contrato_id FROM profesores WHERE cedula = ? LIMIT 1', [
        cedula,
      ]);

      if (existing.length > 0) {
        // Actualizar datos gestionados por SAGA. El PNF/contrato manual se respeta
        // si SAGA no reporta valor (null) para ese profesor.
        await query(
          `UPDATE profesores SET
            saga_id = ?, nombres = ?, apellidos = ?, sexo = ?, email = ?, telefono = ?,
            nacionalidad = ?, origen = 'SAGA', ultima_sincronizacion = NOW(),
            pnf_saga_id = COALESCE(?, pnf_saga_id),
            pnf_nombre = COALESCE(?, pnf_nombre),
            tipo_contrato_id = COALESCE(?, tipo_contrato_id)
           WHERE id = ?`,
          [
            t.id || null,
            t.NombreProfesor?.trim() || 'Sin nombre',
            t.ApellidoProfesor?.trim() || 'Sin apellido',
            sexo,
            email,
            telefono,
            nacionalidad,
            pnfSagaId,
            pnfNombre,
            tipoContratoId,
            existing[0].id,
          ]
        );
        actualizados++;
      } else {
        await query(
          `INSERT INTO profesores
           (saga_id, cedula, nombres, apellidos, nacionalidad, sexo, email, telefono, pnf_saga_id, pnf_nombre, tipo_contrato_id, origen, activo, ultima_sincronizacion)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SAGA', 1, NOW())`,
          [
            t.id || null,
            cedula,
            t.NombreProfesor?.trim() || 'Sin nombre',
            t.ApellidoProfesor?.trim() || 'Sin apellido',
            nacionalidad,
            sexo,
            email,
            telefono,
            pnfSagaId,
            pnfNombre,
            tipoContratoId,
          ]
        );
        nuevos++;
      }
    }

    return reply.send({
      success: true,
      message: `Sincronización completada: ${nuevos} nuevos, ${actualizados} actualizados.`,
      data: { total_saga: teachers.length, nuevos, actualizados, omitidos },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: `Error sincronizando profesores: ${error.message}` });
  }
}

// ---------------------------------------------------------------------------
// PERFILES DEL PROFESOR (especialidades: no restringen, solo sugieren afinidad)
// ---------------------------------------------------------------------------

// GET /api/profesores/:id/perfiles — ids de los perfiles asignados al profesor
export async function getPerfilesProfesorHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  try {
    const rows = await query<any[]>(
      'SELECT perfil_id FROM profesor_perfiles WHERE profesor_id = ?',
      [id]
    );
    return reply.send({ success: true, data: rows.map((r) => r.perfil_id) });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error obteniendo los perfiles del profesor.' });
  }
}

// PUT /api/profesores/:id/perfiles — reemplazo completo: body { perfil_ids: number[] }
export async function setPerfilesProfesorHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { perfil_ids } = request.body as { perfil_ids?: number[] };
  const ids = [...new Set((perfil_ids || []).map(Number).filter((n) => n > 0))];

  try {
    const prof = await query<any[]>('SELECT id FROM profesores WHERE id = ? LIMIT 1', [id]);
    if (prof.length === 0) {
      return reply.status(404).send({ success: false, message: 'Profesor no encontrado.' });
    }

    await query('DELETE FROM profesor_perfiles WHERE profesor_id = ?', [id]);
    for (const pid of ids) {
      await query('INSERT IGNORE INTO profesor_perfiles (profesor_id, perfil_id) VALUES (?, ?)', [id, pid]);
    }

    return reply.send({ success: true, message: 'Perfiles del profesor actualizados.' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error actualizando los perfiles del profesor.' });
  }
}

// GET /api/profesores/:id/perfiles-materias — materias agregadas de todos sus
// perfiles activos + los nombres de los perfiles (para el modal de asignación)
export async function getPerfilMateriasProfesorHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  try {
    const perfiles = await query<any[]>(
      `SELECT pf.id, pf.nombre
       FROM profesor_perfiles pp
       JOIN perfiles pf ON pf.id = pp.perfil_id AND pf.activo = 1
       WHERE pp.profesor_id = ?
       ORDER BY pf.nombre ASC`,
      [id]
    );
    const materias = await query<any[]>(
      `SELECT DISTINCT pm.subject_saga_id, pm.nombre
       FROM profesor_perfiles pp
       JOIN perfiles pf ON pf.id = pp.perfil_id AND pf.activo = 1
       JOIN perfil_materias pm ON pm.perfil_id = pp.perfil_id
       WHERE pp.profesor_id = ?
       ORDER BY pm.nombre ASC`,
      [id]
    );
    return reply.send({ success: true, data: { perfiles, materias } });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error obteniendo las materias del perfil.' });
  }
}

// ---------------------------------------------------------------------------
// TIPOS DE CONTRATO
// ---------------------------------------------------------------------------

export async function listTiposContratoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { incluir_inactivos } = request.query as { incluir_inactivos?: string };

  try {
    let sql = 'SELECT * FROM tipos_contrato';
    if (incluir_inactivos !== '1' && incluir_inactivos !== 'true') {
      sql += ' WHERE activo = 1';
    }
    sql += ' ORDER BY horas_semanales DESC, nombre ASC';
    const tipos = await query(sql);
    return reply.send({ success: true, data: tipos });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error listando tipos de contrato.' });
  }
}

export async function createTipoContratoHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as TipoContratoBody;

  if (!body.nombre?.trim()) {
    return reply.status(400).send({ success: false, message: 'El nombre del tipo de contrato es obligatorio.' });
  }
  const horas = Number(body.horas_semanales ?? 40);
  if (horas <= 0 || horas > 80) {
    return reply.status(400).send({ success: false, message: 'Las horas semanales deben estar entre 1 y 80.' });
  }

  try {
    const insert: any = await query(
      'INSERT INTO tipos_contrato (nombre, descripcion, horas_semanales) VALUES (?, ?, ?)',
      [body.nombre.trim(), body.descripcion?.trim() || null, horas]
    );
    return reply.status(201).send({
      success: true,
      message: 'Tipo de contrato creado exitosamente.',
      data: { id: insert.insertId },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error creando tipo de contrato.' });
  }
}

export async function updateTipoContratoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as TipoContratoBody;

  try {
    const rows = await query<any[]>('SELECT * FROM tipos_contrato WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return reply.status(404).send({ success: false, message: 'Tipo de contrato no encontrado.' });
    }
    const current = rows[0];

    const horas = body.horas_semanales !== undefined ? Number(body.horas_semanales) : current.horas_semanales;
    if (horas <= 0 || horas > 80) {
      return reply.status(400).send({ success: false, message: 'Las horas semanales deben estar entre 1 y 80.' });
    }

    await query('UPDATE tipos_contrato SET nombre = ?, descripcion = ?, horas_semanales = ?, activo = ? WHERE id = ?', [
      body.nombre?.trim() || current.nombre,
      body.descripcion !== undefined ? body.descripcion?.trim() || null : current.descripcion,
      horas,
      body.activo !== undefined ? (body.activo ? 1 : 0) : current.activo,
      id,
    ]);

    return reply.send({ success: true, message: 'Tipo de contrato actualizado exitosamente.' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error actualizando tipo de contrato.' });
  }
}

export async function deleteTipoContratoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };

  try {
    const rows = await query<any[]>('SELECT id, nombre FROM tipos_contrato WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return reply.status(404).send({ success: false, message: 'Tipo de contrato no encontrado.' });
    }

    // La FK profesores.tipo_contrato_id usa ON DELETE SET NULL:
    // los profesores asociados quedan sin tipo de contrato asignado.
    const usage = await query<any[]>('SELECT COUNT(*) AS total FROM profesores WHERE tipo_contrato_id = ?', [id]);
    const total = Number(usage[0]?.total || 0);

    await query('DELETE FROM tipos_contrato WHERE id = ?', [id]);

    return reply.send({
      success: true,
      message: `Tipo de contrato "${rows[0].nombre}" eliminado.${
        total > 0 ? ` ${total} profesor(es) quedaron sin tipo de contrato asignado.` : ''
      }`,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error eliminando tipo de contrato.' });
  }
}

export async function syncTiposContratoHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await syncTiposContratoDesdeSaga();
    if (!result.synced) {
      return reply.send({
        success: true,
        message:
          'La API SAGA no expone un catálogo de dedicaciones en este momento. Los tipos se crearán automáticamente al sincronizar profesores según su dedicacion_id.',
        data: { sincronizados: 0 },
      });
    }
    return reply.send({
      success: true,
      message: `Tipos de contrato sincronizados desde SAGA: ${result.count}.`,
      data: { sincronizados: result.count },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error sincronizando tipos de contrato.' });
  }
}

// ---------------------------------------------------------------------------
// DISPONIBILIDAD HORARIA DEL PROFESOR
// Solo se persisten los slots BLOQUEADOS: la ausencia de fila = disponible.
// El slot se identifica por (dia_semana, hora_inicio, hora_fin), no por
// bloque_id, porque la grilla fusiona bloques de varios turnos que pueden
// compartir horas.
// ---------------------------------------------------------------------------

const HORA_RE = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const normHora = (h: string) => (h.length === 5 ? `${h}:00` : h);

// true si el profesor PUEDE dar clases en ese slot. Reusa esto desde el
// generador de horarios y el reporte de violaciones (solape, no igualdad,
// para tolerar bloques redefinidos).
export async function profesorDisponibleEn(
  profesorId: number,
  diaSemana: number,
  horaInicio: string,
  horaFin: string
): Promise<boolean> {
  const rows = await query<any[]>(
    `SELECT id FROM profesor_disponibilidad
     WHERE profesor_id = ? AND dia_semana = ? AND hora_inicio < ? AND hora_fin > ?
     LIMIT 1`,
    [profesorId, diaSemana, normHora(horaFin), normHora(horaInicio)]
  );
  return rows.length === 0;
}

// id del profesor que corresponde a la cédula del token (rol PROFESOR),
// o null si el usuario no es docente o no tiene cédula vinculada.
async function profesorIdDelToken(request: FastifyRequest): Promise<number | null> {
  const user = request.userPayload;
  if (!user || user.role !== 'PROFESOR' || !user.profesor_cedula) return null;
  const rows = await query<any[]>('SELECT id FROM profesores WHERE cedula = ? LIMIT 1', [
    user.profesor_cedula,
  ]);
  return rows[0]?.id ?? null;
}

// GET /api/profesores/:id/disponibilidad — slots bloqueados del profesor
export async function getDisponibilidadHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  // Un docente solo puede ver su propia disponibilidad
  if (request.userPayload?.role === 'PROFESOR') {
    const propio = await profesorIdDelToken(request);
    if (propio == null || propio !== Number(id)) {
      return reply.status(403).send({ success: false, message: 'Solo puedes consultar tu propia disponibilidad.' });
    }
  }
  try {
    const rows = await query<any[]>(
      `SELECT dia_semana, TIME_FORMAT(hora_inicio, '%H:%i') AS hora_inicio,
              TIME_FORMAT(hora_fin, '%H:%i') AS hora_fin
       FROM profesor_disponibilidad WHERE profesor_id = ?
       ORDER BY dia_semana, hora_inicio`,
      [id]
    );
    return reply.send({ success: true, data: rows });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error obteniendo la disponibilidad.' });
  }
}

// PUT /api/profesores/:id/disponibilidad — marca o libera un slot
// body: { dia_semana, hora_inicio, hora_fin, disponible }
export async function setDisponibilidadSlotHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as {
    dia_semana?: number;
    hora_inicio?: string;
    hora_fin?: string;
    disponible?: boolean;
  };
  const dia = Number(body.dia_semana);
  const ini = String(body.hora_inicio ?? '').trim();
  const fin = String(body.hora_fin ?? '').trim();
  if (!Number.isInteger(dia) || dia < 1 || dia > 7) {
    return reply.status(400).send({ success: false, message: 'dia_semana debe ser un entero entre 1 y 7.' });
  }
  if (!HORA_RE.test(ini) || !HORA_RE.test(fin) || normHora(ini) >= normHora(fin)) {
    return reply.status(400).send({ success: false, message: 'Rango horario inválido (HH:MM, inicio < fin).' });
  }

  // Un docente solo puede editar su propia disponibilidad
  if (request.userPayload?.role === 'PROFESOR') {
    const propio = await profesorIdDelToken(request);
    if (propio == null || propio !== Number(id)) {
      return reply.status(403).send({ success: false, message: 'Solo puedes editar tu propia disponibilidad.' });
    }
  }

  try {
    const prof = await query<any[]>('SELECT id FROM profesores WHERE id = ? LIMIT 1', [id]);
    if (prof.length === 0) {
      return reply.status(404).send({ success: false, message: 'Profesor no encontrado.' });
    }
    if (body.disponible === false) {
      await query(
        'INSERT IGNORE INTO profesor_disponibilidad (profesor_id, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)',
        [id, dia, normHora(ini), normHora(fin)]
      );
    } else {
      await query(
        'DELETE FROM profesor_disponibilidad WHERE profesor_id = ? AND dia_semana = ? AND hora_inicio = ? AND hora_fin = ?',
        [id, dia, normHora(ini), normHora(fin)]
      );
    }
    return reply.send({ success: true, message: 'Disponibilidad actualizada.' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error actualizando la disponibilidad.' });
  }
}
