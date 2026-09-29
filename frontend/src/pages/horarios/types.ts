import { MateriaAsignableRow } from '../AgregarMateriaModal.js';

export interface Turno {
  id: number;
  saga_id: number | null;
  nombre: string;
  dias_semana: string; // CSV 1=Lun..7=Dom
  activo: number;
  bloques: Bloque[];
}

export interface Bloque {
  id: number;
  turno_id: number;
  orden: number;
  hora_inicio: string; // 'HH:MM:SS'
  hora_fin: string;
  es_receso: number;
}

export interface Aula {
  id: number;
  codigo: string;
  nombre: string;
  capacidad: number;
  ubicacion: string | null;
  tipo: 'AULA_REGULAR' | 'LABORATORIO' | 'TALLER' | 'AUDITORIO';
  pnf_saga_id: number | null;
  pnf_nombre: string | null;
  activa: number;
  en_uso?: number;
}

export interface HorarioEntry {
  id: number;
  periodo_academico: string;
  tipo_proyeccion: 'TRIMESTRAL' | 'SEMESTRAL';
  trimestre: number;
  materia_id: number;
  materia_nombre: string;
  horas_semanales: number;
  seccion_id: number;
  seccion_nombre: string;
  turno_saga_id: number;
  turno_nombre: string;
  profesor_id: number | null;
  prof_nombres: string | null;
  prof_apellidos: string | null;
  dia_semana: number;
  bloque_id: number;
  aula_id: number;
  aula_codigo: string;
  aula_nombre: string;
  bloque_orden: number;
  hora_inicio: string;
  hora_fin: string;
  es_receso: number;
  turno_id: number;
  turno_bloque_nombre: string;
}

export interface SeccionRef {
  seccion_id: number;
  seccion_nombre: string;
  turno_saga_id: number;
  turno_nombre: string;
  pnf_nombre: string;
  proyeccion_nombre: string;
  trayecto_nombre: string;
}

export const DIAS_NOMBRES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_CORTOS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const fmtHora = (h: string): string => h?.slice(0, 5) ?? '';

export const minutos = (h: string): number => {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
};

export const traslapan = (i1: string, f1: string, i2: string, f2: string): boolean =>
  minutos(i1) < minutos(f2) && minutos(i2) < minutos(f1);

// Secciones únicas presentes en las filas de carga docente de un lapso
export function seccionesDe(rows: MateriaAsignableRow[]): SeccionRef[] {
  const map = new Map<number, SeccionRef>();
  for (const r of rows) {
    if (!map.has(r.seccion_id)) {
      map.set(r.seccion_id, {
        seccion_id: r.seccion_id,
        seccion_nombre: r.seccion_nombre,
        turno_saga_id: r.turno_saga_id ?? 0,
        turno_nombre: r.turno_nombre,
        pnf_nombre: r.pnf_nombre,
        proyeccion_nombre: r.proyeccion_nombre,
        trayecto_nombre: r.trayecto_nombre,
      });
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      a.pnf_nombre.localeCompare(b.pnf_nombre) ||
      a.proyeccion_nombre.localeCompare(b.proyeccion_nombre) ||
      a.seccion_nombre.localeCompare(b.seccion_nombre)
  );
}
