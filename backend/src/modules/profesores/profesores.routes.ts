import { FastifyInstance } from 'fastify';
import {
  listProfesoresHandler,
  getProfesorHandler,
  createProfesorHandler,
  updateProfesorHandler,
  toggleActivoProfesorHandler,
  uploadFotoProfesorHandler,
  deleteFotoProfesorHandler,
  syncProfesoresHandler,
  listTiposContratoHandler,
  createTipoContratoHandler,
  updateTipoContratoHandler,
  syncTiposContratoHandler,
} from './profesores.controller.js';
import { authenticate, authorizeRoles } from '../../plugins/authGuard.js';

const GESTORES = ['SUPER_USUARIO', 'ADMINISTRADOR', 'REGULAR'] as const;
const ADMINS = ['SUPER_USUARIO', 'ADMINISTRADOR'] as const;

export async function profesoresRoutes(fastify: FastifyInstance) {
  // Tipos de contrato (catálogo editable sincronizado con SAGA)
  fastify.get('/tipos-contrato', { preHandler: [authenticate] }, listTiposContratoHandler);
  fastify.post('/tipos-contrato', { preHandler: [authenticate, authorizeRoles(...ADMINS)] }, createTipoContratoHandler);
  fastify.put('/tipos-contrato/:id', { preHandler: [authenticate, authorizeRoles(...ADMINS)] }, updateTipoContratoHandler);
  fastify.post('/tipos-contrato/sync', { preHandler: [authenticate, authorizeRoles(...ADMINS)] }, syncTiposContratoHandler);

  // Sincronización de profesores con la API SAGA
  fastify.post('/sync', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, syncProfesoresHandler);

  // CRUD de profesores
  fastify.get('/', { preHandler: [authenticate] }, listProfesoresHandler);
  fastify.post('/', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, createProfesorHandler);
  fastify.get('/:id', { preHandler: [authenticate] }, getProfesorHandler);
  fastify.put('/:id', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, updateProfesorHandler);
  fastify.put('/:id/toggle-activo', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, toggleActivoProfesorHandler);

  // Foto del profesor (base64, máx ~4.5 MB de payload ≈ 3 MB de imagen)
  fastify.put(
    '/:id/foto',
    { preHandler: [authenticate, authorizeRoles(...GESTORES)], bodyLimit: 4.5 * 1024 * 1024 },
    uploadFotoProfesorHandler
  );
  fastify.delete(
    '/:id/foto',
    { preHandler: [authenticate, authorizeRoles(...GESTORES)] },
    deleteFotoProfesorHandler
  );
}
