import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { Turno, DIAS_CORTOS } from './types.js';
import { Clock, Plus, Trash2, X, Loader2, Coffee, ArrowUp, ArrowDown } from 'lucide-react';

interface TurnosPanelProps {
  turnos: Turno[];
  puedeEditar: boolean;
  onChanged: () => void;
}

interface BloqueEdit {
  hora_inicio: string;
  hora_fin: string;
  es_receso: boolean;
}

export const TurnosPanel: React.FC<TurnosPanelProps> = ({ turnos, puedeEditar, onChanged }) => {
  const [sel, setSel] = useState<number | null>(turnos[0]?.id ?? null);
  const [dias, setDias] = useState<number[]>([]);
  const [bloques, setBloques] = useState<BloqueEdit[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ error: boolean; texto: string } | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [creando, setCreando] = useState(false);
  const esAdmin = puedeEditar; // creación de turnos locales solo SUPER/ADMIN se valida server-side

  const turno = turnos.find((t) => t.id === sel) ?? turnos[0];

  useEffect(() => {
    if (!turno) return;
    setSel(turno.id);
    setDias(
      String(turno.dias_semana)
        .split(',')
        .map(Number)
        .filter(Boolean)
        .sort()
    );
    setBloques(
      turno.bloques.map((b) => ({
        hora_inicio: b.hora_inicio.slice(0, 5),
        hora_fin: b.hora_fin.slice(0, 5),
        es_receso: !!b.es_receso,
      }))
    );
    setMsg(null);
  }, [turno?.id, turnos]);

  const toggleDia = (d: number) =>
    setDias((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const moverBloque = (i: number, dir: -1 | 1) => {
    setBloques((prev) => {
      const copia = [...prev];
      const j = i + dir;
      if (j < 0 || j >= copia.length) return prev;
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  };

  const guardar = async () => {
    if (!turno) return;
    setSaving(true);
    setMsg(null);
    const r1 = await apiFetch(`/horarios/turnos/${turno.id}`, {
      method: 'PUT',
      body: JSON.stringify({ dias_semana: dias.join(',') }),
    });
    if (!r1.success) {
      setSaving(false);
      setMsg({ error: true, texto: r1.message || 'Error guardando días.' });
      return;
    }
    const r2 = await apiFetch(`/horarios/turnos/${turno.id}/bloques`, {
      method: 'PUT',
      body: JSON.stringify({ bloques }),
    });
    setSaving(false);
    if (r2.success) {
      setMsg({ error: false, texto: 'Turno actualizado.' });
      onChanged();
    } else {
      setMsg({ error: true, texto: r2.message || 'Error guardando bloques.' });
    }
  };

  const crearTurno = async () => {
    if (!nuevoNombre.trim()) return;
    const res = await apiFetch('/horarios/turnos', {
      method: 'POST',
      body: JSON.stringify({ nombre: nuevoNombre.trim() }),
    });
    if (res.success) {
      setNuevoNombre('');
      setCreando(false);
      onChanged();
    } else {
      setMsg({ error: true, texto: res.message || 'Error creando el turno.' });
    }
  };

  const eliminarTurno = async () => {
    if (!turno) return;
    if (turno.saga_id !== null) {
      alert('Los turnos de SAGA no se pueden eliminar.');
      return;
    }
    if (!confirm(`¿Eliminar el turno local '${turno.nombre}'?`)) return;
    const res = await apiFetch(`/horarios/turnos/${turno.id}`, { method: 'DELETE' });
    if (!res.success) alert(res.message || 'Error eliminando.');
    onChanged();
  };

  if (turnos.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm">
        No hay turnos disponibles (SAGA no responde y no hay turnos locales).
      </div>
    );
  }

  return (
    <div className="flex gap-4 items-start">
      {/* Lista de turnos */}
      <div className="w-56 shrink-0 bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-1.5">
        {turnos.map((t) => (
          <button
            key={t.id}
            onClick={() => setSel(t.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              turno?.id === t.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="truncate">{t.nombre}</span>
              {t.saga_id === null && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-slate-700/80 text-slate-300">LOCAL</span>
              )}
            </div>
            <div className={`text-[9px] mt-0.5 ${turno?.id === t.id ? 'text-blue-200' : 'text-slate-500'}`}>
              {t.bloques.length} bloques · {t.bloques.filter((b) => b.es_receso).length} recesos
            </div>
          </button>
        ))}
        {esAdmin &&
          (creando ? (
            <div className="flex gap-1 pt-1">
              <input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Nombre turno"
                className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
              />
              <button
                onClick={crearTurno}
                className="px-2 py-1.5 rounded-lg bg-emerald-600 text-white text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setCreando(false)}
                className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreando(true)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-xs font-semibold cursor-pointer"
            >
              + Turno local
            </button>
          ))}
      </div>

      {/* Editor del turno seleccionado */}
      {turno && (
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" /> {turno.nombre}
              {turno.saga_id === null && puedeEditar && (
                <button
                  onClick={eliminarTurno}
                  title="Eliminar turno local"
                  className="text-slate-500 hover:text-red-300 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </h3>
            {puedeEditar && (
              <button
                onClick={guardar}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
              </button>
            )}
          </div>

          {msg && (
            <div
              className={`mb-3 px-3 py-2 rounded-lg text-xs font-semibold border ${
                msg.error
                  ? 'bg-red-500/10 border-red-500/40 text-red-300'
                  : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
              }`}
            >
              {msg.texto}
            </div>
          )}

          {/* Días de la semana del turno */}
          <div className="mb-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">
              Días de clase del turno
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <button
                  key={d}
                  onClick={() => puedeEditar && toggleDia(d)}
                  disabled={!puedeEditar}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    dias.includes(d)
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-950 border-slate-700 text-slate-500'
                  } ${puedeEditar ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {DIAS_CORTOS[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Bloques horarios */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                Horas de clase y recesos
              </div>
              {puedeEditar && (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setBloques((p) => [...p, { hora_inicio: '', hora_fin: '', es_receso: false }])}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold cursor-pointer"
                  >
                    + Bloque
                  </button>
                  <button
                    onClick={() => setBloques((p) => [...p, { hora_inicio: '', hora_fin: '', es_receso: true }])}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1"
                  >
                    <Coffee className="w-3 h-3" /> Receso
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              {bloques.length === 0 && (
                <div className="text-[11px] text-slate-500 italic py-3 text-center">
                  Sin bloques. Agrega las horas de clase del turno.
                </div>
              )}
              {bloques.map((b, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                    b.es_receso ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-800 bg-slate-950/60'
                  }`}
                >
                  <span className="text-[10px] font-bold text-slate-500 w-5">{i + 1}</span>
                  {b.es_receso && <Coffee className="w-3.5 h-3.5 text-amber-400" />}
                  <input
                    type="time"
                    value={b.hora_inicio}
                    disabled={!puedeEditar}
                    onChange={(e) =>
                      setBloques((p) => p.map((x, j) => (j === i ? { ...x, hora_inicio: e.target.value } : x)))
                    }
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  />
                  <span className="text-slate-500 text-xs">a</span>
                  <input
                    type="time"
                    value={b.hora_fin}
                    disabled={!puedeEditar}
                    onChange={(e) =>
                      setBloques((p) => p.map((x, j) => (j === i ? { ...x, hora_fin: e.target.value } : x)))
                    }
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  />
                  <div className="flex-1" />
                  {puedeEditar && (
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => moverBloque(i, -1)} className="p-1 rounded hover:bg-slate-800 text-slate-400 cursor-pointer" title="Subir">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => moverBloque(i, 1)} className="p-1 rounded hover:bg-slate-800 text-slate-400 cursor-pointer" title="Bajar">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setBloques((p) => p.filter((_, j) => j !== i))}
                        className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-300 cursor-pointer"
                        title="Quitar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-3">
              Nota: si el turno tiene clases agendadas, no se podrán modificar sus bloques hasta desagendarlas.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
