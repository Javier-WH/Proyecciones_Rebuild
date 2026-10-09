import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../db/mysql.js';
import { hashPassword, verifyPassword } from '../../utils/security.js';
import {
  PREGUNTAS_SEGURIDAD,
  PREGUNTAS_REQUERIDAS,
  normalizarRespuesta,
} from '../auth/securityQuestions.js';

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
  // 'admin' es reservado: es el Master de rescate que el seed garantiza al arrancar
  if (username.toLowerCase() === 'admin') {
    return reply.status(400).send({
      success: false,
      message: "El nombre de usuario 'admin' está reservado para el sistema.",
    });
  }
  // Solo el Coordinador (ADMINISTRADOR) requiere obligatoriamente un PNF
  if (role === 'ADMINISTRADOR' && !pnfSagaId) {
    return reply.status(400).send({ success: false, message: 'El Coordinador debe tener un PNF asociado.' });
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
  // Solo el Coordinador (ADMINISTRADOR) requiere obligatoriamente un PNF
  if (role === 'ADMINISTRADOR' && !pnfSagaId) {
    return reply.status(400).send({ success: false, message: 'El Coordinador debe tener un PNF asociado.' });
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
    const existing = await query<any[]>('SELECT id, username FROM users WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      return reply.status(404).send({ success: false, message: 'Usuario no encontrado.' });
    }
    // 'admin' es reservado del sistema: solo puede editarse a sí mismo, nadie
    // puede tomar ese nombre ni renombrarlo.
    const nombreReservado = existing[0].username.toLowerCase() === 'admin';
    if (username.toLowerCase() === 'admin' ? !nombreReservado : nombreReservado) {
      return reply.status(400).send({
        success: false,
        message: "El nombre de usuario 'admin' está reservado para el sistema.",
      });
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

// ── Auto-edición de la propia cuenta ─────────────────────────────────────────
// Cualquier usuario autenticado (no invitado) puede editar SU cuenta: usuario,
// nombre, apellido, email y contraseña. No puede tocar su rol, PNF ni la
// cédula de profesor asociada — eso solo lo hace un Master.

interface SelfBody {
  username?: string;
  nombre?: string;
  apellido?: string;
  email?: string | null;
  password_actual?: string;
  password_nueva?: string;
}

const esInvitado = (request: FastifyRequest) =>
  request.userPayload?.invitado || (request.userPayload?.id ?? 0) <= 0;

// PUT /api/usuarios/me — edición de los propios datos
export async function updateSelfHandler(request: FastifyRequest, reply: FastifyReply) {
  if (esInvitado(request)) {
    return reply.status(403).send({
      success: false,
      message: 'Las sesiones de invitado no tienen cuenta editable.',
    });
  }
  const id = request.userPayload!.id;
  const body = request.body as SelfBody;

  const username = body.username?.trim();
  const nombre = body.nombre?.trim();
  const apellido = body.apellido?.trim();
  if (!username || !nombre || !apellido) {
    return reply.status(400).send({
      success: false,
      message: 'Usuario, nombre y apellido son obligatorios.',
    });
  }
  const quierePassword = !!body.password_nueva;
  if (quierePassword) {
    if ((body.password_nueva ?? '').length < 6) {
      return reply.status(400).send({
        success: false,
        message: 'La nueva contraseña debe tener al menos 6 caracteres.',
      });
    }
    if (!body.password_actual) {
      return reply.status(400).send({
        success: false,
        message: 'Debe ingresar su contraseña actual para cambiarla.',
      });
    }
  }

  try {
    const rows = await query<any[]>('SELECT id, username, password FROM users WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      return reply.status(404).send({ success: false, message: 'Usuario no encontrado.' });
    }
    // 'admin' es reservado: solo el usuario que ya se llama así puede
    // conservarlo; nadie puede adoptarlo desde Mi Cuenta.
    if (
      username.toLowerCase() === 'admin' &&
      rows[0].username.toLowerCase() !== 'admin'
    ) {
      return reply.status(400).send({
        success: false,
        message: "El nombre de usuario 'admin' está reservado para el sistema.",
      });
    }

    if (quierePassword && !(await verifyPassword(body.password_actual!, rows[0].password))) {
      return reply.status(401).send({
        success: false,
        message: 'La contraseña actual no es correcta.',
      });
    }

    if (quierePassword) {
      const hashed = await hashPassword(body.password_nueva!);
      await query(
        'UPDATE users SET username = ?, password = ?, nombre = ?, apellido = ?, email = ? WHERE id = ?',
        [username, hashed, nombre, apellido, body.email?.trim() || null, id]
      );
    } else {
      await query(
        'UPDATE users SET username = ?, nombre = ?, apellido = ?, email = ? WHERE id = ?',
        [username, nombre, apellido, body.email?.trim() || null, id]
      );
    }

    return reply.send({ success: true, message: 'Datos actualizados exitosamente.' });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return reply.status(400).send({
        success: false,
        message: 'El nombre de usuario o el correo ya están en uso.',
      });
    }
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error actualizando la cuenta.' });
  }
}

// GET /api/usuarios/me/security-questions — índices de las preguntas que el
// usuario configuró (nunca las respuestas, solo qué preguntas eligió).
export async function mySecurityQuestionsHandler(request: FastifyRequest, reply: FastifyReply) {
  if (esInvitado(request)) {
    return reply.status(403).send({ success: false, message: 'Sesión de invitado.' });
  }
  try {
    const rows = await query<any[]>(
      'SELECT pregunta_idx FROM user_security_answers WHERE user_id = ? ORDER BY pregunta_idx',
      [request.userPayload!.id]
    );
    return reply.send({
      success: true,
      data: { preguntas: rows.map((r) => r.pregunta_idx) },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error consultando las preguntas.' });
  }
}

// PUT /api/usuarios/me/security-questions — reemplaza el set completo:
// exactamente PREGUNTAS_REQUERIDAS preguntas distintas, todas con respuesta.
export async function updateMySecurityQuestionsHandler(request: FastifyRequest, reply: FastifyReply) {
  if (esInvitado(request)) {
    return reply.status(403).send({ success: false, message: 'Sesión de invitado.' });
  }
  const userId = request.userPayload!.id;
  const body = request.body as { respuestas?: { idx?: number; respuesta?: string }[] };
  const respuestas = Array.isArray(body.respuestas) ? body.respuestas : [];

  const limpias = respuestas
    .map((r) => ({ idx: Number(r.idx), texto: normalizarRespuesta(r.respuesta ?? '') }))
    .filter((r) => Number.isInteger(r.idx) && r.idx >= 0 && r.idx < PREGUNTAS_SEGURIDAD.length);
  const unicas = new Map(limpias.map((r) => [r.idx, r.texto]));

  if (
    unicas.size !== PREGUNTAS_REQUERIDAS ||
    [...unicas.values()].some((t) => t.length === 0)
  ) {
    return reply.status(400).send({
      success: false,
      message:
        `Debe elegir ${PREGUNTAS_REQUERIDAS} preguntas diferentes ` +
        'y responderlas todas.',
    });
  }

  try {
    await query('DELETE FROM user_security_answers WHERE user_id = ?', [userId]);
    for (const [idx, texto] of unicas) {
      const hash = await hashPassword(texto);
      await query(
        'INSERT INTO user_security_answers (user_id, pregunta_idx, respuesta_hash) VALUES (?, ?, ?)',
        [userId, idx, hash]
      );
    }
    return reply.send({
      success: true,
      message: 'Preguntas de seguridad guardadas exitosamente.',
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error guardando las preguntas.' });
  }
}
