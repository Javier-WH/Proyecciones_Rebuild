import { FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import path from 'path';
import { query } from '../../db/mysql.js';
import { audit } from '../../utils/audit.js';
import { periodoDeLaPeticion } from '../../utils/periodo.js';
import { sagaService } from '../saga/saga.service.js';
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

// ── Consultas compartidas entre /resumen y /estadisticas ────────────────────

// Unidades asignables: materia × sección (cada una se dicta en N lapsos).
// La materia general (seccion_id NULL) aplica a todas las secciones salvo que
// exista una versión específica de la misma proyección para esa sección.
async function cargarUnidadesAsignables(periodo: string, pnfCond: string, pnfParams: any[]) {
  return query<any[]>(
    `SELECT m.id AS materia_id, m.nombre AS materia_nombre,
            m.q1, m.q2, m.q3, m.semestre1, m.semestre2,
            s.id AS seccion_id, s.nombre AS seccion_nombre, s.turno_nombre AS seccion_turno,
            p.tipo_proyeccion, p.pnf_saga_id, p.pnf_nombre, p.trayecto_nombre
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
}

// Entries del período con los datos necesarios para detectar conflictos y
// para ubicar qué unidades asignables ya tienen clase agendada.
async function cargarEntriesPeriodo(periodo: string, pnfCond: string, pnfParams: any[]) {
  return query<any[]>(
    `SELECT e.id, e.materia_id, e.seccion_id, e.tipo_proyeccion, e.trimestre,
            e.profesor_id, e.aula_id, e.dia_semana, e.bloque_id,
            b.hora_inicio, b.hora_fin, b.turno_id
     FROM horario_entries e
     JOIN turno_bloques b ON b.id = e.bloque_id
     JOIN proyeccion_materias m ON m.id = e.materia_id
     JOIN proyecciones p ON p.id = m.proyeccion_id
     WHERE e.periodo_academico = ? ${pnfCond}`,
    [periodo, ...pnfParams]
  );
}

// Conflictos: pares de clases del periodo que comparten aula o profesor con
// traslape de hora y relación de traslape TOTAL entre sus lapsos. Un mismo
// par puede contar en ambas categorías (comparte aula Y profesor).
function contarConflictos(entries: any[]) {
  const total = (x: any, y: any) =>
    lapsosTotales(x.tipo_proyeccion as TipoProyeccion, Number(x.trimestre)).some(
      (l) => l.tipo === y.tipo_proyeccion && l.n === Number(y.trimestre)
    );
  let n = 0;
  let porAula = 0;
  let porProfesor = 0;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (a.dia_semana !== b.dia_semana) continue;
      const comparteAula = a.aula_id === b.aula_id;
      const comparteProfesor = a.profesor_id !== null && a.profesor_id === b.profesor_id;
      if (!comparteAula && !comparteProfesor) continue;
      if (!seTraslapan(a.hora_inicio, a.hora_fin, b.hora_inicio, b.hora_fin)) continue;
      if (!total(a, b)) continue;
      n++;
      if (comparteAula) porAula++;
      if (comparteProfesor) porProfesor++;
    }
  }
  return { total: n, por_aula: porAula, por_profesor: porProfesor };
}

// GET /api/reportes/resumen — métricas del periodo de trabajo para las
// tarjetas del dashboard (el ACTIVO, o el en PLANIFICACION que Master/
// Coordinador tenga seleccionado vía ?periodo=). El conteo de conflictos
// es una aproximación por pares de clases (aula/profesor con traslape
// total); el detalle exacto se ve en Horarios → panel Errores. El
// Coordinador ve las métricas acotadas a su PNF.
export async function resumenHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.userPayload!;
  const pnfFiltro = user.role === 'ADMINISTRADOR' ? user.pnf_saga_id : null;
  const { periodo: periodoQ } = request.query as { periodo?: string };

  try {
    const periodo = await periodoDeLaPeticion(user, periodoQ);
    if (!periodo) {
      return reply.send({ success: true, data: { periodo: null } });
    }
    const periodoRows = await query<any[]>(
      'SELECT nombre FROM periodos_academicos WHERE codigo = ? LIMIT 1',
      [periodo]
    );

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
    // Docentes con al menos una asignación en el período (la cifra global de
    // profesores_activos incluye gente de otras sedes y no es representativa).
    const [docentes] = await query<any[]>(
      `SELECT COUNT(DISTINCT a.profesor_id) AS n FROM proyeccion_asignaciones a
       JOIN proyecciones p ON p.id = a.proyeccion_id
       WHERE p.periodo_academico = ? AND p.activa = 1 ${pnfCond}`,
      [periodo, ...pnfParams]
    );

    // Unidades asignables (materia × sección × lapso) sin profesor asignado
    const filas = await cargarUnidadesAsignables(periodo, pnfCond, pnfParams);
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

    const entries = await cargarEntriesPeriodo(periodo, pnfCond, pnfParams);
    const { total: conflictos } = contarConflictos(entries);

    return reply.send({
      success: true,
      data: {
        periodo,
        periodo_nombre: periodoRows[0]?.nombre ?? null,
        proyecciones_activas: proy.n,
        secciones: secc.n,
        profesores_activos: prof.n,
        docentes_con_carga: docentes.n,
        aulas_activas: aula.n,
        clases_agendadas: agendadas.n,
        materias_sin_profesor: sinProfesor,
        conflictos,
      },
    });
  } catch (e: any) {
    request.log.error(e);
    return reply.status(500).send({ success: false, message: 'Error calculando el resumen.' });
  }
}

// ── Estadísticas del dashboard ───────────────────────────────────────────────

interface TrayectoEsperado {
  id: number;
  nombre: string;
}

// Caché en memoria de los trayectos esperados por PNF: vienen de la malla
// vigente en SAGA (~6 llamadas por PNF: mayas + ucslist por trayecto) y casi
// nunca cambian → TTL 1h. Los fallos se cachean 5 min para no martillear
// SAGA cuando está caído.
const trayectosPnfCache = new Map<number, { trayectos: TrayectoEsperado[] | null; ts: number }>();
const TRAYECTOS_TTL_OK = 60 * 60 * 1000;
const TRAYECTOS_TTL_FALLO = 5 * 60 * 1000;

async function trayectosEsperadosDePnf(pnfSagaId: number): Promise<TrayectoEsperado[] | null> {
  const hit = trayectosPnfCache.get(pnfSagaId);
  if (hit && Date.now() - hit.ts < (hit.trayectos ? TRAYECTOS_TTL_OK : TRAYECTOS_TTL_FALLO)) {
    return hit.trayectos;
  }
  let trayectos: TrayectoEsperado[] | null = null;
  try {
    const mayas = await sagaService.getMayas(pnfSagaId);
    if (mayas && mayas.length > 0) {
      // Un PNF puede tener varias mallas (cohortes) y la más nueva a veces
      // está incompleta en SAGA → se unen los trayectos con materias de las
      // mayas vigentes (tope 4 para acotar las llamadas a ucslist).
      const porMaya = await Promise.all(
        mayas.slice(0, 4).map((m) => sagaService.getMateriasPorMaya(pnfSagaId, m.id))
      );
      const union = new Map<number, string>();
      let sagaRespondio = false;
      for (const grupos of porMaya) {
        if (grupos) sagaRespondio = true;
        for (const g of grupos ?? []) union.set(Number(g.trayecto_saga_id), g.trayecto);
      }
      if (sagaRespondio) {
        trayectos = [...union.entries()].map(([id, nombre]) => ({ id, nombre }));
      }
    }
  } catch {
    // SAGA inalcanzable → el caller usa el fallback histórico
  }
  trayectosPnfCache.set(pnfSagaId, { trayectos, ts: Date.now() });
  return trayectos;
}

// GET /api/reportes/estadisticas — panel de estadísticas del período de
// trabajo (activo o el de planificación seleccionado por Master/Coordinador).
// Devuelve solo agregados; el Coordinador lo ve acotado a su PNF.
export async function estadisticasHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.userPayload!;
  const pnfFiltro = user.role === 'ADMINISTRADOR' ? user.pnf_saga_id : null;
  const { periodo: periodoQ } = request.query as { periodo?: string };

  try {
    const periodo = await periodoDeLaPeticion(user, periodoQ);
    if (!periodo) {
      return reply.send({ success: true, data: { periodo: null } });
    }
    const periodoRows = await query<any[]>(
      'SELECT nombre FROM periodos_academicos WHERE codigo = ? LIMIT 1',
      [periodo]
    );
    const pnfCond = pnfFiltro ? 'AND pnf_saga_id = ?' : '';
    const pnfParams = pnfFiltro ? [pnfFiltro] : [];

    // 1) Catálogo de PNFs: SAGA (programas) + los referenciados localmente.
    //    Coordinador → solo su PNF (su nombre sale de las tablas locales).
    const pnfMap = new Map<number, string>();
    if (pnfFiltro == null) {
      try {
        const programas = await sagaService.getProgramas();
        for (const p of programas ?? []) pnfMap.set(Number(p.id), p.programa);
      } catch {
        // SAGA caído: se listan solo los PNFs referenciados localmente
      }
    }
    const locales = await query<any[]>(
      `SELECT DISTINCT pnf_saga_id AS id, pnf_nombre AS nombre FROM proyecciones
        WHERE pnf_saga_id IS NOT NULL ${pnfCond}
       UNION
       SELECT DISTINCT pnf_saga_id, pnf_nombre FROM profesores
        WHERE pnf_saga_id IS NOT NULL ${pnfCond}`,
      [...pnfParams, ...pnfParams]
    );
    for (const l of locales) if (l.id != null) pnfMap.set(Number(l.id), l.nombre || `PNF #${l.id}`);
    const pnfs = [...pnfMap.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    // 2) Trayectos cubiertos en el período seleccionado y, como referencia
    //    de fallback, los que el PNF ha proyectado en algún período.
    const cubiertas = await query<any[]>(
      `SELECT pnf_saga_id, trayecto_saga_id, trayecto_nombre FROM proyecciones
       WHERE periodo_academico = ? AND activa = 1 ${pnfCond}`,
      [periodo, ...pnfParams]
    );
    const cubMap = new Map<number, Set<number>>();
    for (const c of cubiertas) {
      const set = cubMap.get(c.pnf_saga_id) ?? new Set<number>();
      set.add(Number(c.trayecto_saga_id));
      cubMap.set(c.pnf_saga_id, set);
    }
    const historicos = await query<any[]>(
      `SELECT DISTINCT pnf_saga_id, trayecto_saga_id, trayecto_nombre
       FROM proyecciones WHERE pnf_saga_id IS NOT NULL ${pnfCond}`,
      pnfParams
    );
    const histMap = new Map<number, TrayectoEsperado[]>();
    for (const h of historicos) {
      const arr = histMap.get(h.pnf_saga_id) ?? [];
      arr.push({ id: Number(h.trayecto_saga_id), nombre: h.trayecto_nombre || `Trayecto ${h.trayecto_saga_id}` });
      histMap.set(h.pnf_saga_id, arr);
    }

    // 3) Cobertura por PNF. En serie para no lanzar N×5 llamadas a SAGA a la
    //    vez; los resultados quedan en caché (TTL arriba).
    const cobertura_pnf: any[] = [];
    for (const pnf of pnfs) {
      let esperados = await trayectosEsperadosDePnf(pnf.id);
      let fuente: 'saga' | 'historico' | 'sin_datos' = 'saga';
      if (!esperados || esperados.length === 0) {
        esperados = histMap.get(pnf.id) ?? null;
        fuente = esperados ? 'historico' : 'sin_datos';
      }
      const cubSet = cubMap.get(pnf.id) ?? new Set<number>();
      cobertura_pnf.push({
        pnf_saga_id: pnf.id,
        nombre: pnf.nombre,
        trayectos_esperados: esperados?.length ?? null,
        trayectos_cubiertos: (esperados ?? []).filter((t) => cubSet.has(t.id)).length,
        faltantes: (esperados ?? []).filter((t) => !cubSet.has(t.id)),
        fuente,
      });
    }

    // 4) Uso de aulas y turnos. Capacidad teórica = Σ por turno de
    //    (días hábiles del turno × bloques no-receso): cada aula puede alojar
    //    una clase por (día, bloque) de cada turno.
    const turnos = await query<any[]>(
      `SELECT t.id, t.nombre, t.dias_semana,
              (SELECT COUNT(*) FROM turno_bloques b
                WHERE b.turno_id = t.id AND b.es_receso = 0) AS bloques
       FROM turnos t WHERE t.activo = 1 ORDER BY t.id`
    );
    const ocupTurnoRows = await query<any[]>(
      `SELECT b.turno_id, COUNT(DISTINCT e.dia_semana, e.bloque_id) AS n
       FROM horario_entries e
       JOIN turno_bloques b ON b.id = e.bloque_id
       JOIN proyeccion_materias m ON m.id = e.materia_id
       JOIN proyecciones p ON p.id = m.proyeccion_id
       WHERE e.periodo_academico = ? ${pnfCond}
       GROUP BY b.turno_id`,
      [periodo, ...pnfParams]
    );
    const ocupTurno = new Map(ocupTurnoRows.map((r) => [Number(r.turno_id), Number(r.n)]));
    const turnosData = turnos.map((t) => {
      const dias = String(t.dias_semana || '').split(',').filter(Boolean).length;
      const bloques = Number(t.bloques);
      const disponibles = dias * bloques;
      const ocupados = ocupTurno.get(Number(t.id)) ?? 0;
      return {
        id: t.id, nombre: t.nombre, dias, bloques, ocupados, disponibles,
        pct: disponibles ? Math.round((ocupados / disponibles) * 100) : 0,
      };
    });
    const disponiblesPorAula = turnosData.reduce((s, t) => s + t.disponibles, 0);

    const aulas = await query<any[]>(
      'SELECT id, codigo, nombre, tipo FROM aulas WHERE activa = 1 ORDER BY codigo'
    );
    const ocupAulaRows = await query<any[]>(
      `SELECT e.aula_id, COUNT(DISTINCT e.dia_semana, e.bloque_id) AS n
       FROM horario_entries e
       JOIN proyeccion_materias m ON m.id = e.materia_id
       JOIN proyecciones p ON p.id = m.proyeccion_id
       WHERE e.periodo_academico = ? ${pnfCond}
       GROUP BY e.aula_id`,
      [periodo, ...pnfParams]
    );
    const ocupAula = new Map(ocupAulaRows.map((r) => [Number(r.aula_id), Number(r.n)]));
    const por_aula = aulas
      .map((a) => {
        const ocupados = ocupAula.get(Number(a.id)) ?? 0;
        return {
          id: a.id, codigo: a.codigo, nombre: a.nombre, tipo: a.tipo,
          ocupados, disponibles: disponiblesPorAula,
          pct: disponiblesPorAula ? Math.round((ocupados / disponiblesPorAula) * 100) : 0,
        };
      })
      .sort((a, b) => b.ocupados - a.ocupados);

    // 5) Unidades asignables (materia × sección × lapso) sin profesor y sin
    //    clase agendada, con desglose por PNF y una muestra de detalle.
    const filas = await cargarUnidadesAsignables(periodo, pnfCond, pnfParams);
    const asig = await query<any[]>(
      `SELECT a.materia_id, a.seccion_id, a.trimestre FROM proyeccion_asignaciones a
       JOIN proyecciones p ON p.id = a.proyeccion_id
       WHERE p.periodo_academico = ? ${pnfCond}`,
      [periodo, ...pnfParams]
    );
    const entries = await cargarEntriesPeriodo(periodo, pnfCond, pnfParams);
    const asigSet = new Set(asig.map((a) => `${a.materia_id}:${a.seccion_id}:${a.trimestre}`));
    const entrySet = new Set(entries.map((e) => `${e.materia_id}:${e.seccion_id}:${e.trimestre}`));

    const MAX_DETALLE = 15;
    const sinProfesorPorPnf = new Map<number, { nombre: string; n: number }>();
    const sinHorarioPorPnf = new Map<number, { nombre: string; n: number }>();
    const detalleSinProfesor: any[] = [];
    const detalleSinHorario: any[] = [];
    let totalSinProfesor = 0;
    let totalSinHorario = 0;
    const bump = (map: Map<number, { nombre: string; n: number }>, f: any) => {
      const it = map.get(f.pnf_saga_id) ?? { nombre: f.pnf_nombre, n: 0 };
      it.n++;
      map.set(f.pnf_saga_id, it);
    };
    for (const f of filas) {
      for (const lapso of lapsosDeMateria(f, f.tipo_proyeccion)) {
        const clave = `${f.materia_id}:${f.seccion_id}:${lapso}`;
        const ubicacion = {
          seccion_id: f.seccion_id,
          trayecto: f.trayecto_nombre,
          turno: f.seccion_turno,
        };
        if (!asigSet.has(clave)) {
          totalSinProfesor++;
          bump(sinProfesorPorPnf, f);
          if (detalleSinProfesor.length < MAX_DETALLE) {
            detalleSinProfesor.push({ materia: f.materia_nombre, seccion: f.seccion_nombre, lapso, tipo: f.tipo_proyeccion, pnf: f.pnf_nombre, ...ubicacion });
          }
        }
        if (!entrySet.has(clave)) {
          totalSinHorario++;
          bump(sinHorarioPorPnf, f);
          if (detalleSinHorario.length < MAX_DETALLE) {
            detalleSinHorario.push({ materia: f.materia_nombre, seccion: f.seccion_nombre, lapso, tipo: f.tipo_proyeccion, pnf: f.pnf_nombre, ...ubicacion });
          }
        }
      }
    }

    // 6) Conflictos de horario (misma aproximación por pares del resumen,
    //    con desglose aula/profesor) y docentes con carga en el período.
    const conflictos = contarConflictos(entries);
    const [docentes] = await query<any[]>(
      `SELECT COUNT(DISTINCT a.profesor_id) AS n FROM proyeccion_asignaciones a
       JOIN proyecciones p ON p.id = a.proyeccion_id
       WHERE p.periodo_academico = ? AND p.activa = 1 ${pnfCond}`,
      [periodo, ...pnfParams]
    );
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

    // 7) Usuarios que han ingresado (bitácora de autenticación, global). Los
    //    eventos auth.* se registran antes de que exista la sesión, así que
    //    username/role van en el JSON de `detalle`, no en las columnas.
    const logins = await query<any[]>(
      `SELECT username, role, COUNT(*) AS total, MAX(ultimo) AS ultimo_login
       FROM (
         SELECT COALESCE(a.username,
                        JSON_UNQUOTE(JSON_EXTRACT(a.detalle, '$.username')),
                        JSON_UNQUOTE(JSON_EXTRACT(a.detalle, '$.profesor'))) AS username,
                COALESCE(a.role,
                        JSON_UNQUOTE(JSON_EXTRACT(a.detalle, '$.role')),
                        'PROFESOR') AS role,
                a.created_at AS ultimo
         FROM audit_log a
         WHERE a.accion IN ('auth.login', 'auth.profesor_login')
       ) t
       GROUP BY username, role
       ORDER BY ultimo_login DESC
       LIMIT 10`
    );

    const listaPorPnf = (map: Map<number, { nombre: string; n: number }>) =>
      [...map.entries()]
        .map(([id, v]) => ({ pnf_saga_id: id, nombre: v.nombre, n: v.n }))
        .sort((a, b) => b.n - a.n);

    return reply.send({
      success: true,
      data: {
        periodo,
        periodo_nombre: periodoRows[0]?.nombre ?? null,
        proyecciones_activas: proy.n,
        secciones: secc.n,
        clases_agendadas: entries.length,
        docentes_con_carga: docentes.n,
        cobertura_pnf,
        uso_aulas: {
          total_activas: aulas.length,
          en_uso: por_aula.filter((a) => a.ocupados > 0).length,
          sin_uso: por_aula.filter((a) => a.ocupados === 0).length,
          por_aula,
        },
        turnos: turnosData,
        sin_horario: { total: totalSinHorario, por_pnf: listaPorPnf(sinHorarioPorPnf), detalle: detalleSinHorario },
        sin_profesor: { total: totalSinProfesor, por_pnf: listaPorPnf(sinProfesorPorPnf), detalle: detalleSinProfesor },
        conflictos,
        usuarios_login: logins,
      },
    });
  } catch (e: any) {
    request.log.error(e);
    return reply.status(500).send({ success: false, message: 'Error calculando las estadísticas.' });
  }
}
