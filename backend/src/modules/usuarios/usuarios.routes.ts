import { FastifyInstance } from 'fastify';
import {
  listUsuariosHandler,
  createUsuarioHandler,
  updateUsuarioHandler,
  toggleActivoUsuarioHandler,
} from './usuarios.controller.js';
import { authenticate, authorizeRoles } from '../../plugins/authGuard.js';

// Solo el nivel Master (SUPER_USUARIO) administra usuarios del sistema
const MASTER = ['SUPER_USUARIO'] as const;

export async function usuariosRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [authenticate, authorizeRoles(...MASTER)] }, listUsuariosHandler);
  fastify.post('/', { preHandler: [authenticate, authorizeRoles(...MASTER)] }, createUsuarioHandler);
  fastify.put('/:id', { preHandler: [authenticate, authorizeRoles(...MASTER)] }, updateUsuarioHandler);
  fastify.put(
    '/:id/toggle-activo',
    { preHandler: [authenticate, authorizeRoles(...MASTER)] },
    toggleActivoUsuarioHandler
  );
}
