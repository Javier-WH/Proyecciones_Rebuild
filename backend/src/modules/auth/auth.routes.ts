import { FastifyInstance } from 'fastify';
import {
  loginHandler,
  meHandler,
  profesorLoginHandler,
  securityQuestionsHandler,
  recoveryQuestionsHandler,
  recoverPasswordHandler,
  logoutHandler,
} from './auth.controller.js';
import { authenticate } from '../../plugins/authGuard.js';

// Límites estrictos para las rutas sensibles (fuerza bruta de contraseñas,
// cédulas y respuestas de seguridad). El rate limit global (300/min) sigue
// aplicando al resto del API.
const LIMIT_LOGIN = { rateLimit: { max: 10, timeWindow: '1 minute' } };
const LIMIT_RECUPERACION = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', { config: LIMIT_LOGIN }, loginHandler);

  fastify.post('/profesor-login', { config: LIMIT_LOGIN }, profesorLoginHandler);

  // Recuperación de contraseña por preguntas de seguridad (públicas)
  fastify.get('/security-questions', securityQuestionsHandler);
  fastify.get(
    '/recovery-questions',
    { config: LIMIT_RECUPERACION },
    recoveryQuestionsHandler
  );
  fastify.post(
    '/recover-password',
    { config: LIMIT_RECUPERACION },
    recoverPasswordHandler
  );

  fastify.get('/me', { preHandler: [authenticate] }, meHandler);

  fastify.post('/logout', { preHandler: [authenticate] }, logoutHandler);
}
