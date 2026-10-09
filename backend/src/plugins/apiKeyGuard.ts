import { FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';

// Extrae la API key del header 'x-api-key' o de 'Authorization: Bearer <key>'.
function extractKey(request: FastifyRequest): string {
  const headerKey = request.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey) return headerKey;
  const auth = request.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

// Guard para integraciones externas (app de asistencias): solo lectura con
// credencial fija configurada en EXTERNAL_API_KEY.
export async function authenticateApiKey(request: FastifyRequest, reply: FastifyReply) {
  const expected = env.EXTERNAL_API_KEY;
  if (!expected) {
    request.log.warn('EXTERNAL_API_KEY no configurada: /api/externo deshabilitado.');
    return reply.status(503).send({
      success: false,
      message: 'Servicio externo no configurado.',
    });
  }

  const provided = extractKey(request);
  const valid =
    provided.length === expected.length &&
    provided.length > 0 &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (!valid) {
    return reply.status(401).send({
      success: false,
      message: 'No autorizado. API key inválida o ausente.',
    });
  }
}
