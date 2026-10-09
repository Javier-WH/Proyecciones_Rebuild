import React, { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { usePnfColors } from '../context/PnfColorContext.js';
import { ProfesorModal, Profesor } from './ProfesorModal.js';
import { ProfesorAvatar } from './ProfesorAvatar.js';
import { AsignarProfesorModal, AsignacionRow } from './AsignarProfesorModal.js';
import { AgregarMateriaModal, MateriaAsignableRow, labelLapso, terminoLapso, pluralLapso, lapsoKey } from './AgregarMateriaModal.js';
import { ReporteCargaModal } from './ReporteCargaModal.js';
import { ConfirmModal } from './ConfirmModal.js';
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
  X,
  Check,
  FileSpreadsheet
} from 'lucide-react';

interface CargaRow extends AsignacionRow, MateriaAsignableRow {
  asignacion_id: number | null;
  pnf_saga_id: number;
  prof_pnf_saga_id: number | null;
  prof_cedula: string | null;
  prof_nacionalidad: string | null;
  prof_sexo: string | null;
  prof_foto_url: string | null;
  prof_activo: number | null;
  contrato_nombre: string | null;
  contrato_horas: number | null;
  // En la vista de trimestres, fila semestral original de una copia expandida
  // (S1 -> T1+T2, S2 -> T2+T3). Se conserva para las acciones de asignación.
  orig?: CargaRow;
}

interface ProfesorGrupo {
  profesor: Profesor;
  totalHoras: number;
  rows: CargaRow[];
}

export const CargaDocentePage: React.FC = () => {
  const { user } = useAuth();
  const { colorDePnf } = usePnfColors();
  const esCoordinador = user?.role === 'ADMINISTRADOR';
  const puedeAsignar = user?.role === 'SUPER_USUARIO' || esCoordinador;
  const esMioPnf = (pnf?: number | null) =>
    pnf != null && Number(pnf) === Number(user?.pnf_saga_id);
  // Asignar/reasignar: el coordinador solo sobre materias de su PNF (a cualquier profesor)
  const puedeAsignarMateria = (materiaPnf?: number | null) =>
    puedeAsignar && (!esCoordinador || esMioPnf(materiaPnf));
  // Quitar: materia propia, o materia ajena cuyo profesor asignado es de su PNF
  const puedeQuitarMateria = (materiaPnf?: number | null, profPnf?: number | null) =>
    puedeAsignar && (!esCoordinador || esMioPnf(materiaPnf) || esMioPnf(profPnf));

  // Punto discreto con el color identificativo del PNF (slate si no tiene)
  const pnfDot = (sagaId: number | null | undefined) => (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: colorDePnf(sagaId) ?? '#475569' }}
    />
  );

  const [rows, setRows] = useState<CargaRow[]>([]);
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [periodoNombre, setPeriodoNombre] = useState<string | null>(null);
  const [profesores, setProfesores] = useState<Profesor[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [filterLapso, setFilterLapso] = useState<string>('todos');
  // Vista "Todos los trimestres": sumar horas de materias semestrales a los
  // trimestres que cubren (S1 -> T1+T2, S2 -> T2+T3)
  const [sumarSem1, setSumarSem1] = useState(false);
  const [sumarSem2, setSumarSem2] = useState(false);
  // Vista "Todos los semestres": sumar horas de materias trimestrales a los
  // semestres que cubren (T1 -> S1, T2 -> S1+S2, T3 -> S2)
  const [sumarTrim, setSumarTrim] = useState(false);
  const [filterPnf, setFilterPnf] = useState<string>('todos');
  const [filterProyeccion, setFilterProyeccion] = useState<string>('todas');
  const [filterText, setFilterText] = useState('');
  const [soloSinAsignar, setSoloSinAsignar] = useState(false);
  const [soloPnf, setSoloPnf] = useState(true);

  const [modalAsignar, setModalAsignar] = useState<{ open: boolean; row: CargaRow | null; todosLapsos?: boolean }>({
    open: false,
    row: null,
  });
  const [modalMaterias, setModalMaterias] = useState<{ open: boolean; profesor: Profesor | null }>({
    open: false,
    profesor: null,
  });
  const [modalReporte, setModalReporte] = useState(false);
  const [modalProfesor, setModalProfesor] = useState<{ open: boolean; profesor: Profesor | null }>({
    open: false,
    profesor: null,
  });
  // Confirmación para quitar una materia de todos sus lapsos
  const [quitarMateria, setQuitarMateria] = useState<{
    row: CargaRow;
    materia: string;
    plural: string;
  } | null>(null);

  // Altura real de la barra de filtros (cambia con los toggles y el wrap);
  // el thead sticky se posiciona debajo del nav (h-16) + esta barra
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [filterBarH, setFilterBarH] = useState(48);
  useEffect(() => {
    const el = filterBarRef.current;
    if (!el) return;
    const update = () => setFilterBarH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fetchCarga = async () => {
    setLoading(true);
    setErrorMsg(null);
    const res = await apiFetch<{ periodo: string; periodo_nombre?: string | null; rows: CargaRow[] }>(
      '/proyecciones/carga-docente'
    );
    if (res.success && res.data) {
      setRows(res.data.rows);
      setPeriodo(res.data.periodo);
      setPeriodoNombre(res.data.periodo_nombre ?? null);
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

  const handleAssign = async (row: CargaRow, profesorId: number | null, todosLapsos = false) => {
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
    if (res.success) {
      fetchCarga();
    } else {
      setErrorMsg(res.message || 'Error asignando profesor.');
    }
  };

  // Carga por profesor POR LAPSO (todas las filas, sin filtros) para los modales:
  // los lapsos ocurren en momentos distintos del año, la carga no se suma entre ellos.
  // La clave es compuesta (tipo:n) para no mezclar regímenes (T1 ≠ S1).
  const cargaPorProfesor = useMemo(() => {
    const map = new Map<number, Map<string, number>>();
    for (const r of rows) {
      if (r.profesor_id) {
        let porLapso = map.get(r.profesor_id);
        if (!porLapso) {
          porLapso = new Map();
          map.set(r.profesor_id, porLapso);
        }
        const k = lapsoKey(r.tipo_proyeccion, r.trimestre);
        porLapso.set(k, (porLapso.get(k) || 0) + (r.horas_semanales || 0));
      }
    }
    return map;
  }, [rows]);

  const pnfOptions = useMemo(
    () => [...new Map(rows.map((r) => [r.pnf_saga_id, r.pnf_nombre])).entries()],
    [rows]
  );
  // Solo proyecciones del PNF seleccionado en el selector de PNF
  const proyOptions = useMemo(
    () => [
      ...new Map(
        rows
          .filter((r) => filterPnf === 'todos' || r.pnf_saga_id === Number(filterPnf))
          .map((r) => [r.proyeccion_id, r.proyeccion_nombre])
      ).entries(),
    ],
    [rows, filterPnf]
  );

  // 'Trimestre' o 'Semestre' si todas las filas son de un mismo régimen; 'Lapso' si se mezclan
  const lapsoTermino = useMemo(() => terminoLapso(rows.map((r) => r.tipo_proyeccion)), [rows]);

  // Etiqueta de la columna de lapso en la vista plana: el lapso filtrado
  // ('TRIMESTRAL:2' -> 'Trimestre 2'); el término genérico como respaldo
  const lapsoColHeader = useMemo(() => {
    const [tipo, n] = filterLapso.split(':');
    if ((tipo === 'TRIMESTRAL' || tipo === 'SEMESTRAL') && n) return labelLapso(Number(n), tipo);
    return lapsoTermino;
  }, [filterLapso, lapsoTermino]);

  // Vista agrupada por materia (una columna por lapso) cuando el filtro es
  // "todos" o un régimen completo ('TRIMESTRAL' = todos los trimestres,
  // 'SEMESTRAL' = todos los semestres)
  const pivoted =
    filterLapso === 'todos' || filterLapso === 'TRIMESTRAL' || filterLapso === 'SEMESTRAL';
  // Columnas de lapsos por régimen: primero TRIMESTRAL (1-3), luego SEMESTRAL (1-2),
  // solo de los regímenes presentes en los datos
  const lapsoCols = useMemo(() => {
    const tipos: Array<'TRIMESTRAL' | 'SEMESTRAL'> = ['TRIMESTRAL', 'SEMESTRAL'];
    return tipos.flatMap((tipo) =>
      [...new Set(rows.filter((r) => r.tipo_proyeccion === tipo).map((r) => r.trimestre))]
        .sort((a, b) => a - b)
        .map((n) => ({ n, tipo }))
    );
  }, [rows]);

  // Filas que pasan los filtros de lapso/PNF/proyección (filtros de "materia")
  const rowsPorFiltro = useMemo(
    () =>
      rows.filter((r) => {
        if (filterLapso === 'TRIMESTRAL' || filterLapso === 'SEMESTRAL') {
          if (r.tipo_proyeccion !== filterLapso) return false;
        } else if (filterLapso !== 'todos' && lapsoKey(r.tipo_proyeccion, r.trimestre) !== filterLapso) {
          return false;
        }
        if (filterPnf !== 'todos' && r.pnf_saga_id !== Number(filterPnf)) return false;
        if (filterProyeccion !== 'todas' && r.proyeccion_id !== Number(filterProyeccion)) return false;
        return true;
      }),
    [rows, filterLapso, filterPnf, filterProyeccion]
  );

  // Expansión de materias entre regímenes para las vistas agrupadas:
  // - "Todos los trimestres": cada materia semestral se expande a filas
  //   trimestrales sintéticas en los trimestres que cubre (S1 -> T1+T2,
  //   S2 -> T2+T3) cuando se pide sumar sus horas.
  // - "Todos los semestres": cada materia trimestral se expande a los
  //   semestres que cubre (T1 -> S1, T2 -> S1+S2, T3 -> S2).
  // Así la materia aparece como una sola fila con horas en esas columnas
  // y suma en el total del profesor.
  const rowsVista = useMemo(() => {
    const pasaFiltros = (r: CargaRow) =>
      (filterPnf === 'todos' || r.pnf_saga_id === Number(filterPnf)) &&
      (filterProyeccion === 'todas' || r.proyeccion_id === Number(filterProyeccion));
    if (filterLapso === 'TRIMESTRAL' && (sumarSem1 || sumarSem2)) {
      const extras = rows.filter(
        (r) =>
          r.tipo_proyeccion === 'SEMESTRAL' &&
          ((r.trimestre === 1 && sumarSem1) || (r.trimestre === 2 && sumarSem2)) &&
          pasaFiltros(r)
      );
      const expandidas = extras.flatMap((r) =>
        (r.trimestre === 1 ? [1, 2] : [2, 3]).map(
          (t): CargaRow => ({ ...r, orig: r, tipo_proyeccion: 'TRIMESTRAL', trimestre: t })
        )
      );
      return [...rowsPorFiltro, ...expandidas];
    }
    if (filterLapso === 'SEMESTRAL' && sumarTrim) {
      const extras = rows.filter((r) => r.tipo_proyeccion === 'TRIMESTRAL' && pasaFiltros(r));
      const expandidas = extras.flatMap((r) =>
        (r.trimestre === 1 ? [1] : r.trimestre === 2 ? [1, 2] : [2]).map(
          (s): CargaRow => ({ ...r, orig: r, tipo_proyeccion: 'SEMESTRAL', trimestre: s })
        )
      );
      return [...rowsPorFiltro, ...expandidas];
    }
    return rowsPorFiltro;
  }, [rowsPorFiltro, rows, filterLapso, sumarSem1, sumarSem2, sumarTrim, filterPnf, filterProyeccion]);

  // PNF de referencia para el toggle "Mis profesores": el PNF asociado
  // a la cuenta del usuario
  const pnfReferencia = useMemo(() => user?.pnf_saga_id ?? null, [user]);

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
        // Toggle "Mis profesores": solo profesores del PNF del usuario
        if (soloPnf && pnfReferencia != null && Number(p.pnf_saga_id) !== pnfReferencia) continue;
        // Con texto: incluir si coincide el profesor O alguna de sus materias
        const susRows = rowsVista
          .filter((r) => r.profesor_id === p.id && (coincideTextoProfesor(p) || coincideTextoMateria(r)))
          .sort((a, b) =>
            a.materia_nombre.localeCompare(b.materia_nombre, 'es', {
              numeric: true,
              sensitivity: 'base',
            })
          );
        // El profesor siempre aparece si coincide con el texto de búsqueda;
        // con texto solo se oculta si ni él ni sus materias coinciden
        if (susRows.length === 0 && !coincideTextoProfesor(p)) continue;
        lista.push({
          profesor: p,
          totalHoras: susRows.reduce((acc, r) => acc + (r.horas_semanales || 0), 0),
          rows: susRows,
        });
      }
      // Primero los que tienen materias asignadas; dentro de cada bloque, por cédula
      lista.sort((a, b) => {
        const d = (a.rows.length === 0 ? 1 : 0) - (b.rows.length === 0 ? 1 : 0);
        if (d !== 0) return d;
        return (parseInt(a.profesor.cedula, 10) || Infinity) - (parseInt(b.profesor.cedula, 10) || Infinity);
      });
    }

    const sinAsignarRows = rowsVista.filter((r) => r.profesor_id === null && coincideTextoMateria(r));
    return { grupos: lista, sinAsignar: sinAsignarRows };
  }, [profesores, rowsVista, filterText, soloSinAsignar, soloPnf, pnfReferencia]);

  // Columnas de lapsos de la tabla agrupada: solo regímenes presentes en las
  // filas visibles (profesores mostrados + sin asignar). Sin datos visibles,
  // por defecto se muestran las columnas trimestrales.
  const lapsoColsVista = useMemo(() => {
    const visibles = [...grupos.flatMap((g) => g.rows), ...sinAsignar];
    const tipos: Array<'TRIMESTRAL' | 'SEMESTRAL'> = ['TRIMESTRAL', 'SEMESTRAL'];
    const cols = tipos.flatMap((tipo) =>
      [...new Set(visibles.filter((r) => r.tipo_proyeccion === tipo).map((r) => r.trimestre))]
        .sort((a, b) => a - b)
        .map((n) => ({ n, tipo }))
    );
    if (cols.length > 0) return cols;
    return filterLapso === 'SEMESTRAL'
      ? [1, 2].map((n) => ({ n, tipo: 'SEMESTRAL' as const }))
      : [1, 2, 3].map((n) => ({ n, tipo: 'TRIMESTRAL' as const }));
  }, [grupos, sinAsignar, filterLapso]);

  const sobrecargaColor = (total: number, contrato: number | null | undefined) => {
    if (!contrato) return 'text-slate-300';
    if (total > contrato) return 'text-red-400';
    if (total >= contrato * 0.8) return 'text-amber-400';
    return 'text-emerald-400';
  };

  // Etiqueta del lapso original de una fila expandida: 'SEMESTRE 1'/'SEMESTRAL'
  // en la vista de trimestres; 'T1', 'T1+T2', ... en la de semestres
  const badgeLapso = (m: { base: CargaRow; sems: Set<number> }): string | null => {
    const o = m.base.orig;
    if (!o) return null;
    if (o.tipo_proyeccion === 'SEMESTRAL') {
      return m.sems.size > 1 ? 'SEMESTRAL' : labelLapso(o.trimestre, 'SEMESTRAL').toUpperCase();
    }
    return [...m.sems]
      .sort((a, b) => a - b)
      .map((t) => `T${t}`)
      .join('+');
  };

  const profesorCell = (p: Profesor, span: number) => (
    <td rowSpan={span} className="py-3 px-4 align-top border-r border-slate-800/60">
      <div
        className="flex items-center gap-2.5 cursor-pointer"
        title="Doble click para editar los datos del profesor"
        onDoubleClick={() => setModalProfesor({ open: true, profesor: p })}
      >
        <ProfesorAvatar fotoUrl={p.foto_url} sexo={p.sexo} nombres={p.nombres} apellidos={p.apellidos} />
        <div className="min-w-0">
          <div className="font-bold text-white text-sm leading-tight uppercase">
            {p.apellidos} {p.nombres}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {p.nacionalidad}-{p.cedula}
          </div>
          {p.pnf_nombre && (
            <div className="text-[10px] text-slate-500 truncate flex items-center gap-1.5">
              {pnfDot(p.pnf_saga_id)}
              {p.pnf_nombre}
            </div>
          )}
          {!p.activo && (
            <span className="inline-block mt-0.5 text-[9px] bg-red-500/15 border border-red-500/30 text-red-300 px-1.5 py-0.5 rounded font-bold">
              INACTIVO
            </span>
          )}
        </div>
      </div>
    </td>
  );

  const totalCell = (total: number, horas: number | null | undefined, span: number, compact = false) => (
    <td rowSpan={span} className={`py-3 ${compact ? 'px-2' : 'px-4'} text-center align-middle border-l border-slate-800/60`}>
      <span className={`text-base font-extrabold ${sobrecargaColor(total, horas)}`}>{total}</span>
    </td>
  );

  const dedicacionCell = (nombre: string | null | undefined, horas: number | null | undefined, span: number) => (
    <td rowSpan={span} className="py-3 px-4 align-middle border-l border-slate-800/60">
      {nombre ? (
        <>
          <span className="inline-flex items-center whitespace-nowrap bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[10px] px-2.5 py-1 rounded-full font-semibold">
            {nombre}
          </span>
          {horas != null && <div className="text-[9px] text-slate-500 mt-1">{horas} hrs/sem</div>}
        </>
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
          <tr key={`${r.materia_id}-${r.seccion_id}-${r.tipo_proyeccion}-${r.trimestre}`} className="hover:bg-slate-800/40 transition-colors">
            {idx === 0 && profesorCell(p, span)}
            <td className="py-3 px-4 font-medium text-white">{r.materia_nombre}</td>
            <td className="py-3 px-4 text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                {pnfDot(r.pnf_saga_id)}
                {r.pnf_nombre}
              </span>
            </td>
            <td className="py-3 px-4 text-slate-400">{r.trayecto_nombre}</td>
            <td className="py-3 px-4 font-semibold text-slate-200">{r.seccion_nombre}</td>
            <td className="py-3 px-4 text-slate-400">{r.turno_nombre}</td>
            <td className="py-3 px-4 text-center font-bold text-blue-300">{r.horas_semanales}</td>
            {idx === 0 && totalCell(grupo.totalHoras, p.tipo_contrato_horas, span)}
            {idx === 0 && dedicacionCell(p.tipo_contrato_nombre, p.tipo_contrato_horas, span)}
            {puedeAsignar && (
              <td className="py-3 px-4">
                <div className="flex items-center justify-center gap-1">
                  {puedeAsignarMateria(r.pnf_saga_id) && (
                    <button
                      onClick={() => setModalAsignar({ open: true, row: r })}
                      className="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                      title="Reasignar a otro profesor"
                    >
                      <UserSearch className="w-4 h-4" />
                    </button>
                  )}
                  {puedeQuitarMateria(r.pnf_saga_id, r.prof_pnf_saga_id) && (
                    <button
                      onClick={() => handleAssign(r, null)}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                      title="Quitar materia"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </td>
            )}
          </tr>
        ))}

        {/* Fila final del grupo: agregar materia (o fila única si no tiene materias) */}
        {(puedeAsignar || n === 0) && (
          <tr className="border-b border-slate-800/60">
            {n === 0 && profesorCell(p, 1)}
            <td colSpan={6} className="py-2 px-4">
              {puedeAsignar ? (
                <button
                  onClick={() => setModalMaterias({ open: true, profesor: p })}
                  className="w-full py-2 border border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl text-[11px] font-semibold text-slate-500 hover:text-emerald-300 hover:bg-emerald-500/5 flex items-center justify-center gap-2 transition-colors cursor-pointer uppercase"
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
            {n === 0 && dedicacionCell(p.tipo_contrato_nombre, p.tipo_contrato_horas, 1)}
            {puedeAsignar && <td />}
          </tr>
        )}
      </Fragment>
    );
  };

  // Vista agrupada: una fila por materia×sección con columnas de horas por lapso
  const renderGrupoPivoted = (grupo: ProfesorGrupo) => {
    const p = grupo.profesor;

    // Colapsar filas por materia+sección+régimen guardando las horas de cada lapso
    const mergedMap = new Map<
      string,
      { base: CargaRow; horas: Map<string, number>; sems: Set<number> }
    >();
    for (const r of grupo.rows) {
      const k = `${r.materia_id}:${r.seccion_id}:${r.tipo_proyeccion}`;
      let e = mergedMap.get(k);
      if (!e) {
        e = { base: r, horas: new Map(), sems: new Set() };
        mergedMap.set(k, e);
      }
      if (r.orig) e.sems.add(r.orig.trimestre);
      const lk = lapsoKey(r.tipo_proyeccion, r.trimestre);
      e.horas.set(lk, (e.horas.get(lk) || 0) + (r.horas_semanales || 0));
    }
    const merged = [...mergedMap.values()];
    const n = merged.length;
    // El profesor cubre también la fila 'agregar'; totales/dedicación solo las filas de datos,
    // así la fila del botón queda con todas sus columnas libres y el colSpan no se solapa
    const span = puedeAsignar ? n + 1 : Math.max(n, 1);
    const dataSpan = Math.max(n, 1);

    // Total del profesor por lapso+régimen (misma regla de suma de horas, por lapso)
    const totalPorLapso = new Map<string, number>();
    for (const l of lapsoColsVista) {
      const k = lapsoKey(l.tipo, l.n);
      totalPorLapso.set(
        k,
        grupo.rows
          .filter((r) => lapsoKey(r.tipo_proyeccion, r.trimestre) === k)
          .reduce((acc, r) => acc + (r.horas_semanales || 0), 0)
      );
    }

    return (
      <Fragment key={p.id}>
        {merged.map((m, idx) => {
          // Fila real para las acciones: si es una copia expandida de una
          // materia semestral, se usa la original (régimen y lapsos reales)
          const rowObj = m.base.orig ?? m.base;
          const pluralRow = pluralLapso(terminoLapso([rowObj.tipo_proyeccion]));
          const badge = badgeLapso(m);
          return (
          <tr
            key={`${m.base.materia_id}-${m.base.seccion_id}-${m.base.tipo_proyeccion}`}
            className="hover:bg-slate-800/40 transition-colors"
          >
            {idx === 0 && profesorCell(p, span)}
            <td className="py-3 px-3 font-medium text-white">
              {m.base.materia_nombre}
              {badge && (
                <span className="ml-1.5 text-[9px] bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded font-bold align-middle whitespace-nowrap">
                  {badge}
                </span>
              )}
            </td>
            <td className="py-3 px-3 text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                {pnfDot(m.base.pnf_saga_id)}
                {m.base.pnf_nombre}
              </span>
            </td>
            <td className="py-3 px-3 text-slate-400">{m.base.trayecto_nombre}</td>
            <td className="py-3 px-3 font-semibold text-slate-200">{m.base.seccion_nombre}</td>
            <td className="py-3 px-3 text-slate-400">{m.base.turno_nombre}</td>
            {lapsoColsVista.map((l) => {
              const k = lapsoKey(l.tipo, l.n);
              return (
                <Fragment key={k}>
                  <td className="py-3 px-1.5 text-center font-bold text-blue-300">
                    {m.horas.has(k) ? m.horas.get(k) : '—'}
                  </td>
                  {idx === 0 && totalCell(totalPorLapso.get(k) || 0, p.tipo_contrato_horas, dataSpan, true)}
                </Fragment>
              );
            })}
            {idx === 0 && dedicacionCell(p.tipo_contrato_nombre, p.tipo_contrato_horas, dataSpan)}
            {puedeAsignar && (
              <td className="py-3 px-4">
                <div className="flex items-center justify-center gap-1">
                  {puedeAsignarMateria(m.base.pnf_saga_id) && (
                    <button
                      onClick={() => setModalAsignar({ open: true, row: rowObj, todosLapsos: true })}
                      className="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                      title={`Reasignar a otro profesor en todos los ${pluralRow}`}
                    >
                      <UserSearch className="w-4 h-4" />
                    </button>
                  )}
                  {puedeQuitarMateria(m.base.pnf_saga_id, m.base.prof_pnf_saga_id) && (
                    <button
                      onClick={() =>
                        setQuitarMateria({
                          row: rowObj,
                          materia: m.base.materia_nombre,
                          plural: pluralRow,
                        })
                      }
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                      title={`Quitar materia en todos los ${pluralRow}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </td>
            )}
          </tr>
          );
        })}

        {/* Fila final del grupo: agregar materia (o fila única si no tiene materias) */}
        {(puedeAsignar || n === 0) && (
          <tr className="border-b border-slate-800/60">
            {n === 0 && profesorCell(p, 1)}
            <td colSpan={6 + lapsoColsVista.length * 2} className="py-2 px-4">
              {puedeAsignar ? (
                <button
                  onClick={() => setModalMaterias({ open: true, profesor: p })}
                  className="w-full py-2 border border-dashed border-slate-700 hover:border-emerald-500/50 rounded-xl text-[11px] font-semibold text-slate-500 hover:text-emerald-300 hover:bg-emerald-500/5 flex items-center justify-center gap-2 transition-colors cursor-pointer uppercase"
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
            {puedeAsignar && <td />}
          </tr>
        )}
      </Fragment>
    );
  };

  // Grupo SIN ASIGNAR en vista agrupada: colapsa por materia×sección igual que los profesores
  const renderSinAsignarPivoted = () => {
    const mergedMap = new Map<
      string,
      { base: CargaRow; horas: Map<string, number>; sems: Set<number> }
    >();
    for (const r of sinAsignar) {
      const k = `${r.materia_id}:${r.seccion_id}:${r.tipo_proyeccion}`;
      let e = mergedMap.get(k);
      if (!e) {
        e = { base: r, horas: new Map(), sems: new Set() };
        mergedMap.set(k, e);
      }
      if (r.orig) e.sems.add(r.orig.trimestre);
      const lk = lapsoKey(r.tipo_proyeccion, r.trimestre);
      e.horas.set(lk, (e.horas.get(lk) || 0) + (r.horas_semanales || 0));
    }
    const merged = [...mergedMap.values()];

    return (
      <Fragment key="sin-asignar-pivoted">
        {merged.map((m, idx) => {
          const rowObj = m.base.orig ?? m.base;
          const badgeSem = badgeLapso(m);
          return (
          <tr
            key={`sa-${m.base.materia_id}-${m.base.seccion_id}-${m.base.tipo_proyeccion}`}
            className="bg-amber-500/[0.03] hover:bg-amber-500/[0.07] transition-colors"
          >
            {idx === 0 && (
              <td rowSpan={merged.length} className="py-3 px-4 align-top border-r border-slate-800/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-full border border-amber-500/30 bg-amber-500/10 flex items-center justify-center shrink-0">
                    <UserX className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="font-bold text-amber-300 text-sm leading-tight">SIN ASIGNAR</div>
                    <div className="text-[10px] text-slate-500">{merged.length} materia(s) pendiente(s)</div>
                  </div>
                </div>
              </td>
            )}
            <td className="py-3 px-3 font-medium text-white">
              {m.base.materia_nombre}
              {badgeSem && (
                <span className="ml-1.5 text-[9px] bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded font-bold align-middle whitespace-nowrap">
                  {badgeSem}
                </span>
              )}
            </td>
            <td className="py-3 px-3 text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                {pnfDot(m.base.pnf_saga_id)}
                {m.base.pnf_nombre}
              </span>
            </td>
            <td className="py-3 px-3 text-slate-400">{m.base.trayecto_nombre}</td>
            <td className="py-3 px-3 font-semibold text-slate-200">{m.base.seccion_nombre}</td>
            <td className="py-3 px-3 text-slate-400">{m.base.turno_nombre}</td>
            {lapsoColsVista.map((l) => {
              const k = lapsoKey(l.tipo, l.n);
              return (
                <Fragment key={k}>
                  <td className="py-3 px-1.5 text-center font-bold text-blue-300">
                    {m.horas.has(k) ? m.horas.get(k) : '—'}
                  </td>
                  {idx === 0 && (
                    <td rowSpan={merged.length} className="py-3 px-4 text-center align-middle border-l border-slate-800/60">
                      <span className="text-base font-extrabold text-slate-500">—</span>
                    </td>
                  )}
                </Fragment>
              );
            })}
            {idx === 0 && (
              <td rowSpan={merged.length} className="py-3 px-4 align-middle border-l border-slate-800/60">
                <span className="text-slate-600 italic text-[10px]">—</span>
              </td>
            )}
            {puedeAsignar && (
              <td className="py-3 px-4 text-center">
                {puedeAsignarMateria(m.base.pnf_saga_id) && (
                <button
                  onClick={() => setModalAsignar({ open: true, row: rowObj, todosLapsos: true })}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-emerald-600 border border-slate-700 hover:border-emerald-500 text-slate-200 hover:text-white rounded-lg text-[10px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <UserSearch className="w-3.5 h-3.5" />
                  <span>Asignar</span>
                </button>
                )}
              </td>
            )}
          </tr>
          );
        })}
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

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setModalReporte(true)}
            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Reporte</span>
          </button>
          <button
            onClick={() => {
              fetchCarga();
              fetchProfesores();
            }}
            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div ref={filterBarRef} className="flex flex-wrap items-start gap-3 sticky top-16 z-20 bg-slate-950 py-2">
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

        <div className="flex flex-col gap-1.5">
          <select
            value={filterLapso}
            onChange={(e) => setFilterLapso(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="todos">Todos los {pluralLapso(lapsoTermino)}</option>
            {lapsoCols.some((l) => l.tipo === 'TRIMESTRAL') && (
              <option value="TRIMESTRAL">Todos los trimestres</option>
            )}
            {lapsoCols.some((l) => l.tipo === 'SEMESTRAL') && (
              <option value="SEMESTRAL">Todos los semestres</option>
            )}
            {lapsoCols.map((l) => (
              <option key={lapsoKey(l.tipo, l.n)} value={lapsoKey(l.tipo, l.n)}>
                {labelLapso(l.n, l.tipo)}
              </option>
            ))}
          </select>

          {/* En la vista de trimestres: sumar horas de materias semestrales */}
          {filterLapso === 'TRIMESTRAL' && (
            <div className="flex items-center gap-1.5 pl-0.5">
              {lapsoCols.some((l) => l.tipo === 'SEMESTRAL' && l.n === 1) && (
                <button
                  onClick={() => setSumarSem1(!sumarSem1)}
                  title="Las materias de Semestre 1 se muestran y sus horas suman en Trimestre 1 y Trimestre 2"
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors cursor-pointer ${
                    sumarSem1
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  Sumar Semestre 1
                </button>
              )}
              {lapsoCols.some((l) => l.tipo === 'SEMESTRAL' && l.n === 2) && (
                <button
                  onClick={() => setSumarSem2(!sumarSem2)}
                  title="Las materias de Semestre 2 se muestran y sus horas suman en Trimestre 2 y Trimestre 3"
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors cursor-pointer ${
                    sumarSem2
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  Sumar Semestre 2
                </button>
              )}
            </div>
          )}

          {/* En la vista de semestres: sumar horas de materias trimestrales */}
          {filterLapso === 'SEMESTRAL' && lapsoCols.some((l) => l.tipo === 'TRIMESTRAL') && (
            <div className="flex items-center gap-1.5 pl-0.5">
              <button
                onClick={() => setSumarTrim(!sumarTrim)}
                title="Las materias trimestrales se muestran y sus horas suman en los semestres que cubren (T1 → S1, T2 → S1+S2, T3 → S2)"
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors cursor-pointer ${
                  sumarTrim
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                }`}
              >
                Sumar trimestres
              </button>
            </div>
          )}
        </div>

        <select
          value={filterPnf}
          onChange={(e) => {
            setFilterPnf(e.target.value);
            // La proyección elegida pertenece a otro PNF: se reinicia el filtro
            setFilterProyeccion('todas');
          }}
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

        {/* Toggle Mis profesores / Todos los profesores: solo si el usuario tiene PNF asociado */}
        {pnfReferencia != null && (
          <div
            className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1"
            title="Mis profesores: solo profesores de su PNF; Todos los profesores: todos"
          >
            <button
              onClick={() => setSoloPnf(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                soloPnf
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>Mis profesores</span>
            </button>
            <button
              onClick={() => setSoloPnf(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                !soloPnf
                  ? 'bg-slate-700 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Todos los profesores</span>
            </button>
          </div>
        )}

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
        <div className="border border-slate-800 rounded-3xl overflow-clip bg-slate-900/80 shadow-xl w-max min-w-full">
          <table
            className="w-full text-left text-xs text-slate-300"
            style={{ minWidth: pivoted ? `${820 + lapsoColsVista.length * 80}px` : '1280px' }}
          >
            <thead
              className="sticky z-10 bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800"
              style={{ top: 64 + filterBarH }}
            >
              {pivoted ? (
                <>
                  <tr>
                    <th rowSpan={2} className="py-3.5 px-3 min-w-[180px]">Profesor</th>
                    <th rowSpan={2} className="py-3.5 px-3 min-w-[190px]">Unidad Curricular</th>
                    <th rowSpan={2} className="py-3.5 px-3">PNF</th>
                    <th rowSpan={2} className="py-3.5 px-3">Trayecto</th>
                    <th rowSpan={2} className="py-3.5 px-3">Sección</th>
                    <th rowSpan={2} className="py-3.5 px-3">Turno</th>
                    {lapsoColsVista.map((l) => (
                      <th
                        key={lapsoKey(l.tipo, l.n)}
                        colSpan={2}
                        className="py-3 px-2 text-center border-l border-b border-slate-800/60 whitespace-nowrap text-[10px]"
                      >
                        {labelLapso(l.n, l.tipo)}
                      </th>
                    ))}
                    <th rowSpan={2} className="py-3.5 px-3 border-l border-slate-800/60">Dedicación</th>
                    {puedeAsignar && <th rowSpan={2} className="py-3.5 px-3 text-center w-[90px]">Acciones</th>}
                  </tr>
                  <tr>
                    {lapsoColsVista.map((l) => (
                      <Fragment key={lapsoKey(l.tipo, l.n)}>
                        <th className="py-2 px-1.5 text-center border-l border-slate-800/60" title="Horas por U/C">Hrs</th>
                        <th className="py-2 px-1.5 text-center" title="Total de horas del profesor en el lapso">Tot</th>
                      </Fragment>
                    ))}
                  </tr>
                </>
              ) : (
                <>
                  <tr>
                    <th rowSpan={2} className="py-3.5 px-3 min-w-[210px]">Profesor</th>
                    <th rowSpan={2} className="py-3.5 px-3 min-w-[220px]">Unidad Curricular</th>
                    <th rowSpan={2} className="py-3.5 px-3">PNF</th>
                    <th rowSpan={2} className="py-3.5 px-3">Trayecto</th>
                    <th rowSpan={2} className="py-3.5 px-3">Sección</th>
                    <th rowSpan={2} className="py-3.5 px-3">Turno</th>
                    <th colSpan={2} className="py-3 px-2 text-center border-l border-b border-slate-800/60 whitespace-nowrap text-[10px]">
                      {lapsoColHeader}
                    </th>
                    <th rowSpan={2} className="py-3.5 px-3 border-l border-slate-800/60">Dedicación</th>
                    {puedeAsignar && <th rowSpan={2} className="py-3.5 px-3 text-center w-[90px]">Acciones</th>}
                  </tr>
                  <tr>
                    <th className="py-2 px-1.5 text-center border-l border-slate-800/60" title="Horas por U/C">Hrs</th>
                    <th className="py-2 px-1.5 text-center" title="Total de horas del profesor en el lapso">Tot</th>
                  </tr>
                </>
              )}
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {grupos.map((g) => (pivoted ? renderGrupoPivoted(g) : renderGrupo(g)))}

              {/* Grupo SIN ASIGNAR */}
              {sinAsignar.length > 0 && !pivoted && (
                <Fragment key="sin-asignar">
                  {sinAsignar.map((r, idx) => (
                    <tr
                      key={`sa-${r.materia_id}-${r.seccion_id}-${r.tipo_proyeccion}-${r.trimestre}`}
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
                      <td className="py-3 px-4 text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          {pnfDot(r.pnf_saga_id)}
                          {r.pnf_nombre}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{r.trayecto_nombre}</td>
                      <td className="py-3 px-4 font-semibold text-slate-200">{r.seccion_nombre}</td>
                      <td className="py-3 px-4 text-slate-400">{r.turno_nombre}</td>
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
                          {puedeAsignarMateria(r.pnf_saga_id) && (
                          <button
                            onClick={() => setModalAsignar({ open: true, row: r })}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-emerald-600 border border-slate-700 hover:border-emerald-500 text-slate-200 hover:text-white rounded-lg text-[10px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <UserSearch className="w-3.5 h-3.5" />
                            <span>Asignar</span>
                          </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </Fragment>
              )}
              {pivoted && renderSinAsignarPivoted()}
            </tbody>
          </table>
        </div>
      )}

      <AsignarProfesorModal
        isOpen={modalAsignar.open}
        row={modalAsignar.row}
        todosLapsos={modalAsignar.todosLapsos === true}
        lapsos={lapsoCols.filter((c) => c.tipo === modalAsignar.row?.tipo_proyeccion).map((c) => c.n)}
        cargaPorProfesor={cargaPorProfesor}
        onClose={() => setModalAsignar({ open: false, row: null })}
        onAssigned={fetchCarga}
      />

      <AgregarMateriaModal
        isOpen={modalMaterias.open}
        profesor={modalMaterias.profesor}
        rows={esCoordinador ? rows.filter((r) => Number(r.pnf_saga_id) === Number(user?.pnf_saga_id)) : rows}
        lapsoInicial={!pivoted ? filterLapso : null}
        onClose={() => setModalMaterias({ open: false, profesor: null })}
        onChanged={fetchCarga}
      />

      <ReporteCargaModal
        isOpen={modalReporte}
        rows={rows}
        profesores={profesores}
        periodo={periodo}
        periodoNombre={periodoNombre}
        onClose={() => setModalReporte(false)}
      />

      <ProfesorModal
        isOpen={modalProfesor.open}
        profesor={modalProfesor.profesor}
        onClose={() => setModalProfesor({ open: false, profesor: null })}
        onSuccess={() => {
          fetchProfesores();
          fetchCarga();
        }}
      />

      {quitarMateria && (
        <ConfirmModal
          titulo="Quitar materia asignada"
          icono={<X className="w-5 h-5 text-red-400" />}
          danger
          confirmLabel="Quitar Materia"
          mensaje={`Se quitará "${quitarMateria.materia}" del profesor en todos sus ${quitarMateria.plural}.`}
          onConfirm={() => {
            handleAssign(quitarMateria.row, null, true);
            setQuitarMateria(null);
          }}
          onCancel={() => setQuitarMateria(null)}
        />
      )}
    </div>
  );
};
