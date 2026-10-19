import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { usePnfColors } from '../context/PnfColorContext.js';
import {
  GraduationCap,
  Loader2,
  AlertCircle,
  RefreshCw,
  Search,
  Users,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  Layers,
  UserRound,
  Filter,
  X,
} from 'lucide-react';

// ── Tipos del endpoint SAGA /student/enrolled ───────────────────────────────

interface UcInscrita {
  uc_id: number;
  uc: string;
  lapso_id: number;
  lapso: string;
  periodo?: string;
  seccion?: string;
  turno?: string;
  nota?: string | null;
  recup?: string | null;
  estatus?: string;
  trayecto_id?: number;
}

interface EstudianteSaga {
  id: number;
  cedula: string;
  nombre: string;
  apellido: string;
  sexo: string;
  nacionalidad?: string;
  programa_id?: number;
  pnf?: string;
  trayecto_id?: number;
  trayecto?: string;
  maya_id?: number;
  maya?: string;
  turno_id?: number;
  turno?: string;
  seccion?: string;
  estatus_academico?: string;
  condicion_ingreso?: string;
  iaa?: string | number | null;
  ucr_cursadas?: number;
  lapso_ficha_id?: number;
  ucs_inscritas?: UcInscrita[];
}

interface Maya {
  id: number;
  descripcion: string;
  tipopensum_id: number;
}

type Alcance = '0' | '1' | 'all';

const POR_PAGINA = 50;
const TODOS = 'todos';

const capitalizar = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ── Piezas visuales (mismo lenguaje que EstadisticasPanel) ──────────────────

const Card: React.FC<{ titulo: string; icono: React.ReactNode; children: React.ReactNode }> = ({
  titulo,
  icono,
  children,
}) => (
  <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
    <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
      <span className="text-slate-500">{icono}</span>
      {titulo}
    </h3>
    {children}
  </section>
);

const BarraConteo: React.FC<{ etiqueta: string; valor: number; total: number; color?: string | null }> = ({
  etiqueta,
  valor,
  total,
  color,
}) => {
  const pct = total > 0 ? (valor / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-400 w-36 truncate shrink-0" title={etiqueta}>
        {etiqueta}
      </span>
      <div className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color || '#6366f1' }}
        />
      </div>
      <span className="text-[11px] font-semibold text-slate-200 w-10 text-right shrink-0">{valor}</span>
    </div>
  );
};

// ── Página principal ─────────────────────────────────────────────────────────

export const EstudiantesPage: React.FC = () => {
  const { user } = useAuth();
  const { catalogo: pnfCatalogo, colorDePnf } = usePnfColors();

  // PNF preseleccionado: el del usuario si tiene uno asociado; si no, "Todos".
  const [pnfSel, setPnfSel] = useState<string>(
    user?.pnf_saga_id != null ? String(user.pnf_saga_id) : TODOS
  );
  const [mayas, setMayas] = useState<Maya[]>([]);
  const [loadingMayas, setLoadingMayas] = useState(false);
  const [mayaSel, setMayaSel] = useState<string>(TODOS);
  const [alcance, setAlcance] = useState<Alcance>('0');

  const [estudiantes, setEstudiantes] = useState<EstudianteSaga[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sagaCaido, setSagaCaido] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Filtros client-side sobre el conjunto cargado
  const [fTrayecto, setFTrayecto] = useState(TODOS);
  const [fTurno, setFTurno] = useState(TODOS);
  const [fSeccion, setFSeccion] = useState(TODOS);
  const [fSexo, setFSexo] = useState(TODOS);
  const [fEstatus, setFEstatus] = useState(TODOS);
  const [fCondicion, setFCondicion] = useState(TODOS);
  const [fLapso, setFLapso] = useState(TODOS);
  const [fTexto, setFTexto] = useState('');

  const [expandido, setExpandido] = useState<number | null>(null);
  const [pagina, setPagina] = useState(1);

  // ── Mayas del PNF seleccionado ────────────────────────────────────────────
  useEffect(() => {
    setMayaSel(TODOS);
    setMayas([]);
    if (pnfSel === TODOS) return;
    let cancelado = false;
    setLoadingMayas(true);
    apiFetch<Maya[]>(`/saga/mayas/${pnfSel}`).then((res) => {
      if (cancelado) return;
      setLoadingMayas(false);
      if (res.success && Array.isArray(res.data)) setMayas(res.data);
    });
    return () => {
      cancelado = true;
    };
  }, [pnfSel]);

  // ── Carga de inscritos ────────────────────────────────────────────────────
  const cargarEstudiantes = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setSagaCaido(false);
    const params = new URLSearchParams();
    if (pnfSel !== TODOS) params.set('programa', pnfSel);
    if (pnfSel !== TODOS && mayaSel !== TODOS) params.set('pensum', mayaSel);
    if (alcance !== '0') params.set('history', alcance);
    const res = await apiFetch<EstudianteSaga[]>(`/saga/estudiantes?${params.toString()}`, {
      etiqueta: 'Consultando inscritos en SAGA…',
    });
    setLoading(false);
    if (res.success) {
      setEstudiantes(Array.isArray(res.data) ? res.data : []);
      if (res.connected === false) setSagaCaido(true);
    } else {
      setEstudiantes(null);
      setErrorMsg(res.message || 'Error consultando estudiantes en SAGA.');
    }
  }, [pnfSel, mayaSel, alcance]);

  useEffect(() => {
    cargarEstudiantes();
  }, [cargarEstudiantes, tick]);

  // Al cambiar el dataset se reinician los filtros dependientes y la página
  useEffect(() => {
    setFTrayecto(TODOS);
    setFTurno(TODOS);
    setFSeccion(TODOS);
    setFSexo(TODOS);
    setFEstatus(TODOS);
    setFCondicion(TODOS);
    setFLapso(TODOS);
    setPagina(1);
    setExpandido(null);
  }, [estudiantes]);

  // ── Opciones de filtro derivadas de los datos cargados ────────────────────
  // La API no expone catálogos de lapsos/sexos/estatus/condiciones: se toman
  // los valores distintos presentes en la respuesta.
  const opciones = useMemo(() => {
    const trayectos = new Map<string, string>();
    const turnos = new Set<string>();
    const secciones = new Set<string>();
    const sexos = new Set<string>();
    const estatuses = new Set<string>();
    const condiciones = new Set<string>();
    const lapsos = new Map<string, string>();
    for (const e of estudiantes ?? []) {
      if (e.trayecto_id != null)
        trayectos.set(String(e.trayecto_id), capitalizar(e.trayecto || `Trayecto ${e.trayecto_id}`));
      if (e.turno) turnos.add(e.turno);
      if (e.seccion) secciones.add(e.seccion);
      if (e.sexo) sexos.add(e.sexo);
      if (e.estatus_academico) estatuses.add(e.estatus_academico);
      if (e.condicion_ingreso) condiciones.add(e.condicion_ingreso);
      for (const u of e.ucs_inscritas ?? []) {
        // PeriodoAcademico (ej. "2024-I") es el nombre legible; ReferenciaLapso
        // (ej. "c2-2024") queda de respaldo cuando el lapso no tiene periodo.
        if (u.lapso_id != null)
          lapsos.set(
            String(u.lapso_id),
            (u.periodo || u.lapso || `Lapso ${u.lapso_id}`).toUpperCase()
          );
      }
    }
    const ordenar = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
    return {
      trayectos: [...trayectos.entries()].sort((a, b) => Number(a[0]) - Number(b[0])),
      turnos: ordenar(turnos),
      secciones: ordenar(secciones),
      sexos: ordenar(sexos),
      estatuses: ordenar(estatuses),
      condiciones: ordenar(condiciones),
      lapsos: [...lapsos.entries()].sort((a, b) => Number(a[0]) - Number(b[0])),
    };
  }, [estudiantes]);

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    const texto = fTexto.trim().toLowerCase();
    return (estudiantes ?? []).filter((e) => {
      if (fTrayecto !== TODOS && String(e.trayecto_id) !== fTrayecto) return false;
      if (fTurno !== TODOS && e.turno !== fTurno) return false;
      if (fSeccion !== TODOS && e.seccion !== fSeccion) return false;
      if (fSexo !== TODOS && e.sexo !== fSexo) return false;
      if (fEstatus !== TODOS && e.estatus_academico !== fEstatus) return false;
      if (fCondicion !== TODOS && e.condicion_ingreso !== fCondicion) return false;
      if (fLapso !== TODOS && !(e.ucs_inscritas ?? []).some((u) => String(u.lapso_id) === fLapso))
        return false;
      if (texto) {
        const nombre = `${e.nombre ?? ''} ${e.apellido ?? ''}`.toLowerCase();
        if (!nombre.includes(texto) && !String(e.cedula ?? '').includes(texto)) return false;
      }
      return true;
    });
  }, [estudiantes, fTrayecto, fTurno, fSeccion, fSexo, fEstatus, fCondicion, fLapso, fTexto]);

  // ── Totales del conjunto filtrado ─────────────────────────────────────────
  const totales = useMemo(() => {
    const porSexo = new Map<string, number>();
    const porTrayecto = new Map<string, number>();
    const porPnf = new Map<string, { n: number; id: number | null }>();
    for (const e of filtrados) {
      const sexo = capitalizar(e.sexo || 'Sin dato');
      porSexo.set(sexo, (porSexo.get(sexo) ?? 0) + 1);
      const trayecto = capitalizar(e.trayecto || 'Sin trayecto');
      porTrayecto.set(trayecto, (porTrayecto.get(trayecto) ?? 0) + 1);
      const pnf = capitalizar(e.pnf || 'Sin PNF');
      const entrada = porPnf.get(pnf) ?? { n: 0, id: e.programa_id ?? null };
      entrada.n += 1;
      porPnf.set(pnf, entrada);
    }
    const ordenarDesc = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]);
    return {
      total: filtrados.length,
      porSexo: ordenarDesc(porSexo),
      porTrayecto: ordenarDesc(porTrayecto),
      porPnf: [...porPnf.entries()].sort((a, b) => b[1].n - a[1].n),
    };
  }, [filtrados]);

  // ── Paginación de la tabla ────────────────────────────────────────────────
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const paginaActual = filtrados.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA);

  useEffect(() => {
    setPagina(1);
  }, [fTrayecto, fTurno, fSeccion, fSexo, fEstatus, fCondicion, fLapso, fTexto]);

  const hayFiltrosActivos =
    fTrayecto !== TODOS || fTurno !== TODOS || fSeccion !== TODOS || fSexo !== TODOS ||
    fEstatus !== TODOS || fCondicion !== TODOS || fLapso !== TODOS || fTexto.trim() !== '';

  const limpiarFiltros = () => {
    setFTrayecto(TODOS);
    setFTurno(TODOS);
    setFSeccion(TODOS);
    setFSexo(TODOS);
    setFEstatus(TODOS);
    setFCondicion(TODOS);
    setFLapso(TODOS);
    setFTexto('');
  };

  const selectClase =
    'bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[200px]';

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-indigo-400" />
            Estudiantes Inscritos
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Inscritos registrados en SAGA por PNF, maya y lapso.
          </p>
        </div>
        <button
          onClick={() => setTick((t) => t + 1)}
          disabled={loading}
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Selectores PNF → Maya + alcance */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">PNF</label>
            <select
              value={pnfSel}
              onChange={(e) => setPnfSel(e.target.value)}
              className={selectClase}
            >
              <option value={TODOS}>Todos los PNF</option>
              {pnfCatalogo.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Maya</label>
            <select
              value={mayaSel}
              onChange={(e) => setMayaSel(e.target.value)}
              disabled={pnfSel === TODOS || loadingMayas}
              className={`${selectClase} disabled:opacity-50`}
            >
              <option value={TODOS}>
                {pnfSel === TODOS
                  ? 'Elija un PNF primero'
                  : loadingMayas
                    ? 'Cargando mayas…'
                    : 'Todas las mayas'}
              </option>
              {mayas.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.descripcion}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Alcance</label>
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1">
              {(
                [
                  { v: '0' as Alcance, label: 'Lapso en curso' },
                  { v: '1' as Alcance, label: 'Histórico' },
                  { v: 'all' as Alcance, label: 'Todo' },
                ]
              ).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setAlcance(o.v)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    alcance === o.v ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Banners */}
      {sagaCaido && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-300 text-sm">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <span>La API SAGA no respondió. Los datos mostrados pueden estar desactualizados o vacíos.</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-300 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Totales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <section className="bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/20 rounded-2xl p-5 flex flex-col justify-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300/80 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Total de estudiantes
          </p>
          <p className="text-3xl font-extrabold text-white mt-1">
            {loading ? '—' : totales.total}
          </p>
          {hayFiltrosActivos && estudiantes && (
            <p className="text-[10px] text-slate-500 mt-1">de {estudiantes.length} cargados</p>
          )}
        </section>

        <Card titulo="Por sexo" icono={<UserRound className="w-4 h-4" />}>
          <div className="space-y-2">
            {totales.porSexo.length === 0 ? (
              <p className="text-[11px] text-slate-600 italic">Sin datos.</p>
            ) : (
              totales.porSexo.map(([sexo, n]) => (
                <BarraConteo key={sexo} etiqueta={sexo} valor={n} total={totales.total} />
              ))
            )}
          </div>
        </Card>

        <Card titulo="Por trayecto" icono={<Layers className="w-4 h-4" />}>
          <div className="space-y-2">
            {totales.porTrayecto.length === 0 ? (
              <p className="text-[11px] text-slate-600 italic">Sin datos.</p>
            ) : (
              totales.porTrayecto.map(([trayecto, n]) => (
                <BarraConteo key={trayecto} etiqueta={trayecto} valor={n} total={totales.total} />
              ))
            )}
          </div>
        </Card>

        <Card titulo="Por PNF" icono={<BookOpen className="w-4 h-4" />}>
          <div className="space-y-2">
            {totales.porPnf.length === 0 ? (
              <p className="text-[11px] text-slate-600 italic">Sin datos.</p>
            ) : (
              totales.porPnf.map(([pnf, info]) => (
                <BarraConteo
                  key={pnf}
                  etiqueta={pnf}
                  valor={info.n}
                  total={totales.total}
                  color={colorDePnf(info.id)}
                />
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Barra de filtros */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" /> Filtros
          </p>
          {hayFiltrosActivos && (
            <button
              onClick={limpiarFiltros}
              className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" /> Limpiar filtros
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={fTexto}
              onChange={(e) => setFTexto(e.target.value)}
              placeholder="Cédula, nombre o apellido..."
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select value={fTrayecto} onChange={(e) => setFTrayecto(e.target.value)} className={selectClase}>
            <option value={TODOS}>Todos los trayectos</option>
            {opciones.trayectos.map(([id, nombre]) => (
              <option key={id} value={id}>{nombre}</option>
            ))}
          </select>

          <select value={fTurno} onChange={(e) => setFTurno(e.target.value)} className={selectClase}>
            <option value={TODOS}>Todos los turnos</option>
            {opciones.turnos.map((t) => (
              <option key={t} value={t}>{capitalizar(t)}</option>
            ))}
          </select>

          <select value={fSeccion} onChange={(e) => setFSeccion(e.target.value)} className={selectClase}>
            <option value={TODOS}>Todas las secciones</option>
            {opciones.secciones.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select value={fSexo} onChange={(e) => setFSexo(e.target.value)} className={selectClase}>
            <option value={TODOS}>Todos los sexos</option>
            {opciones.sexos.map((s) => (
              <option key={s} value={s}>{capitalizar(s)}</option>
            ))}
          </select>

          <select value={fEstatus} onChange={(e) => setFEstatus(e.target.value)} className={selectClase}>
            <option value={TODOS}>Todos los estatus</option>
            {opciones.estatuses.map((s) => (
              <option key={s} value={s}>{capitalizar(s)}</option>
            ))}
          </select>

          <select value={fCondicion} onChange={(e) => setFCondicion(e.target.value)} className={selectClase}>
            <option value={TODOS}>Todas las condiciones</option>
            {opciones.condiciones.map((c) => (
              <option key={c} value={c}>{capitalizar(c)}</option>
            ))}
          </select>

          <select value={fLapso} onChange={(e) => setFLapso(e.target.value)} className={selectClase}>
            <option value={TODOS}>Todos los lapsos</option>
            {opciones.lapsos.map(([id, nombre]) => (
              <option key={id} value={id}>{nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Listado */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-xs flex justify-center items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          <span>Consultando inscritos en SAGA...</span>
        </div>
      ) : !estudiantes ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center text-slate-400">
          <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-300 mb-1">No se pudo consultar SAGA</h3>
          <p className="text-xs text-slate-500">Verifique la conexión con el indicador SAGA y reintente.</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center text-slate-400">
          <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-300 mb-1">
            {estudiantes.length === 0 ? 'Sin inscritos en esta selección' : 'Sin resultados para los filtros'}
          </h3>
          <p className="text-xs text-slate-500">
            {estudiantes.length === 0
              ? 'Pruebe con otra maya, otro PNF o cambie el alcance (histórico / todo).'
              : 'Ajuste o limpie los filtros para ver más resultados.'}
          </p>
        </div>
      ) : (
        <div className="border border-slate-800 rounded-3xl overflow-hidden bg-slate-900/80 shadow-xl overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 min-w-[980px]">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="py-4 px-4 w-8"></th>
                <th className="py-4 px-4">Cédula</th>
                <th className="py-4 px-4">Estudiante</th>
                <th className="py-4 px-4">Sexo</th>
                <th className="py-4 px-4">PNF</th>
                <th className="py-4 px-4">Trayecto</th>
                <th className="py-4 px-4">Maya</th>
                <th className="py-4 px-4">Turno</th>
                <th className="py-4 px-4">Sección</th>
                <th className="py-4 px-4">Estatus</th>
                <th className="py-4 px-4 text-center">UCs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {paginaActual.map((e) => {
                const abierto = expandido === e.id;
                const ucs = e.ucs_inscritas ?? [];
                return (
                  <React.Fragment key={e.id}>
                    <tr
                      onClick={() => setExpandido(abierto ? null : e.id)}
                      className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 text-slate-500">
                        {abierto ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">{e.cedula}</td>
                      <td className="py-3 px-4 font-semibold text-slate-200">
                        {e.apellido} {e.nombre}
                      </td>
                      <td className="py-3 px-4">{capitalizar(e.sexo || '—')}</td>
                      <td className="py-3 px-4">
                        <span
                          className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold"
                          style={{
                            backgroundColor: `${colorDePnf(e.programa_id ?? null) ?? '#475569'}22`,
                            color: colorDePnf(e.programa_id ?? null) ?? '#94a3b8',
                          }}
                        >
                          {capitalizar(e.pnf || '—')}
                        </span>
                      </td>
                      <td className="py-3 px-4">{capitalizar(e.trayecto || '—')}</td>
                      <td className="py-3 px-4">{capitalizar(e.maya || '—')}</td>
                      <td className="py-3 px-4">{capitalizar(e.turno || '—')}</td>
                      <td className="py-3 px-4">{e.seccion || '—'}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                            (e.estatus_academico || '').toLowerCase() === 'activo'
                              ? 'bg-emerald-500/10 text-emerald-300'
                              : 'bg-slate-700/50 text-slate-300'
                          }`}
                        >
                          {capitalizar(e.estatus_academico || '—')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-semibold">{ucs.length}</td>
                    </tr>
                    {abierto && (
                      <tr className="bg-slate-950/50">
                        <td colSpan={11} className="px-6 py-3">
                          {ucs.length === 0 ? (
                            <p className="text-[11px] text-slate-600 italic">
                              Sin unidades curriculares inscritas en el alcance consultado.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                                Unidades curriculares inscritas
                                {e.condicion_ingreso ? ` · ${capitalizar(e.condicion_ingreso)}` : ''}
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                {ucs.map((u, i) => (
                                  <div
                                    key={`${u.uc_id}-${u.lapso_id}-${i}`}
                                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800/80"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-[11px] text-slate-300 truncate">{u.uc}</p>
                                      <p className="text-[10px] text-slate-500">
                                        {(u.periodo || u.lapso || '—').toUpperCase()} · Sec. {u.seccion || '—'} · {capitalizar(u.turno || '—')}
                                      </p>
                                    </div>
                                    {u.nota != null && (
                                      <span className="text-[10px] font-bold text-slate-200 shrink-0">
                                        {u.nota}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-950/60">
              <p className="text-[11px] text-slate-500">
                {filtrados.length} estudiantes · página {paginaSegura} de {totalPaginas}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={paginaSegura === 1}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaSegura === totalPaginas}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
