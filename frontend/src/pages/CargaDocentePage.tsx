import React, { useState, useEffect, useMemo, Fragment } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { Profesor } from './ProfesorModal.js';
import { ProfesorAvatar } from './ProfesorAvatar.js';
import { AsignarProfesorModal, AsignacionRow } from './AsignarProfesorModal.js';
import { AgregarMateriaModal, MateriaAsignableRow } from './AgregarMateriaModal.js';
import {
  ClipboardList,
  Loader2,
  AlertCircle,
  RefreshCw,
  Search,
  UserSearch,
  Users,
  UserX,
  Plus,
  X
} from 'lucide-react';

interface CargaRow extends AsignacionRow, MateriaAsignableRow {
  asignacion_id: number | null;
  pnf_saga_id: number;
  prof_cedula: string | null;
  prof_nacionalidad: string | null;
  prof_sexo: string | null;
  prof_foto_url: string | null;
  prof_activo: number | null;
  contrato_nombre: string | null;
  contrato_horas: number | null;
}

interface ProfesorGrupo {
  profesor: Profesor;
  totalHoras: number;
  rows: CargaRow[];
}

export const CargaDocentePage: React.FC = () => {
  const { user } = useAuth();
  const puedeAsignar = user?.role === 'SUPER_USUARIO' || user?.role === 'ADMINISTRADOR' || user?.role === 'REGULAR';

  const [rows, setRows] = useState<CargaRow[]>([]);
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [filterLapso, setFilterLapso] = useState<string>('todos');
  const [filterPnf, setFilterPnf] = useState<string>('todos');
  const [filterProyeccion, setFilterProyeccion] = useState<string>('todas');
  const [filterText, setFilterText] = useState('');
  const [soloSinAsignar, setSoloSinAsignar] = useState(false);

  const [modalAsignar, setModalAsignar] = useState<{ open: boolean; row: CargaRow | null }>({
    open: false,
    row: null,
  });
  const [modalMaterias, setModalMaterias] = useState<{ open: boolean; profesor: Profesor | null }>({
    open: false,
    profesor: null,
  });

  const fetchCarga = async () => {
    setLoading(true);
    setErrorMsg(null);
    const res = await apiFetch<{ periodo: string; rows: CargaRow[] }>('/proyecciones/carga-docente');
    if (res.success && res.data) {
      setRows(res.data.rows);
      setPeriodo(res.data.periodo);
    } else {
      setErrorMsg(res.message || 'Error cargando la carga docente.');
    }
    setLoading(false);
  };

  const fetchProfesores = async () => {
    const res = await apiFetch<Profesor[]>('/profesores?para_asignacion=1&incluir_inactivos=1');
    if (res.success && res.data) setProfesores(res.data);
  };

  useEffect(() => {
    fetchCarga();
    fetchProfesores();
  }, []);

  const handleAssign = async (row: CargaRow, profesorId: number | null) => {
    const res = await apiFetch('/proyecciones/asignaciones', {
      method: 'PUT',
      body: JSON.stringify({
        proyeccion_id: row.proyeccion_id,
        materia_id: row.materia_id,
        seccion_id: row.seccion_id,
        trimestre: row.trimestre,
        profesor_id: profesorId,
      }),
    });
    if (res.success) {
      fetchCarga();
    } else {
      setErrorMsg(res.message || 'Error asignando profesor.');
    }
  };

  // Carga total por profesor (todas las filas, sin filtros) para los modales
  const cargaPorProfesor = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of rows) {
      if (r.profesor_id) {
        map.set(r.profesor_id, (map.get(r.profesor_id) || 0) + (r.horas_semanales || 0));
      }
    }
    return map;
  }, [rows]);

  const pnfOptions = useMemo(
    () => [...new Map(rows.map((r) => [r.pnf_saga_id, r.pnf_nombre])).entries()],
    [rows]
  );
  const proyOptions = useMemo(
    () => [...new Map(rows.map((r) => [r.proyeccion_id, r.proyeccion_nombre])).entries()],
    [rows]
  );

  const hayFiltroDeFila = filterLapso !== 'todos' || filterPnf !== 'todos' || filterProyeccion !== 'todas';

  // Filas que pasan los filtros de lapso/PNF/proyección (filtros de "materia")
  const rowsPorFiltro = useMemo(
    () =>
      rows.filter((r) => {
        if (filterLapso !== 'todos' && r.trimestre !== Number(filterLapso)) return false;
        if (filterPnf !== 'todos' && r.pnf_saga_id !== Number(filterPnf)) return false;
        if (filterProyeccion !== 'todas' && r.proyeccion_id !== Number(filterProyeccion)) return false;
        return true;
      }),
    [rows, filterLapso, filterPnf, filterProyeccion]
  );

  // Grupos: TODOS los profesores activos + pseudo-grupo "SIN ASIGNAR"
  const { grupos, sinAsignar } = useMemo(() => {
    const texto = filterText.toLowerCase();
    const coincideTextoProfesor = (p: Profesor) =>
      !texto ||
      `${p.nombres} ${p.apellidos}`.toLowerCase().includes(texto) ||
      p.cedula.includes(texto) ||
      (p.pnf_nombre || '').toLowerCase().includes(texto);

    const coincideTextoMateria = (r: CargaRow) =>
      !texto ||
      r.materia_nombre.toLowerCase().includes(texto) ||
      (r.pnf_nombre || '').toLowerCase().includes(texto) ||
      r.seccion_nombre.toLowerCase().includes(texto);

    const lista: ProfesorGrupo[] = [];
    if (!soloSinAsignar) {
      for (const p of profesores) {
        const susRows = rowsPorFiltro.filter(
          (r) => r.profesor_id === p.id && (coincideTextoProfesor(p) || coincideTextoMateria(r))
        );
        // Mostrar el profesor aunque no tenga materias, salvo que haya filtros
        // de fila activos o el texto no coincida ni con él ni con sus materias
        const incluir =
          susRows.length > 0 ||
          (!hayFiltroDeFila && coincideTextoProfesor(p)) ||
          (texto !== '' && coincideTextoProfesor(p) && !hayFiltroDeFila);
        if (!incluir) continue;
        lista.push({
          profesor: p,
          totalHoras: susRows.reduce((acc, r) => acc + (r.horas_semanales || 0), 0),
          rows: susRows,
        });
      }
      lista.sort((a, b) => `${a.profesor.apellidos} ${a.profesor.nombres}`.localeCompare(`${b.profesor.apellidos} ${b.profesor.nombres}`));
    }

    const sinAsignarRows = rowsPorFiltro.filter((r) => r.profesor_id === null && coincideTextoMateria(r));
    return { grupos: lista, sinAsignar: sinAsignarRows };
  }, [profesores, rowsPorFiltro, filterText, soloSinAsignar, hayFiltroDeFila]);

  const sobrecargaColor = (total: number, contrato: number | null | undefined) => {
    if (!contrato) return 'text-slate-300';
    if (total > contrato) return 'text-red-400';
    if (total >= contrato * 0.8) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const profesorCell = (p: Profesor, span: number) => (
    <td rowSpan={span} className="py-3 px-4 align-top border-r border-slate-800/60">
      <div className="flex items-center gap-2.5">
        <ProfesorAvatar fotoUrl={p.foto_url} sexo={p.sexo} nombres={p.nombres} apellidos={p.apellidos} />
        <div className="min-w-0">
          <div className="font-bold text-white text-sm leading-tight">
            {p.apellidos} {p.nombres}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {p.nacionalidad}-{p.cedula}
          </div>
          {p.pnf_nombre && <div className="text-[10px] text-slate-500 truncate">{p.pnf_nombre}</div>}
          {!p.activo && (
            <span className="inline-block mt-0.5 text-[9px] bg-red-500/15 border border-red-500/30 text-red-300 px-1.5 py-0.5 rounded font-bold">
              INACTIVO
            </span>
          )}
        </div>
      </div>
    </td>
  );

  const totalCell = (total: number, horas: number | null | undefined, span: number) => (
    <td rowSpan={span} className="py-3 px-4 text-center align-middle border-l border-slate-800/60">
      <span className={`text-base font-extrabold ${sobrecargaColor(total, horas)}`}>{total}</span>
      {horas != null && <div className="text-[9px] text-slate-500">de {horas} hrs</div>}
    </td>
  );

  const dedicacionCell = (nombre: string | null | undefined, span: number) => (
    <td rowSpan={span} className="py-3 px-4 align-middle border-l border-slate-800/60">
      {nombre ? (
        <span className="bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[10px] px-2 py-1 rounded-full font-semibold">
          {nombre}
        </span>
      ) : (
        <span className="text-slate-600 italic text-[10px]">—</span>
      )}
    </td>
  );

  const renderGrupo = (grupo: ProfesorGrupo) => {
    const p = grupo.profesor;
    const n = grupo.rows.length;
    const span = puedeAsignar ? n + 1 : Math.max(n, 1);

    return (
      <Fragment key={p.id}>
        {grupo.rows.map((r, idx) => (
          <tr key={`${r.materia_id}-${r.seccion_id}-${r.trimestre}`} className="hover:bg-slate-800/40 transition-colors">
            {idx === 0 && profesorCell(p, span)}
            <td className="py-3 px-4 font-medium text-white">{r.materia_nombre}</td>
            <td className="py-3 px-4 text-slate-400">{r.pnf_nombre}</td>
            <td className="py-3 px-4 text-slate-400">{r.trayecto_nombre}</td>
            <td className="py-3 px-4 font-semibold text-slate-200">{r.seccion_nombre}</td>
            <td className="py-3 px-4 text-slate-400">{r.turno_nombre}</td>
            <td className="py-3 px-4 text-center">
              <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold text-slate-300">
                Lapso {r.trimestre}
              </span>
            </td>
            <td className="py-3 px-4 text-center font-bold text-blue-300">{r.horas_semanales}</td>
            {idx === 0 && totalCell(grupo.totalHoras, p.tipo_contrato_horas, span)}
            {idx === 0 && dedicacionCell(p.tipo_contrato_nombre, span)}
            {puedeAsignar && (
              <td className="py-3 px-4">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => setModalAsignar({ open: true, row: r })}
                    className="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                    title="Reasignar a otro profesor"
                  >
                    <UserSearch className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleAssign(r, null)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                    title="Quitar materia"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </td>
            )}
          </tr>
        ))}

        {/* Fila final del grupo: agregar materia (o fila única si no tiene materias) */}
        {(puedeAsignar || n === 0) && (
          <tr className="border-b border-slate-800/60">
            {n === 0 && profesorCell(p, 1)}
            <td colSpan={7} className="py-2 px-4">
              {puedeAsignar ? (
                <button
                  onClick={() => setModalMaterias({ open: true, profesor: p })}
                  className="w-full py-2 border border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl text-[11px] font-semibold text-slate-500 hover:text-emerald-300 hover:bg-emerald-500/5 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    Agregar materia a {p.apellidos}, {p.nombres}
                  </span>
                </button>
              ) : (
                <span className="block text-center text-[10px] text-slate-600 italic">Sin materias asignadas</span>
              )}
            </td>
            {n === 0 && totalCell(0, p.tipo_contrato_horas, 1)}
            {n === 0 && dedicacionCell(p.tipo_contrato_nombre, 1)}
            {puedeAsignar && <td />}
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-md">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-emerald-400" />
            <span>Carga Docente</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Asignación de unidades curriculares a profesores en las proyecciones activas.
            {periodo && <span className="text-emerald-400 font-semibold"> Periodo: {periodo}</span>}
          </p>
        </div>

        <button
          onClick={() => {
            fetchCarga();
            fetchProfesores();
          }}
          className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Buscar profesor, materia, PNF o cédula..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <select
          value={filterLapso}
          onChange={(e) => setFilterLapso(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="todos">Todos los lapsos</option>
          <option value="1">Lapso 1</option>
          <option value="2">Lapso 2</option>
          <option value="3">Lapso 3</option>
        </select>

        <select
          value={filterPnf}
          onChange={(e) => setFilterPnf(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 max-w-[200px]"
        >
          <option value="todos">Todos los PNF</option>
          {pnfOptions.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>

        <select
          value={filterProyeccion}
          onChange={(e) => setFilterProyeccion(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 max-w-[220px]"
        >
          <option value="todas">Todas las proyecciones</option>
          {proyOptions.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>

        <button
          onClick={() => setSoloSinAsignar(!soloSinAsignar)}
          className={`px-3.5 py-2 border rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
            soloSinAsignar
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <UserX className="w-3.5 h-3.5" />
          <span>Sin asignar</span>
        </button>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabla tipo Excel */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          <span>Cargando carga docente...</span>
        </div>
      ) : grupos.length === 0 && sinAsignar.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center text-slate-400">
          <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-300 mb-1">
            {profesores.length === 0 ? 'No hay profesores registrados' : 'Sin resultados para los filtros'}
          </h3>
          <p className="text-xs text-slate-500">
            {profesores.length === 0
              ? 'Sincronice o registre profesores en el módulo de Gestión de Profesores.'
              : 'Pruebe con otros filtros o términos de búsqueda.'}
          </p>
        </div>
      ) : (
        <div className="border border-slate-800 rounded-3xl overflow-hidden bg-slate-900/80 shadow-xl overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 min-w-[1000px]">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 min-w-[210px]">Profesor</th>
                <th className="py-3.5 px-4 min-w-[220px]">Unidad Curricular</th>
                <th className="py-3.5 px-4">PNF</th>
                <th className="py-3.5 px-4">Trayecto</th>
                <th className="py-3.5 px-4">Sección</th>
                <th className="py-3.5 px-4">Turno</th>
                <th className="py-3.5 px-4 text-center">Lapso</th>
                <th className="py-3.5 px-4 text-center">Hrs x U/C</th>
                <th className="py-3.5 px-4 text-center">Total Hrs</th>
                <th className="py-3.5 px-4">Dedicación</th>
                {puedeAsignar && <th className="py-3.5 px-4 text-center w-[90px]">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {grupos.map(renderGrupo)}

              {/* Grupo SIN ASIGNAR */}
              {sinAsignar.length > 0 && (
                <Fragment key="sin-asignar">
                  {sinAsignar.map((r, idx) => (
                    <tr
                      key={`sa-${r.materia_id}-${r.seccion_id}-${r.trimestre}`}
                      className="bg-amber-500/[0.03] hover:bg-amber-500/[0.07] transition-colors"
                    >
                      {idx === 0 && (
                        <td rowSpan={sinAsignar.length} className="py-3 px-4 align-top border-r border-slate-800/60">
                          <div className="flex items-center gap-2.5">
                            <div className="w-11 h-11 rounded-full border border-amber-500/30 bg-amber-500/10 flex items-center justify-center shrink-0">
                              <UserX className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                              <div className="font-bold text-amber-300 text-sm leading-tight">SIN ASIGNAR</div>
                              <div className="text-[10px] text-slate-500">{sinAsignar.length} materia(s) pendiente(s)</div>
                            </div>
                          </div>
                        </td>
                      )}
                      <td className="py-3 px-4 font-medium text-white">{r.materia_nombre}</td>
                      <td className="py-3 px-4 text-slate-400">{r.pnf_nombre}</td>
                      <td className="py-3 px-4 text-slate-400">{r.trayecto_nombre}</td>
                      <td className="py-3 px-4 font-semibold text-slate-200">{r.seccion_nombre}</td>
                      <td className="py-3 px-4 text-slate-400">{r.turno_nombre}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px] font-bold text-slate-300">
                          Lapso {r.trimestre}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-blue-300">{r.horas_semanales}</td>
                      {idx === 0 && (
                        <>
                          <td rowSpan={sinAsignar.length} className="py-3 px-4 text-center align-middle border-l border-slate-800/60">
                            <span className="text-base font-extrabold text-slate-500">—</span>
                          </td>
                          <td rowSpan={sinAsignar.length} className="py-3 px-4 align-middle border-l border-slate-800/60">
                            <span className="text-slate-600 italic text-[10px]">—</span>
                          </td>
                        </>
                      )}
                      {puedeAsignar && (
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setModalAsignar({ open: true, row: r })}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-emerald-600 border border-slate-700 hover:border-emerald-500 text-slate-200 hover:text-white rounded-lg text-[10px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <UserSearch className="w-3.5 h-3.5" />
                            <span>Asignar</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </Fragment>
              )}
            </tbody>
          </table>
        </div>
      )}

      <AsignarProfesorModal
        isOpen={modalAsignar.open}
        row={modalAsignar.row}
        cargaPorProfesor={cargaPorProfesor}
        onClose={() => setModalAsignar({ open: false, row: null })}
        onAssigned={fetchCarga}
      />

      <AgregarMateriaModal
        isOpen={modalMaterias.open}
        profesor={modalMaterias.profesor}
        rows={rows}
        onClose={() => setModalMaterias({ open: false, profesor: null })}
        onChanged={fetchCarga}
      />
    </div>
  );
};
