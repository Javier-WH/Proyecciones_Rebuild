import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../db/mysql.js';
import { verifyPassword, hashPassword } from '../../utils/security.js';
import { UserTokenPayload } from '../../plugins/authGuard.js';
import {
  PREGUNTAS_SEGURIDAD,
  RECUPERAR_CANTIDAD,
  normalizarRespuesta,
} from './securityQuestions.js';

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
  pnf_nombre?: string | null;
  profesor_nombre?: string | null;
  profesor_id?: number | null;
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
    const users = await query<UserRow[]>(
      `SELECT u.*,
              COALESCE(
                p.nombre,
                (SELECT x.pnf_nombre FROM proyecciones x WHERE x.pnf_saga_id = u.pnf_saga_id AND x.pnf_nombre != '' LIMIT 1),
                (SELECT x.pnf_nombre FROM profesores x WHERE x.pnf_saga_id = u.pnf_saga_id AND x.pnf_nombre != '' LIMIT 1),
                (SELECT x.pnf_nombre FROM aulas x WHERE x.pnf_saga_id = u.pnf_saga_id AND x.pnf_nombre != '' LIMIT 1)
              ) AS pnf_nombre,
              NULLIF(TRIM(CONCAT(COALESCE(pr.nombres, ''), ' ', COALESCE(pr.apellidos, ''))), '') AS profesor_nombre,
              pr.id AS profesor_id
       FROM users u
       LEFT JOIN pnf p ON p.saga_id = u.pnf_saga_id
       LEFT JOIN profesores pr ON pr.cedula = u.profesor_cedula
       WHERE u.username = ? LIMIT 1`,
      [username.trim()]
    );
    
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
          pnf_nombre: user.pnf_nombre ?? null,
          profesor_nombre: user.profesor_nombre ?? null,
          profesor_id: user.profesor_id ?? null,
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

// POST /api/auth/profesor-login — acceso de solo lectura para docentes con su cédula.
// No requiere cuenta de usuario: emite un token de invitado (id = -profesor.id).
export async function profesorLoginHandler(request: FastifyRequest, reply: FastifyReply) {
  const { cedula } = request.body as { cedula?: string };

  if (!cedula || !cedula.trim()) {
    return reply.status(400).send({ success: false, message: 'Ingrese su número de cédula.' });
  }

  try {
    const profes = await query<any[]>(
      `SELECT id, cedula, nombres, apellidos, email, pnf_saga_id, pnf_nombre, activo
       FROM profesores WHERE cedula = ? LIMIT 1`,
      [cedula.trim()]
    );

    if (profes.length === 0 || !profes[0].activo) {
      return reply.status(404).send({
        success: false,
        message: 'No se encontró un docente activo con esa cédula.',
      });
    }

    const p = profes[0];
    const tokenPayload: UserTokenPayload = {
      id: -p.id, // negativo para no colisionar con ids de users
      username: p.cedula,
      role: 'PROFESOR',
      nombre: p.nombres,
      apellido: p.apellidos,
      pnf_saga_id: p.pnf_saga_id,
      profesor_cedula: p.cedula,
      invitado: true,
    };

    const token = request.server.jwt.sign(tokenPayload, { expiresIn: '12h' });
    const profesorNombre = `${p.nombres} ${p.apellidos}`.trim();

    return reply.send({
      success: true,
      message: 'Acceso concedido.',
      data: {
        token,
        user: {
          id: -p.id,
          username: p.cedula,
          nombre: p.nombres,
          apellido: p.apellidos,
          email: p.email,
          role: 'PROFESOR',
          pnf_saga_id: p.pnf_saga_id,
          profesor_cedula: p.cedula,
          pnf_nombre: p.pnf_nombre ?? null,
          profesor_nombre: profesorNombre,
          profesor_id: p.id,
          invitado: true,
        },
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error interno del servidor.' });
  }
}

export async function meHandler(request: FastifyRequest, reply: FastifyReply) {
  const payload = request.userPayload;
  if (!payload) {
    return reply.status(401).send({ success: false, message: 'No autenticado.' });
  }

  // Sesiones de invitado (docente por cédula): el usuario vive en profesores.
  if (payload.invitado) {
    try {
      const profes = await query<any[]>(
        `SELECT id, cedula, nombres, apellidos, email, pnf_saga_id, pnf_nombre, activo
         FROM profesores WHERE cedula = ? LIMIT 1`,
        [payload.profesor_cedula ?? '']
      );
      if (profes.length === 0 || !profes[0].activo) {
        return reply.status(401).send({ success: false, message: 'Docente no encontrado o inactivo.' });
      }
      const p = profes[0];
      return reply.send({
        success: true,
        data: {
          user: {
            id: -p.id,
            username: p.cedula,
            nombre: p.nombres,
            apellido: p.apellidos,
            email: p.email,
            role: 'PROFESOR',
            pnf_saga_id: p.pnf_saga_id,
            profesor_cedula: p.cedula,
            pnf_nombre: p.pnf_nombre ?? null,
            profesor_nombre: `${p.nombres} ${p.apellidos}`.trim(),
            profesor_id: p.id,
            invitado: true,
          },
        },
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ success: false, message: 'Error recuperando información del docente.' });
    }
  }

  try {
    const users = await query<UserRow[]>(
      `SELECT u.id, u.username, u.nombre, u.apellido, u.email, u.role, u.pnf_saga_id, u.profesor_cedula, u.activo,
              COALESCE(
                p.nombre,
                (SELECT x.pnf_nombre FROM proyecciones x WHERE x.pnf_saga_id = u.pnf_saga_id AND x.pnf_nombre != '' LIMIT 1),
                (SELECT x.pnf_nombre FROM profesores x WHERE x.pnf_saga_id = u.pnf_saga_id AND x.pnf_nombre != '' LIMIT 1),
                (SELECT x.pnf_nombre FROM aulas x WHERE x.pnf_saga_id = u.pnf_saga_id AND x.pnf_nombre != '' LIMIT 1)
              ) AS pnf_nombre,
              NULLIF(TRIM(CONCAT(COALESCE(pr.nombres, ''), ' ', COALESCE(pr.apellidos, ''))), '') AS profesor_nombre,
              pr.id AS profesor_id
       FROM users u
       LEFT JOIN pnf p ON p.saga_id = u.pnf_saga_id
       LEFT JOIN profesores pr ON pr.cedula = u.profesor_cedula
       WHERE u.id = ? LIMIT 1`,
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

// GET /api/auth/security-questions — catálogo público de preguntas de
// seguridad (lo usa el modal "Mi cuenta" para configurarlas).
export async function securityQuestionsHandler(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ success: true, data: { preguntas: PREGUNTAS_SEGURIDAD } });
}

// GET /api/auth/recovery-questions?username=X — devuelve RECUPERAR_CANTIDAD
// preguntas al azar de las que el usuario configuró. Es público: es el primer
// paso del flujo "olvidé mi contraseña".
export async function recoveryQuestionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { username } = request.query as { username?: string };
  if (!username?.trim()) {
    return reply.status(400).send({ success: false, message: 'Ingrese su nombre de usuario.' });
  }

  try {
    const users = await query<any[]>(
      'SELECT id, activo FROM users WHERE username = ? LIMIT 1',
      [username.trim()]
    );
    if (users.length === 0 || !users[0].activo) {
      return reply.status(404).send({
        success: false,
        message: 'No se encontró una cuenta activa con ese usuario.',
      });
    }

    const rows = await query<any[]>(
      'SELECT pregunta_idx FROM user_security_answers WHERE user_id = ?',
      [users[0].id]
    );
    if (rows.length < RECUPERAR_CANTIDAD) {
      return reply.status(400).send({
        success: false,
        message:
          'Esta cuenta no tiene preguntas de seguridad configuradas. ' +
          'Contacte al administrador para restablecer su contraseña.',
      });
    }

    // RECUPERAR_CANTIDAD preguntas al azar del set configurado por el usuario
    const mezcladas = rows
      .map((r) => r.pregunta_idx)
      .filter((i) => i >= 0 && i < PREGUNTAS_SEGURIDAD.length)
      .sort(() => Math.random() - 0.5)
      .slice(0, RECUPERAR_CANTIDAD);

    return reply.send({
      success: true,
      data: {
        preguntas: mezcladas.map((idx) => ({ idx, texto: PREGUNTAS_SEGURIDAD[idx] })),
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error obteniendo las preguntas.' });
  }
}

// POST /api/auth/recover-password — segundo paso: verifica las respuestas a
// las preguntas sorteadas y, si TODAS son correctas, actualiza la contraseña.
export async function recoverPasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as {
    username?: string;
    respuestas?: { idx?: number; respuesta?: string }[];
    password?: string;
  };

  const username = body.username?.trim();
  const nuevas = body.password ?? '';
  const respuestas = Array.isArray(body.respuestas) ? body.respuestas : [];

  if (!username || nuevas.length < 6 || respuestas.length < RECUPERAR_CANTIDAD) {
    return reply.status(400).send({
      success: false,
      message:
        `Debe responder las ${RECUPERAR_CANTIDAD} preguntas y elegir una contraseña ` +
        'de al menos 6 caracteres.',
    });
  }

  try {
    const users = await query<any[]>(
      'SELECT id, activo FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    if (users.length === 0 || !users[0].activo) {
      return reply.status(404).send({ success: false, message: 'Cuenta no encontrada.' });
    }
    const userId = users[0].id;

    const idxs = [...new Set(respuestas.map((r) => Number(r.idx)))].filter(
      (i) => Number.isInteger(i) && i >= 0 && i < PREGUNTAS_SEGURIDAD.length
    );
    const guardadas = await query<any[]>(
      `SELECT pregunta_idx, respuesta_hash FROM user_security_answers
       WHERE user_id = ? AND pregunta_idx IN (${idxs.map(() => '?').join(',') || 'NULL'})`,
      [userId, ...idxs]
    );

    // Verifica cada respuesta contra su hash; todas deben ser correctas
    const hashPorIdx = new Map<number, string>(
      guardadas.map((g) => [g.pregunta_idx, g.respuesta_hash])
    );
    for (const r of respuestas) {
      const hash = hashPorIdx.get(Number(r.idx));
      const texto = normalizarRespuesta(r.respuesta ?? '');
      if (!hash || !texto || !(await verifyPassword(texto, hash))) {
        return reply.status(401).send({
          success: false,
          message: 'Las respuestas no coinciden con las registradas.',
        });
      }
    }

    const hashed = await hashPassword(nuevas);
    await query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
    return reply.send({
      success: true,
      message: 'Contraseña actualizada exitosamente. Ya puede iniciar sesión.',
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error recuperando la contraseña.' });
  }
}
