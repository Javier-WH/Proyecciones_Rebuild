import { FastifyInstance } from 'fastify';
import { horarioProfesorHandler } from './externo.controller.js';
import { authenticateApiKey } from '../../plugins/apiKeyGuard.js';

// API de solo lectura para integraciones externas (app de asistencias).
// Autenticación: header 'x-api-key' o 'Authorization: Bearer <key>'.
export async function externoRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/horario/:cedula',
    { preHandler: [authenticateApiKey] },
    horarioProfesorHandler
  );
}
