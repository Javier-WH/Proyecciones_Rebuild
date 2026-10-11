import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/mysql.js';

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
  // Identificador único del token (para revocación al cerrar sesión) y
  // versión de credenciales del usuario (se incrementa al cambiar la
  // contraseña: invalida todas las sesiones anteriores).
  jti?: string;
  tv?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    userPayload?: UserTokenPayload;
  }
}

// Purga perezosa de tokens revocados ya expirados (una purga por minuto
// como mucho, sin penalizar cada request).
let ultimaPurga = 0;
async function purgarExpirados() {
  const ahora = Date.now();
  if (ahora - ultimaPurga < 60_000) return;
  ultimaPurga = ahora;
  try {
    await query('DELETE FROM revoked_tokens WHERE expires_at < NOW()');
  } catch {
    /* la purga es best-effort */
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify<UserTokenPayload>();

    // 1. ¿El token fue revocado explícitamente? (logout)
    if (decoded.jti) {
      const rev = await query<any[]>(
        'SELECT 1 AS x FROM revoked_tokens WHERE jti = ? LIMIT 1',
        [decoded.jti]
      );
      if (rev.length > 0) {
        return reply.status(401).send({
          success: false,
          message: 'Sesión cerrada. Inicie sesión nuevamente.',
        });
      }
    }
    purgarExpirados().catch(() => {});

    // 2. ¿Las credenciales del usuario cambiaron después de emitirse el
    // token? (cambio/recuperación de contraseña, reset por admin)
    // tv === undefined = token emitido antes de la migración: se acepta.
    if (!decoded.invitado && decoded.tv !== undefined && decoded.id > 0) {
      const rows = await query<any[]>(
        'SELECT token_version FROM users WHERE id = ? AND activo = 1 LIMIT 1',
        [decoded.id]
      );
      if (rows.length === 0 || rows[0].token_version !== decoded.tv) {
        return reply.status(401).send({
          success: false,
          message: 'La sesión ya no es válida. Inicie sesión nuevamente.',
        });
      }
    }

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
