import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { Turno } from './horarios/types.js';
import { X, CalendarCog, Loader2, AlertCircle, Info } from 'lucide-react';

interface ConfigHorariosModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

// Orden fijo de turnos: Mañana → Tarde → Noche → otros (igual que VistaRecurso)
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

interface JornadaRow {
  turno_id: number;
  nombre: string;
  horas: number;
}

export const ConfigHorariosModal: React.FC<ConfigHorariosModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [min, setMin] = useState(2);
  const [max, setMax] = useState(3);
  const [jornadas, setJornadas] = useState<JornadaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ error: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMsg(null);
    setLoading(true);
    Promise.all([
      apiFetch<{ min_horas_bloque: number; max_horas_dia: number }>('/horarios/config'),
      apiFetch<Turno[]>('/horarios/turnos'),
    ]).then(([cfg, tns]) => {
      setLoading(false);
      if (cfg.success && cfg.data) {
        setMin(cfg.data.min_horas_bloque);
        setMax(cfg.data.max_horas_dia);
      } else {
        setMsg({ error: true, texto: cfg.message || 'No se pudo cargar la configuración.' });
      }
      if (tns.success && tns.data) {
        setJornadas(
          tns.data
            .filter((t) => t.activo)
            .sort((a, b) => ordenTurno(a.nombre) - ordenTurno(b.nombre) || a.nombre.localeCompare(b.nombre))
            .map((t) => ({ turno_id: t.id, nombre: t.nombre, horas: t.horas_jornada ?? 30 }))
        );
      }
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const setJornada = (turnoId: number, horas: number) =>
    setJornadas((prev) => prev.map((j) => (j.turno_id === turnoId ? { ...j, horas } : j)));

  const guardar = async () => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < 1) {
      setMsg({ error: true, texto: 'Ambos valores deben ser enteros mayores o iguales a 1.' });
      return;
    }
    if (min > max) {
      setMsg({ error: true, texto: 'El mínimo por bloque no puede superar el máximo por día.' });
      return;
    }
    if (jornadas.some((j) => !Number.isInteger(j.horas) || j.horas < 1 || j.horas > 168)) {
      setMsg({ error: true, texto: 'Las horas de jornada deben ser enteros entre 1 y 168.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    const r = await apiFetch('/horarios/config', {
      method: 'PUT',
      body: JSON.stringify({
        min_horas_bloque: min,
        max_horas_dia: max,
        jornadas: jornadas.map((j) => ({ turno_id: j.turno_id, horas: j.horas })),
      }),
    });
    setSaving(false);
    if (r.success) {
      onSaved?.();
      onClose();
    } else {
      setMsg({ error: true, texto: r.message || 'Error guardando la configuración.' });
    }
  };

  const inputCls =
    'w-24 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-white text-sm text-center focus:ring-2 focus:ring-purple-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <CalendarCog className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Configuración de Horarios</h3>
              <p className="text-xs text-slate-400">Reglas de la generación automática.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {msg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{msg.texto}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Horas mínimas por bloque
                  </label>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Sesión mínima consecutiva de una materia. Con <strong>2</strong> no se generan
                    horas sueltas; con 3 solo sesiones de 3+ horas.
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={min}
                  onChange={(e) => setMin(parseInt(e.target.value, 10) || 0)}
                  className={inputCls}
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Horas máximas por día
                  </label>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Tope de horas de una misma materia en un día. Ej.: 5h semanales con máximo 3 →
                    se reparten 3h + 2h en días distintos.
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={max}
                  onChange={(e) => setMax(parseInt(e.target.value, 10) || 0)}
                  className={inputCls}
                />
              </div>

              <div className="pt-3 border-t border-slate-800">
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Horas de jornada semanal por turno
                </label>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
                  Horas de clase que cada turno dicta por semana (30 por defecto, 60 en turnos
                  diurnos). Se usará para validar proyecciones y bloques de turno.
                </p>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {jornadas.map((j) => (
                    <div key={j.turno_id} className="flex items-center justify-between gap-4">
                      <span className="text-xs text-slate-300 font-medium truncate">{j.nombre}</span>
                      <input
                        type="number"
                        min={1}
                        max={168}
                        value={j.horas}
                        onChange={(e) => setJornada(j.turno_id, parseInt(e.target.value, 10) || 0)}
                        className={inputCls}
                      />
                    </div>
                  ))}
                  {jornadas.length === 0 && (
                    <p className="text-[11px] text-slate-500 italic">
                      No hay turnos configurados. Crealos en Turnos y Bloques.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[11px]">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Estas reglas aplican al botón <strong>Generar horario</strong>. En el agendamiento
                  manual solo se muestra una advertencia, sin bloquear la acción.
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-slate-800">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm font-semibold hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={saving || loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
              </>
            ) : (
              'Guardar'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
