import { FastifyInstance } from 'fastify';
import { sagaService } from './saga.service.js';
import { authenticate } from '../../plugins/authGuard.js';

export async function sagaRoutes(fastify: FastifyInstance) {
  fastify.get('/status', { preHandler: [authenticate] }, async (_req, reply) => {
    const token = await sagaService.getProgramas();
    if (token) {
      return reply.send({ success: true, connected: true, message: 'Conexión a API SAGA activa y funcional.' });
    }
    return reply.status(503).send({ success: false, connected: false, message: 'La API externa SAGA no está disponible.' });
  });

  fastify.get('/programas', { preHandler: [authenticate] }, async (_req, reply) => {
    const data = await sagaService.getProgramas();
    return reply.send({ success: true, data: data || [] });
  });

  fastify.get('/trayectos', { preHandler: [authenticate] }, async (_req, reply) => {
    const data = await sagaService.getTrayectos();
    return reply.send({ success: true, data: data || [] });
  });

  fastify.get('/turnos', { preHandler: [authenticate] }, async (_req, reply) => {
    const data = await sagaService.getTurnos();
    return reply.send({ success: true, data: data || [] });
  });

  fastify.get('/teachers', { preHandler: [authenticate] }, async (_req, reply) => {
    const data = await sagaService.getTeachers();
    return reply.send({ success: true, data: data || [] });
  });

  fastify.get('/mayas/:pnfSagaId', { preHandler: [authenticate] }, async (req, reply) => {
    const { pnfSagaId } = req.params as { pnfSagaId: string };
    const data = await sagaService.getMayas(pnfSagaId);
    return reply.send({ success: true, data: data || [] });
  });

  fastify.get('/materias-maya/:pnfSagaId/:mayaId', { preHandler: [authenticate] }, async (req, reply) => {
    const { pnfSagaId, mayaId } = req.params as { pnfSagaId: string; mayaId: string };
    const data = await sagaService.getMateriasPorMaya(pnfSagaId, mayaId);
    return reply.send({ success: true, data: data || [] });
  });

  fastify.get('/ucslist/:pnfSagaId/:trayectoSagaId/:mayaId', { preHandler: [authenticate] }, async (req, reply) => {
    const { pnfSagaId, trayectoSagaId, mayaId } = req.params as {
      pnfSagaId: string;
      trayectoSagaId: string;
      mayaId: string;
    };
    const data = await sagaService.getUcsList(pnfSagaId, trayectoSagaId, mayaId);
    return reply.send({ success: true, data: data || [] });
  });

  fastify.get('/inscriptions-summary/:pnfSagaId/:trayectoSagaId', { preHandler: [authenticate] }, async (req, reply) => {
    const { pnfSagaId, trayectoSagaId } = req.params as { pnfSagaId: string; trayectoSagaId: string };
    const data = await sagaService.getInscriptionsSummary(pnfSagaId, trayectoSagaId);
    return reply.send({ success: true, data: data || [] });
  });
}
