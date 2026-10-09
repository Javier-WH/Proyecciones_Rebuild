import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { usePnfColors } from '../context/PnfColorContext.js';
import { apiFetch } from '../api/client.js';
import { invalidarCatalogoMaterias, precargarCatalogoMaterias } from './horarios/catalogoMaterias.js';
import { ProyeccionesPage } from './ProyeccionesPage.js';
import { PeriodosPage } from './PeriodosPage.js';
import { ProfesoresPage } from './ProfesoresPage.js';
import { CargaDocentePage } from './CargaDocentePage.js';
import { HorariosPage, HorariosSubTab } from './HorariosPage.js';
import { ProfesorPortalPage } from './ProfesorPortalPage.js';
import { UsuariosModal } from './UsuariosModal.js';
import { ConfigHorariosModal } from './ConfigHorariosModal.js';
import { PnfMallasModal } from './PnfMallasModal.js';
import { TiposContratoModal } from './TiposContratoModal.js';
import { PerfilesModal } from './PerfilesModal.js';
import { ProfesorPanelModal } from './ProfesorPanelModal.js';
import { PermisosRolModal } from './PermisosRolModal.js';
import logoProyecciones from '../images/Gemini_back_transparent.png';
import logoUniversidad from '../images/UPTLL_logo_transparent_outlined.png';
import {
  GraduationCap,
  Briefcase,
  LogOut,
  UserCheck,
  Calendar,
  CalendarDays,
  Users,
  Building2,
  BookOpen,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  LayoutDashboard,
  ClipboardList,
  Settings,
  UserCog,
  CalendarClock,
  CalendarCog,
  IdCard,
  ShieldCheck,
  RefreshCw,
  Info,
  HelpCircle
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'proyecciones' | 'periodos' | 'profesores' | 'carga' | 'horarios'>('dashboard');
  const [horariosSubTab, setHorariosSubTab] = useState<HorariosSubTab>('horario');
  const [sagaConnected, setSagaConnected] = useState<boolean | null>(null);
  const [loadingSaga, setLoadingSaga] = useState(true);
  const [sagaNota, setSagaNota] = useState<string | null>(null); // feedback breve tras reintentar
  const { refresh: refreshPnfs } = usePnfColors();
  const [configMenuOpen, setConfigMenuOpen] = useState(false);
  const [usuariosModalOpen, setUsuariosModalOpen] = useState(false);
  const [configHorariosOpen, setConfigHorariosOpen] = useState(false);
  const [horariosConfigTick, setHorariosConfigTick] = useState(0);
  const [pnfMallasOpen, setPnfMallasOpen] = useState(false);
  const [tiposContratoOpen, setTiposContratoOpen] = useState(false);
  const [perfilesOpen, setPerfilesOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [acercaOpen, setAcercaOpen] = useState(false);
  const [permisosOpen, setPermisosOpen] = useState(false);
  const [panelProfesor, setPanelProfesor] = useState<{
    id: number;
    nombre: string;
    cedula?: string | null;
  } | null>(null);

  useEffect(() => {
    const checkSagaStatus = async () => {
      setLoadingSaga(true);
      const res = await apiFetch('/saga/status');
      setSagaConnected(res.connected ?? res.success);
      setLoadingSaga(false);
    };
    checkSagaStatus();
  }, []);

  // Click en el indicador SAGA: reintenta la conexión y, si responde,
  // resincroniza los cachés relacionados (catálogo de materias en memoria,
  // catálogo/colores de PNF y la config del módulo de horarios).
  const resincronizarSaga = async () => {
    if (loadingSaga) return;
    setLoadingSaga(true);
    setSagaNota(null);
    const res = await apiFetch('/saga/status');
    const conectado = !!(res.connected ?? res.success);
    setSagaConnected(conectado);
    setLoadingSaga(false);
    if (conectado) {
      invalidarCatalogoMaterias();
      precargarCatalogoMaterias();
      await refreshPnfs();
      setHorariosConfigTick((t) => t + 1);
      setSagaNota('SAGA conectado: caché y catálogos actualizados.');
    } else {
      setSagaNota(res.message || 'SAGA sigue sin responder.');
    }
    window.setTimeout(() => setSagaNota(null), 6000);
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'SUPER_USUARIO':
        return <span className="inline-block whitespace-nowrap bg-purple-500/10 text-purple-300/80 border border-purple-500/20 text-[10px] px-3 py-0.5 rounded-full font-medium tracking-wide">Super Usuario</span>;
      case 'ADMINISTRADOR':
        return <span className="inline-block whitespace-nowrap bg-blue-500/10 text-blue-300/80 border border-blue-500/20 text-[10px] px-3 py-0.5 rounded-full font-medium tracking-wide">Coordinador</span>;
      case 'REGULAR':
        return <span className="inline-block whitespace-nowrap bg-emerald-500/10 text-emerald-300/80 border border-emerald-500/20 text-[10px] px-3 py-0.5 rounded-full font-medium tracking-wide">Usuario</span>;
      case 'PROFESOR':
        return <span className="inline-block whitespace-nowrap bg-amber-500/10 text-amber-300/80 border border-amber-500/20 text-[10px] px-3 py-0.5 rounded-full font-medium tracking-wide">Docente</span>;
      default:
        return <span className="inline-block whitespace-nowrap bg-slate-700/60 text-slate-300/80 text-[10px] px-3 py-0.5 rounded-full font-medium tracking-wide">{role}</span>;
    }
  };

  const esAdmin = user?.role === 'SUPER_USUARIO' || user?.role === 'ADMINISTRADOR';
  const puedeGestionarDocentes = esAdmin;

  const moduloClases: Record<string, { icon: string; tag: string; hover: string; btn: string }> = {
    blue:    { icon: 'bg-blue-500/10 border-blue-500/20 text-blue-400',       tag: 'text-blue-400 bg-blue-500/10',       hover: 'hover:border-blue-500/50',    btn: 'hover:bg-blue-600' },
    indigo:  { icon: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400', tag: 'text-indigo-400 bg-indigo-500/10', hover: 'hover:border-indigo-500/50',  btn: 'hover:bg-indigo-600' },
    cyan:    { icon: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',       tag: 'text-cyan-400 bg-cyan-500/10',       hover: 'hover:border-cyan-500/50',    btn: 'hover:bg-cyan-600' },
    teal:    { icon: 'bg-teal-500/10 border-teal-500/20 text-teal-400',       tag: 'text-teal-400 bg-teal-500/10',       hover: 'hover:border-teal-500/50',    btn: 'hover:bg-teal-600' },
    emerald: { icon: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', tag: 'text-emerald-400 bg-emerald-500/10', hover: 'hover:border-emerald-500/50', btn: 'hover:bg-emerald-600' },
    sky:     { icon: 'bg-sky-500/10 border-sky-500/20 text-sky-400',          tag: 'text-sky-400 bg-sky-500/10',         hover: 'hover:border-sky-500/50',     btn: 'hover:bg-sky-600' },
    orange:  { icon: 'bg-orange-500/10 border-orange-500/20 text-orange-400', tag: 'text-orange-400 bg-orange-500/10', hover: 'hover:border-orange-500/50',  btn: 'hover:bg-orange-600' },
    rose:    { icon: 'bg-rose-500/10 border-rose-500/20 text-rose-400',       tag: 'text-rose-400 bg-rose-500/10',       hover: 'hover:border-rose-500/50',    btn: 'hover:bg-rose-600' },
    amber:   { icon: 'bg-amber-500/10 border-amber-500/20 text-amber-400',    tag: 'text-amber-400 bg-amber-500/10',    hover: 'hover:border-amber-500/50',   btn: 'hover:bg-amber-600' },
    violet:  { icon: 'bg-violet-500/10 border-violet-500/20 text-violet-400', tag: 'text-violet-400 bg-violet-500/10', hover: 'hover:border-violet-500/50',  btn: 'hover:bg-violet-600' },
    fuchsia: { icon: 'bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-400', tag: 'text-fuchsia-400 bg-fuchsia-500/10', hover: 'hover:border-fuchsia-500/50', btn: 'hover:bg-fuchsia-600' },
    purple:  { icon: 'bg-purple-500/10 border-purple-500/20 text-purple-400', tag: 'text-purple-400 bg-purple-500/10', hover: 'hover:border-purple-500/50',  btn: 'hover:bg-purple-600' },
  };

  const modulos: Array<{
    titulo: string;
    desc: string;
    tag: string;
    accion: string;
    icono: React.ReactNode;
    color: keyof typeof moduloClases;
    onClick: () => void;
    oculto?: boolean;
  }> = [
    {
      titulo: 'Periodos Académicos',
      desc: 'Crear y administrar los periodos académicos del año escolar.',
      tag: 'Gestión',
      accion: 'Ver Periodos',
      icono: <CalendarDays className="w-6 h-6" />,
      color: 'amber',
      onClick: () => setActiveTab('periodos'),
    },
    {
      titulo: 'Proyecciones',
      desc: 'Crear y gestionar proyecciones por PNF, trayecto y pensum.',
      tag: 'Módulo Principal',
      accion: 'Ver Proyecciones',
      icono: <Calendar className="w-6 h-6" />,
      color: 'blue',
      onClick: () => setActiveTab('proyecciones'),
    },
    {
      titulo: 'Profesores',
      desc: 'Registro, carga horaria, restricciones y asignación de materias.',
      tag: 'Gestión Docente',
      accion: 'Ver Docentes',
      icono: <Users className="w-6 h-6" />,
      color: 'indigo',
      onClick: () => setActiveTab('profesores'),
    },
    {
      titulo: 'Tipos de Contrato',
      desc: 'Dedicación y horas semanales según el tipo de contrato.',
      tag: 'Gestión Docente',
      accion: 'Ver Tipos',
      icono: <Briefcase className="w-6 h-6" />,
      color: 'cyan',
      onClick: () => setTiposContratoOpen(true),
      oculto: !puedeGestionarDocentes,
    },
    {
      titulo: 'Perfiles Docentes',
      desc: 'Perfiles y materias que cada docente puede dictar.',
      tag: 'Gestión Docente',
      accion: 'Ver Perfiles',
      icono: <GraduationCap className="w-6 h-6" />,
      color: 'teal',
      onClick: () => setPerfilesOpen(true),
      oculto: !puedeGestionarDocentes,
    },
    {
      titulo: 'Carga Docente',
      desc: 'Asignación de unidades curriculares a profesores por lapso.',
      tag: 'Asignación',
      accion: 'Ver Carga',
      icono: <ClipboardList className="w-6 h-6" />,
      color: 'sky',
      onClick: () => setActiveTab('carga'),
    },
    {
      titulo: 'Horarios',
      desc: 'Generación y consulta de horarios por sección, aula y docente.',
      tag: 'Planificación',
      accion: 'Ver Horarios',
      icono: <CalendarClock className="w-6 h-6" />,
      color: 'orange',
      onClick: () => {
        setHorariosSubTab('horario');
        setActiveTab('horarios');
      },
    },
    {
      titulo: 'Aulas de Clase',
      desc: 'Catálogo de aulas, capacidades, laboratorios y estado.',
      tag: 'Espacios Físicos',
      accion: 'Gestionar Aulas',
      icono: <Building2 className="w-6 h-6" />,
      color: 'emerald',
      onClick: () => {
        setHorariosSubTab('aulas');
        setActiveTab('horarios');
      },
    },
    {
      titulo: 'Turnos y Bloques',
      desc: 'Turnos de clase, bloques horarios y su duración.',
      tag: 'Espacios Físicos',
      accion: 'Gestionar Turnos',
      icono: <Clock className="w-6 h-6" />,
      color: 'rose',
      onClick: () => {
        setHorariosSubTab('turnos');
        setActiveTab('horarios');
      },
    },
    {
      titulo: 'Usuarios del Sistema',
      desc: 'Crear y editar cuentas y permisos de acceso.',
      tag: 'Administración',
      accion: 'Gestionar Usuarios',
      icono: <UserCog className="w-6 h-6" />,
      color: 'purple',
      onClick: () => setUsuariosModalOpen(true),
      oculto: user?.role !== 'SUPER_USUARIO',
    },
    {
      titulo: 'Configuración de Horarios',
      desc: 'Reglas de generación automática de horarios.',
      tag: 'Administración',
      accion: 'Configurar',
      icono: <CalendarCog className="w-6 h-6" />,
      color: 'violet',
      onClick: () => setConfigHorariosOpen(true),
      oculto: !esAdmin,
    },
    {
      titulo: 'PNF y Mallas',
      desc: 'Mallas curriculares SAGA e inscritos por PNF.',
      tag: 'Pensums SAGA',
      accion: 'Consultar Pensums',
      icono: <BookOpen className="w-6 h-6" />,
      color: 'fuchsia',
      onClick: () => setPnfMallasOpen(true),
      oculto: !esAdmin,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <nav className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left Brand */}
            <div className="flex items-center gap-3">
              <img
                src={logoProyecciones}
                alt="Logo Proyecciones UPTLL"
                onClick={() => setActiveTab('dashboard')}
                className="h-15 w-auto object-contain cursor-pointer"
              />
              <div>
                <span className="font-bold text-white text-base tracking-tight cursor-pointer" onClick={() => setActiveTab('dashboard')}>
                  Proyecciones UPTLL
                </span>
                <span className="hidden sm:inline-block ml-2 text-xs text-slate-400">| Juana Ramírez</span>
              </div>
            </div>

            {/* Navigation Tabs (ocultas para el rol docente) */}
            {user?.role !== 'PROFESOR' && (
            <div className="hidden md:flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Inicio</span>
              </button>
              <button
                onClick={() => setActiveTab('proyecciones')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'proyecciones' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Proyecciones</span>
              </button>
              <button
                onClick={() => setActiveTab('profesores')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'profesores' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Profesores</span>
              </button>
              <button
                onClick={() => setActiveTab('carga')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'carga' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Carga Docente</span>
              </button>
              <button
                onClick={() => setActiveTab('horarios')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'horarios' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5" />
                <span>Horarios</span>
              </button>
            </div>
            )}

            {/* Right Profile & Actions */}
            <div className="flex items-center gap-4">
              {/* SAGA Status Indicator — clic para reintentar y resincronizar cachés */}
              <button
                onClick={resincronizarSaga}
                disabled={loadingSaga}
                title="Reintentar conexión con SAGA y resincronizar los cachés"
                className="hidden md:flex items-center gap-2 bg-slate-950 border border-slate-800 hover:border-slate-600 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer disabled:cursor-wait"
              >
                <Activity className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400">SAGA:</span>
                {loadingSaga ? (
                  <span className="text-amber-400 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Sincronizando...</span>
                ) : sagaNota ? (
                  <span
                    className={`flex items-center gap-1 font-medium max-w-[220px] truncate ${
                      sagaConnected ? 'text-emerald-400' : 'text-red-400'
                    }`}
                    title={sagaNota}
                  >
                    {sagaConnected ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    {sagaNota}
                  </span>
                ) : sagaConnected ? (
                  <span className="text-emerald-400 flex items-center gap-1 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> En línea</span>
                ) : (
                  <span className="text-red-400 flex items-center gap-1 font-medium"><XCircle className="w-3.5 h-3.5" /> Desconectado</span>
                )}
              </button>

              {/* Menú de configuración y sesión — el docente ve solo logout directo */}
              <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
                {user?.role === 'PROFESOR' ? (
                  <button
                    onClick={() => setLogoutConfirmOpen(true)}
                    title="Cerrar sesión"
                    className="p-2 rounded-xl border bg-slate-800 hover:bg-red-500/15 text-slate-300 hover:text-red-300 border-slate-700/60 hover:border-red-500/40 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                ) : (
                <div className="relative">
                  <button
                    onClick={() => setConfigMenuOpen((v) => !v)}
                    title="Configuración"
                    className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                      configMenuOpen
                        ? 'bg-slate-700 text-white border-slate-600'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/60'
                    }`}
                  >
                    <Settings className="w-5 h-5" />
                  </button>

                  {configMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setConfigMenuOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden z-50">
                        {esAdmin && (
                          <>
                            <div className="px-4 py-2.5 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Configuración
                            </div>
                            {user?.role === 'SUPER_USUARIO' && (
                              <button
                                onClick={() => {
                                  setConfigMenuOpen(false);
                                  setUsuariosModalOpen(true);
                                }}
                                className="w-full px-4 py-3 flex items-center gap-3 text-sm text-slate-200 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                              >
                                <UserCog className="w-4 h-4 text-purple-400" />
                                <div className="text-left">
                                  <div className="font-semibold text-xs">Usuarios del Sistema</div>
                                  <div className="text-[10px] text-slate-500">Crear y editar cuentas y permisos</div>
                                </div>
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setConfigMenuOpen(false);
                                setConfigHorariosOpen(true);
                              }}
                              className="w-full px-4 py-3 flex items-center gap-3 text-sm text-slate-200 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                            >
                              <CalendarCog className="w-4 h-4 text-blue-400" />
                              <div className="text-left">
                                <div className="font-semibold text-xs">Configuración de Horarios</div>
                                <div className="text-[10px] text-slate-500">Reglas de generación automática</div>
                              </div>
                            </button>
                            <button
                              onClick={() => {
                                setConfigMenuOpen(false);
                                setPnfMallasOpen(true);
                              }}
                              className="w-full px-4 py-3 flex items-center gap-3 text-sm text-slate-200 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                            >
                              <BookOpen className="w-4 h-4 text-indigo-400" />
                              <div className="text-left">
                                <div className="font-semibold text-xs">PNF y Mallas</div>
                                <div className="text-[10px] text-slate-500">Mallas SAGA y color por PNF</div>
                              </div>
                            </button>
                          </>
                        )}
                        <a
                          href="/manual/index.html"
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setConfigMenuOpen(false)}
                          className={`w-full px-4 py-3 flex items-center gap-3 text-sm text-slate-200 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer ${
                            esAdmin ? '' : 'rounded-t-2xl'
                          }`}
                        >
                          <HelpCircle className="w-4 h-4 text-emerald-400" />
                          <div className="text-left">
                            <div className="font-semibold text-xs">Ayuda</div>
                            <div className="text-[10px] text-slate-500">Manual de usuario con capturas</div>
                          </div>
                        </a>
                        <button
                          onClick={() => {
                            setConfigMenuOpen(false);
                            setAcercaOpen(true);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 text-sm text-slate-200 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                        >
                          <Info className="w-4 h-4 text-cyan-400" />
                          <div className="text-left">
                            <div className="font-semibold text-xs">Acerca de</div>
                            <div className="text-[10px] text-slate-500">Información del sistema</div>
                          </div>
                        </button>

                        <button
                          onClick={() => {
                            setConfigMenuOpen(false);
                            setLogoutConfirmOpen(true);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 text-sm text-red-300 hover:bg-red-500/10 hover:text-red-200 border-t border-slate-800 transition-colors cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <div className="text-left">
                            <div className="font-semibold text-xs">Cerrar Sesión</div>
                            <div className="text-[10px] text-slate-500">Salir de la plataforma</div>
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className={`flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 ${activeTab === 'carga' || activeTab === 'horarios' ? 'max-w-none' : 'max-w-7xl'}`}>
        {user?.role === 'PROFESOR' ? (
          <ProfesorPortalPage />
        ) : activeTab === 'periodos' ? (
          <PeriodosPage />
        ) : activeTab === 'profesores' ? (
          <ProfesoresPage />
        ) : activeTab === 'carga' ? (
          <CargaDocentePage />
        ) : activeTab === 'horarios' ? (
          <HorariosPage subTab={horariosSubTab} onSubTabChange={setHorariosSubTab} configTick={horariosConfigTick} />
        ) : activeTab === 'proyecciones' ? (
          <ProyeccionesPage />
        ) : (
          <>
            {/* Welcome Hero Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900/60 via-indigo-900/40 to-slate-900 border border-blue-500/20 p-6 sm:p-8 shadow-2xl">
              <div className="relative z-10 max-w-3xl">
                <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 text-blue-300 px-3 py-1 rounded-full text-xs font-semibold mb-3">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Sesión Activa</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Bienvenido, {user?.nombre} {user?.apellido}
                </h2>
                <p className="text-slate-300 text-sm sm:text-base mt-2 leading-relaxed">
                  Plataforma para la creación de proyecciones académicas, asignación de carga docente y generación automática de horarios de la UPTLL "Juana Ramírez".
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <div className="flex items-center gap-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3.5 py-2.5">
                    <IdCard className="w-[18px] h-[18px] text-blue-400 shrink-0" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Usuario</p>
                      <p className="text-xs font-semibold text-slate-200">@{user?.username}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setPermisosOpen(true)}
                    title="Ver qué puede hacer este nivel de permiso"
                    className="flex items-center gap-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3.5 py-2.5 hover:border-purple-500/40 hover:bg-slate-800/60 transition-colors cursor-pointer text-left"
                  >
                    <ShieldCheck className="w-[18px] h-[18px] text-purple-400 shrink-0" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Nivel de Permiso</p>
                      {getRoleBadge(user?.role)}
                    </div>
                  </button>
                  <div className="flex items-center gap-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3.5 py-2.5">
                    <BookOpen className="w-[18px] h-[18px] text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">PNF Asociado</p>
                      <p className="text-xs font-semibold text-slate-200">
                        {user?.pnf_saga_id != null
                          ? user.pnf_nombre || `PNF #${user.pnf_saga_id}`
                          : user?.role === 'REGULAR'
                            ? 'Sin PNF asignado'
                            : 'Todos los PNF'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl px-3.5 py-2.5">
                    <UserCheck className="w-[18px] h-[18px] text-amber-400 shrink-0" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Docente Vinculado</p>
                      {user?.profesor_cedula && user?.profesor_id ? (
                        <button
                          onClick={() =>
                            setPanelProfesor({
                              id: user.profesor_id!,
                              nombre:
                                user.profesor_nombre ?? `C.I. ${user.profesor_cedula}`,
                              cedula: user.profesor_cedula,
                            })
                          }
                          title="Ver panel del docente"
                          className="text-xs font-semibold text-slate-200 hover:text-blue-300 transition-colors cursor-pointer text-left"
                        >
                          {user.profesor_nombre
                            ? `${user.profesor_nombre} · C.I. ${user.profesor_cedula}`
                            : `C.I. ${user.profesor_cedula}`}
                        </button>
                      ) : (
                        <p className="text-xs font-semibold text-slate-200">No vinculado</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* System Module Shortcut Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {modulos.filter((m) => !m.oculto).map((m) => {
                const c = moduloClases[m.color];
                return (
                  <div
                    key={m.titulo}
                    onClick={m.onClick}
                    className={`bg-slate-900/90 border border-slate-800 ${c.hover} rounded-2xl p-5 transition-all group cursor-pointer`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-12 h-12 rounded-xl border ${c.icon} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                        {m.icono}
                      </div>
                      <span className={`text-xs font-semibold ${c.tag} px-2.5 py-1 rounded-md`}>{m.tag}</span>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">{m.titulo}</h3>
                    <p className="text-xs text-slate-400 mb-4">{m.desc}</p>
                    <button
                      onClick={m.onClick}
                      className={`w-full py-2.5 bg-slate-800 ${c.btn} text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer`}
                    >
                      <span>{m.accion}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-center text-xs text-slate-400">
        <p>UPTLL Juana Ramírez — Sistema de Proyecciones Académicas © {new Date().getFullYear()}</p>
      </footer>

      <UsuariosModal
        isOpen={usuariosModalOpen}
        onClose={() => setUsuariosModalOpen(false)}
        currentUserId={user?.id}
      />
      <ConfigHorariosModal
        isOpen={configHorariosOpen}
        onClose={() => setConfigHorariosOpen(false)}
        onSaved={() => setHorariosConfigTick((t) => t + 1)}
      />

      <PnfMallasModal isOpen={pnfMallasOpen} onClose={() => setPnfMallasOpen(false)} />
      <TiposContratoModal isOpen={tiposContratoOpen} onClose={() => setTiposContratoOpen(false)} />
      <PerfilesModal isOpen={perfilesOpen} onClose={() => setPerfilesOpen(false)} />
      <ProfesorPanelModal profesor={panelProfesor} onClose={() => setPanelProfesor(null)} />
      {permisosOpen && <PermisosRolModal role={user?.role} onClose={() => setPermisosOpen(false)} />}

      {/* Acerca de — información del sistema */}
      {acercaOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setAcercaOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/60 p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center gap-5 mb-4">
              <img src={logoUniversidad} alt="Logo UPTLL" className="h-16 w-auto object-contain" />
              <div className="w-px h-14 bg-slate-700/70" />
              <img src={logoProyecciones} alt="Logo Proyecciones UPTLL" className="h-16 w-auto object-contain" />
            </div>
            <h3 className="text-base font-extrabold text-white tracking-tight">
              Proyecciones UPTLL
            </h3>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Plataforma para la creación de proyecciones académicas, asignación de carga docente y
              generación automática de horarios de la UPTLL "Juana Ramírez".
            </p>
            <div className="mt-4 pt-4 border-t border-slate-800">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">
                Desarrollado por
              </p>
              <p className="text-sm font-semibold text-slate-200">
                Francisco Javier Rodríguez Hernández
              </p>
              <a
                href="https://javier-wh.github.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                javier-wh.github.io
              </a>
            </div>
            <p className="text-[10px] text-slate-600 mt-4">
              UPTLL Juana Ramírez — Sistema de Proyecciones Académicas © {new Date().getFullYear()}
            </p>
          </div>
        </div>
      )}

      {/* Confirmación de cierre de sesión */}
      {logoutConfirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setLogoutConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/60 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Cerrar sesión</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  ¿Seguro que deseas salir de la plataforma? Tendrás que iniciar sesión nuevamente.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setLogoutConfirmOpen(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setLogoutConfirmOpen(false);
                  logout();
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

