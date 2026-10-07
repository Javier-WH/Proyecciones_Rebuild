import React, { useMemo } from 'react';
import { HorarioEntry, Turno, ErrorClase, DIAS_NOMBRES, fmtHoraCfg, minutos, normMateria } from './types.js';
import { ClaseCard, ClaseCascada } from './ClaseCard.js';
import { Clock, Coffee } from 'lucide-react';

// Vista de solo lectura: grilla días × bloques con las clases de un recurso
// (aula o profesor). Como un recurso puede tener clases en varios turnos con
// horarios distintos, la grilla se divide en bandas por turno — cada banda usa
// los bloques de su propio turno, igual que la vista por sección, así los
// bloques contiguos de una misma clase se fusionan en una sola celda.
interface VistaRecursoProps {
  titulo: string;
  entries: HorarioEntry[]; // ya filtradas por recurso
  turnos: Turno[];
  formato12?: boolean; // vista 12h; la BD siempre guarda 24h
  enError?: Map<string, ErrorClase[]> | null; // 'bloque_id:dia' → violaciones (punto rojo + tooltip)
  advertencias?: Map<number, string[]>; // entry.id → avisos (triángulo amarillo)
  avisosParciales?: Map<number, string[]>; // entry.id → choques parciales T2 (icono verde)
  parejasParciales?: Map<number, number[]>; // entry.id → ids de las clases T2/semestre que le chocan
  seccionesSemestrales?: Set<number>; // secciones cuyas clases trimestrales son de semestre
  ocultarAula?: boolean; // vista por aula: no repetir el aula en cada tarjeta
  ocultarProfesor?: boolean; // vista por profesor: no repetir el profesor en cada tarjeta
}

// Fila de la grilla: un rango horario (puede ser la unión de rangos de varios
// turnos que se solapan).
interface Fila {
  inicio: string; // 'HH:MM'
  fin: string;
  esReceso: boolean;
}

// Banda = cluster de turnos cuyos rangos horarios se solapan. El turno DIURNO
// es la mezcla de mañana + tarde (separados por un receso), así que comparte
// las mismas filas con ellos en lugar de abrir una banda propia que repita
// las mismas horas.
interface Banda {
  nombre: string;
  turnos: Turno[];
  filas: Fila[];
}

const minAHora = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const VistaRecurso: React.FC<VistaRecursoProps> = ({ titulo, entries, turnos, formato12, enError, advertencias, avisosParciales, parejasParciales, seccionesSemestrales, ocultarAula, ocultarProfesor }) => {
  // Orden fijo de bandas: Mañana → Tarde → Noche. Turnos con otros nombres
  // van al final, ordenados por su hora de inicio.
  const ordenTurno = (nombre: string): number => {
    const n = nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase();
    if (n.includes('MANANA') || n.includes('MATUT')) return 0;
    if (n.includes('TARDE') || n.includes('VESPERT')) return 1;
    if (n.includes('NOCHE') || n.includes('NOCTURN')) return 2;
    return 3;
  };

  // Bandas por cluster de turnos solapados. Las filas de cada banda son los
  // rangos horarios ÚNICOS de todos sus turnos (más los rangos reales de las
  // entries, por si hay datos fuera de bloque): los rangos que se solapan se
  // fusionan en una sola fila, así un bloque del diurno de 07:00–07:45 cae en
  // la misma fila que el bloque de mañana de 07:00–07:45.
  const { bandas, porCelda } = useMemo(() => {
    const ids = new Set(entries.map((e) => e.turno_id));
    const usados = turnos.filter((t) => ids.has(t.id));
    const lista = (usados.length > 0 ? usados : turnos)
      .filter((t) => t.bloques.length > 0)
      .map((t) => ({
        t,
        ini: Math.min(...t.bloques.map((b) => minutos(b.hora_inicio))),
        fin: Math.max(...t.bloques.map((b) => minutos(b.hora_fin))),
      }))
      .sort((a, b) => a.ini - b.ini || a.fin - b.fin);

    // Clusters transitivos: si el rango de un turno toca el del cluster
    // anterior, se fusionan (mañana 7–12 + diurno 7–19 + tarde 13–19 → uno).
    const clusters: { ini: number; fin: number; turnos: Turno[] }[] = [];
    const clusterDeTurno = new Map<number, number>();
    for (const x of lista) {
      let c = clusters[clusters.length - 1];
      if (!c || x.ini >= c.fin) {
        clusters.push({ ini: x.ini, fin: x.fin, turnos: [x.t] });
        c = clusters[clusters.length - 1];
      } else {
        c.fin = Math.max(c.fin, x.fin);
        c.turnos.push(x.t);
      }
      clusterDeTurno.set(x.t.id, clusters.length - 1);
    }

    const bandas: Banda[] = [];
    const filaDe = new Map<number, { b: number; f: number }>();
    clusters.forEach((c, bi) => {
      const turnoIds = new Set(c.turnos.map((t) => t.id));
      const rangos: { ini: number; fin: number; receso: boolean }[] = [];
      for (const t of c.turnos)
        for (const b of t.bloques)
          rangos.push({ ini: minutos(b.hora_inicio), fin: minutos(b.hora_fin), receso: !!b.es_receso });
      const deCluster = entries.filter((e) => turnoIds.has(e.turno_id));
      for (const e of deCluster)
        rangos.push({ ini: minutos(e.hora_inicio), fin: minutos(e.hora_fin), receso: false });
      rangos.sort((a, b) => a.ini - b.ini || a.fin - b.fin);

      // Fusión de rangos solapados en una sola fila
      const filas: { ini: number; fin: number; receso: boolean }[] = [];
      for (const r of rangos) {
        const last = filas[filas.length - 1];
        if (last && r.ini < last.fin) {
          if (r.fin > last.fin) last.fin = r.fin;
          last.receso = last.receso && r.receso;
        } else {
          filas.push({ ...r });
        }
      }

      const nombre = [...c.turnos]
        .sort((a, b) => ordenTurno(a.nombre) - ordenTurno(b.nombre))
        .map((t) => t.nombre)
        .join(' / ');
      bandas.push({
        nombre,
        turnos: c.turnos,
        filas: filas.map((f) => ({ inicio: minAHora(f.ini), fin: minAHora(f.fin), esReceso: f.receso })),
      });
      for (const e of deCluster) {
        const ei = minutos(e.hora_inicio);
        const fi = filas.findIndex((f) => f.ini <= ei && ei < f.fin);
        if (fi >= 0) filaDe.set(e.id, { b: bi, f: fi });
      }
    });

    // Entries sin fila (turno desconocido u horario fuera de todo bloque):
    // banda extra con una fila por rango horario real.
    const resto = entries.filter((e) => !filaDe.has(e.id));
    if (resto.length > 0) {
      const bi = bandas.length;
      const rangos = new Map<string, { ini: number; fin: number }>();
      for (const e of resto)
        rangos.set(`${e.hora_inicio}-${e.hora_fin}`, {
          ini: minutos(e.hora_inicio),
          fin: minutos(e.hora_fin),
        });
      const filas = [...rangos.values()]
        .sort((a, b) => a.ini - b.ini)
        .map((r) => ({ inicio: minAHora(r.ini), fin: minAHora(r.fin), esReceso: false }));
      bandas.push({ nombre: 'Otras horas', turnos: [], filas });
      for (const e of resto) {
        const fi = filas.findIndex(
          (f) => f.inicio === minAHora(minutos(e.hora_inicio)) && f.fin === minAHora(minutos(e.hora_fin))
        );
        if (fi >= 0) filaDe.set(e.id, { b: bi, f: fi });
      }
    }

    const porCelda = new Map<string, HorarioEntry[]>();
    for (const e of entries) {
      const u = filaDe.get(e.id);
      if (!u) continue;
      const k = `${u.b}:${u.f}:${e.dia_semana}`;
      const arr = porCelda.get(k) || [];
      arr.push(e);
      porCelda.set(k, arr);
    }
    return { bandas, porCelda };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, turnos]);

  // Columnas: unión de días habilitados por los turnos usados y de días
  // donde efectivamente hay clases (mínimo Lun–Vie)
  const dias = useMemo(() => {
    const set = new Set<number>();
    for (const b of bandas) {
      for (const t of b.turnos) {
        String(t.dias_semana).split(',').map(Number).filter(Boolean).forEach((d) => set.add(d));
      }
    }
    for (const e of entries) set.add(e.dia_semana);
    const arr = [...set].sort((a, b) => a - b);
    return arr.length > 0 ? arr : [1, 2, 3, 4, 5];
  }, [bandas, entries]);

  // Parejas del choque parcial T2↔semestre que están en ESTA vista del
  // recurso (un choque de aula puede ser con otra sección/profesor que no
  // aparece aquí → se ignora). Son exactamente los pares del icono verde.
  const porId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const parejasDe = (e: HorarioEntry): HorarioEntry[] =>
    (parejasParciales?.get(e.id) ?? [])
      .map((id) => porId.get(id))
      .filter((x): x is HorarioEntry => !!x);

  // Identidad de materia dentro de la división: las parejas suelen ser
  // varias entries de la MISMA clase (una por hora); deben formar un solo
  // bloque, no una región por hora intercalada. Incluye el lapso: la misma
  // clase registrada en T1 y T2 son dos regiones distintas.
  const claveMateria = (e: HorarioEntry) =>
    `${e.seccion_id}|${normMateria(e.materia_nombre)}|${e.profesor_id ?? 0}|` +
    `${e.tipo_proyeccion}:${e.trimestre}`;

  // Conjunto de clases del slot: propias + parejas del choque parcial (pueden
  // estar en otra banda). Se usa para conectar celdas contiguas.
  const setCelda = (items: HorarioEntry[]): Set<string> => {
    const s = new Set<string>();
    for (const e of items) {
      for (const x of [e, ...parejasDe(e)]) s.add(`${claveMateria(x)}|${x.aula_id ?? 0}`);
    }
    return s;
  };

  const sigCelda = (items: HorarioEntry[]): string => [...setCelda(items)].sort().join(';');

  const hayPareja = (items: HorarioEntry[]) => items.some((e) => parejasDe(e).length > 0);

  // Runs verticales por día dentro de cada banda. Las celdas contiguas que
  // comparten alguna clase (propia o pareja T2↔semestre) forman un cluster:
  //   · si el cluster contiene un choque parcial → se fusiona ENTERO y se
  //     dibuja como cascada a posición temporal real (la materia que empieza
  //     antes atrás, las siguientes encima desplazadas);
  //   · si no hay choque → solo se fusionan celdas de firma idéntica (el
  //     bloque limpio de siempre).
  const { spans, cubiertas } = useMemo(() => {
    const spans = new Map<string, { n: number; fin: string }>();
    const cubiertas = new Set<string>();
    for (const [bi, banda] of bandas.entries()) {
      const filas = banda.filas;
      for (const d of dias) {
        let i = 0;
        while (i < filas.length) {
          const f = filas[i];
          if (f.esReceso) {
            i++;
            continue;
          }
          const cell = porCelda.get(`${bi}:${i}:${d}`) || [];
          if (cell.length === 0) {
            i++;
            continue;
          }
          // Cluster: absorbe celdas contiguas que compartan alguna clase
          const acum = new Set(setCelda(cell));
          let tienePareja = hayPareja(cell);
          let j = i + 1;
          while (j < filas.length && !filas[j].esReceso) {
            const nc = porCelda.get(`${bi}:${j}:${d}`) || [];
            if (nc.length === 0) break;
            const s = setCelda(nc);
            if (![...s].some((k) => acum.has(k))) break;
            for (const k of s) acum.add(k);
            if (hayPareja(nc)) tienePareja = true;
            j++;
          }
          if (j - i > 1) {
            let fusionar = tienePareja;
            if (!fusionar) {
              const sig = sigCelda(cell);
              fusionar = true;
              for (let k = i + 1; k < j; k++) {
                if (sigCelda(porCelda.get(`${bi}:${k}:${d}`) || []) !== sig) {
                  fusionar = false;
                  break;
                }
              }
            }
            if (fusionar) {
              spans.set(`${bi}:${i}:${d}`, { n: j - i, fin: filas[j - 1].fin });
              for (let k = i + 1; k < j; k++) cubiertas.add(`${bi}:${k}:${d}`);
              i = j;
              continue;
            }
          }
          i++;
        }
      }
    }
    return { spans, cubiertas };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandas, dias, porCelda, porId, parejasParciales]);

  // Tarjetas a renderizar en una celda, agrupadas por materia: las propias
  // de la celda más las parejas de choque parcial de todas ellas (pueden
  // estar en otra banda/turno). Solo se divide cuando hay pareja real del
  // icono verde.
  const grupoDe = (items: HorarioEntry[]): HorarioEntry[][] => {
    const map = new Map<string, HorarioEntry[]>();
    for (const e of items) {
      for (const x of [e, ...parejasDe(e)]) {
        const k = claveMateria(x);
        const g = map.get(k);
        if (g) g.push(x);
        else map.set(k, [x]);
      }
    }
    return [...map.values()];
  };

  // Lapso a mostrar: las clases de secciones SEMESTRALES se registran como
  // T1/T3 (cursan todo el semestre) → se etiquetan como el semestre real,
  // no como el trimestre donde están archivadas.
  const lapsoTexto = (e: HorarioEntry) =>
    e.tipo_proyeccion === 'SEMESTRAL'
      ? `Semestre ${e.trimestre}`
      : seccionesSemestrales?.has(e.seccion_id)
      ? `Semestre ${e.trimestre === 1 ? '1' : e.trimestre === 3 ? '2' : '1/2'}`
      : `Trimestre ${e.trimestre}`;

  // Indicadores de un grupo (unión de los de todas sus entries/horas) y su
  // rango horario completo (primera hora de inicio → última hora de fin)
  const itemDividido = (g: HorarioEntry[]) => ({
    entry: g[0],
    lapsoTexto: lapsoTexto(g[0]),
    iniMin: Math.min(...g.map((x) => minutos(x.hora_inicio))),
    finMin: Math.max(...g.map((x) => minutos(x.hora_fin))),
    horas: (() => {
      const ini = g.map((x) => x.hora_inicio).sort()[0];
      const fin = g.map((x) => x.hora_fin).sort().slice(-1)[0];
      return `${fmtHoraCfg(ini, formato12)}–${fmtHoraCfg(fin, formato12)}`;
    })(),
    errores: [
      ...new Map(
        g
          .flatMap((x) => enError?.get(`${x.bloque_id}:${x.dia_semana}`) ?? [])
          .map((t) => [`${t.titulo}|${t.texto}`, t])
      ).values(),
    ],
    advertencias: [...new Set(g.flatMap((x) => advertencias?.get(x.id) ?? []))],
    avisosParciales: [...new Set(g.flatMap((x) => avisosParciales?.get(x.id) ?? []))],
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 overflow-x-auto">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold px-1 pb-2">{titulo}</div>
      <table className="w-full table-fixed border-separate border-spacing-1 min-w-[640px]">
        <thead>
          <tr>
            <th className="w-24 pb-1">
              <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-800/80 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                Hora
              </span>
            </th>
            {dias.map((d) => (
              <th key={d} className="pb-1">
                <span className="inline-block w-full px-2 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-[11px] uppercase tracking-wider text-slate-200 font-bold text-center">
                  {DIAS_NOMBRES[d]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bandas.map((banda, bi) => (
            <React.Fragment key={bi}>
              {bandas.length > 1 && (
                <tr style={{ height: '1.5rem' }}>
                  <td colSpan={dias.length + 1} className="align-middle">
                    <span className="text-[9px] font-bold tracking-[0.3em] text-slate-500 uppercase">
                      {banda.nombre}
                    </span>
                  </td>
                </tr>
              )}
              {banda.filas.map((f, fIdx) => {
                const esReceso = f.esReceso;
                const celdaKey = (d: number) => `${bi}:${fIdx}:${d}`;
                const ocupacion = (d: number) => porCelda.get(celdaKey(d)) || [];
                if (esReceso) {
                  const ocupada = dias.some((d) => ocupacion(d).length > 0);
                  return (
                    <tr key={fIdx} style={{ height: '1.75rem' }}>
                      <td className="text-[9px] text-slate-500 text-right pr-2 whitespace-nowrap">
                        {fmtHoraCfg(f.inicio, formato12)}–{fmtHoraCfg(f.fin, formato12)}
                      </td>
                      {ocupada ? (
                        dias.map((d) => {
                          const items = ocupacion(d);
                          const dividir =
                            items.length > 1 || items.some((e) => parejasDe(e).length > 0);
                          return (
                            <td key={d} className="relative p-0 align-top" style={{ height: '1.75rem' }}>
                              <div className="absolute inset-0 p-0.5">
                                {!dividir ? (
                                  <div className="h-full flex flex-col gap-1">
                                    {items.map((e) => (
                                      <ClaseCard
                                        key={e.id}
                                        entry={e}
                                        compacto={items.length > 1}
                                        usa12h={formato12}
                                        errores={enError?.get(`${e.bloque_id}:${e.dia_semana}`) ?? []}
                                        advertencias={advertencias?.get(e.id)}
                                        avisosParciales={avisosParciales?.get(e.id)}
                                        ocultarAula={ocultarAula}
                                        ocultarProfesor={ocultarProfesor}
                                      />
                                    ))}
                                  </div>
                                ) : (
                                  <ClaseCascada
                                    items={grupoDe(items).map(itemDividido)}
                                    rangoInicio={minutos(f.inicio)}
                                    rangoFin={minutos(f.fin)}
                                    ocultarAula={ocultarAula}
                                    ocultarProfesor={ocultarProfesor}
                                  />
                                )}
                              </div>
                            </td>
                          );
                        })
                      ) : (
                        <td
                          colSpan={dias.length}
                          className="rounded-lg bg-slate-800/50 border border-dashed border-slate-700/60 text-center"
                        >
                          <span className="text-[9px] font-bold tracking-[0.3em] text-slate-600 uppercase inline-flex items-center gap-1">
                            <Coffee className="w-3 h-3" /> Receso
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                }
                return (
                  <tr key={fIdx} style={{ height: '3.5rem' }}>
                    <td className="text-[9px] text-slate-400 text-right pr-2 whitespace-nowrap align-middle">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {fmtHoraCfg(f.inicio, formato12)}–{fmtHoraCfg(f.fin, formato12)}
                      </span>
                    </td>
                    {dias.map((d) => {
                      const key = celdaKey(d);
                      if (cubiertas.has(key)) return null;
                      const items = ocupacion(d);
                      const sp = spans.get(key);
                      const fusion = sp && sp.n > 1;
                      // Errores de la tarjeta o de alguna celda que absorbe por rowspan
                      const errsDe = (e?: HorarioEntry): ErrorClase[] => {
                        if (!enError) return [];
                        if (e) return enError.get(`${e.bloque_id}:${e.dia_semana}`) ?? [];
                        const acc: ErrorClase[] = [];
                        const push = (k: string) => {
                          for (const t of enError.get(k) ?? []) {
                            if (!acc.some((m) => m.titulo === t.titulo && m.texto === t.texto))
                              acc.push(t);
                          }
                        };
                        for (const x of items) push(`${x.bloque_id}:${x.dia_semana}`);
                        for (let k = 0; k < (sp?.n ?? 1); k++) {
                          for (const x of porCelda.get(`${bi}:${fIdx + k}:${d}`) ?? [])
                            push(`${x.bloque_id}:${x.dia_semana}`);
                        }
                        return acc;
                      };
                      // Choques parciales T2 de la tarjeta, incluidos los de las
                      // celdas que absorbe el rowspan (cada bloque es un entry).
                      const parDe = (e?: HorarioEntry): string[] => {
                        if (!avisosParciales) return [];
                        const acc: string[] = [];
                        const pushE = (x: HorarioEntry) => {
                          for (const t of avisosParciales.get(x.id) ?? []) {
                            if (!acc.includes(t)) acc.push(t);
                          }
                        };
                        if (e) {
                          pushE(e);
                        } else {
                          for (const x of items) pushE(x);
                          for (let k = 0; k < (sp?.n ?? 1); k++) {
                            const fl = banda.filas[fIdx + k];
                            if (fl) for (const x of porCelda.get(`${bi}:${fIdx + k}:${d}`) ?? []) pushE(x);
                          }
                        }
                        return acc;
                      };
                      return (
                        <td
                          key={d}
                          rowSpan={fusion ? sp.n : undefined}
                          className="relative p-0 align-top"
                          style={{ height: '3.5rem' }}
                        >
                          <div className="absolute inset-0 p-0.5">
                            {(() => {
                              // Parejas del choque parcial de TODAS las celdas
                              // que absorbe el rowspan: si alguna choca con el
                              // trimestre 2, el bloque se divide. Con varias
                              // clases en la celda también se divide, como en
                              // la vista semestral (columnas lado a lado).
                              const itemsRun: HorarioEntry[] = [];
                              for (let k = 0; k < (fusion ? sp!.n : 1); k++) {
                                const fl = banda.filas[fIdx + k];
                                if (!fl) break;
                                itemsRun.push(...(porCelda.get(`${bi}:${fIdx + k}:${d}`) ?? []));
                              }
                              if (
                                items.length > 1 ||
                                itemsRun.some((e) => parejasDe(e).length > 0)
                              ) {
                                return (
                                  <ClaseCascada
                                    items={grupoDe(itemsRun).map(itemDividido)}
                                    rangoInicio={minutos(f.inicio)}
                                    rangoFin={minutos(fusion ? sp!.fin : f.fin)}
                                    ocultarAula={ocultarAula}
                                    ocultarProfesor={ocultarProfesor}
                                  />
                                );
                              }
                              return (
                                <div className="h-full flex flex-col gap-1">
                                  {items.map((e) => (
                                    <ClaseCard
                                      key={e.id}
                                      entry={e}
                                      fin={fusion ? sp.fin : undefined}
                                      compacto={items.length > 1}
                                      usa12h={formato12}
                                      errores={items.length > 1 ? errsDe(e) : errsDe()}
                                      advertencias={advertencias?.get(e.id)}
                                      avisosParciales={parDe(items.length > 1 ? e : undefined)}
                                      ocultarAula={ocultarAula}
                                      ocultarProfesor={ocultarProfesor}
                                    />
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && (
        <div className="text-center text-slate-500 text-xs italic py-6">
          Sin clases agendadas en este lapso.
        </div>
      )}
    </div>
  );
};
