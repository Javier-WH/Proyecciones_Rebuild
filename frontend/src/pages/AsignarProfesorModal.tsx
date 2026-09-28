import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api/client.js';
import { Profesor } from './ProfesorModal.js';
import { ProfesorAvatar } from './ProfesorAvatar.js';
import { labelLapso, terminoLapso, pluralLapso } from './AgregarMateriaModal.js';
import { X, Loader2, Search, AlertCircle, UserX } from 'lucide-react';

export interface AsignacionRow {
  proyeccion_id: number;
  materia_id: number;
  seccion_id: number;
  trimestre: number;
  tipo_proyeccion: 'TRIMESTRAL' | 'SEMESTRAL';
  materia_nombre: string;
  seccion_nombre: string;
  horas_semanales: number;
}

interface AsignarProfesorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssigned: () => void;
  row: AsignacionRow | null;
  // true = la asignación aplica a todos los lapsos de la materia (vista agrupada)
  todosLapsos?: boolean;
  // Lapsos existentes en el periodo, para mostrar la carga de cada profesor por lapso
  lapsos: number[];
  // Mapa profesor_id -> (lapso -> horas asignadas) calculado por la página
  cargaPorProfesor: Map<number, Map<number, number>>;
}

export const AsignarProfesorModal: React.FC<AsignarProfesorModalProps> = ({
  isOpen,
  onClose,
  onAssigned,
  row,
  todosLapsos = false,
  lapsos,
  cargaPorProfesor,
}) => {
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setErrorMsg(null);
    setLoading(true);
    apiFetch<Profesor[]>('/profesores?para_asignacion=1').then((res) => {
      if (res.success && res.data) setProfesores(res.data);
      setLoading(false);
    });
  }, [isOpen]);

  if (!isOpen || !row) return null;

  const filtered = profesores.filter(
    (p) =>
      !search ||
      `${p.nombres} ${p.apellidos}`.toLowerCase().includes(search.toLowerCase()) ||
      p.cedula.includes(search) ||
      (p.pnf_nombre || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAssign = async (profesorId: number | null) => {
    setAssigning(true);
    setErrorMsg(null);
    const res = await apiFetch('/proyecciones/asignaciones', {
      method: 'PUT',
      body: JSON.stringify({
        proyeccion_id: row.proyeccion_id,
        materia_id: row.materia_id,
        seccion_id: row.seccion_id,
        trimestre: row.trimestre,
        profesor_id: profesorId,
        todos_lapsos: todosLapsos,
      }),
    });
    setAssigning(false);
    if (res.success) {
      onAssigned();
      onClose();
    } else {
      setErrorMsg(res.message || 'Error asignando profesor.');
    }
  };

  // La carga se evalúa por lapso: cada lapso ocurre en un momento distinto del año
  const cargaDe = (p: Profesor, lapso: number) => cargaPorProfesor.get(p.id)?.get(lapso) || 0;
  const abrevLapso = (n: number) => (row?.tipo_proyeccion === 'SEMESTRAL' ? `S${n}` : `T${n}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800 bg-slate-950 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Asignar Profesor</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            <span className="font-semibold text-indigo-300">{row.materia_nombre}</span> — Sección {row.seccion_nombre},{' '}
            {todosLapsos
              ? `Todos los ${pluralLapso(terminoLapso([row.tipo_proyeccion]))}`
              : labelLapso(row.trimestre, row.tipo_proyeccion)}
            {' '}· {row.horas_semanales} hrs/sem
          </p>
        </div>

        <div className="p-4 border-b border-slate-800 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, cédula o PNF..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Opción quitar asignación */}
          <button
            onClick={() => handleAssign(null)}
            disabled={assigning}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition-colors cursor-pointer text-xs font-semibold"
          >
            <UserX className="w-5 h-5" />
            <span>Dejar sin asignar</span>
          </button>

          {loading ? (
            <div className="py-8 text-center text-slate-400 flex justify-center items-center gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Cargando profesores activos...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">Sin profesores que coincidan.</div>
          ) : (
            filtered.map((p) => {
              const contrato = p.tipo_contrato_horas || 0;
              const lapsosVista = lapsos.length > 0 ? lapsos : [row.trimestre];
              return (
                <button
                  key={p.id}
                  onClick={() => handleAssign(p.id)}
                  disabled={assigning}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-indigo-500/50 hover:bg-slate-800/60 transition-colors cursor-pointer text-left disabled:opacity-50"
                >
                  <ProfesorAvatar fotoUrl={p.foto_url} sexo={p.sexo} nombres={p.nombres} apellidos={p.apellidos} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      {p.apellidos}, {p.nombres}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {p.nacionalidad}-{p.cedula}
                      {p.pnf_nombre ? ` · ${p.pnf_nombre}` : ''}
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {lapsosVista.map((l) => {
                        const asignadas = cargaDe(p, l);
                        const pct = contrato > 0 ? Math.min(100, Math.round((asignadas / contrato) * 100)) : 0;
                        const color =
                          contrato > 0 && asignadas > contrato
                            ? 'bg-red-500'
                            : pct >= 80
                              ? 'bg-amber-500'
                              : 'bg-emerald-500';
                        const esObjetivo = !todosLapsos && l === row.trimestre;
                        return (
                          <div key={l} className="flex items-center gap-2">
                            <span
                              className={`text-[9px] font-bold w-6 shrink-0 ${
                                esObjetivo ? 'text-emerald-300' : 'text-slate-500'
                              }`}
                            >
                              {abrevLapso(l)}
                            </span>
                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                            <span
                              className={`text-[10px] font-bold shrink-0 ${
                                contrato > 0 && asignadas > contrato ? 'text-red-400' : 'text-slate-400'
                              }`}
                            >
                              {asignadas}/{contrato || '—'} hrs
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {p.tipo_contrato_nombre && (
                    <span className="text-[9px] bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded shrink-0 font-semibold">
                      {p.tipo_contrato_nombre}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
