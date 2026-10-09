import React from 'react';
import { X, Check, ShieldCheck, Ban } from 'lucide-react';

type Rol = 'SUPER_USUARIO' | 'ADMINISTRADOR' | 'REGULAR' | 'PROFESOR';

interface PermisoInfo {
  titulo: string;
  resumen: string;
  puede: string[];
  noPuede: string[];
}

const PERMISOS: Record<Rol, PermisoInfo> = {
  SUPER_USUARIO: {
    titulo: 'Master',
    resumen: 'Acceso total al sistema, sin restricciones.',
    puede: [
      'Todo lo que pueden hacer los demás roles',
      'Crear, editar y eliminar periodos académicos',
      'Gestionar proyecciones, horarios y carga docente de cualquier PNF',
      'Gestionar docentes y catálogos (aulas, turnos, contratos, perfiles)',
      'Administrar usuarios y niveles de permiso',
      'Imprimir y exportar cualquier reporte',
      'Editar los encabezados de los reportes',
    ],
    noPuede: [],
  },
  ADMINISTRADOR: {
    titulo: 'Coordinador',
    resumen: 'Ve todo el sistema, pero solo puede editar lo de su PNF asociado.',
    puede: [
      'Ver toda la información del sistema',
      'Imprimir y exportar cualquier reporte',
      'Crear, editar y eliminar proyecciones de su PNF',
      'Editar horarios de su PNF',
      'Asignar materias de su PNF a cualquier docente',
      'Quitar materias de otro PNF cuando el docente es de su PNF',
      'Gestionar docentes de su PNF (datos, foto, perfiles, disponibilidad)',
      'Editar catálogos globales: aulas, turnos, contratos y perfiles',
      'Editar los encabezados de los reportes',
    ],
    noPuede: [
      'Crear, editar o eliminar periodos académicos',
      'Modificar proyecciones, horarios o docentes de otros PNF',
      'Asignar materias de otro PNF',
      'Administrar usuarios',
    ],
  },
  REGULAR: {
    titulo: 'Usuario',
    resumen: 'Solo lectura: puede consultar todo el sistema sin modificar nada.',
    puede: [
      'Ver proyecciones, horarios, carga docente y catálogos',
      'Imprimir y exportar reportes',
      'Consultar la disponibilidad y datos de los docentes',
    ],
    noPuede: [
      'Crear, editar o eliminar cualquier dato',
      'Editar los encabezados de los reportes',
      'Administrar usuarios',
    ],
  },
  PROFESOR: {
    titulo: 'Docente',
    resumen: 'Portal propio: consulta su horario y gestiona solo su disponibilidad.',
    puede: [
      'Consultar su horario y su carga docente',
      'Imprimir su horario',
      'Marcar su propia disponibilidad horaria',
    ],
    noPuede: [
      'Ver o editar datos de otros docentes',
      'Acceder a la administración del sistema',
      'Editar los encabezados de los reportes',
      'Crear o modificar proyecciones u horarios',
    ],
  },
};

export const PermisosRolModal: React.FC<{ role?: string; onClose: () => void }> = ({
  role,
  onClose,
}) => {
  const info = PERMISOS[role as Rol];
  if (!info) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 shrink-0 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            Permisos: {info.titulo}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">{info.resumen}</p>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1.5">
              Puede hacer
            </p>
            <ul className="space-y-1">
              {info.puede.map((p) => (
                <li key={p} className="flex items-start gap-2 text-xs text-slate-300">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          {info.noPuede.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-1.5">
                No puede hacer
              </p>
              <ul className="space-y-1">
                {info.noPuede.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-xs text-slate-400">
                    <Ban className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
