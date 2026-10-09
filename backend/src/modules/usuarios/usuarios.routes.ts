import { FastifyInstance } from 'fastify';
import {
  listUsuariosHandler,
  createUsuarioHandler,
  updateUsuarioHandler,
  toggleActivoUsuarioHandler,
  updateSelfHandler,
  mySecurityQuestionsHandler,
  updateMySecurityQuestionsHandler,
} from './usuarios.controller.js';
import { authenticate, authorizeRoles } from '../../plugins/authGuard.js';

// Solo el nivel Master (SUPER_USUARIO) administra usuarios del sistema
const MASTER = ['SUPER_USUARIO'] as const;

export async function usuariosRoutes(fastify: FastifyInstance) {
  // Auto-edición: cualquier cuenta autenticada edita SUS propios datos y sus
  // preguntas de seguridad (registradas antes que /:id por claridad)
  fastify.put('/me', { preHandler: [authenticate] }, updateSelfHandler);
  fastify.get('/me/security-questions', { preHandler: [authenticate] }, mySecurityQuestionsHandler);
  fastify.put(
    '/me/security-questions',
    { preHandler: [authenticate] },
    updateMySecurityQuestionsHandler
  );

  fastify.get('/', { preHandler: [authenticate, authorizeRoles(...MASTER)] }, listUsuariosHandler);
  fastify.post('/', { preHandler: [authenticate, authorizeRoles(...MASTER)] }, createUsuarioHandler);
  fastify.put('/:id', { preHandler: [authenticate, authorizeRoles(...MASTER)] }, updateUsuarioHandler);
  fastify.put(
    '/:id/toggle-activo',
    { preHandler: [authenticate, authorizeRoles(...MASTER)] },
    toggleActivoUsuarioHandler
  );
}
