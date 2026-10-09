import { FastifyInstance } from 'fastify';
import { getPlantillaHandler, putPlantillaHandler } from './reportes.controller.js';
import { authenticate, authorizeRoles } from '../../plugins/authGuard.js';

const GESTORES = ['SUPER_USUARIO', 'ADMINISTRADOR', 'REGULAR'] as const;

export async function reportesRoutes(fastify: FastifyInstance) {
  // Cualquier usuario lee la plantilla; solo gestores la modifican (el
  // encabezado es global — un docente no debería cambiarlo para todos).
  fastify.get('/plantilla/:reporte', { preHandler: [authenticate] }, getPlantillaHandler);
  fastify.put(
    '/plantilla/:reporte',
    { preHandler: [authenticate, authorizeRoles(...GESTORES)] },
    putPlantillaHandler
  );
}
