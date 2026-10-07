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
