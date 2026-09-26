import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../db/mysql.js';

interface CreatePeriodoBody {
  codigo: string;
  nombre: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  estado?: 'PLANIFICACION' | 'ACTIVO' | 'CERRADO';
}

export async function listPeriodosHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const periodos = await query('SELECT * FROM periodos_academicos ORDER BY id DESC');
    return reply.send({ success: true, data: periodos });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error listando periodos académicos.' });
  }
}

export async function listPeriodosActivosHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const periodos = await query(
      "SELECT * FROM periodos_academicos WHERE estado IN ('ACTIVO', 'PLANIFICACION') ORDER BY id DESC"
    );
    return reply.send({ success: true, data: periodos });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error recuperando periodos activos.' });
  }
}

export async function createPeriodoHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as CreatePeriodoBody;

  if (!body.codigo || !body.nombre) {
    return reply.status(400).send({
      success: false,
      message: 'Debe especificar el código (ej. 2026-1) y el nombre del periodo académico.',
    });
  }

  const codigoClean = body.codigo.trim().toUpperCase();

  try {
    const existing = await query<any[]>('SELECT id FROM periodos_academicos WHERE codigo = ? LIMIT 1', [codigoClean]);
    if (existing.length > 0) {
      return reply.status(400).send({
        success: false,
        message: `Ya existe un periodo académico registrado con el código "${codigoClean}".`,
      });
    }

    const estado = body.estado || 'ACTIVO';

    const insertResult: any = await query(
      `INSERT INTO periodos_academicos (codigo, nombre, fecha_inicio, fecha_fin, estado)
       VALUES (?, ?, ?, ?, ?)`,
      [
        codigoClean,
        body.nombre.trim(),
        body.fecha_inicio || null,
        body.fecha_fin || null,
        estado,
      ]
    );

    return reply.status(201).send({
      success: true,
      message: 'Periodo académico registrado exitosamente.',
      data: { id: insertResult.insertId, codigo: codigoClean, nombre: body.nombre },
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error registrando el periodo académico.' });
  }
}

export async function updatePeriodoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = request.body as Partial<CreatePeriodoBody>;

  try {
    const periodos = await query<any[]>('SELECT * FROM periodos_academicos WHERE id = ? LIMIT 1', [id]);
    if (periodos.length === 0) {
      return reply.status(404).send({ success: false, message: 'Periodo académico no encontrado.' });
    }

    const current = periodos[0];
    const codigoClean = body.codigo ? body.codigo.trim().toUpperCase() : current.codigo;
    const nombreClean = body.nombre ? body.nombre.trim() : current.nombre;
    const estadoClean = body.estado || current.estado;

    await query(
      `UPDATE periodos_academicos 
       SET codigo = ?, nombre = ?, fecha_inicio = ?, fecha_fin = ?, estado = ?
       WHERE id = ?`,
      [
        codigoClean,
        nombreClean,
        body.fecha_inicio !== undefined ? body.fecha_inicio : current.fecha_inicio,
        body.fecha_fin !== undefined ? body.fecha_fin : current.fecha_fin,
        estadoClean,
        id,
      ]
    );

    return reply.send({ success: true, message: 'Periodo académico actualizado exitosamente.' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, message: 'Error actualizando periodo académico.' });
  }
}

export async function deletePeriodoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };

  try {
    await query('DELETE FROM periodos_academicos WHERE id = ?', [id]);
    return reply.send({ success: true, message: 'Periodo académico eliminado exitosamente.' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: 'No se puede eliminar el periodo académico porque tiene proyecciones asociadas.',
    });
  }
}
