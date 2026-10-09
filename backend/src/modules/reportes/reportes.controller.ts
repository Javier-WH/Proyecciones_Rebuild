import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../db/mysql.js';

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
