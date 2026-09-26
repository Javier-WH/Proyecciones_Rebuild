import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../db/mysql.js';
import { verifyPassword } from '../../utils/security.js';
import { UserTokenPayload } from '../../plugins/authGuard.js';

interface UserRow {
  id: number;
  username: string;
  password: string;
  nombre: string;
  apellido: string;
  email: string | null;
  role: 'SUPER_USUARIO' | 'ADMINISTRADOR' | 'REGULAR' | 'PROFESOR';
  pnf_saga_id: number | null;
  profesor_cedula: string | null;
  activo: number;
}

export async function loginHandler(request: FastifyRequest, reply: FastifyReply) {
  const { username, password } = request.body as { username?: string; password?: string };

  if (!username || !password) {
    return reply.status(400).send({
      success: false,
      message: 'Debe ingresar nombre de usuario y contraseña.',
    });
  }

  try {
    const users = await query<UserRow[]>('SELECT * FROM users WHERE username = ? LIMIT 1', [username.trim()]);
    
    if (users.length === 0) {
      return reply.status(401).send({
        success: false,
        message: 'Usuario o contraseña incorrectos.',
      });
    }

    const user = users[0];

    if (!user.activo) {
      return reply.status(403).send({
        success: false,
        message: 'Esta cuenta de usuario se encuentra desactivada. Contacte al administrador.',
      });
    }

    const isValidPassword = await verifyPassword(password, user.password);
    if (!isValidPassword) {
      return reply.status(401).send({
        success: false,
        message: 'Usuario o contraseña incorrectos.',
      });
    }

    const tokenPayload: UserTokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      nombre: user.nombre,
      apellido: user.apellido,
      pnf_saga_id: user.pnf_saga_id,
      profesor_cedula: user.profesor_cedula,
    };

    const token = request.server.jwt.sign(tokenPayload, { expiresIn: '24h' });

    return reply.send({
      success: true,
      message: 'Inicio de sesión exitoso.',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          nombre: user.nombre,
          apellido: user.apellido,
          email: user.email,
          role: user.role,
          pnf_saga_id: user.pnf_saga_id,
          profesor_cedula: user.profesor_cedula,
        },
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: 'Error interno del servidor al procesar la autenticación.',
    });
  }
}

export async function meHandler(request: FastifyRequest, reply: FastifyReply) {
  const payload = request.userPayload;
  if (!payload) {
    return reply.status(401).send({ success: false, message: 'No autenticado.' });
  }

  try {
    const users = await query<UserRow[]>(
      'SELECT id, username, nombre, apellido, email, role, pnf_saga_id, profesor_cedula, activo FROM users WHERE id = ? LIMIT 1',
      [payload.id]
    );

    if (users.length === 0 || !users[0].activo) {
      return reply.status(401).send({ success: false, message: 'Usuario no encontrado o inactivo.' });
    }

    return reply.send({
      success: true,
      data: { user: users[0] },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error recuperando información del usuario.' });
  }
}
