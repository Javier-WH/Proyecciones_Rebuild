import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { apiFetch } from '../api/client.js';
import { ProyeccionesPage } from './ProyeccionesPage.js';
import { PeriodosPage } from './PeriodosPage.js';
import { ProfesoresPage } from './ProfesoresPage.js';
import { CargaDocentePage } from './CargaDocentePage.js';
import { HorariosPage, HorariosSubTab } from './HorariosPage.js';
import { UsuariosModal } from './UsuariosModal.js';
import {
  GraduationCap,
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
  Plus,
  LayoutDashboard,
  ClipboardList,
  Settings,
  UserCog,
  CalendarClock
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'proyecciones' | 'periodos' | 'profesores' | 'carga' | 'horarios'>('dashboard');
  const [horariosSubTab, setHorariosSubTab] = useState<HorariosSubTab>('horario');
  const [sagaConnected, setSagaConnected] = useState<boolean | null>(null);
  const [loadingSaga, setLoadingSaga] = useState(true);
  const [configMenuOpen, setConfigMenuOpen] = useState(false);
  const [usuariosModalOpen, setUsuariosModalOpen] = useState(false);

  useEffect(() => {
    const checkSagaStatus = async () => {
      setLoadingSaga(true);
      const res = await apiFetch('/saga/status');
      setSagaConnected(res.connected ?? res.success);
      setLoadingSaga(false);
    };
    checkSagaStatus();
  }, []);

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'SUPER_USUARIO':
        return <span className="inline-block whitespace-nowrap bg-purple-500/10 text-purple-300/80 border border-purple-500/20 text-[10px] px-3 py-0.5 rounded-full font-medium tracking-wide">Super Usuario</span>;
      case 'ADMINISTRADOR':
        return <span className="inline-block whitespace-nowrap bg-blue-500/10 text-blue-300/80 border border-blue-500/20 text-[10px] px-3 py-0.5 rounded-full font-medium tracking-wide">Administrador</span>;
      case 'REGULAR':
        return <span className="inline-block whitespace-nowrap bg-emerald-500/10 text-emerald-300/80 border border-emerald-500/20 text-[10px] px-3 py-0.5 rounded-full font-medium tracking-wide">Coordinador PNF</span>;
      case 'PROFESOR':
        return <span className="inline-block whitespace-nowrap bg-amber-500/10 text-amber-300/80 border border-amber-500/20 text-[10px] px-3 py-0.5 rounded-full font-medium tracking-wide">Docente</span>;
      default:
        return <span className="inline-block whitespace-nowrap bg-slate-700/60 text-slate-300/80 text-[10px] px-3 py-0.5 rounded-full font-medium tracking-wide">{role}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <nav className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left Brand */}
            <div className="flex items-center gap-3">
              <div
                onClick={() => setActiveTab('dashboard')}
                className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 cursor-pointer"
              >
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="font-bold text-white text-base tracking-tight cursor-pointer" onClick={() => setActiveTab('dashboard')}>
                  Proyecciones UPTLL
                </span>
                <span className="hidden sm:inline-block ml-2 text-xs text-slate-400">| Juana Ramírez</span>
              </div>
            </div>

            {/* Navigation Tabs */}
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
                onClick={() => setActiveTab('periodos')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'periodos' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Periodos Académicos</span>
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

            {/* Right Profile & Actions */}
            <div className="flex items-center gap-4">
              {/* SAGA Status Indicator */}
              <div className="hidden md:flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
                <Activity className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400">SAGA:</span>
                {loadingSaga ? (
                  <span className="text-amber-400 flex items-center gap-1"><Clock className="w-3 h-3 animate-spin" /> Verificando...</span>
                ) : sagaConnected ? (
                  <span className="text-emerald-400 flex items-center gap-1 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> En línea</span>
                ) : (
                  <span className="text-red-400 flex items-center gap-1 font-medium"><XCircle className="w-3.5 h-3.5" /> Desconectado</span>
                )}
              </div>

              {/* User badge */}
              <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
                <div className="hidden sm:block text-right">
                  <div className="text-sm font-semibold text-white leading-tight">
                    {user?.nombre} {user?.apellido}
                  </div>
                  <div className="mt-0.5">{getRoleBadge(user?.role)}</div>
                </div>

                {/* Configuración (solo Master) */}
                {user?.role === 'SUPER_USUARIO' && (
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
                          <div className="px-4 py-2.5 border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Configuración
                          </div>
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
                        </div>
                      </>
                    )}
                  </div>
                )}

                <button
                  onClick={logout}
                  title="Cerrar sesión"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-red-500/20 hover:text-red-300 text-slate-300 border border-slate-700/60 transition-colors cursor-pointer"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className={`flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 ${activeTab === 'carga' ? 'max-w-[1600px]' : 'max-w-7xl'}`}>
        {activeTab === 'periodos' ? (
          <PeriodosPage />
        ) : activeTab === 'profesores' ? (
          <ProfesoresPage />
        ) : activeTab === 'carga' ? (
          <CargaDocentePage />
        ) : activeTab === 'horarios' ? (
          <HorariosPage subTab={horariosSubTab} onSubTabChange={setHorariosSubTab} />
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
              </div>
            </div>

            {/* System Module Shortcut Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Proyecciones */}
              <div
                onClick={() => setActiveTab('proyecciones')}
                className="bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-5 transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-md">Módulo Principal</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Proyecciones</h3>
                <p className="text-xs text-slate-400 mb-4">Crear y gestionar proyecciones por PNF, trayecto y pensum.</p>
                <button
                  onClick={() => setActiveTab('proyecciones')}
                  className="w-full py-2.5 bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nueva Proyección</span>
                </button>
              </div>

              {/* Profesores */}
              <div
                onClick={() => setActiveTab('profesores')}
                className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Users className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md">Gestión Docente</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Profesores</h3>
                <p className="text-xs text-slate-400 mb-4">Registro, carga horaria, restricciones y asignación de materias.</p>
                <button
                  onClick={() => setActiveTab('profesores')}
                  className="w-full py-2.5 bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>Ver Docentes</span>
                </button>
              </div>

              {/* Aulas */}
              <div
                onClick={() => {
                  setHorariosSubTab('aulas');
                  setActiveTab('horarios');
                }}
                className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md">Espacios Físicos</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Aulas de Clase</h3>
                <p className="text-xs text-slate-400 mb-4">Catálogo de aulas, capacidades, laboratorios y estado.</p>
                <button
                  onClick={() => {
                    setHorariosSubTab('aulas');
                    setActiveTab('horarios');
                  }}
                  className="w-full py-2.5 bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>Gestionar Aulas</span>
                </button>
              </div>

              {/* PNFs y Mallas */}
              <div className="bg-slate-900/90 border border-slate-800 hover:border-purple-500/50 rounded-2xl p-5 transition-all group">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-semibold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-md">Pensums SAGA</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-1">PNFs & Mallas</h3>
                <p className="text-xs text-slate-400 mb-4">Consulta de mallas curriculares e inscritos desde SAGA.</p>
                <button className="w-full py-2.5 bg-slate-800 hover:bg-purple-600 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer">
                  <span>Consultar Pensums</span>
                </button>
              </div>
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
    </div>
  );
};

