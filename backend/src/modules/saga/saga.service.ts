import { env } from '../../config/env.js';

export interface SagaResponse<T = any> {
  status?: number;
  data: T;
  message?: string | null;
}

export interface SubjectUC {
  id: number;
  description: string;
  hours: { total: number; times: number };
  quarters: { q1: number; q2: number; q3: number };
  trayecto_info: { id: number };
  // Campos calculados para facilidad del frontend
  horasSemanales: number;
  trimestresActivos: number[];
  semestre1Activo: boolean;
  semestre2Activo: boolean;
}

export interface TurnoEstimacion {
  turnoId: number;
  turnoNombre: string;
  estudiantesContados: number;
  seccionesEstimadas: number;
}

// Token en caché 10 min: evita un login por cada petición cuando el catálogo
// hace decenas de consultas seguidas (ej. materias de todas las mallas).
let tokenCache: { token: string; ts: number } | null = null;

export async function getApiToken(): Promise<string | null> {
  if (tokenCache && Date.now() - tokenCache.ts < 10 * 60 * 1000) {
    return tokenCache.token;
  }
  try {
    const response = await fetch(`${env.API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: env.API_USER,
        password: env.API_PASSWORD,
      }),
    });

    if (!response.ok) {
      console.error(`[SAGA API] Fallo al autenticar. HTTP status: ${response.status}`);
      return null;
    }

    const result = (await response.json()) as SagaResponse<{ token: string }>;
    if (result && result.data && result.data.token) {
      tokenCache = { token: result.data.token, ts: Date.now() };
      return result.data.token;
    }

    console.error('[SAGA API] Token no encontrado en la respuesta:', result);
    return null;
  } catch (error) {
    console.error('[SAGA API] Excepción durante login:', error);
    return null;
  }
}

async function fetchFromSaga<T = any>(endpoint: string): Promise<T | null> {
  const token = await getApiToken();
  if (!token) {
    console.error(`[SAGA API] Abortando petición a ${endpoint} por falta de token.`);
    return null;
  }

  try {
    const url = `${env.API_URL}${endpoint}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // Si el token cacheado expiró, la próxima petición vuelve a loguear
      tokenCache = null;
      console.error(`[SAGA API] Error en GET ${endpoint}. Status: ${response.status}`);
      return null;
    }

    const result = (await response.json()) as SagaResponse<T>;
    return result.data ?? null;
  } catch (error) {
    console.error(`[SAGA API] Excepción en GET ${endpoint}:`, error);
    return null;
  }
}

export const sagaService = {
  getProgramas: () => fetchFromSaga<Array<{ id: number; programa: string }>>('/programas'),
  getTrayectos: () => fetchFromSaga<Array<{ id: number; trayecto: string }>>('/trayectos'),
  getTurnos: () => fetchFromSaga<Array<{ id: number; turno: string }>>('/turnos'),
  getTeachers: () =>
    fetchFromSaga<
      Array<{
        id?: number;
        NombreProfesor: string;
        ApellidoProfesor: string;
        CedulaProfesor: string;
        Nacionalidad?: string | null;
        sexo: string;
        email1: string | null;
        email2: string | null;
        programa_id?: number | null;
        dedicacion_id?: number | null;
        tlfMovil?: string | null;
        estatus?: string | null;
      }>
    >('/teachers'),

  // Dedicaciones / tipos de contrato docente.
  // NOTA: la API Laravel actual no expone este endpoint; si no existe (404) se
  // retorna null y el módulo de profesores deriva los tipos desde dedicacion_id.
  getDedicaciones: async () => {
    const data = await fetchFromSaga<any[]>('/dedicaciones');
    return data ?? (await fetchFromSaga<any[]>('/dedicacions'));
  },
  
  getMayas: async (pnfSagaId: number | string) => {
    const list = await fetchFromSaga<Array<{ id: number; descripcion: string; tipopensum_id: number }>>(`/maya/${pnfSagaId}`);
    if (!list) return [];
    // Ordenar por ID descendente para obtener la malla más reciente primero
    return list.sort((a, b) => b.id - a.id);
  },

  // Materias de una malla agrupadas por trayecto: ucslist en SAGA es por
  // (pnf, trayecto, maya), así que se consulta cada trayecto y se fusiona.
  getMateriasPorMaya: async (pnfSagaId: number | string, mayaId: number | string) => {
    const trayectos = (await sagaService.getTrayectos()) ?? [];
    const grupos = await Promise.all(
      trayectos.map(async (t) => ({
        trayecto_saga_id: Number(t.id),
        trayecto: t.trayecto,
        materias: await sagaService.getUcsList(pnfSagaId, t.id, mayaId),
      }))
    );
    return grupos.filter((g) => g.materias.length > 0);
  },

  getUcsList: async (pnfSagaId: number | string, trayectoSagaId: number | string, mayaId: number | string): Promise<SubjectUC[]> => {
    const rawList = await fetchFromSaga<any[]>(`/ucslist/${pnfSagaId}/${trayectoSagaId}/${mayaId}`);
    if (!rawList) return [];

    const weeksInTerm = Number(mayaId) === 24 ? 18 : 12;

    return rawList.map((item) => {
      const total = item.hours?.total || 0;
      const times = item.hours?.times || 1;
      
      let quarterHours = 0;
      let horasSemanales = 0;

      if (total > 0 && times > 0) {
        quarterHours = total / times;
        horasSemanales = Math.round(quarterHours / weeksInTerm) || Math.round(total / times);
      } else if (times > 0) {
        horasSemanales = Math.round(total / times);
      }

      const q = item.quarters || { q1: 0, q2: 0, q3: 0 };
      const trimestresActivos: number[] = [];
      if (q.q1 === 1) trimestresActivos.push(1);
      if (q.q2 === 1) trimestresActivos.push(2);
      if (q.q3 === 1) trimestresActivos.push(3);

      // Interpretación semestral: Semestre 1 = Q1; Semestre 2 = Q2 o Q3
      const semestre1Activo = q.q1 === 1;
      const semestre2Activo = q.q2 === 1 || q.q3 === 1;

      return {
        id: item.id,
        description: item.description || 'Materia sin nombre',
        hours: { total, times },
        quarters: q,
        trayecto_info: item.trayecto_info || { id: Number(trayectoSagaId) },
        horasSemanales: horasSemanales > 0 ? horasSemanales : 4, // Fallback visual si horas.total es 0
        trimestresActivos,
        semestre1Activo,
        semestre2Activo,
      };
    });
  },

  getInscriptionsSummary: async (pnfSagaId: number | string, trayectoSagaId: number | string): Promise<TurnoEstimacion[]> => {
    const rawInscriptions = await fetchFromSaga<any[]>('/student/inscription');
    if (!rawInscriptions || !Array.isArray(rawInscriptions)) return [];

    const targetPnf = Number(pnfSagaId);
    const targetTrayecto = Number(trayectoSagaId);

    // 1. Filtrar por PNF y Trayecto
    const filtered = rawInscriptions.filter((item) => {
      const pnfId = item.pnf_info?.id;
      const trayectoId = item.uc_info?.trayecto_id;
      return pnfId === targetPnf && trayectoId === targetTrayecto;
    });

    // 2. Agrupar por turno y deduplicar por student_id
    const turnosMap: Record<string, { id: number; nombre: string; students: Set<string> }> = {};

    filtered.forEach((item) => {
      const turnoObj = item.turno_info || { id: 1, turno: 'Mañana' };
      const turnoNombre = turnoObj.turno || 'Mañana';
      const studentId = item.student_id || String(Math.random());

      if (!turnosMap[turnoNombre]) {
        turnosMap[turnoNombre] = {
          id: turnoObj.id || 1,
          nombre: turnoNombre,
          students: new Set(),
        };
      }
      turnosMap[turnoNombre].students.add(studentId);
    });

    // 3. Estimar secciones (máx 30 estudiantes por sección)
    const result: TurnoEstimacion[] = Object.values(turnosMap).map((t) => {
      const count = t.students.size;
      const secciones = count > 0 ? Math.ceil(count / 30) : 1;
      return {
        turnoId: t.id,
        turnoNombre: t.nombre,
        estudiantesContados: count,
        seccionesEstimadas: secciones,
      };
    });

    return result;
  },
};
