import React, { useState } from 'react';
import type { Profesor } from './ProfesorModal.js';
import { DisponibilidadGrid } from './DisponibilidadGrid.js';
import { ConfirmModal } from './ConfirmModal.js';
import { apiFetch } from '../api/client.js';
import { X, CalendarCheck, RefreshCw } from 'lucide-react';

interface DisponibilidadProfesorModalProps {
  isOpen: boolean;
  onClose: () => void;
  profesor: Profesor | null;
}

// Grilla día × rango horario (unión de bloques de todos los turnos: mañana,
// tarde, noche). Click en una celda = toggle disponible/no disponible.
// Solo se persisten los slots bloqueados (verde = default, no ocupa fila).
//
// Esta es la disponibilidad REAL: la que usan el generador y la auditoría.
// Lo que el docente marca en su portal es solo una SUGERENCIA — aquí se ve
// con un punto ámbar y el botón "Sincronizar sugerencia" la copia
// reemplazando por completo la real (previa confirmación).
export const DisponibilidadProfesorModal: React.FC<DisponibilidadProfesorModalProps> = ({
  isOpen,
  onClose,
  profesor,
}) => {
  const [confirmSync, setConfirmSync] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [recargaKey, setRecargaKey] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!isOpen || !profesor) return null;

  const sincronizar = async () => {
    setSincronizando(true);
    setSyncError(null);
    const res = await apiFetch(`/profesores/${profesor.id}/disponibilidad/sincronizar`, {
      method: 'PUT',
      etiqueta: 'Sincronizando disponibilidad…',
    });
    setSincronizando(false);
    if (res.success) {
      setConfirmSync(false);
      setRecargaKey((k) => k + 1);
      setAviso(res.message || 'Disponibilidad sincronizada.');
      window.setTimeout(() => setAviso(null), 5000);
    } else {
      setSyncError(res.message || 'No se pudo sincronizar la disponibilidad.');
    }
  };

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
              <span className="text-red-300 font-semibold">no disponible</span>. El punto ámbar
              indica lo que el docente sugirió bloquear desde su portal.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setSyncError(null);
                setConfirmSync(true);
              }}
              title="Copiar la disponibilidad sugerida por el docente sobre la real"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-500/20 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sincronizar sugerencia
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-auto">
          {aviso && (
            <div className="mb-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
              {aviso}
            </div>
          )}
          <DisponibilidadGrid profesorId={profesor.id} marcarSugeridas recargaKey={recargaKey} />
        </div>
      </div>

      {confirmSync && (
        <ConfirmModal
          titulo="Sincronizar disponibilidad sugerida"
          mensaje={`La disponibilidad real de ${profesor.apellidos}, ${profesor.nombres} quedará idéntica a la que el docente sugirió en su portal.`}
          lineas={[
            'Se copiarán todos los bloqueos que el docente sugirió.',
            'Se borrarán los bloqueos reales que el docente no sugirió (ajustes manuales se pierden).',
            'La sugerencia del docente no se modifica.',
          ]}
          confirmLabel="Sincronizar"
          icono={<RefreshCw className="w-5 h-5 text-amber-400" />}
          busy={sincronizando}
          error={syncError}
          onConfirm={sincronizar}
          onCancel={() => setConfirmSync(false)}
        />
      )}
    </div>
  );
};
