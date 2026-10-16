import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../db/mysql.js';
import { authenticate } from '../../plugins/authGuard.js';

// GET /api/sync — "token de cambio" para el poll de sincronización del
// cliente. Devuelve el MAX(id) de la bitácora sobre las entidades que
// alimentan las vistas colaborativas: baratísimo (una query indexada de
// ~1KB) y el cliente solo refetchea la data pesada cuando el número sube.
//
// No se filtra por período ni usuario: un cambio ajeno en otra cosa
// provoca a lo sumo un refetch "de más" — molestia inofensiva, no error.
// 'usuario' queda fuera a propósito: logins/logouts también auditan con
// esa entidad y dispararían refetches constantes sin cambio de datos.
const ENTIDADES_DATOS = [
  'horario_entry',
  'asignacion',
  'proyeccion',
  'periodo',
  'aula',
  'turno',
  'profesor',
  'config',
] as const;

async function syncHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const ph = ENTIDADES_DATOS.map(() => '?').join(',');
    const rows = await query<any[]>(
      `SELECT MAX(id) AS v FROM audit_log WHERE entidad IN (${ph})`,
      [...ENTIDADES_DATOS]
    );
    return reply.send({ success: true, data: { v: rows[0]?.v ?? 0 } });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error consultando el estado de sincronización.' });
  }
}

export async function syncRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [authenticate] }, syncHandler);
}
