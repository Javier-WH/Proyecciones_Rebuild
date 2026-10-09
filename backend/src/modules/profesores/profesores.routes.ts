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
  deleteTipoContratoHandler,
  syncTiposContratoHandler,
  getPerfilesProfesorHandler,
  setPerfilesProfesorHandler,
  getPerfilMateriasProfesorHandler,
  getDisponibilidadHandler,
  setDisponibilidadSlotHandler,
} from './profesores.controller.js';
import { authenticate, authorizeRoles } from '../../plugins/authGuard.js';

// Escritura: Master + Coordinador (catálogo global). REGULAR es solo lectura.
const ADMINS = ['SUPER_USUARIO', 'ADMINISTRADOR'] as const;
const GESTORES = ADMINS;

export async function profesoresRoutes(fastify: FastifyInstance) {
  // Tipos de contrato (catálogo editable sincronizado con SAGA)
  fastify.get('/tipos-contrato', { preHandler: [authenticate] }, listTiposContratoHandler);
  fastify.post('/tipos-contrato', { preHandler: [authenticate, authorizeRoles(...ADMINS)] }, createTipoContratoHandler);
  fastify.put('/tipos-contrato/:id', { preHandler: [authenticate, authorizeRoles(...ADMINS)] }, updateTipoContratoHandler);
  fastify.delete('/tipos-contrato/:id', { preHandler: [authenticate, authorizeRoles(...ADMINS)] }, deleteTipoContratoHandler);
  fastify.post('/tipos-contrato/sync', { preHandler: [authenticate, authorizeRoles(...ADMINS)] }, syncTiposContratoHandler);

  // Sincronización de profesores con la API SAGA
  fastify.post('/sync', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, syncProfesoresHandler);

  // CRUD de profesores
  fastify.get('/', { preHandler: [authenticate] }, listProfesoresHandler);
  fastify.post('/', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, createProfesorHandler);
  fastify.get('/:id', { preHandler: [authenticate] }, getProfesorHandler);
  fastify.put('/:id', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, updateProfesorHandler);
  fastify.put('/:id/toggle-activo', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, toggleActivoProfesorHandler);

  // Perfiles docentes del profesor
  fastify.get('/:id/perfiles', { preHandler: [authenticate] }, getPerfilesProfesorHandler);
  fastify.put('/:id/perfiles', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, setPerfilesProfesorHandler);
  fastify.get('/:id/perfiles-materias', { preHandler: [authenticate] }, getPerfilMateriasProfesorHandler);

  // Disponibilidad horaria del profesor (slots bloqueados)
  fastify.get('/:id/disponibilidad', { preHandler: [authenticate] }, getDisponibilidadHandler);
  // PROFESOR también puede entrar: el handler verifica que solo edite la suya
  fastify.put('/:id/disponibilidad', { preHandler: [authenticate, authorizeRoles(...GESTORES, 'PROFESOR')] }, setDisponibilidadSlotHandler);

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
