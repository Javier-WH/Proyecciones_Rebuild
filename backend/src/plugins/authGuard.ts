import { FastifyRequest, FastifyReply } from 'fastify';

export interface UserTokenPayload {
  id: number;
  username: string;
  role: 'SUPER_USUARIO' | 'ADMINISTRADOR' | 'REGULAR' | 'PROFESOR';
  nombre: string;
  apellido: string;
  pnf_saga_id?: number | null;
  profesor_cedula?: string | null;
  // true cuando la sesión es de un docente que entró solo con su cédula
  // (sin cuenta de usuario). id = -profesor.id en ese caso.
  invitado?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    userPayload?: UserTokenPayload;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify<UserTokenPayload>();
    request.userPayload = decoded;
  } catch (err) {
    return reply.status(401).send({
      success: false,
      message: 'No autorizado. Token de sesión inválido o expirado.',
    });
  }
}

export function authorizeRoles(...allowedRoles: Array<'SUPER_USUARIO' | 'ADMINISTRADOR' | 'REGULAR' | 'PROFESOR'>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.userPayload) {
      return reply.status(401).send({ success: false, message: 'No autenticado.' });
    }

    if (!allowedRoles.includes(request.userPayload.role)) {
      return reply.status(403).send({
        success: false,
        message: 'Acceso denegado. No posee los permisos requeridos para esta acción.',
      });
    }
  };
}

// true cuando el usuario es un Coordinador (ADMINISTRADOR) intentando tocar
// datos de un PNF que no es el suyo — incluye el caso "sin PNF asociado",
// que para ese rol es obligatorio y por tanto prohibido para escribir.
export function esCoordinadorDeOtroPnf(
  user: UserTokenPayload,
  pnfSagaId: number | string | null | undefined
): boolean {
  if (user.role !== 'ADMINISTRADOR') return false;
  if (user.pnf_saga_id == null || pnfSagaId == null) return true;
  return Number(user.pnf_saga_id) !== Number(pnfSagaId);
}

export const MSG_PNF_PROHIBIDO = 'Solo puede gestionar información de su PNF asignado.';
