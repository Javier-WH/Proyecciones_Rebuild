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
  setDisponibilidadBulkHandler,
  getDisponibilidadSugeridaHandler,
  setDisponibilidadSugeridaSlotHandler,
  setDisponibilidadSugeridaBulkHandler,
  sincronizarDisponibilidadHandler,
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

  // Disponibilidad horaria REAL del profesor (slots bloqueados): la escriben
  // solo los gestores; es la que usa el generador/auditoría de horarios.
  fastify.get('/:id/disponibilidad', { preHandler: [authenticate] }, getDisponibilidadHandler);
  fastify.put('/:id/disponibilidad', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, setDisponibilidadSlotHandler);
  fastify.put('/:id/disponibilidad-bulk', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, setDisponibilidadBulkHandler);
  // Copia la sugerencia del docente sobre la disponibilidad real (reemplazo).
  fastify.put('/:id/disponibilidad/sincronizar', { preHandler: [authenticate, authorizeRoles(...GESTORES)] }, sincronizarDisponibilidadHandler);

  // Disponibilidad SUGERIDA: lo que el docente propone desde su portal. Solo
  // consulta para el coordinador; no afecta el horario. El PROFESOR solo
  // edita la suya (el handler lo verifica).
  fastify.get('/:id/disponibilidad-sugerida', { preHandler: [authenticate] }, getDisponibilidadSugeridaHandler);
  fastify.put('/:id/disponibilidad-sugerida', { preHandler: [authenticate, authorizeRoles('PROFESOR')] }, setDisponibilidadSugeridaSlotHandler);
  fastify.put('/:id/disponibilidad-sugerida-bulk', { preHandler: [authenticate, authorizeRoles('PROFESOR')] }, setDisponibilidadSugeridaBulkHandler);

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
