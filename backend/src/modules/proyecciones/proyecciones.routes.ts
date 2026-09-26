import { FastifyInstance } from 'fastify';
import {
  createProyeccionHandler,
  listProyeccionesHandler,
  getProyeccionDetailHandler,
  updateProyeccionHandler,
  toggleActiveProyeccionHandler,
  deleteProyeccionHandler,
} from './proyecciones.controller.js';
import { authenticate } from '../../plugins/authGuard.js';

export async function proyeccionesRoutes(fastify: FastifyInstance) {
  fastify.post('/', { preHandler: [authenticate] }, createProyeccionHandler);
  fastify.get('/', { preHandler: [authenticate] }, listProyeccionesHandler);
  fastify.get('/:id', { preHandler: [authenticate] }, getProyeccionDetailHandler);
  fastify.put('/:id', { preHandler: [authenticate] }, updateProyeccionHandler);
  fastify.put('/:id/toggle-active', { preHandler: [authenticate] }, toggleActiveProyeccionHandler);
  fastify.delete('/:id', { preHandler: [authenticate] }, deleteProyeccionHandler);
}
