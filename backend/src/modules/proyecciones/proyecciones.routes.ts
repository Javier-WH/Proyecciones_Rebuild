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

// Escritura: Master + Coordinador (este último validado a su PNF en los handlers)
const ESCRITORES = ['SUPER_USUARIO', 'ADMINISTRADOR'] as const;

export async function proyeccionesRoutes(fastify: FastifyInstance) {
  // Rutas estáticas antes que /:id
  fastify.get('/carga-docente', { preHandler: [authenticate] }, cargaDocenteHandler);
  fastify.put(
    '/asignaciones',
    { preHandler: [authenticate, authorizeRoles(...ESCRITORES)] },
    upsertAsignacionHandler
  );

  fastify.post('/', { preHandler: [authenticate, authorizeRoles(...ESCRITORES)] }, createProyeccionHandler);
  fastify.get('/', { preHandler: [authenticate] }, listProyeccionesHandler);
  fastify.get('/:id', { preHandler: [authenticate] }, getProyeccionDetailHandler);
  fastify.put('/:id', { preHandler: [authenticate, authorizeRoles(...ESCRITORES)] }, updateProyeccionHandler);
  fastify.put(
    '/:id/toggle-active',
    { preHandler: [authenticate, authorizeRoles(...ESCRITORES)] },
    toggleActiveProyeccionHandler
  );
  fastify.delete('/:id', { preHandler: [authenticate, authorizeRoles(...ESCRITORES)] }, deleteProyeccionHandler);
}
