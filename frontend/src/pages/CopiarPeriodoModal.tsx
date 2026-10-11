import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { X, Copy, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Periodo {
  codigo: string;
  nombre: string;
  estado: string;
}

interface Resultado {
  copiadas: number;
  omitidas: number;
  secciones: number;
  materias: number;
  asignaciones: number;
}

// Modal "Copiar periodo": clona proyecciones + secciones + materias (y
// opcionalmente las asignaciones de docentes) de un periodo anterior al
// ACTIVO. Las clases agendadas nunca se copian.
export const CopiarPeriodoModal: React.FC<{
  onClose: () => void;
  onSuccess: () => void;
}> = ({ onClose, onSuccess }) => {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [activo, setActivo] = useState<string | null>(null);
  const [origen, setOrigen] = useState('');
  const [conAsignaciones, setConAsignaciones] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [copiando, setCopiando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    (async () => {
      const res = await apiFetch<Periodo[]>('/periodos');
      setCargando(false);
      if (res.success && res.data) {
        const act = res.data.find((p) => p.estado === 'ACTIVO');
        setActivo(act?.codigo ?? null);
        const otros = res.data.filter((p) => p.codigo !== act?.codigo);
        setPeriodos(otros);
        if (otros.length > 0) setOrigen(otros[0].codigo);
      } else {
        setErrorMsg(res.message || 'No se pudieron cargar los periodos.');
      }
    })();
  }, []);

  const copiar = async () => {
    if (!origen || copiando) return;
    setCopiando(true);
    setErrorMsg(null);
    setResultado(null);
    const res = await apiFetch<Resultado>('/proyecciones/copiar-periodo', {
      method: 'POST',
      body: JSON.stringify({ periodo_origen: origen, incluir_asignaciones: conAsignaciones }),
    });
    setCopiando(false);
    if (res.success) {
      setResultado(res.data ?? null);
      onSuccess();
    } else {
      setErrorMsg(res.message || 'No se pudo copiar el periodo.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-950">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Copy className="w-4 h-4 text-blue-300" />
            Copiar desde otro periodo
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {resultado ? (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {resultado.copiadas === 0
                    ? 'No se copió ninguna proyección (ya existían en el periodo activo).'
                    : `Copiadas ${resultado.copiadas} proyección(es) a ${activo ?? 'el periodo activo'}.`}
                </span>
              </div>
              <ul className="text-slate-300 space-y-1 pl-1">
                <li>· {resultado.secciones} secciones</li>
                <li>· {resultado.materias} materias</li>
                {resultado.asignaciones > 0 && <li>· {resultado.asignaciones} asignaciones de docentes</li>}
                {resultado.omitidas > 0 && <li className="text-amber-300">· {resultado.omitidas} omitidas (ya existían)</li>}
              </ul>
              <p className="text-slate-500">Las clases agendadas en el horario no se copiaron.</p>
              <div className="pt-3 border-t border-slate-800 flex justify-end">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : cargando ? (
            <div className="py-8 text-center text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando periodos…
            </div>
          ) : periodos.length === 0 ? (
            <p className="py-4 text-center text-slate-500 italic">No hay otros periodos registrados para copiar.</p>
          ) : (
            <>
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">Periodo de origen</label>
                <select
                  value={origen}
                  onChange={(e) => setOrigen(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {periodos.map((p) => (
                    <option key={p.codigo} value={p.codigo}>
                      {p.codigo} — {p.nombre}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Destino: periodo activo <span className="font-bold text-slate-300">{activo ?? '—'}</span>
                </p>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={conAsignaciones}
                  onChange={(e) => setConAsignaciones(e.target.checked)}
                  className="mt-0.5 accent-blue-500"
                />
                <span>
                  <span className="block font-semibold text-slate-200">Copiar asignaciones de docentes</span>
                  <span className="block text-[10px] text-slate-500 mt-0.5">
                    Conserva qué profesor dictaba cada materia. Desmarcado, todo queda sin asignar.
                  </span>
                </span>
              </label>

              <p className="text-[10px] text-slate-500 leading-snug">
                Se clonan proyecciones activas, sus secciones y materias al periodo activo.
                Las que ya existan allí se omiten. <strong>Nunca se copian las clases agendadas</strong> —
                el horario se arma de nuevo.
              </p>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 border border-slate-700 text-slate-300 rounded-xl hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={copiar}
                  disabled={!origen || copiando}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-semibold flex items-center gap-2 cursor-pointer"
                >
                  {copiando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                  <span>{copiando ? 'Copiando…' : 'Copiar al periodo activo'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
