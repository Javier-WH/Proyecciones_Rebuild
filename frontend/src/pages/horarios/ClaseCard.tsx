import React from 'react';
import { usePnfColors } from '../../context/PnfColorContext.js';
import { HorarioEntry, colorMateria, fmtHora } from './types.js';
import { User, MapPin, Clock } from 'lucide-react';

// Tarjeta de una clase agendada, común a las vistas por sección, aula y
// profesor: materia (grande) + profesor, aula y hora (pequeños).
// `fin` = hora de fin efectiva cuando la tarjeta abarca varios bloques fusionados.
// `compacto` = varias clases comparten la celda: materia + una línea resumida.
export const ClaseCard: React.FC<{
  entry: HorarioEntry;
  fin?: string;
  compacto?: boolean;
  className?: string;
}> = ({ entry, fin, compacto, className = '' }) => {
  const { colorDePnf, catalogo } = usePnfColors();
  const pnfColor = colorDePnf(entry.pnf_saga_id);
  const pnfNombre = catalogo.find((c) => c.id === entry.pnf_saga_id)?.nombre;

  const profesor = entry.profesor_id
    ? `${entry.prof_nombres ?? ''} ${entry.prof_apellidos ?? ''}`.trim()
    : 'Sin profesor';
  const aula = entry.aula_nombre || entry.aula_codigo;
  const hora = `${fmtHora(entry.hora_inicio)}–${fmtHora(fin ?? entry.hora_fin)}`;

  return (
    <div
      className={`rounded-lg border px-2 py-1 flex flex-col justify-center overflow-hidden select-none ${colorMateria(
        entry.materia_id
      )} ${compacto ? 'flex-1 min-h-0' : 'h-full'} ${className}`}
    >
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
