import { FastifyInstance } from 'fastify';
import {
  listPeriodosHandler,
  listPeriodosActivosHandler,
  createPeriodoHandler,
  updatePeriodoHandler,
  deletePeriodoHandler,
} from './periodos.controller.js';
import { authenticate, authorizeRoles } from '../../plugins/authGuard.js';

// Solo el Master (SUPER_USUARIO) puede crear/editar/eliminar periodos.
// Coordinador y Usuario solo los consultan.
const MASTER = ['SUPER_USUARIO'] as const;

export async function periodosRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [authenticate] }, listPeriodosHandler);
  fastify.get('/activos', { preHandler: [authenticate] }, listPeriodosActivosHandler);
  fastify.post('/', { preHandler: [authenticate, authorizeRoles(...MASTER)] }, createPeriodoHandler);
  fastify.put('/:id', { preHandler: [authenticate, authorizeRoles(...MASTER)] }, updatePeriodoHandler);
  fastify.delete('/:id', { preHandler: [authenticate, authorizeRoles(...MASTER)] }, deletePeriodoHandler);
}
