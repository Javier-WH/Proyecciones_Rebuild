import { query } from '../../db/mysql.js';

export type TipoProyeccion = 'TRIMESTRAL' | 'SEMESTRAL';
export interface LapsoRef {
  tipo: TipoProyeccion;
  n: number;
}

// Lapsos que coexisten en el tiempo con (tipo, n), incluyéndose a sí mismo.
// Supuesto: SEMESTRAL S1 abarca los trimestres 1-2 y S2 el trimestre 3.
export function lapsosRivales(tipo: TipoProyeccion, n: number): LapsoRef[] {
  if (tipo === 'TRIMESTRAL') {
    if (n === 1) return [{ tipo, n: 1 }, { tipo: 'SEMESTRAL', n: 1 }];
    if (n === 2) return [{ tipo, n: 2 }, { tipo: 'SEMESTRAL', n: 1 }];
    return [{ tipo, n: 3 }, { tipo: 'SEMESTRAL', n: 2 }];
  }
  if (n === 1) {
    return [
      { tipo, n: 1 },
      { tipo: 'TRIMESTRAL', n: 1 },
      { tipo: 'TRIMESTRAL', n: 2 },
    ];
  }
  return [
    { tipo, n: 2 },
    { tipo: 'TRIMESTRAL', n: 3 },
  ];
}

export function horaMin(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

export function seTraslapan(inicioA: string, finA: string, inicioB: string, finB: string): boolean {
  return horaMin(inicioA) < horaMin(finB) && horaMin(inicioB) < horaMin(finA);
}

export interface EntryRow {
  id: number;
  tipo_proyeccion?: string;
  trimestre?: number;
  materia_id: number;
  seccion_id: number;
  profesor_id: number | null;
  dia_semana: number;
  bloque_id: number;
  aula_id: number;
  hora_inicio: string;
  hora_fin: string;
  materia_nombre?: string;
  seccion_nombre?: string;
  aula_codigo?: string;
}

// Entries de un periodo en los lapsos indicados, con los tiempos de su bloque.
export async function cargarEntries(
  periodo: string,
  lapsos: LapsoRef[],
  extraJoins = ''
): Promise<EntryRow[]> {
  if (lapsos.length === 0) return [];
  const cond = lapsos.map(() => '(e.tipo_proyeccion = ? AND e.trimestre = ?)').join(' OR ');
  const params = lapsos.flatMap((l) => [l.tipo, l.n]);
  return query<EntryRow[]>(
    `SELECT e.id, e.tipo_proyeccion, e.trimestre, e.materia_id, e.seccion_id, e.profesor_id,
            e.dia_semana, e.bloque_id, e.aula_id,
            b.hora_inicio, b.hora_fin ${extraJoins}
     FROM horario_entries e
     JOIN turno_bloques b ON b.id = e.bloque_id
     WHERE e.periodo_academico = ? AND (${cond})`,
    [periodo, ...params]
  );
}

// ¿El slot (dia, inicio, fin) choca con un entry ocupando el mismo recurso?
export function conflictoEn(
  entries: EntryRow[],
  dia: number,
  inicio: string,
  fin: string,
  recurso: { aula_id?: number; seccion_id?: number; profesor_id?: number | null },
  excluirId?: number
): EntryRow | null {
  for (const e of entries) {
    if (excluirId && e.id === excluirId) continue;
    if (e.dia_semana !== dia) continue;
    if (!seTraslapan(inicio, fin, e.hora_inicio, e.hora_fin)) continue;
    if (recurso.aula_id !== undefined && e.aula_id === recurso.aula_id) return e;
    if (recurso.seccion_id !== undefined && e.seccion_id === recurso.seccion_id) return e;
    if (recurso.profesor_id != null && e.profesor_id === recurso.profesor_id) return e;
  }
  return null;
}

// Aulas ocupadas en un slot: devuelve el set de aula_id no disponibles
export function aulasOcupadas(
  entries: EntryRow[],
  dia: number,
  inicio: string,
  fin: string,
  excluirId?: number
): Set<number> {
  const ocupadas = new Set<number>();
  for (const e of entries) {
    if (excluirId && e.id === excluirId) continue;
    if (e.dia_semana !== dia) continue;
    if (seTraslapan(inicio, fin, e.hora_inicio, e.hora_fin)) ocupadas.add(e.aula_id);
  }
  return ocupadas;
}

// Normaliza el nombre de materia para compararlo con aula_materias
export const normMateria = (s: any) => String(s ?? '').trim().toUpperCase();

// Aulas activas con su set de materias preferidas (aula_materias)
export async function cargarAulasActivas(): Promise<any[]> {
  const aulas = await query<any[]>(
    'SELECT id, codigo, nombre, tipo, activa, pnf_saga_id FROM aulas WHERE activa = 1'
  );
  const prefs = await query<any[]>(
    'SELECT aula_id, materia_nombre FROM aula_materias'
  );
  const porAula = new Map<number, Set<string>>();
  for (const p of prefs) {
    const s = porAula.get(Number(p.aula_id)) ?? new Set<string>();
    s.add(normMateria(p.materia_nombre));
    porAula.set(Number(p.aula_id), s);
  }
  for (const a of aulas) a.materias_pref = porAula.get(Number(a.id)) ?? new Set<string>();
  return aulas;
}

// Elige el aula libre "más adecuada": primero las que tienen la materia como
// preferida (ej. laboratorio para química), luego preferencia de PNF, luego
// AULA_REGULAR y finalmente balancea el uso. Las preferencias son
// informativas: cualquier aula libre puede usarse si las preferidas están
// ocupadas.
export function elegirAula(
  aulas: any[],
  ocupadas: Set<number>,
  usoPorAula: Map<number, number>,
  pnfPreferido?: number | null,
  materiaNombre?: string | null
): number | null {
  const libres = aulas.filter((a) => a.activa && !ocupadas.has(a.id));
  if (libres.length === 0) return null;
  const mat = materiaNombre ? normMateria(materiaNombre) : null;
  libres.sort((a, b) => {
    const matA = mat && a.materias_pref?.has(mat) ? 0 : 1;
    const matB = mat && b.materias_pref?.has(mat) ? 0 : 1;
    if (matA !== matB) return matA - matB;
    const pnfA = pnfPreferido && a.pnf_saga_id === pnfPreferido ? 0 : 1;
    const pnfB = pnfPreferido && b.pnf_saga_id === pnfPreferido ? 0 : 1;
    if (pnfA !== pnfB) return pnfA - pnfB;
    const tipoA = a.tipo === 'AULA_REGULAR' ? 0 : 1;
    const tipoB = b.tipo === 'AULA_REGULAR' ? 0 : 1;
    if (tipoA !== tipoB) return tipoA - tipoB;
    const usoA = usoPorAula.get(a.id) ?? 0;
    const usoB = usoPorAula.get(b.id) ?? 0;
    if (usoA !== usoB) return usoA - usoB;
    return String(a.codigo).localeCompare(String(b.codigo));
  });
  return libres[0].id;
}
