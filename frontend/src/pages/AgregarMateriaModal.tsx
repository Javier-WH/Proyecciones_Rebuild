import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api/client.js';
import { Profesor } from './ProfesorModal.js';
import { ProfesorAvatar } from './ProfesorAvatar.js';
import { X, Search, AlertCircle, Plus, CheckCircle2, UserX, Layers } from 'lucide-react';

// Misma forma de fila que usa la página de carga docente
export interface MateriaAsignableRow {
  proyeccion_id: number;
  proyeccion_nombre: string;
  tipo_proyeccion: 'TRIMESTRAL' | 'SEMESTRAL';
  pnf_saga_id?: number;
  pnf_nombre: string;
  trayecto_nombre: string;
  materia_id: number;
  materia_nombre: string;
  horas_semanales: number;
  seccion_id: number;
  seccion_nombre: string;
  turno_saga_id?: number;
  turno_nombre: string;
  trimestre: number;
  profesor_id: number | null;
  prof_nombres: string | null;
  prof_apellidos: string | null;
}

// Etiqueta de un lapso según el régimen de su proyección: 'Trimestre 2' / 'Semestre 1'
export const labelLapso = (n: number, tipo?: string | null): string =>
  `${tipo === 'SEMESTRAL' ? 'Semestre' : 'Trimestre'} ${n}`;

// Término genérico para un conjunto de filas: si todas son del mismo régimen usa
// su término; si mezcla tipos (o no hay datos) usa el neutro 'Lapso'.
export const terminoLapso = (tipos: (string | null | undefined)[]): string => {
  const set = new Set(tipos.filter(Boolean));
  if (set.size === 1) return set.has('SEMESTRAL') ? 'Semestre' : 'Trimestre';
  return 'Lapso';
};

export const pluralLapso = (termino: string): string =>
  termino === 'Trimestre' ? 'trimestres' : termino === 'Semestre' ? 'semestres' : 'lapsos';

// Clave compuesta de un lapso: 'TRIMESTRAL:1' / 'SEMESTRAL:2'.
// El número de lapso solo es único dentro de su régimen (T1 ≠ S1).
export const lapsoKey = (tipo: string | null | undefined, n: number): string => `${tipo}:${n}`;

interface AgregarMateriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;
  profesor: Profesor | null;
  // Todas las filas asignables; el lapso se filtra dentro del modal
  rows: MateriaAsignableRow[];
  // Lapso seleccionado en la tabla como clave compuesta 'tipo:n' (se preselecciona aquí)
  lapsoInicial?: string | null;
}

export const AgregarMateriaModal: React.FC<AgregarMateriaModalProps> = ({
  isOpen,
  onClose,
  onChanged,
  profesor,
  rows,
  lapsoInicial,
}) => {
  const [search, setSearch] = useState('');
  const [lapso, setLapso] = useState<string>('todos');
  const [pnfFiltro, setPnfFiltro] = useState<string>('todos');
  const [soloSinAsignar, setSoloSinAsignar] = useState(true);
  const [agruparLapsos, setAgruparLapsos] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Al abrir: preseleccionar el lapso de la tabla, limpiar la búsqueda y
  // preseleccionar el PNF asociado del profesor si tiene uno
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setLapso(lapsoInicial != null ? lapsoInicial : 'todos');
      setSoloSinAsignar(true);
      setAgruparLapsos(true);
      setErrorMsg(null);
      const pnfProf =
        profesor?.pnf_saga_id != null && profesor.pnf_nombre ? profesor.pnf_nombre.trim() : null;
      setPnfFiltro(pnfProf || 'todos');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, lapsoInicial, profesor]);

  if (!isOpen || !profesor) return null;

  // PNFs presentes en las materias (+ el PNF del profesor aunque no tenga materias)
  const pnfMap = new Map<string, string>();
  for (const r of rows) {
    const n = (r.pnf_nombre || '').trim();
    if (n) pnfMap.set(n.toLowerCase(), n);
  }
  const pnfProfNombre = profesor.pnf_nombre?.trim();
  if (profesor.pnf_saga_id != null && pnfProfNombre && !pnfMap.has(pnfProfNombre.toLowerCase())) {
    pnfMap.set(pnfProfNombre.toLowerCase(), pnfProfNombre);
  }
  const pnfOpciones = [...pnfMap.values()].sort((a, b) => a.localeCompare(b));

  // Lapsos disponibles por régimen: primero TRIMESTRAL (1-3), luego SEMESTRAL (1-2),
  // solo de los regímenes presentes en las materias
  const lapsosDisponibles = (['TRIMESTRAL', 'SEMESTRAL'] as const).flatMap((tipo) =>
    [...new Set(rows.filter((r) => r.tipo_proyeccion === tipo).map((r) => r.trimestre))]
      .sort((a, b) => a - b)
      .map((n) => ({ n, tipo }))
  );
  const lapsoTermino = terminoLapso(rows.map((r) => r.tipo_proyeccion));

  const texto = search.toLowerCase();
  const filtradas = rows
    .filter((r) => {
      if (lapso !== 'todos' && lapsoKey(r.tipo_proyeccion, r.trimestre) !== lapso) return false;
      if (pnfFiltro !== 'todos' && (r.pnf_nombre || '').trim() !== pnfFiltro) return false;
      if (soloSinAsignar && r.profesor_id !== null && r.profesor_id !== profesor.id) return false;
      if (texto) {
        return (
          r.materia_nombre.toLowerCase().includes(texto) ||
          (r.pnf_nombre || '').toLowerCase().includes(texto) ||
          r.seccion_nombre.toLowerCase().includes(texto) ||
          r.proyeccion_nombre.toLowerCase().includes(texto)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const aDeEste = a.profesor_id === profesor.id ? 0 : a.profesor_id === null ? 1 : 2;
      const bDeEste = b.profesor_id === profesor.id ? 0 : b.profesor_id === null ? 1 : 2;
      return aDeEste - bDeEste;
    });

  const handleAssign = async (r: MateriaAsignableRow, quitar = false) => {
    const key = `${r.materia_id}-${r.seccion_id}-${r.tipo_proyeccion}-${r.trimestre}`;
    setBusyKey(key);
    setErrorMsg(null);
    const res = await apiFetch('/proyecciones/asignaciones', {
      method: 'PUT',
      body: JSON.stringify({
        proyeccion_id: r.proyeccion_id,
        materia_id: r.materia_id,
        seccion_id: r.seccion_id,
        trimestre: r.trimestre,
        profesor_id: quitar ? null : profesor.id,
        todos_lapsos: agruparLapsos,
      }),
    });
    setBusyKey(null);
    if (res.success) {
      onChanged(); // el modal queda abierto para seguir agregando
    } else {
      setErrorMsg(res.message || 'Error procesando la asignación.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800 bg-slate-950 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Agregar Materias</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2.5 mt-2">
            <ProfesorAvatar
              fotoUrl={profesor.foto_url}
              sexo={profesor.sexo}
              nombres={profesor.nombres}
              apellidos={profesor.apellidos}
              size="sm"
            />
            <div className="text-[11px] text-slate-400">
              <span className="font-semibold text-indigo-300">
                {profesor.apellidos}, {profesor.nombres}
              </span>
              {profesor.tipo_contrato_nombre && (
                <span className="text-slate-500">
                  {' '}
                  · {profesor.tipo_contrato_nombre} ({profesor.tipo_contrato_horas} hrs/sem)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-slate-800 shrink-0 flex flex-wrap items-center gap-2">
          <select
            value={lapso}
            onChange={(e) => setLapso(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shrink-0"
          >
            <option value="todos">Todos los {pluralLapso(lapsoTermino)}</option>
            {lapsosDisponibles.map((l) => (
              <option key={lapsoKey(l.tipo, l.n)} value={lapsoKey(l.tipo, l.n)}>
                {labelLapso(l.n, l.tipo)}
              </option>
            ))}
          </select>
          <select
            value={pnfFiltro}
            onChange={(e) => setPnfFiltro(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shrink-0 max-w-[200px] truncate"
            title="Filtrar por PNF"
          >
            <option value="todos">Todos los PNF</option>
            {pnfOpciones.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por materia, PNF, sección o proyección..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={() => setSoloSinAsignar(!soloSinAsignar)}
            className={`px-3 py-2.5 border rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${
              soloSinAsignar
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-950 border-slate-700/80 text-slate-400 hover:text-white'
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            <span>Solo sin asignar</span>
          </button>
          <label
            className="w-full flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer select-none mt-1"
            title={`Si la materia se dicta en varios ${pluralLapso(lapsoTermino)}, se asigna (o quita) en todos ellos`}
          >
            <input
              type="checkbox"
              checked={agruparLapsos}
              onChange={(e) => setAgruparLapsos(e.target.checked)}
              className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
            />
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              <span className="font-semibold text-slate-300">Agrupar {pluralLapso(lapsoTermino)}:</span>{' '}
              asignar la materia en todos los {pluralLapso(lapsoTermino)} en que se dicta
            </span>
          </label>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-1.5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {filtradas.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              {soloSinAsignar
                ? 'No quedan materias sin asignar. Desactive el filtro para reasignar materias de otros profesores.'
                : 'Sin materias que coincidan con la búsqueda.'}
            </div>
          ) : (
            filtradas.map((r) => {
              const key = `${r.materia_id}-${r.seccion_id}-${r.tipo_proyeccion}-${r.trimestre}`;
              const esDeEste = r.profesor_id === profesor.id;
              const esDeOtro = r.profesor_id !== null && !esDeEste;
              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    esDeEste
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : esDeOtro
                        ? 'border-slate-800 bg-slate-950/40 opacity-75'
                        : 'border-slate-800 bg-slate-950/60 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{r.materia_nombre}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {r.pnf_nombre} · {r.trayecto_nombre} · Sec. {r.seccion_nombre} · {r.turno_nombre} ·{' '}
                      {labelLapso(r.trimestre, r.tipo_proyeccion)}
                    </div>
                    {esDeOtro && (
                      <div className="text-[10px] text-amber-400/90 mt-0.5">
                        Asignada a {r.prof_apellidos}, {r.prof_nombres}
                      </div>
                    )}
                  </div>

                  <span className="text-[11px] font-bold text-blue-300 shrink-0">{r.horas_semanales} hrs</span>

                  {esDeEste ? (
                    <button
                      onClick={() => handleAssign(r, true)}
                      disabled={busyKey === key}
                      className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-red-500/15 border border-emerald-500/30 hover:border-red-500/40 text-emerald-300 hover:text-red-300 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                      title="Quitar materia de este profesor"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Asignada</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAssign(r)}
                      disabled={busyKey === key}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-emerald-600 border border-slate-700 hover:border-emerald-500 text-slate-200 hover:text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                      title={esDeOtro ? 'Reasignar a este profesor' : 'Asignar a este profesor'}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{esDeOtro ? 'Reasignar' : 'Agregar'}</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
