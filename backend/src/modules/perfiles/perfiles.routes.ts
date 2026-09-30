import { FastifyInstance } from 'fastify';
import {
  listPerfilesHandler,
  createPerfilHandler,
  updatePerfilHandler,
  deletePerfilHandler,
  catalogoMateriasHandler,
} from './perfiles.controller.js';
import { authenticate, authorizeRoles } from '../../plugins/authGuard.js';

const GESTORES = ['SUPER_USUARIO', 'ADMINISTRADOR', 'REGULAR'] as const;

export async function perfilesRoutes(fastify: FastifyInstance) {
  // Rutas estáticas antes que /:id
  fastify.get('/materias-catalogo', { preHandler: [authenticate] }, catalogoMateriasHandler);

  fastify.get('/', { preHandler: [authenticate] }, listPerfilesHandler);
  fastify.post('/', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, createPerfilHandler);
  fastify.put('/:id', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, updatePerfilHandler);
  fastify.delete('/:id', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, deletePerfilHandler);
}
