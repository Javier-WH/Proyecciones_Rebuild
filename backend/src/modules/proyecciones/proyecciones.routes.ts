import { FastifyInstance } from 'fastify';
import {
  createProyeccionHandler,
  listProyeccionesHandler,
  getProyeccionDetailHandler,
  updateProyeccionHandler,
  toggleActiveProyeccionHandler,
  deleteProyeccionHandler,
} from './proyecciones.controller.js';
import { cargaDocenteHandler, upsertAsignacionHandler } from './asignaciones.controller.js';
import { authenticate, authorizeRoles } from '../../plugins/authGuard.js';

export async function proyeccionesRoutes(fastify: FastifyInstance) {
  // Rutas estáticas antes que /:id
  fastify.get('/carga-docente', { preHandler: [authenticate] }, cargaDocenteHandler);
  fastify.put(
    '/asignaciones',
    { preHandler: [authenticate, authorizeRoles('SUPER_USUARIO', 'ADMINISTRADOR', 'REGULAR')] },
    upsertAsignacionHandler
  );

  fastify.post('/', { preHandler: [authenticate] }, createProyeccionHandler);
  fastify.get('/', { preHandler: [authenticate] }, listProyeccionesHandler);
  fastify.get('/:id', { preHandler: [authenticate] }, getProyeccionDetailHandler);
  fastify.put('/:id', { preHandler: [authenticate] }, updateProyeccionHandler);
  fastify.put('/:id/toggle-active', { preHandler: [authenticate] }, toggleActiveProyeccionHandler);
  fastify.delete('/:id', { preHandler: [authenticate] }, deleteProyeccionHandler);
}
