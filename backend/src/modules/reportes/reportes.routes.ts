import { FastifyInstance } from 'fastify';
import { getPlantillaHandler, putPlantillaHandler, resumenHandler } from './reportes.controller.js';
import { authenticate, authorizeRoles } from '../../plugins/authGuard.js';

const GESTORES = ['SUPER_USUARIO', 'ADMINISTRADOR'] as const;

export async function reportesRoutes(fastify: FastifyInstance) {
  // Métricas del periodo activo para el dashboard
  fastify.get('/resumen', { preHandler: [authenticate] }, resumenHandler);
  // Cualquier usuario lee la plantilla; solo gestores la modifican (el
  // encabezado es global — un docente no debería cambiarlo para todos).
  fastify.get('/plantilla/:reporte', { preHandler: [authenticate] }, getPlantillaHandler);
  fastify.put(
    '/plantilla/:reporte',
    { preHandler: [authenticate, authorizeRoles(...GESTORES)] },
    putPlantillaHandler
  );
}
