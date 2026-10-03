import { FastifyInstance } from 'fastify';
import {
  listAulasHandler,
  createAulaHandler,
  updateAulaHandler,
  deleteAulaHandler,
  listTurnosHandler,
  createTurnoHandler,
  updateTurnoHandler,
  deleteTurnoHandler,
  replaceBloquesHandler,
  deleteTurnoEntriesHandler,
  getConfigHandler,
  updateConfigHandler,
  listPnfsHandler,
  updatePnfColorHandler,
} from './horarios.controller.js';
import {
  listEntriesHandler,
  upsertEntryHandler,
  swapEntriesHandler,
  deleteEntryHandler,
  generarHorarioHandler,
} from './entries.controller.js';
import { authenticate, authorizeRoles } from '../../plugins/authGuard.js';

const GESTORES = ['SUPER_USUARIO', 'ADMINISTRADOR', 'REGULAR'] as const;
const ADMINS = ['SUPER_USUARIO', 'ADMINISTRADOR'] as const;

export async function horariosRoutes(fastify: FastifyInstance) {
  // Aulas
  fastify.get('/aulas', { preHandler: [authenticate] }, listAulasHandler);
  fastify.post('/aulas', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, createAulaHandler);
  fastify.put('/aulas/:id', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, updateAulaHandler);
  fastify.delete('/aulas/:id', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, deleteAulaHandler);

  // Catálogo completo de PNFs del sistema
  fastify.get('/pnfs', { preHandler: [authenticate] }, listPnfsHandler);
  fastify.put('/pnfs/:sagaId/color', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, updatePnfColorHandler);

  // Turnos y bloques horarios
  fastify.get('/turnos', { preHandler: [authenticate] }, listTurnosHandler);
  fastify.post('/turnos', { preHandler: [authenticate, authorizeRoles(...ADMINS)] }, createTurnoHandler);
  fastify.put('/turnos/:id', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, updateTurnoHandler);
  fastify.delete('/turnos/:id', { preHandler: [authenticate, authorizeRoles(...ADMINS)] }, deleteTurnoHandler);
  fastify.put(
    '/turnos/:id/bloques',
    { preHandler: [authenticate, authorizeRoles(...GESTORES)] },
    replaceBloquesHandler
  );
  fastify.delete(
    '/turnos/:id/entries',
    { preHandler: [authenticate, authorizeRoles(...GESTORES)] },
    deleteTurnoEntriesHandler
  );

  // Reglas de generación automática
  fastify.get('/config', { preHandler: [authenticate] }, getConfigHandler);
  fastify.put('/config', { preHandler: [authenticate, authorizeRoles(...ADMINS)] }, updateConfigHandler);

  // Entries del horario (una clase en un bloque/día/aula)
  fastify.get('/entries', { preHandler: [authenticate] }, listEntriesHandler);
  fastify.put('/entries', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, upsertEntryHandler);
  fastify.post('/entries/swap', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, swapEntriesHandler);
  fastify.delete('/entries/:id', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, deleteEntryHandler);
  fastify.post('/generar', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, generarHorarioHandler);
}
