import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../db/mysql.js';
import { hashPassword } from '../../utils/security.js';

type UserRole = 'SUPER_USUARIO' | 'ADMINISTRADOR' | 'REGULAR' | 'PROFESOR';
const ROLES_VALIDOS: UserRole[] = ['SUPER_USUARIO', 'ADMINISTRADOR', 'REGULAR', 'PROFESOR'];

interface UsuarioBody {
  username?: string;
  password?: string;
  nombre?: string;
  apellido?: string;
  email?: string | null;
  role?: UserRole;
  pnf_saga_id?: number | null;
  profesor_cedula?: string | null;
}

// GET /api/usuarios — lista todos los usuarios del sistema
export async function listUsuariosHandler(_request: FastifyRequest, reply: FastifyReply) {
  try {
    const rows = await query<any[]>(
      `SELECT u.id, u.username, u.nombre, u.apellido, u.email, u.role,
              u.pnf_saga_id, p.nombre AS pnf_nombre, u.profesor_cedula,
              u.activo, u.created_at
       FROM users u
       LEFT JOIN pnf p ON p.saga_id = u.pnf_saga_id
       ORDER BY u.apellido, u.nombre`
    );
    return reply.send({ success: true, data: rows });
  } catch (error: any) {
    _request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error obteniendo usuarios.' });
  }
}

// POST /api/usuarios — crear usuario
export async function createUsuarioHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as UsuarioBody;
  const username = body.username?.trim();
  const password = body.password ?? '';
  const nombre = body.nombre?.trim();
  const apellido = body.apellido?.trim();
  const role = body.role;
  const pnfSagaId = body.pnf_saga_id ? Number(body.pnf_saga_id) : null;

  if (!username || !password || !nombre || !apellido || !role) {
    return reply.status(400).send({
      success: false,
      message: 'Usuario, contraseña, nombre, apellido y nivel de permisos son obligatorios.',
    });
  }
  if (!ROLES_VALIDOS.includes(role)) {
    return reply.status(400).send({ success: false, message: 'Nivel de permisos inválido.' });
  }
  if (password.length < 6) {
    return reply.status(400).send({ success: false, message: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  if (!pnfSagaId) {
    return reply.status(400).send({ success: false, message: 'Debe asociar el usuario a un PNF.' });
  }

  try {
    const hashed = await hashPassword(password);
    const result: any = await query(
      `INSERT INTO users (username, password, nombre, apellido, email, role, pnf_saga_id, profesor_cedula, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        username,
        hashed,
        nombre,
        apellido,
        body.email?.trim() || null,
        role,
        pnfSagaId,
        body.profesor_cedula?.trim() || null,
      ]
    );
    return reply.send({ success: true, message: 'Usuario creado exitosamente.', data: { id: result.insertId } });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return reply.status(400).send({
        success: false,
        message: 'El nombre de usuario o el correo ya están registrados.',
      });
    }
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error creando el usuario.' });
  }
}

// PUT /api/usuarios/:id — editar usuario
export async function updateUsuarioHandler(request: FastifyRequest, reply: FastifyReply) {
  const id = Number((request.params as { id: string }).id);
  const body = request.body as UsuarioBody;
  const current = request.userPayload!;

  const username = body.username?.trim();
  const nombre = body.nombre?.trim();
  const apellido = body.apellido?.trim();
  const role = body.role;
  const pnfSagaId = body.pnf_saga_id ? Number(body.pnf_saga_id) : null;

  if (!username || !nombre || !apellido || !role) {
    return reply.status(400).send({
      success: false,
      message: 'Usuario, nombre, apellido y nivel de permisos son obligatorios.',
    });
  }
  if (!ROLES_VALIDOS.includes(role)) {
    return reply.status(400).send({ success: false, message: 'Nivel de permisos inválido.' });
  }
  if (!pnfSagaId) {
    return reply.status(400).send({ success: false, message: 'Debe asociar el usuario a un PNF.' });
  }
  if (body.password && body.password.length < 6) {
    return reply.status(400).send({ success: false, message: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  // Seguridad: no puede quitarse a sí mismo el nivel Master
  if (id === current.id && role !== current.role) {
    return reply.status(400).send({
      success: false,
      message: 'No puede cambiar su propio nivel de permisos.',
    });
  }

  try {
    const existing = await query<any[]>('SELECT id FROM users WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      return reply.status(404).send({ success: false, message: 'Usuario no encontrado.' });
    }

    if (body.password) {
      const hashed = await hashPassword(body.password);
      await query(
        `UPDATE users SET username = ?, password = ?, nombre = ?, apellido = ?, email = ?, role = ?, pnf_saga_id = ?, profesor_cedula = ? WHERE id = ?`,
        [username, hashed, nombre, apellido, body.email?.trim() || null, role, pnfSagaId, body.profesor_cedula?.trim() || null, id]
      );
    } else {
      await query(
        `UPDATE users SET username = ?, nombre = ?, apellido = ?, email = ?, role = ?, pnf_saga_id = ?, profesor_cedula = ? WHERE id = ?`,
        [username, nombre, apellido, body.email?.trim() || null, role, pnfSagaId, body.profesor_cedula?.trim() || null, id]
      );
    }

    return reply.send({ success: true, message: 'Usuario actualizado exitosamente.' });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return reply.status(400).send({
        success: false,
        message: 'El nombre de usuario o el correo ya están registrados.',
      });
    }
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error actualizando el usuario.' });
  }
}

// PUT /api/usuarios/:id/toggle-activo — activar/desactivar
export async function toggleActivoUsuarioHandler(request: FastifyRequest, reply: FastifyReply) {
  const id = Number((request.params as { id: string }).id);
  const current = request.userPayload!;

  if (id === current.id) {
    return reply.status(400).send({ success: false, message: 'No puede desactivar su propia cuenta.' });
  }

  try {
    const existing = await query<any[]>('SELECT id, activo FROM users WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      return reply.status(404).send({ success: false, message: 'Usuario no encontrado.' });
    }

    const nuevoEstado = existing[0].activo ? 0 : 1;
    await query('UPDATE users SET activo = ? WHERE id = ?', [nuevoEstado, id]);

    return reply.send({
      success: true,
      message: nuevoEstado ? 'Usuario activado.' : 'Usuario desactivado.',
      data: { id, activo: nuevoEstado },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error cambiando el estado del usuario.' });
  }
}
