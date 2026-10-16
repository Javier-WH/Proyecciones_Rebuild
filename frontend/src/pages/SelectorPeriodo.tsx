import React from 'react';
import { usePeriodo } from '../context/PeriodoContext.js';
import { CalendarDays, FlaskConical } from 'lucide-react';

// Sección del menú de configuración (tuerca) con el selector global de
// periodo de trabajo. Solo Master y Coordinador pueden salir del periodo
// ACTIVO para preparar el periodo en PLANIFICACION; el resto de roles ni
// lo ve (y el backend ignora el parámetro si lo envían manualmente).
export const SelectorPeriodo: React.FC<{ onSeleccionado?: () => void }> = ({ onSeleccionado }) => {
  const { periodos, periodo, esPlanificacion, puedeSeleccionar, setPeriodo } = usePeriodo();

  // Sin nada que elegir (solo el activo) no se muestra control alguno.
  if (!puedeSeleccionar || periodos.length < 2) return null;

  return (
    <div
      className={`px-4 py-3 border-b border-slate-800 ${
        esPlanificacion ? 'bg-amber-500/10' : ''
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
        {esPlanificacion ? (
          <FlaskConical className="w-3 h-3 text-amber-400" />
        ) : (
          <CalendarDays className="w-3 h-3" />
        )}
        Periodo de trabajo
      </div>
      <select
        value={periodo ?? ''}
        onChange={(e) => {
          setPeriodo(e.target.value);
          onSeleccionado?.();
        }}
        title={
          esPlanificacion
            ? 'Estás trabajando sobre el periodo en planificación — solo afecta a tu sesión'
            : 'Periodo de trabajo'
        }
        className={`w-full rounded-lg border px-2.5 py-2 text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 transition-colors ${
          esPlanificacion
            ? 'bg-slate-900 border-amber-500/50 text-amber-300 focus:ring-amber-500/50'
            : 'bg-slate-950 border-slate-700 text-slate-200 focus:ring-slate-500'
        }`}
      >
        {periodos.map((p) => (
          <option key={p.codigo} value={p.codigo} className="bg-slate-900 text-slate-200">
            {p.codigo} · {p.estado === 'ACTIVO' ? 'Activo' : 'Planificación'}
          </option>
        ))}
      </select>
      {esPlanificacion && (
        <p className="mt-1.5 text-[10px] text-amber-400/90 leading-snug">
          Estás editando la planificación — solo afecta a tu sesión.
        </p>
      )}
    </div>
  );
};
