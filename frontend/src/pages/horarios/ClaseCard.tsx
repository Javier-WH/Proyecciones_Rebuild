import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePnfColors } from '../../context/PnfColorContext.js';
import { HorarioEntry, ErrorClase, colorMateria, fmtHoraCfg, pnfLabel } from './types.js';
import { User, MapPin, Clock, AlertTriangle, AlertOctagon, GraduationCap } from 'lucide-react';

// Tarjeta de una clase agendada, común a las vistas por sección, aula y
// profesor: materia (grande) + profesor, aula y hora (pequeños).
// `fin` = hora de fin efectiva cuando la tarjeta abarca varios bloques fusionados.
// `compacto` = varias clases comparten la celda: materia + una línea resumida.
// `errores` = violaciones de la clase: dibuja un punto rojo con tooltip flotante
// que lista cada conflicto con su título (grande) y descripción (pequeña).
export const ClaseCard: React.FC<{
  entry: HorarioEntry;
  fin?: string;
  compacto?: boolean;
  usa12h?: boolean;
  errores?: ErrorClase[];
  advertencias?: string[]; // avisos (no errores): triángulo amarillo bajo la tarjeta
  avisosParciales?: string[]; // choques parciales T2↔semestre: icono verde abajo a la derecha
  ocultarAula?: boolean; // vista por aula: la línea del aula es redundante → PNF
  ocultarProfesor?: boolean; // vista por profesor: la línea del profesor es redundante → PNF
  className?: string;
}> = ({ entry, fin, compacto, usa12h, errores, advertencias, avisosParciales, ocultarAula, ocultarProfesor, className = '' }) => {
  const [tip, setTip] = useState<{ x: number; y: number; flip: boolean } | null>(null);
  const [tipAdv, setTipAdv] = useState<{ x: number; y: number; flip: boolean } | null>(null);
  const [tipPar, setTipPar] = useState<{ x: number; y: number; flip: boolean } | null>(null);
  const { colorDePnf, catalogo } = usePnfColors();
  const pnfColor = colorDePnf(entry.pnf_saga_id);
  const pnfNombre = catalogo.find((c) => c.id === entry.pnf_saga_id)?.nombre;

  const profesor = entry.profesor_id
    ? `${entry.prof_nombres ?? ''} ${entry.prof_apellidos ?? ''}`.trim()
    : 'Sin profesor';
  const aula = entry.aula_nombre || entry.aula_codigo;
  const hora = `${fmtHoraCfg(entry.hora_inicio, usa12h)}–${fmtHoraCfg(fin ?? entry.hora_fin, usa12h)}`;
  const pnf = pnfLabel(pnfNombre);
  // Trayecto de la sección: se anexa al PNF en las vistas por aula/profesor
  // para identificar de qué cohorte es la clase ('Administración · T. IV').
  const trayecto = entry.trayecto_nombre
    ? entry.trayecto_nombre.replace(/^\s*trayecto\s*/i, 'T. ').replace(/\s+/g, ' ')
    : '';
  const pnfTrayecto = trayecto ? `${pnf} · ${trayecto}` : pnf;
  // Línea resumida del modo compacto: en vista por aula se antepone el PNF;
  // en vista por profesor el PNF sustituye al profesor (redundante ahí).
  const resumen = ocultarProfesor
    ? `${pnfTrayecto} · ${aula} · ${hora}`
    : `${ocultarAula ? `${pnfTrayecto} · ` : ''}${profesor}${ocultarAula ? '' : ` · ${aula}`} · ${hora}`;

  return (
    <div
      className={`relative rounded-lg border px-2 py-1 flex flex-col justify-center overflow-hidden select-none ${colorMateria(
        entry.materia_id
      )} ${compacto ? 'flex-1 min-h-0' : 'h-full'} ${className}`}
    >
      {errores && errores.length > 0 && (
        <span
          onMouseEnter={(ev) => {
            const r = ev.currentTarget.getBoundingClientRect();
            setTip({ x: r.left + r.width / 2, y: r.top, flip: r.top < 190 });
          }}
          onMouseLeave={() => setTip(null)}
          className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-300/70 shadow-[0_0_6px_2px_rgba(239,68,68,0.7)] animate-pulse cursor-help"
        />
      )}
      {tip && errores && errores.length > 0 &&
        createPortal(
          <div
            className="fixed z-[100] pointer-events-none"
            style={{
              left: tip.x,
              top: tip.y,
              transform: tip.flip
                ? 'translate(-50%, 12px)'
                : 'translate(-50%, calc(-100% - 10px))',
            }}
          >
            <div className="w-64 rounded-xl border border-red-500/40 bg-slate-900/95 backdrop-blur-sm shadow-2xl shadow-black/60 px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-red-300 mb-1.5">
                {errores.length} conflicto{errores.length === 1 ? '' : 's'}
              </div>
              <ul className="space-y-2">
                {errores.map((t, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-[4px]" />
                    <span className="min-w-0">
                      {t.titulo && (
                        <span className="block text-[11px] font-bold text-red-300 leading-tight">
                          {t.titulo}
                        </span>
                      )}
                      <span className="block text-[10px] text-slate-300 leading-snug">
                        {t.texto}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body
        )}
      {advertencias && advertencias.length > 0 && (
        <span
          onMouseEnter={(ev) => {
            const r = ev.currentTarget.getBoundingClientRect();
            setTipAdv({ x: r.left + r.width / 2, y: r.bottom, flip: false });
          }}
          onMouseLeave={() => setTipAdv(null)}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 p-1.5 z-10 cursor-help"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.9)]" />
        </span>
      )}
      {tipAdv && advertencias && advertencias.length > 0 &&
        createPortal(
          <div
            className="fixed z-[100] pointer-events-none"
            style={{ left: tipAdv.x, top: tipAdv.y, transform: 'translate(-50%, 10px)' }}
          >
            <div className="w-64 rounded-xl border border-amber-500/40 bg-slate-900/95 backdrop-blur-sm shadow-2xl shadow-black/60 px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-amber-300 mb-1.5">
                Advertencia{advertencias.length === 1 ? '' : 's'}
              </div>
              <ul className="space-y-2">
                {advertencias.map((t, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-[4px]" />
                    <span className="text-[10px] text-slate-300 leading-snug">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body
        )}
      {avisosParciales && avisosParciales.length > 0 && (
        <span
          onMouseEnter={(ev) => {
            const r = ev.currentTarget.getBoundingClientRect();
            setTipPar({ x: r.left + r.width / 2, y: r.top, flip: r.top < 210 });
          }}
          onMouseLeave={() => setTipPar(null)}
          className="absolute bottom-0 right-0 p-1.5 z-10 cursor-help"
        >
          <AlertOctagon className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.9)]" />
        </span>
      )}
      {tipPar && avisosParciales && avisosParciales.length > 0 &&
        createPortal(
          <div
            className="fixed z-[100] pointer-events-none"
            style={{
              left: tipPar.x,
              top: tipPar.y,
              transform: tipPar.flip
                ? 'translate(-50%, 12px)'
                : 'translate(-50%, calc(-100% - 10px))',
            }}
          >
            <div className="w-72 rounded-xl border border-emerald-500/40 bg-slate-900/95 backdrop-blur-sm shadow-2xl shadow-black/60 px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-300 mb-1.5">
                Conflicto potencial — trimestre 2
              </div>
              <ul className="space-y-2">
                {avisosParciales.map((t, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-[4px]" />
                    <span className="text-[10px] text-slate-300 leading-snug">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body
        )}
      <div className="text-[11px] font-bold leading-tight flex items-start gap-1">
        {pnfColor && (
          <span
            title={pnfNombre ?? 'PNF'}
            className="w-2 h-2 rounded-full shrink-0 mt-[3px] ring-1 ring-white/20"
            style={{ backgroundColor: pnfColor }}
          />
        )}
        <span className="line-clamp-1 min-w-0" title={entry.materia_nombre}>
          {entry.materia_nombre}
        </span>
      </div>
      {compacto ? (
        <div className="text-[9px] opacity-80 leading-tight truncate" title={resumen}>
          {resumen}
        </div>
      ) : (
        <div className="text-[9px] opacity-80 leading-tight mt-0.5 space-y-px">
          {ocultarProfesor ? (
            <div className="flex items-center gap-1 truncate" title={pnfTrayecto}>
              <GraduationCap className="w-2.5 h-2.5 shrink-0 opacity-70" />
              <span className="truncate">{pnfTrayecto}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 truncate" title={profesor}>
              <User className="w-2.5 h-2.5 shrink-0 opacity-70" />
              <span className="truncate">{profesor}</span>
            </div>
          )}
          {ocultarAula ? (
            <div className="flex items-center gap-1 truncate" title={pnfTrayecto}>
              <GraduationCap className="w-2.5 h-2.5 shrink-0 opacity-70" />
              <span className="truncate">{pnfTrayecto}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 truncate" title={`${entry.aula_codigo} — ${entry.aula_nombre}`}>
              <MapPin className="w-2.5 h-2.5 shrink-0 opacity-70" />
              <span className="truncate">{aula}</span>
            </div>
          )}
          <div className="flex items-center gap-1 truncate">
            <Clock className="w-2.5 h-2.5 shrink-0 opacity-70" />
            <span className="truncate">{hora}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Tarjeta dividida: materias en conflicto parcial T2↔semestre ─────────────
// Divide el espacio visual del bloque entre las materias que chocan:
//   2 clases  → dos bloques lado a lado (izquierda / derecha).
//   3+ clases → columnas verticales iguales con divisor.
// Cada región muestra materia + sección y sus indicadores (punto rojo =
// conflicto real, triángulo ámbar = advertencia, octágono verde = choque
// parcial con el trimestre 2).
export interface ItemDividido {
  entry: HorarioEntry;
  lapsoTexto?: string; // lapso lógico a mostrar ('Semestre 1'); si falta se deriva de la entry
  horas?: string; // rango horario del grupo ('HH:MM–HH:MM'), ya formateado
  iniMin?: number; // inicio del grupo en minutos (para posición en cascada)
  finMin?: number; // fin del grupo en minutos
  errores?: ErrorClase[];
  advertencias?: string[];
  avisosParciales?: string[];
}

// Punto con el color del PNF (igual que el de ClaseCard) para las tarjetas
// divididas/cascada, donde el nombre de la materia va centrado o vertical.
const PuntoPnf: React.FC<{ pnfSagaId: number | null | undefined }> = ({ pnfSagaId }) => {
  const { colorDePnf, catalogo } = usePnfColors();
  const color = colorDePnf(pnfSagaId);
  if (!color) return null;
  const nombre = catalogo.find((c) => c.id === pnfSagaId)?.nombre;
  return (
    <span
      title={nombre ?? 'PNF'}
      className="inline-block w-2 h-2 rounded-full shrink-0 ring-1 ring-white/20 mr-1 align-baseline"
      style={{ backgroundColor: color }}
    />
  );
};

// 'TRIMESTRAL',2 → 'Trimestre 2' · 'SEMESTRAL',1 → 'Semestre 1'
const lapsoLabel = (e: HorarioEntry) =>
  `${e.tipo_proyeccion === 'SEMESTRAL' ? 'Semestre' : 'Trimestre'} ${e.trimestre}`;

// Texto de lapso del item: el calculado por la vista o el de la entry
const lapsoDe = (it: ItemDividido) => it.lapsoTexto ?? lapsoLabel(it.entry);

// Etiqueta corta de lapso para columnas angostas: 'S1', 'T2'…
const lapsoCorto = (it: ItemDividido) => {
  const t = lapsoDe(it);
  return `${t[0]}${t.replace(/\D/g, '')}`;
};

// Cuerpo de un item dividido con el mismo formato de ClaseCard: materia en
// negrita con punto del PNF y líneas pequeñas con icono (sección·lapso,
// profesor, aula y hora).
const DetalleItem: React.FC<{ it: ItemDividido; ocultarAula?: boolean; ocultarProfesor?: boolean }> = ({
  it,
  ocultarAula,
  ocultarProfesor,
}) => {
  const e = it.entry;
  const { catalogo } = usePnfColors();
  const pnfNombre = catalogo.find((c) => c.id === e.pnf_saga_id)?.nombre;
  const profesor = e.profesor_id
    ? `${e.prof_nombres ?? ''} ${e.prof_apellidos ?? ''}`.trim()
    : 'Sin profesor';
  const aula = e.aula_nombre || e.aula_codigo;
  const trayecto = e.trayecto_nombre
    ? e.trayecto_nombre.replace(/^\s*trayecto\s*/i, 'T. ').replace(/\s+/g, ' ')
    : '';
  const pnfTrayecto = trayecto ? `${pnfLabel(pnfNombre)} · ${trayecto}` : pnfLabel(pnfNombre);
  return (
    <>
      <div
        className="text-[10px] font-bold leading-tight line-clamp-2"
        title={`${e.materia_nombre} · ${e.seccion_nombre}`}
      >
        <PuntoPnf pnfSagaId={e.pnf_saga_id} />
        {e.materia_nombre}
      </div>
      <div className="text-[8px] opacity-80 leading-tight mt-0.5 space-y-px">
        <div
          className="truncate"
          title={`${e.seccion_nombre} · ${lapsoDe(it)} · ${e.turno_nombre}${trayecto ? ` · ${e.trayecto_nombre}` : ''}`}
        >
          {e.seccion_nombre} · {lapsoDe(it)}
        </div>
        {ocultarProfesor ? (
          <div className="flex items-center gap-1 truncate" title={pnfTrayecto}>
            <GraduationCap className="w-2.5 h-2.5 shrink-0 opacity-70" />
            <span className="truncate">{pnfTrayecto}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 truncate" title={profesor}>
            <User className="w-2.5 h-2.5 shrink-0 opacity-70" />
            <span className="truncate">{profesor}</span>
          </div>
        )}
        {ocultarAula ? (
          <div className="flex items-center gap-1 truncate" title={pnfTrayecto}>
            <GraduationCap className="w-2.5 h-2.5 shrink-0 opacity-70" />
            <span className="truncate">{pnfTrayecto}</span>
          </div>
        ) : (
          <div
            className="flex items-center gap-1 truncate"
            title={`${e.aula_codigo} — ${e.aula_nombre}`}
          >
            <MapPin className="w-2.5 h-2.5 shrink-0 opacity-70" />
            <span className="truncate">{aula}</span>
          </div>
        )}
        {it.horas && (
          <div className="flex items-center gap-1 truncate">
            <Clock className="w-2.5 h-2.5 shrink-0 opacity-70" />
            <span className="truncate">{it.horas}</span>
          </div>
        )}
      </div>
    </>
  );
};

export const ClaseDividida: React.FC<{
  items: ItemDividido[];
  onItemClick?: (entry: HorarioEntry) => void;
  ocultarAula?: boolean;
  ocultarProfesor?: boolean;
}> = ({ items, onItemClick, ocultarAula, ocultarProfesor }) => {
  if (items.length < 2) return null;

  // 2 materias: dos bloques lado a lado (izquierda / derecha)
  if (items.length === 2) {
    return (
      <div className="absolute inset-0 rounded-lg overflow-hidden border border-slate-700/70 flex select-none">
        {items.map((it, i) => (
          <div
            key={i}
            className={`relative flex-1 min-w-0 ${colorMateria(it.entry.materia_id)} ${
              i > 0 ? 'border-l-2 border-slate-900/80' : ''
            } ${onItemClick ? 'cursor-pointer' : ''}`}
            onClick={() => onItemClick?.(it.entry)}
          >
            <div className="absolute inset-0 flex flex-col justify-center p-1.5 pb-4 overflow-hidden">
              <DetalleItem it={it} ocultarAula={ocultarAula} ocultarProfesor={ocultarProfesor} />
            </div>
            <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 z-10">
              <MiniAvisos item={it} horizontal />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 3 o más clases: columnas verticales iguales
  return (
    <div className="absolute inset-0 rounded-lg overflow-hidden border border-slate-700/70 flex select-none">
      {items.map((it, i) => (
        <div
          key={i}
          className={`relative flex-1 min-w-0 ${colorMateria(it.entry.materia_id)} ${
            i > 0 ? 'border-l-2 border-slate-900/70' : ''
          } ${onItemClick ? 'cursor-pointer' : ''}`}
          onClick={() => onItemClick?.(it.entry)}
        >
          {/* Lapso arriba en horizontal para ubicar la región de un vistazo */}
          <div className="absolute top-0.5 left-0 right-0 text-center text-[8px] font-bold opacity-90 leading-tight">
            {lapsoCorto(it)}
          </div>
          <div className="absolute inset-0 flex items-center justify-center p-0.5 pb-4 pt-4">
            <span
              className="text-[9px] font-bold leading-tight max-h-full overflow-hidden"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              title={`${it.entry.materia_nombre} · ${it.entry.seccion_nombre} · ${lapsoDe(it)} · ${it.entry.turno_nombre}${it.horas ? ` · ${it.horas}` : ''}`}
            >
              <PuntoPnf pnfSagaId={it.entry.pnf_saga_id} />
              {it.entry.materia_nombre}
            </span>
          </div>
          <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5 z-10">
            <MiniAvisos item={it} horizontal />
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Cascada: choque parcial particionado por franjas de tiempo real ───────
// El espacio del cluster se corta horizontalmente en los límites reales de
// las clases; cada franja reparte su ancho en columnas iguales entre las
// materias presentes. La posición horizontal es estable: cada materia ocupa
// un "carril" (coloreo de intervalos — el carril más bajo que no se solape
// con ella), así si una materia sigue en la franja de abajo conserva su
// columna, y una materia nueva que cabe en un carril libre ocupa su espacio.
export const ClaseCascada: React.FC<{
  items: ItemDividido[]; // cada item trae iniMin/finMin del grupo
  rangoInicio: number; // minutos
  rangoFin: number; // minutos
  onItemClick?: (entry: HorarioEntry) => void;
  ocultarAula?: boolean;
  ocultarProfesor?: boolean;
}> = ({ items, rangoInicio, rangoFin, onItemClick, ocultarAula, ocultarProfesor }) => {
  if (items.length === 0) return null;
  const span = Math.max(1, rangoFin - rangoInicio);
  const orden = [...items].sort(
    (a, b) =>
      (a.iniMin ?? rangoInicio) - (b.iniMin ?? rangoInicio) ||
      (b.finMin ?? rangoFin) - (a.finMin ?? rangoFin)
  );
  const iniDe = (it: ItemDividido) => Math.max(it.iniMin ?? rangoInicio, rangoInicio);
  const finDe = (it: ItemDividido) => Math.min(it.finMin ?? rangoFin, rangoFin);

  // Carril de cada materia: el más bajo libre a su hora de inicio
  const carrilDe = new Map<ItemDividido, number>();
  const finCarril: number[] = [];
  for (const it of orden) {
    let c = finCarril.findIndex((f) => f <= (it.iniMin ?? rangoInicio));
    if (c === -1) {
      c = finCarril.length;
      finCarril.push(0);
    }
    finCarril[c] = Math.max(finCarril[c], it.finMin ?? rangoFin);
    carrilDe.set(it, c);
  }

  // Cortes = todos los inicios/fines reales dentro del rango + los bordes
  const cortes = new Set<number>([rangoInicio, rangoFin]);
  for (const it of orden) {
    cortes.add(iniDe(it));
    cortes.add(finDe(it));
  }
  const bounds = [...cortes].sort((a, b) => a - b);

  // Franjas entre cortes. Un carril que queda vacío por un hueco temporal
  // (la materia anterior ya terminó pero otra vendrá a ese carril) se
  // RELLENA con el último ocupante — así no aparecen franjas angostas de
  // una sola materia entre dos materias distintas.
  interface CeldaFranja {
    it: ItemDividido;
    relleno: boolean; // true = prolongación visual del carril, no tiempo real
  }
  interface Franja {
    t0: number;
    t1: number;
    celdas: CeldaFranja[]; // ordenadas de mayor a menor carril
    key: string;
  }
  const crudos: { t0: number; t1: number; reales: ItemDividido[] }[] = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const t0 = bounds[k];
    const t1 = bounds[k + 1];
    if (t1 <= t0) continue;
    const reales = orden.filter((it) => iniDe(it) < t1 && finDe(it) > t0);
    if (reales.length > 0) crudos.push({ t0, t1, reales });
  }
  // Último slice donde cada carril está activo de verdad (para saber si un
  // carril vacío será reocupado más adelante y conviene rellenarlo)
  const ultActivo = new Map<number, number>();
  crudos.forEach((s, i) => {
    for (const it of s.reales) ultActivo.set(carrilDe.get(it) ?? 0, i);
  });
  const ultimo = new Map<number, ItemDividido>();
  const franjas: Franja[] = [];
  crudos.forEach((s, i) => {
    const celdas: CeldaFranja[] = s.reales.map((it) => ({ it, relleno: false }));
    const presentes = new Set(s.reales.map((it) => carrilDe.get(it) ?? 0));
    for (const [c, it] of ultimo) {
      if (!presentes.has(c) && (ultActivo.get(c) ?? -1) > i) {
        celdas.push({ it, relleno: true });
      }
    }
    celdas.sort((a, b) => (carrilDe.get(b.it) ?? 0) - (carrilDe.get(a.it) ?? 0));
    for (const it of s.reales) ultimo.set(carrilDe.get(it) ?? 0, it);
    const key = celdas.map((x) => `${carrilDe.get(x.it)}${x.relleno ? 'r' : ''}`).join(',');
    const prev = franjas[franjas.length - 1];
    if (prev && prev.key === key && prev.t1 === s.t0) prev.t1 = s.t1;
    else franjas.push({ t0: s.t0, t1: s.t1, celdas, key });
  });

  // La etiqueta de cada materia se muestra solo en su franja real más alta
  const mejorFranja = new Map<ItemDividido, number>();
  franjas.forEach((f, idx) => {
    for (const x of f.celdas) {
      if (x.relleno) continue;
      const cur = mejorFranja.get(x.it);
      if (cur === undefined || f.t1 - f.t0 > franjas[cur].t1 - franjas[cur].t0) {
        mejorFranja.set(x.it, idx);
      }
    }
  });

  // Separadores SOLO entre materias distintas (no cortes internos de la
  // misma clase): verticales entre columnas de una franja; horizontales
  // solo en los tramos donde la materia cambia al cruzar la franja.
  interface Sep {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }
  const seps: Sep[] = [];
  const pctY = (t: number) => ((t - rangoInicio) / span) * 100;
  for (const f of franjas) {
    const n = f.celdas.length;
    for (let c = 1; c < n; c++) {
      seps.push({ x0: (c / n) * 100, y0: pctY(f.t0), x1: (c / n) * 100, y1: pctY(f.t1) });
    }
  }
  const ocupanteDe = (f: Franja, x: number) =>
    f.celdas[Math.min(f.celdas.length - 1, Math.floor((x / 100) * f.celdas.length))].it;
  for (let i = 0; i + 1 < franjas.length; i++) {
    const f = franjas[i];
    const g = franjas[i + 1];
    if (f.t1 !== g.t0) continue;
    const xs = new Set<number>([0, 100]);
    for (let c = 1; c < f.celdas.length; c++) xs.add((c / f.celdas.length) * 100);
    for (let c = 1; c < g.celdas.length; c++) xs.add((c / g.celdas.length) * 100);
    const exs = [...xs].sort((a, b) => a - b);
    for (let k = 0; k + 1 < exs.length; k++) {
      const mid = (exs[k] + exs[k + 1]) / 2;
      if (ocupanteDe(f, mid) !== ocupanteDe(g, mid)) {
        seps.push({ x0: exs[k], y0: pctY(f.t1), x1: exs[k + 1], y1: pctY(f.t1) });
      }
    }
  }

  return (
    <div className="absolute inset-0 select-none overflow-hidden rounded-lg">
      {franjas.map((f, fi) => {
        const top = ((f.t0 - rangoInicio) / span) * 100;
        const alto = ((f.t1 - f.t0) / span) * 100;
        const n = f.celdas.length;
        return f.celdas.map((x, col) => (
          <div
            key={`${fi}-${col}`}
            className="absolute"
            style={{
              top: `${top}%`,
              height: `${alto}%`,
              left: `${(col / n) * 100}%`,
              width: `${100 / n}%`,
            }}
            onClick={() => onItemClick?.(x.it.entry)}
          >
            {/* Base opaca: el tinte de materia es translúcido y sin ella se
                verían las regiones de atrás al solaparse */}
            <div className="absolute inset-0 bg-slate-900" />
            <div
              className={`relative h-full overflow-hidden ${colorMateria(
                x.it.entry.materia_id
              )} ${onItemClick ? 'cursor-pointer' : ''}`}
            >
              {!x.relleno && mejorFranja.get(x.it) === fi && (
                <div className="absolute inset-0 flex flex-col justify-center p-1 pb-3 overflow-hidden">
                  <DetalleItem it={x.it} ocultarAula={ocultarAula} ocultarProfesor={ocultarProfesor} />
                  <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 z-10">
                    <MiniAvisos item={x.it} horizontal />
                  </div>
                </div>
              )}
            </div>
          </div>
        ));
      })}
      {/* Separadores solo donde realmente cambia la materia */}
      {seps.map((s, i) =>
        s.x0 === s.x1 ? (
          <div
            key={i}
            className="absolute bg-white/25 z-20 pointer-events-none"
            style={{ left: `${s.x0}%`, top: `${s.y0}%`, width: '1.5px', height: `${s.y1 - s.y0}%` }}
          />
        ) : (
          <div
            key={i}
            className="absolute bg-white/25 z-20 pointer-events-none"
            style={{ top: `${s.y0}%`, left: `${s.x0}%`, height: '1.5px', width: `${s.x1 - s.x0}%` }}
          />
        )
      )}
    </div>
  );
};

// Mini iconos con tooltip por portal para cada región de la tarjeta dividida
const MiniAvisos: React.FC<{
  item: { errores?: ErrorClase[]; advertencias?: string[]; avisosParciales?: string[] };
  horizontal?: boolean;
}> = ({ item, horizontal }) => {
  const [tip, setTip] = useState<{ x: number; y: number; tipo: string; lineas: string[] } | null>(null);
  const show = (ev: React.MouseEvent, tipo: string, lineas: string[]) => {
    const r = ev.currentTarget.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top, tipo, lineas });
  };
  const cls = 'w-3 h-3 cursor-help shrink-0';
  return (
    <div className={`flex ${horizontal ? 'flex-row' : 'flex-col'} gap-0.5 pointer-events-auto`}>
      {item.errores && item.errores.length > 0 && (
        <span
          onMouseEnter={(e) => show(e, 'conflictos', item.errores!.map((x) => `${x.titulo ? x.titulo + ': ' : ''}${x.texto}`))}
          onMouseLeave={() => setTip(null)}
          className={`${cls} rounded-full bg-red-500 ring-1 ring-red-300 animate-pulse`}
        />
      )}
      {item.advertencias && item.advertencias.length > 0 && (
        <span
          onMouseEnter={(e) => show(e, 'advertencias', item.advertencias!)}
          onMouseLeave={() => setTip(null)}
          className={cls}
        >
          <AlertTriangle className="w-3 h-3 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.9)]" />
        </span>
      )}
      {item.avisosParciales && item.avisosParciales.length > 0 && (
        <span
          onMouseEnter={(e) => show(e, 'conflicto potencial — trimestre 2', item.avisosParciales!)}
          onMouseLeave={() => setTip(null)}
          className={cls}
        >
          <AlertOctagon className="w-3 h-3 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.9)]" />
        </span>
      )}
      {tip &&
        createPortal(
          <div
            className="fixed z-[100] pointer-events-none"
            style={{ left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 8px))' }}
          >
            <div
              className={`w-64 rounded-xl border px-3 py-2.5 bg-slate-900/95 backdrop-blur-sm shadow-2xl shadow-black/60 ${
                tip.tipo === 'conflictos'
                  ? 'border-red-500/40'
                  : tip.tipo === 'advertencias'
                  ? 'border-amber-500/40'
                  : 'border-emerald-500/40'
              }`}
            >
              <div
                className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${
                  tip.tipo === 'conflictos'
                    ? 'text-red-300'
                    : tip.tipo === 'advertencias'
                    ? 'text-amber-300'
                    : 'text-emerald-300'
                }`}
              >
                {tip.tipo}
              </div>
              <ul className="space-y-1.5">
                {tip.lineas.map((t, i) => (
                  <li key={i} className="text-[10px] text-slate-300 leading-snug">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
