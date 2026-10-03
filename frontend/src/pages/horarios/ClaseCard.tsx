import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { usePnfColors } from '../../context/PnfColorContext.js';
import { HorarioEntry, ErrorClase, colorMateria, fmtHoraCfg } from './types.js';
import { User, MapPin, Clock } from 'lucide-react';

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
  className?: string;
}> = ({ entry, fin, compacto, usa12h, errores, className = '' }) => {
  const [tip, setTip] = useState<{ x: number; y: number; flip: boolean } | null>(null);
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
