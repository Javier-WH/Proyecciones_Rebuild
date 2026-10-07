import React from 'react';
import type { Profesor } from './ProfesorModal.js';
import { DisponibilidadGrid } from './DisponibilidadGrid.js';
import { X, CalendarCheck } from 'lucide-react';

interface DisponibilidadProfesorModalProps {
  isOpen: boolean;
  onClose: () => void;
  profesor: Profesor | null;
}

// Grilla día × rango horario (unión de bloques de todos los turnos: mañana,
// tarde, noche). Click en una celda = toggle disponible/no disponible.
// Solo se persisten los slots bloqueados (verde = default, no ocupa fila).
export const DisponibilidadProfesorModal: React.FC<DisponibilidadProfesorModalProps> = ({
  isOpen,
  onClose,
  profesor,
}) => {
  if (!isOpen || !profesor) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-950 shrink-0">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-emerald-400" />
              Disponibilidad — {profesor.apellidos}, {profesor.nombres}
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Click en una celda para alternar entre{' '}
              <span className="text-emerald-300 font-semibold">disponible</span> y{' '}
              <span className="text-red-300 font-semibold">no disponible</span>.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-auto">
          <DisponibilidadGrid profesorId={profesor.id} />
        </div>
      </div>
    </div>
  );
};
