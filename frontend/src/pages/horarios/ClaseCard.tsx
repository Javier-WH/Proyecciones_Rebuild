import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePnfColors } from '../../context/PnfColorContext.js';
import { HorarioEntry, ErrorClase, colorMateria, fmtHoraCfg } from './types.js';
import { User, MapPin, Clock, AlertTriangle, AlertOctagon } from 'lucide-react';

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
  className?: string;
}> = ({ entry, fin, compacto, usa12h, errores, advertencias, avisosParciales, className = '' }) => {
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
        <div className="text-[9px] opacity-80 leading-tight truncate" title={`${profesor} · ${aula} · ${hora}`}>
          {profesor} · {aula} · {hora}
        </div>
      ) : (
        <div className="text-[9px] opacity-80 leading-tight mt-0.5 space-y-px">
          <div className="flex items-center gap-1 truncate" title={profesor}>
            <User className="w-2.5 h-2.5 shrink-0 opacity-70" />
            <span className="truncate">{profesor}</span>
          </div>
          <div className="flex items-center gap-1 truncate" title={`${entry.aula_codigo} — ${entry.aula_nombre}`}>
            <MapPin className="w-2.5 h-2.5 shrink-0 opacity-70" />
            <span className="truncate">{aula}</span>
          </div>
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
  errores?: ErrorClase[];
  advertencias?: string[];
  avisosParciales?: string[];
}

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

export const ClaseDividida: React.FC<{
  items: ItemDividido[];
  onItemClick?: (entry: HorarioEntry) => void;
}> = ({ items, onItemClick }) => {
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
            <div className="absolute inset-0 flex flex-col items-center justify-center p-1 pb-4">
              <span
                className="text-[10px] font-bold leading-tight text-center line-clamp-3"
                title={`${it.entry.materia_nombre} · ${it.entry.seccion_nombre}`}
              >
                {it.entry.materia_nombre}
              </span>
              <span className="text-[8px] opacity-80 leading-tight text-center truncate max-w-full mt-0.5">
                {it.entry.seccion_nombre} · {lapsoDe(it)}
              </span>
              <span className="text-[8px] opacity-80 leading-tight text-center truncate max-w-full">
                {it.entry.turno_nombre}
              </span>
              {it.horas && (
                <span className="text-[8px] opacity-80 leading-tight text-center truncate max-w-full">
                  {it.horas}
                </span>
              )}
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
