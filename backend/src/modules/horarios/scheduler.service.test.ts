import { describe, it, expect } from 'vitest';
import {
  lapsosTotales,
  lapsosParciales,
  lapsosRivales,
  esRivalParcial,
  seTraslapan,
  horaMin,
  conflictoEn,
  aulasOcupadas,
  elegirAula,
  normMateria,
  EntryRow,
} from './scheduler.service.js';

describe('lapsosTotales', () => {
  it('T1 choca con T1 y S1', () => {
    expect(lapsosTotales('TRIMESTRAL', 1)).toEqual([
      { tipo: 'TRIMESTRAL', n: 1 },
      { tipo: 'SEMESTRAL', n: 1 },
    ]);
  });
  it('T2 solo choca consigo mismo (traslape total)', () => {
    expect(lapsosTotales('TRIMESTRAL', 2)).toEqual([{ tipo: 'TRIMESTRAL', n: 2 }]);
  });
  it('T3 choca con T3 y S2', () => {
    expect(lapsosTotales('TRIMESTRAL', 3)).toEqual([
      { tipo: 'TRIMESTRAL', n: 3 },
      { tipo: 'SEMESTRAL', n: 2 },
    ]);
  });
  it('S1 choca con S1 y T1', () => {
    expect(lapsosTotales('SEMESTRAL', 1)).toEqual([
      { tipo: 'SEMESTRAL', n: 1 },
      { tipo: 'TRIMESTRAL', n: 1 },
    ]);
  });
  it('S2 choca con S2 y T3', () => {
    expect(lapsosTotales('SEMESTRAL', 2)).toEqual([
      { tipo: 'SEMESTRAL', n: 2 },
      { tipo: 'TRIMESTRAL', n: 3 },
    ]);
  });
});

describe('lapsosParciales / esRivalParcial', () => {
  it('T2 tiene traslape parcial con ambos semestres', () => {
    expect(lapsosParciales('TRIMESTRAL', 2)).toEqual([
      { tipo: 'SEMESTRAL', n: 1 },
      { tipo: 'SEMESTRAL', n: 2 },
    ]);
    expect(esRivalParcial('TRIMESTRAL', 2, 'SEMESTRAL', 1)).toBe(true);
    expect(esRivalParcial('TRIMESTRAL', 2, 'SEMESTRAL', 2)).toBe(true);
  });
  it('cualquier semestre tiene traslape parcial con T2', () => {
    expect(esRivalParcial('SEMESTRAL', 1, 'TRIMESTRAL', 2)).toBe(true);
    expect(esRivalParcial('SEMESTRAL', 2, 'TRIMESTRAL', 2)).toBe(true);
  });
  it('T1 y T3 no tienen rivales parciales', () => {
    expect(lapsosParciales('TRIMESTRAL', 1)).toEqual([]);
    expect(lapsosParciales('TRIMESTRAL', 3)).toEqual([]);
    expect(esRivalParcial('TRIMESTRAL', 1, 'SEMESTRAL', 1)).toBe(false);
  });
  it('rivales = totales + parciales', () => {
    expect(lapsosRivales('TRIMESTRAL', 2)).toHaveLength(3);
    expect(lapsosRivales('TRIMESTRAL', 1)).toHaveLength(2);
  });
});

describe('horaMin / seTraslapan', () => {
  it('convierte horas a minutos', () => {
    expect(horaMin('08:00')).toBe(480);
    expect(horaMin('13:45')).toBe(825);
  });
  it('detecta traslape parcial y contenido', () => {
    expect(seTraslapan('08:00', '10:00', '09:00', '11:00')).toBe(true);
    expect(seTraslapan('08:00', '10:00', '08:30', '09:30')).toBe(true);
  });
  it('bloques adyacentes NO traslapa (fin = inicio)', () => {
    expect(seTraslapan('08:00', '10:00', '10:00', '12:00')).toBe(false);
  });
  it('bloques separados no traslapa', () => {
    expect(seTraslapan('08:00', '09:00', '10:00', '11:00')).toBe(false);
  });
});

const entry = (over: Partial<EntryRow>): EntryRow => ({
  id: 1,
  materia_id: 1,
  seccion_id: 10,
  profesor_id: 5,
  dia_semana: 2,
  bloque_id: 1,
  aula_id: 7,
  hora_inicio: '08:00',
  hora_fin: '10:00',
  ...over,
});

describe('conflictoEn', () => {
  const entries = [entry({})];

  it('detecta choque por aula en slot traslapado', () => {
    const c = conflictoEn(entries, 2, '09:00', '11:00', { aula_id: 7 });
    expect(c?.id).toBe(1);
  });
  it('detecta choque por sección', () => {
    expect(conflictoEn(entries, 2, '08:00', '10:00', { seccion_id: 10 })).not.toBeNull();
  });
  it('detecta choque por profesor', () => {
    expect(conflictoEn(entries, 2, '09:00', '09:30', { profesor_id: 5 })).not.toBeNull();
  });
  it('ignora otro día y otra aula', () => {
    expect(conflictoEn(entries, 3, '08:00', '10:00', { aula_id: 7 })).toBeNull();
    expect(conflictoEn(entries, 2, '08:00', '10:00', { aula_id: 99 })).toBeNull();
  });
  it('ignora slot no traslapado', () => {
    expect(conflictoEn(entries, 2, '10:00', '12:00', { aula_id: 7 })).toBeNull();
  });
  it('excluye el propio entry al mover', () => {
    expect(conflictoEn(entries, 2, '08:00', '10:00', { aula_id: 7 }, 1)).toBeNull();
  });
});

describe('aulasOcupadas', () => {
  it('devuelve solo las aulas traslapadas ese día', () => {
    const entries = [
      entry({ aula_id: 7, dia_semana: 1 }),
      entry({ id: 2, aula_id: 8, dia_semana: 2 }),
      entry({ id: 3, aula_id: 9, dia_semana: 1, hora_inicio: '11:00', hora_fin: '12:00' }),
    ];
    const s = aulasOcupadas(entries, 1, '08:30', '09:30');
    expect(s.has(7)).toBe(true);
    expect(s.has(8)).toBe(false);
    expect(s.has(9)).toBe(false);
  });
  it('respeta excluirId', () => {
    const entries = [entry({})];
    expect(aulasOcupadas(entries, 2, '08:00', '10:00', 1).size).toBe(0);
  });
});

describe('elegirAula', () => {
  const aula = (id: number, over: any = {}) => ({
    id,
    codigo: `A${id}`,
    tipo: 'AULA_REGULAR',
    activa: 1,
    pnf_saga_id: null,
    materias_pref: new Set<string>(),
    ...over,
  });
  const uso = new Map<number, number>();

  it('devuelve null si no hay aulas libres', () => {
    expect(elegirAula([aula(1)], new Set([1]), uso)).toBeNull();
  });
  it('prefiere el aula que tiene la materia como preferida', () => {
    const aulas = [aula(1), aula(2, { materias_pref: new Set(['CÁLCULO I']) })];
    expect(elegirAula(aulas, new Set(), uso, null, 'cálculo i')).toBe(2);
  });
  it('luego prefiere el aula del PNF', () => {
    const aulas = [aula(1), aula(2, { pnf_saga_id: 42 })];
    expect(elegirAula(aulas, new Set(), uso, 42)).toBe(2);
  });
  it('prefiere AULA_REGULAR sobre laboratorio', () => {
    const aulas = [aula(1, { tipo: 'LABORATORIO' }), aula(2)];
    expect(elegirAula(aulas, new Set(), uso)).toBe(2);
  });
  it('balancea el uso entre aulas equivalentes', () => {
    const aulas = [aula(1), aula(2)];
    const usoLocal = new Map([[1, 5], [2, 1]]);
    expect(elegirAula(aulas, new Set(), usoLocal)).toBe(2);
  });
  it('ignora aulas inactivas', () => {
    const aulas = [aula(1, { activa: 0 }), aula(2)];
    expect(elegirAula(aulas, new Set(), uso)).toBe(2);
  });
});

describe('normMateria', () => {
  it('normaliza a mayúsculas sin extremos', () => {
    expect(normMateria('  cálculo i  ')).toBe('CÁLCULO I');
    expect(normMateria(null)).toBe('');
  });
});
