import { FastifyInstance } from 'fastify';
import {
  listPeriodosHandler,
  listPeriodosActivosHandler,
  createPeriodoHandler,
  updatePeriodoHandler,
  deletePeriodoHandler,
} from './periodos.controller.js';
import { authenticate } from '../../plugins/authGuard.js';

export async function periodosRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [authenticate] }, listPeriodosHandler);
  fastify.get('/activos', { preHandler: [authenticate] }, listPeriodosActivosHandler);
  fastify.post('/', { preHandler: [authenticate] }, createPeriodoHandler);
  fastify.put('/:id', { preHandler: [authenticate] }, updatePeriodoHandler);
  fastify.delete('/:id', { preHandler: [authenticate] }, deletePeriodoHandler);
}
