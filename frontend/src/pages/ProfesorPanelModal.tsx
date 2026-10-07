import React from 'react';
import { X } from 'lucide-react';
import { ProfesorPortalView } from './ProfesorPortalPage.js';

export interface ProfesorPanelRef {
  id: number;
  nombre: string;
  cedula?: string | null;
}

// Panel del docente para gestores: la misma vista del portal (horario,
// materias y disponibilidad) dentro de un modal. La disponibilidad es
// editable porque el admin ya puede modificarla desde su vista.
export const ProfesorPanelModal: React.FC<{
  profesor: ProfesorPanelRef | null;
  onClose: () => void;
}> = ({ profesor, onClose }) => {
  if (!profesor) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-950 border border-slate-800 rounded-3xl w-full max-w-6xl max-h-[92vh] overflow-y-auto p-5 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          title="Cerrar"
          className="sticky top-0 float-right z-20 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
        <ProfesorPortalView
          profesorId={profesor.id}
          nombre={profesor.nombre}
          cedula={profesor.cedula}
        />
      </div>
    </div>
  );
};
