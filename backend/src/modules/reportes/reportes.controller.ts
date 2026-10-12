import { FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import path from 'path';
import { query } from '../../db/mysql.js';
import { audit } from '../../utils/audit.js';
import { lapsosTotales, seTraslapan, TipoProyeccion } from '../horarios/scheduler.service.js';

// Clave del reporte: identifica qué plantilla se pide ('horarios',
// 'carga_docente', futuros reportes). Se restringe el formato para evitar
// claves arbitrarias en la tabla.
const CLAVE_VALIDA = /^[a-z_]{2,50}$/;
const MAX_LINEAS = 10;
const MAX_LARGO = 300;

// GET /api/reportes/plantilla/:reporte — encabezado guardado (o null si no hay)
export async function getPlantillaHandler(request: FastifyRequest, reply: FastifyReply) {
  const { reporte } = request.params as { reporte: string };
  if (!CLAVE_VALIDA.test(reporte)) {
    return reply.status(400).send({ success: false, message: 'Reporte inválido.' });
  }
  try {
    const rows = await query<any[]>(
      'SELECT encabezado FROM reportes_plantillas WHERE reporte = ?',
      [reporte]
    );
    const raw = rows[0]?.encabezado;
    // mysql2 puede devolver la columna JSON como string o ya parseada
    const encabezado = typeof raw === 'string' ? JSON.parse(raw) : raw ?? null;
    return reply.send({ success: true, data: { reporte, encabezado } });
  } catch (e: any) {
    request.log.error(e);
    return reply.status(500).send({ success: false, message: 'Error cargando la plantilla.' });
  }
}

// PUT /api/reportes/plantilla/:reporte — guarda el encabezado (upsert)
export async function putPlantillaHandler(request: FastifyRequest, reply: FastifyReply) {
  const { reporte } = request.params as { reporte: string };
  if (!CLAVE_VALIDA.test(reporte)) {
    return reply.status(400).send({ success: false, message: 'Reporte inválido.' });
  }
  const { encabezado } = request.body as { encabezado?: unknown };
  if (
    !Array.isArray(encabezado) ||
    encabezado.length === 0 ||
    encabezado.length > MAX_LINEAS ||
    encabezado.some((l) => typeof l !== 'string' || l.length > MAX_LARGO)
  ) {
    return reply.status(400).send({
      success: false,
      message: `El encabezado debe ser un arreglo de 1-${MAX_LINEAS} líneas de hasta ${MAX_LARGO} caracteres.`,
    });
  }
  try {
    await query(
      'INSERT INTO reportes_plantillas (reporte, encabezado) VALUES (?, ?) ON DUPLICATE KEY UPDATE encabezado = VALUES(encabezado)',
      [reporte, JSON.stringify(encabezado)]
    );
    return reply.send({ success: true, message: 'Plantilla guardada.' });
  } catch (e: any) {
    request.log.error(e);
    return reply.status(500).send({ success: false, message: 'Error guardando la plantilla.' });
  }
}

// ── Logo institucional de los reportes ─────────────────────────────────
// Mismo patrón que las fotos de profesores: el archivo vive en public/ y lo
// sirve fastify-static en /public/logo-reportes.png. Si el archivo existe,
// el frontend lo usa en impresión y Excel; si no existe (404) cae al logo
// empaquetado en el bundle — "restaurar" es simplemente borrar el archivo.
const LOGO_PATH = path.join(process.cwd(), 'public', 'logo-reportes.png');
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB ya decodificado
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // ‰PNG

// PUT /api/reportes/logo — body { logo: 'data:image/png;base64,...' }
// El frontend normaliza cualquier imagen a PNG por canvas antes de subirla,
// así exceljs siempre recibe extension 'png' y el nombre de archivo es fijo.
export async function putLogoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { logo } = request.body as { logo?: string };
  const match = typeof logo === 'string' ? logo.match(/^data:image\/png;base64,(.+)$/s) : null;
  if (!match) {
    return reply.status(400).send({
      success: false,
      message: 'Formato de imagen no válido. Debe ser PNG.',
    });
  }
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_LOGO_BYTES) {
    return reply.status(400).send({
      success: false,
      message: 'La imagen excede el tamaño máximo permitido de 2 MB.',
    });
  }
  if (buffer.length < 8 || !buffer.subarray(0, 4).equals(PNG_MAGIC)) {
    return reply.status(400).send({ success: false, message: 'El contenido no es un PNG válido.' });
  }
  try {
    fs.mkdirSync(path.dirname(LOGO_PATH), { recursive: true });
    fs.writeFileSync(LOGO_PATH, buffer);
    audit(request, {
      accion: 'reportes.logo',
      entidad: 'config',
      detalle: { op: 'actualizar', bytes: buffer.length },
      pnfSagaId: null,
    });
    return reply.send({ success: true, message: 'Logo actualizado. Se usará en los próximos reportes.' });
  } catch (e: any) {
    request.log.error(e);
    return reply.status(500).send({ success: false, message: 'Error guardando el logo.' });
  }
}

// DELETE /api/reportes/logo — borra el archivo → vuelve el logo empaquetado.
export async function deleteLogoHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    if (fs.existsSync(LOGO_PATH)) fs.unlinkSync(LOGO_PATH);
    audit(request, {
      accion: 'reportes.logo',
      entidad: 'config',
      detalle: { op: 'restaurar' },
      pnfSagaId: null,
    });
    return reply.send({ success: true, message: 'Logo restaurado al predeterminado.' });
  } catch (e: any) {
    request.log.error(e);
    return reply.status(500).send({ success: false, message: 'Error restaurando el logo.' });
  }
}

// Lapsos en los que una materia se dicta según su régimen (misma regla que
// usa la carga docente y el generador).
function lapsosDeMateria(m: any, tipo: string): number[] {
  const lapsos =
    tipo === 'SEMESTRAL'
      ? [m.semestre1 ? 1 : 0, m.semestre2 ? 2 : 0].filter(Boolean)
      : [m.q1 ? 1 : 0, m.q2 ? 2 : 0, m.q3 ? 3 : 0].filter(Boolean);
  return lapsos.length > 0 ? lapsos : [1];
}

// GET /api/reportes/resumen — métricas del periodo activo para las tarjetas
// del dashboard. El conteo de conflictos es una aproximación por pares de
// clases (aula/profesor con traslape total); el detalle exacto se ve en
// Horarios → panel Errores. El Coordinador ve las métricas acotadas a su PNF.
export async function resumenHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.userPayload!;
  const pnfFiltro = user.role === 'ADMINISTRADOR' ? user.pnf_saga_id : null;

  try {
    const periodoRows = await query<any[]>(
      "SELECT codigo, nombre FROM periodos_academicos WHERE estado = 'ACTIVO' ORDER BY id DESC LIMIT 1"
    );
    if (periodoRows.length === 0) {
      return reply.send({ success: true, data: { periodo: null } });
    }
    const periodo: string = periodoRows[0].codigo;

    const pnfCond = pnfFiltro ? 'AND pnf_saga_id = ?' : '';
    const pnfParams = pnfFiltro ? [pnfFiltro] : [];

    const [proy] = await query<any[]>(
      `SELECT COUNT(*) AS n FROM proyecciones WHERE periodo_academico = ? AND activa = 1 ${pnfCond}`,
      [periodo, ...pnfParams]
    );
    const [secc] = await query<any[]>(
      `SELECT COUNT(*) AS n FROM proyeccion_secciones s
       JOIN proyecciones p ON p.id = s.proyeccion_id
       WHERE p.periodo_academico = ? AND p.activa = 1 ${pnfCond}`,
      [periodo, ...pnfParams]
    );
    const [prof] = await query<any[]>(
      `SELECT COUNT(*) AS n FROM profesores WHERE activo = 1 ${pnfCond}`,
      pnfParams
    );
    const [aula] = await query<any[]>(
      'SELECT COUNT(*) AS n FROM aulas WHERE activa = 1'
    );
    const [agendadas] = await query<any[]>(
      `SELECT COUNT(*) AS n FROM horario_entries e
       JOIN proyeccion_materias m ON m.id = e.materia_id
       JOIN proyecciones p ON p.id = m.proyeccion_id
       WHERE e.periodo_academico = ? ${pnfCond}`,
      [periodo, ...pnfParams]
    );

    // Unidades asignables (materia × sección × lapso) sin profesor asignado
    const filas = await query<any[]>(
      `SELECT m.id AS materia_id, m.q1, m.q2, m.q3, m.semestre1, m.semestre2,
              m.seccion_id AS materia_seccion_id, s.id AS seccion_id, p.tipo_proyeccion
       FROM proyecciones p
       JOIN proyeccion_materias m ON m.proyeccion_id = p.id AND m.eliminada = 0
       JOIN proyeccion_secciones s
         ON s.proyeccion_id = p.id
         AND (m.seccion_id = s.id OR (m.seccion_id IS NULL AND NOT EXISTS (
              SELECT 1 FROM proyeccion_materias pm
              WHERE pm.proyeccion_id = p.id AND pm.seccion_id = s.id AND pm.eliminada = 0)))
       WHERE p.activa = 1 AND p.periodo_academico = ? ${pnfCond}`,
      [periodo, ...pnfParams]
    );
    const asig = await query<any[]>(
      `SELECT a.materia_id, a.seccion_id, a.trimestre FROM proyeccion_asignaciones a
       JOIN proyecciones p ON p.id = a.proyeccion_id
       WHERE p.periodo_academico = ? ${pnfCond}`,
      [periodo, ...pnfParams]
    );
    const asigSet = new Set(asig.map((a) => `${a.materia_id}:${a.seccion_id}:${a.trimestre}`));
    let sinProfesor = 0;
    for (const f of filas) {
      for (const lapso of lapsosDeMateria(f, f.tipo_proyeccion)) {
        if (!asigSet.has(`${f.materia_id}:${f.seccion_id}:${lapso}`)) sinProfesor++;
      }
    }

    // Conflictos: pares de clases del periodo que comparten aula o profesor
    // con traslape de hora y relación de traslape TOTAL entre sus lapsos.
    const entries = await query<any[]>(
      `SELECT e.id, e.tipo_proyeccion, e.trimestre, e.profesor_id, e.aula_id,
              e.dia_semana, b.hora_inicio, b.hora_fin
       FROM horario_entries e
       JOIN turno_bloques b ON b.id = e.bloque_id
       JOIN proyeccion_materias m ON m.id = e.materia_id
       JOIN proyecciones p ON p.id = m.proyeccion_id
       WHERE e.periodo_academico = ? ${pnfCond}`,
      [periodo, ...pnfParams]
    );
    const total = (x: any, y: any) =>
      lapsosTotales(x.tipo_proyeccion as TipoProyeccion, Number(x.trimestre)).some(
        (l) => l.tipo === y.tipo_proyeccion && l.n === Number(y.trimestre)
      );
    let conflictos = 0;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        if (a.dia_semana !== b.dia_semana) continue;
        if (a.aula_id !== b.aula_id && (a.profesor_id === null || a.profesor_id !== b.profesor_id)) continue;
        if (!seTraslapan(a.hora_inicio, a.hora_fin, b.hora_inicio, b.hora_fin)) continue;
        if (!total(a, b)) continue;
        conflictos++;
      }
    }

    return reply.send({
      success: true,
      data: {
        periodo,
        periodo_nombre: periodoRows[0].nombre,
        proyecciones_activas: proy[0].n,
        secciones: secc[0].n,
        profesores_activos: prof[0].n,
        aulas_activas: aula[0].n,
        clases_agendadas: agendadas[0].n,
        materias_sin_profesor: sinProfesor,
        conflictos,
      },
    });
  } catch (e: any) {
    request.log.error(e);
    return reply.status(500).send({ success: false, message: 'Error calculando el resumen.' });
  }
}
