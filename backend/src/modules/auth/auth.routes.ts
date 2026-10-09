import { FastifyInstance } from 'fastify';
import {
  loginHandler,
  meHandler,
  profesorLoginHandler,
  securityQuestionsHandler,
  recoveryQuestionsHandler,
  recoverPasswordHandler,
} from './auth.controller.js';
import { authenticate } from '../../plugins/authGuard.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', loginHandler);

  fastify.post('/profesor-login', profesorLoginHandler);

  // Recuperación de contraseña por preguntas de seguridad (públicas)
  fastify.get('/security-questions', securityQuestionsHandler);
  fastify.get('/recovery-questions', recoveryQuestionsHandler);
  fastify.post('/recover-password', recoverPasswordHandler);

  fastify.get('/me', { preHandler: [authenticate] }, meHandler);

  fastify.post('/logout', async (_request, reply) => {
    return reply.send({ success: true, message: 'Sesión cerrada exitosamente.' });
  });
}
