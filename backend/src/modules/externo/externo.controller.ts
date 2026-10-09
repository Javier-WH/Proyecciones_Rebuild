import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../db/mysql.js';

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const hhmm = (h: any) => String(h ?? '').slice(0, 5);

async function periodoActivo(): Promise<string | null> {
  const rows = await query<any[]>(
    "SELECT codigo FROM periodos_academicos WHERE estado = 'ACTIVO' ORDER BY id DESC LIMIT 1"
  );
  return rows[0]?.codigo ?? null;
}

interface ClaseItem {
  dia_semana: number;
  dia: string;
  hora_inicio: string;
  hora_fin: string;
  materia: string;
  materia_id: number;
  seccion: string;
  seccion_id: number;
  aula: string;
  aula_nombre: string;
  turno: string;
  tipo_proyeccion: string;
  trimestre: number;
}

// GET /api/externo/horario/:cedula?periodo=&tipo=&trimestre=
// Horario del profesor para la app externa de asistencias. Solo lectura.
export async function horarioProfesorHandler(request: FastifyRequest, reply: FastifyReply) {
  const { cedula } = request.params as { cedula: string };
  const { periodo, tipo, trimestre } = request.query as {
    periodo?: string;
    tipo?: string;
    trimestre?: string;
  };

  if (!cedula?.trim()) {
    return reply.status(400).send({ success: false, message: 'Debe indicar la cédula del profesor.' });
  }

  try {
    const profes = await query<any[]>(
      `SELECT id, cedula, nombres, apellidos, pnf_nombre, activo
       FROM profesores WHERE cedula = ? LIMIT 1`,
      [cedula.trim()]
    );
    if (profes.length === 0 || !profes[0].activo) {
      return reply.status(404).send({
        success: false,
        message: 'No se encontró un docente activo con esa cédula.',
      });
    }
    const profesor = profes[0];

    const periodoCodigo = periodo?.trim() || (await periodoActivo());
    if (!periodoCodigo) {
      return reply.status(404).send({
        success: false,
        message: 'No hay un periodo académico activo.',
      });
    }

    let sql = `
      SELECT e.tipo_proyeccion, e.trimestre,
             e.materia_id, m.nombre AS materia_nombre,
             e.seccion_id, s.nombre AS seccion_nombre,
             e.dia_semana,
             a.codigo AS aula_codigo, a.nombre AS aula_nombre,
             TIME_FORMAT(b.hora_inicio, '%H:%i') AS hora_inicio,
             TIME_FORMAT(b.hora_fin, '%H:%i') AS hora_fin,
             t.nombre AS turno_nombre
      FROM horario_entries e
      JOIN proyeccion_materias m ON m.id = e.materia_id
      JOIN proyeccion_secciones s ON s.id = e.seccion_id
      JOIN aulas a ON a.id = e.aula_id
      JOIN turno_bloques b ON b.id = e.bloque_id
      JOIN turnos t ON t.id = b.turno_id
      WHERE e.profesor_id = ? AND e.periodo_academico = ?`;
    const params: any[] = [profesor.id, periodoCodigo];

    if (tipo === 'TRIMESTRAL' || tipo === 'SEMESTRAL') {
      sql += ' AND e.tipo_proyeccion = ?';
      params.push(tipo);
    }
    if (trimestre && Number(trimestre) > 0) {
      sql += ' AND e.trimestre = ?';
      params.push(Number(trimestre));
    }
    sql += ' ORDER BY e.dia_semana, b.hora_inicio';

    const rows = await query<any[]>(sql, params);

    const clases: ClaseItem[] = rows.map((r) => ({
      dia_semana: r.dia_semana,
      dia: DIAS[r.dia_semana] || String(r.dia_semana),
      hora_inicio: r.hora_inicio,
      hora_fin: r.hora_fin,
      materia: r.materia_nombre,
      materia_id: r.materia_id,
      seccion: r.seccion_nombre,
      seccion_id: r.seccion_id,
      aula: r.aula_codigo,
      aula_nombre: r.aula_nombre,
      turno: r.turno_nombre,
      tipo_proyeccion: r.tipo_proyeccion,
      trimestre: r.trimestre,
    }));

    const porDia: Record<string, ClaseItem[]> = {};
    for (const c of clases) {
      const key = (DIAS[c.dia_semana] || `dia_${c.dia_semana}`).toLowerCase();
      (porDia[key] ??= []).push(c);
    }

    return reply.send({
      success: true,
      data: {
        profesor: {
          id: profesor.id,
          cedula: profesor.cedula,
          nombres: profesor.nombres,
          apellidos: profesor.apellidos,
          pnf_nombre: profesor.pnf_nombre ?? null,
        },
        periodo: periodoCodigo,
        clases,
        por_dia: porDia,
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: 'Error interno al obtener el horario del docente.',
    });
  }
}
