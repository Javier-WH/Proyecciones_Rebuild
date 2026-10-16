import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client.js';
import { usePeriodo } from '../../context/PeriodoContext.js';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  School,
  Clock,
  Users,
  BookOpen,
  UserX,
  CalendarX,
  Layers,
} from 'lucide-react';

// ── Tipos del endpoint /api/reportes/estadisticas ────────────────────────────

interface CoberturaPnf {
  pnf_saga_id: number;
  nombre: string;
  trayectos_esperados: number | null;
  trayectos_cubiertos: number;
  faltantes: { id: number; nombre: string }[];
  fuente: 'saga' | 'historico' | 'sin_datos';
}

interface AulaUso {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string;
  ocupados: number;
  disponibles: number;
  pct: number;
}

interface TurnoUso {
  id: number;
  nombre: string;
  dias: number;
  bloques: number;
  ocupados: number;
  disponibles: number;
  pct: number;
}

interface PendienteDetalle {
  materia: string;
  seccion: string;
  lapso: number;
  tipo?: string;
  pnf: string;
}

interface Estadisticas {
  periodo: string | null;
  periodo_nombre?: string | null;
  proyecciones_activas?: number;
  secciones?: number;
  clases_agendadas?: number;
  docentes_con_carga?: number;
  cobertura_pnf?: CoberturaPnf[];
  uso_aulas?: { total_activas: number; en_uso: number; sin_uso: number; por_aula: AulaUso[] };
  turnos?: TurnoUso[];
  sin_horario?: { total: number; por_pnf: { pnf_saga_id: number; nombre: string; n: number }[]; detalle: PendienteDetalle[] };
  sin_profesor?: { total: number; por_pnf: { pnf_saga_id: number; nombre: string; n: number }[]; detalle: PendienteDetalle[] };
  conflictos?: { total: number; por_aula: number; por_profesor: number };
  usuarios_login?: { username: string; role: string; total: number; ultimo_login: string }[];
}

// ── Piezas visuales ──────────────────────────────────────────────────────────

const Card: React.FC<{ titulo: string; icono: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode }> = ({
  titulo,
  icono,
  extra,
  children,
}) => (
  <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <span className="text-slate-500">{icono}</span>
        {titulo}
      </h3>
      {extra}
    </div>
    {children}
  </section>
);

const Barra: React.FC<{ pct: number; tono: string }> = ({ pct, tono }) => (
  <div className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden">
    <div
      className={`h-full rounded-full transition-all ${tono}`}
      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
    />
  </div>
);

const tonoPct = (pct: number) => (pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-700');

const Badge: React.FC<{ children: React.ReactNode; tono: string }> = ({ children, tono }) => (
  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${tono}`}>{children}</span>
);

const VACIO = 'Sin datos para el período seleccionado.';

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

const nombreLapso = (lapso: number, tipo?: string) =>
  tipo === 'SEMESTRAL' ? `Sem. ${lapso}` : `Trim. ${lapso}`;

// ── Panel principal ──────────────────────────────────────────────────────────

export const EstadisticasPanel: React.FC = () => {
  const { periodo } = usePeriodo();
  const [data, setData] = useState<Estadisticas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setLoading(true);
      setError(null);
      const qs = periodo ? `?periodo=${encodeURIComponent(periodo)}` : '';
      const res = await apiFetch<Estadisticas>(`/reportes/estadisticas${qs}`, { silencioso: true });
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.message || 'No se pudieron cargar las estadísticas.');
      }
      setLoading(false);
    },
    [periodo]
  );

  // Se carga solo cuando esta sub-pestaña está montada (la consulta de la
  // cobertura por trayecto pega contra SAGA — no se paga en cada Inicio).
  useEffect(() => {
    cargar();
  }, [cargar]);

  if (loading) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-10 text-center">
        <p className="text-sm text-slate-400 animate-pulse">Calculando estadísticas del período…</p>
        <p className="text-[11px] text-slate-600 mt-1">La cobertura de trayectos consulta la malla en SAGA la primera vez.</p>
      </div>
    );
  }

  if (error || !data || !data.periodo) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-10 text-center">
        <p className="text-sm text-slate-400">{error ?? VACIO}</p>
        <button
          onClick={() => cargar()}
          className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-sky-400 hover:text-sky-300 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  const cobertura = data.cobertura_pnf ?? [];
  const aulas = data.uso_aulas;
  const turnos = data.turnos ?? [];
  const sinHorario = data.sin_horario;
  const sinProfesor = data.sin_profesor;
  const conflictos = data.conflictos;
  const logins = data.usuarios_login ?? [];
  const maxPnf = Math.max(
    1,
    ...(sinProfesor?.por_pnf ?? []).map((p) => p.n),
    ...(sinHorario?.por_pnf ?? []).map((p) => p.n)
  );

  return (
    <div className="space-y-5">
      {/* Encabezado con totales del período */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-slate-900/80 border border-slate-800 rounded-2xl px-5 py-4">
        <div className="mr-auto">
          <h2 className="text-sm font-bold text-white">Estadísticas del período</h2>
          <p className="text-[11px] text-slate-500">
            {data.periodo_nombre || data.periodo}
            {data.periodo_nombre ? ` · ${data.periodo}` : ''}
          </p>
        </div>
        <span className="text-xs text-slate-400">
          <b className="text-white">{data.proyecciones_activas ?? 0}</b> proyecciones
        </span>
        <span className="text-xs text-slate-400">
          <b className="text-white">{data.secciones ?? 0}</b> secciones
        </span>
        <span className="text-xs text-slate-400">
          <b className="text-white">{data.clases_agendadas ?? 0}</b> clases agendadas
        </span>
        <span className="text-xs text-slate-400" title="Docentes con al menos una asignación en este período">
          <b className="text-white">{data.docentes_con_carga ?? 0}</b> docentes con carga
        </span>
        <button
          onClick={() => cargar(true)}
          className="text-slate-500 hover:text-white transition-colors cursor-pointer"
          title="Actualizar"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Cobertura de proyecciones por PNF × trayecto */}
      <Card
        titulo="Proyecciones por trayecto"
        icono={<Layers className="w-4 h-4" />}
        extra={<Badge tono="bg-slate-800 text-slate-400">{cobertura.length} PNF</Badge>}
      >
        {cobertura.length === 0 ? (
          <p className="text-xs text-slate-500">{VACIO}</p>
        ) : (
          <div className="space-y-3">
            {cobertura.map((c) => {
              const esperados = c.trayectos_esperados;
              const completo = esperados != null && esperados > 0 && c.faltantes.length === 0;
              const pct = esperados ? Math.round((c.trayectos_cubiertos / esperados) * 100) : 0;
              return (
                <div key={c.pnf_saga_id} className="border border-slate-800/80 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    {completo ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-white">{c.nombre}</span>
                    <span className="text-xs text-slate-400">
                      {esperados == null ? '—' : `${c.trayectos_cubiertos}/${esperados} trayectos`}
                    </span>
                    {c.fuente === 'historico' && (
                      <Badge tono="bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        estimado (SAGA no disponible)
                      </Badge>
                    )}
                    {c.fuente === 'sin_datos' && (
                      <Badge tono="bg-slate-800 text-slate-500">sin malla ni historial</Badge>
                    )}
                    <div className="ml-auto w-28">
                      <Barra pct={esperados ? pct : 0} tono={tonoPct(pct)} />
                    </div>
                  </div>
                  {c.faltantes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                      {c.faltantes.map((t) => (
                        <span
                          key={t.id}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/30"
                        >
                          Falta: {t.nombre}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Uso de aulas */}
        <Card
          titulo="Uso de aulas"
          icono={<School className="w-4 h-4" />}
          extra={
            aulas ? (
              <Badge tono="bg-slate-800 text-slate-400">
                {aulas.en_uso} en uso · {aulas.sin_uso} libres
              </Badge>
            ) : undefined
          }
        >
          {!aulas || aulas.por_aula.length === 0 ? (
            <p className="text-xs text-slate-500">{VACIO}</p>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {aulas.por_aula.map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <div className="w-40 shrink-0">
                    <p className="text-xs font-semibold text-slate-200 truncate" title={a.nombre}>
                      {a.codigo}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">{a.tipo.replace(/_/g, ' ')}</p>
                  </div>
                  <Barra pct={a.pct} tono={a.ocupados === 0 ? 'bg-slate-700' : 'bg-sky-500'} />
                  <span className="text-[10px] text-slate-400 w-16 text-right shrink-0">
                    {a.ocupados} · {a.pct}%
                  </span>
                </div>
              ))}
              <p className="text-[10px] text-slate-600 pt-1">
                Bloques ocupados sobre la capacidad teórica (días × bloques de todos los turnos).
              </p>
            </div>
          )}
        </Card>

        {/* Turnos disponibles */}
        <Card
          titulo="Turnos disponibles"
          icono={<Clock className="w-4 h-4" />}
          extra={<Badge tono="bg-slate-800 text-slate-400">{turnos.length} activos</Badge>}
        >
          {turnos.length === 0 ? (
            <p className="text-xs text-slate-500">{VACIO}</p>
          ) : (
            <div className="space-y-3">
              {turnos.map((t) => (
                <div key={t.id}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-200 w-28 truncate">{t.nombre}</span>
                    <Barra pct={t.pct} tono={t.ocupados === 0 ? 'bg-slate-700' : 'bg-emerald-500'} />
                    <span className="text-[10px] text-slate-400 w-20 text-right shrink-0">
                      {t.ocupados}/{t.disponibles}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-600 pl-[7.75rem]">
                    {t.dias} días × {t.bloques} bloques
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Materias sin profesor */}
        <Card
          titulo="Materias sin profesor asignado"
          icono={<UserX className="w-4 h-4" />}
          extra={
            <Badge tono={(sinProfesor?.total ?? 0) > 0 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'}>
              {sinProfesor?.total ?? 0} pendientes
            </Badge>
          }
        >
          {!sinProfesor || sinProfesor.total === 0 ? (
            <p className="text-xs text-emerald-400/80">Todas las unidades asignables tienen docente.</p>
          ) : (
            <>
              <div className="space-y-2 mb-3">
                {sinProfesor.por_pnf.map((p) => (
                  <div key={p.pnf_saga_id} className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-300 w-32 truncate" title={p.nombre}>{p.nombre}</span>
                    <Barra pct={(p.n / maxPnf) * 100} tono="bg-amber-500" />
                    <span className="text-[10px] text-slate-400 w-6 text-right">{p.n}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-800 pt-2 max-h-44 overflow-y-auto pr-1">
                {sinProfesor.detalle.map((d, i) => (
                  <p key={i} className="text-[11px] text-slate-400 py-0.5 truncate">
                    {d.materia} · Sec. {d.seccion} · {nombreLapso(d.lapso, d.tipo)}
                  </p>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Materias sin horario */}
        <Card
          titulo="Materias sin clase agendada"
          icono={<CalendarX className="w-4 h-4" />}
          extra={
            <Badge tono={(sinHorario?.total ?? 0) > 0 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'}>
              {sinHorario?.total ?? 0} pendientes
            </Badge>
          }
        >
          {!sinHorario || sinHorario.total === 0 ? (
            <p className="text-xs text-emerald-400/80">Todo lo asignable tiene al menos una clase en el horario.</p>
          ) : (
            <>
              <div className="space-y-2 mb-3">
                {sinHorario.por_pnf.map((p) => (
                  <div key={p.pnf_saga_id} className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-300 w-32 truncate" title={p.nombre}>{p.nombre}</span>
                    <Barra pct={(p.n / maxPnf) * 100} tono="bg-orange-500" />
                    <span className="text-[10px] text-slate-400 w-6 text-right">{p.n}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-800 pt-2 max-h-44 overflow-y-auto pr-1">
                {sinHorario.detalle.map((d, i) => (
                  <p key={i} className="text-[11px] text-slate-400 py-0.5 truncate">
                    {d.materia} · Sec. {d.seccion} · {nombreLapso(d.lapso, d.tipo)}
                  </p>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Conflictos */}
        <Card
          titulo="Conflictos de horario"
          icono={<AlertTriangle className="w-4 h-4" />}
          extra={
            <Badge tono={(conflictos?.total ?? 0) > 0 ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'}>
              {conflictos?.total ?? 0}
            </Badge>
          }
        >
          {!conflictos || conflictos.total === 0 ? (
            <p className="text-xs text-emerald-400/80">Sin pares de clases en conflicto en el período.</p>
          ) : (
            <div className="flex gap-3">
              <div className="flex-1 bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-red-300">{conflictos.por_aula}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">por aula</p>
              </div>
              <div className="flex-1 bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-red-300">{conflictos.por_profesor}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">por docente</p>
              </div>
            </div>
          )}
          <p className="text-[10px] text-slate-600 mt-3">
            Pares de clases que comparten aula o docente con traslape. Detalle en Horarios → Errores.
          </p>
        </Card>

        {/* Usuarios que han ingresado */}
        <Card
          titulo="Accesos al sistema"
          icono={<Users className="w-4 h-4" />}
          extra={<Badge tono="bg-slate-800 text-slate-400">{logins.length} usuarios</Badge>}
        >
          {logins.length === 0 ? (
            <p className="text-xs text-slate-500">No hay inicios de sesión registrados en la bitácora.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto pr-1">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="pb-2 font-semibold">Usuario</th>
                    <th className="pb-2 font-semibold">Rol</th>
                    <th className="pb-2 font-semibold text-right">Logins</th>
                    <th className="pb-2 font-semibold text-right">Último</th>
                  </tr>
                </thead>
                <tbody>
                  {logins.map((l) => (
                    <tr key={l.username} className="border-t border-slate-800/60 text-xs text-slate-300">
                      <td className="py-1.5 font-semibold">{l.username}</td>
                      <td className="py-1.5 text-slate-500">{l.role ?? '—'}</td>
                      <td className="py-1.5 text-right">{l.total}</td>
                      <td className="py-1.5 text-right text-slate-400">{fmtFecha(l.ultimo_login)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default EstadisticasPanel;
