import { FastifyInstance } from 'fastify';
import { loginHandler, meHandler, profesorLoginHandler } from './auth.controller.js';
import { authenticate } from '../../plugins/authGuard.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', loginHandler);

  fastify.post('/profesor-login', profesorLoginHandler);
  
  fastify.get('/me', { preHandler: [authenticate] }, meHandler);

  fastify.post('/logout', async (_request, reply) => {
    return reply.send({ success: true, message: 'Sesión cerrada exitosamente.' });
  });
}
