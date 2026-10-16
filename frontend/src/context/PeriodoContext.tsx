import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from './AuthContext.js';

export interface Periodo {
  id: number;
  codigo: string;
  nombre: string;
  estado: 'PLANIFICACION' | 'ACTIVO' | 'CERRADO';
}

interface PeriodoContextType {
  // Periodos "en juego": el ACTIVO y los en PLANIFICACION (fuente: /periodos/activos)
  periodos: Periodo[];
  // Código del periodo de trabajo del usuario. Master/Coordinador pueden
  // haber elegido uno en planificación; el resto siempre es el activo.
  // null mientras carga o para el rol docente (el portal usa el activo).
  periodo: string | null;
  periodoInfo: Periodo | null;
  esPlanificacion: boolean;
  // Solo SUPER_USUARIO y ADMINISTRADOR pueden salir del periodo activo.
  puedeSeleccionar: boolean;
  loading: boolean;
  setPeriodo: (codigo: string) => void;
  refresh: () => Promise<void>;
}

const PeriodoContext = createContext<PeriodoContextType | undefined>(undefined);

// La selección es POR USUARIO: se persiste en localStorage con la clave
// del usuario, así cada quien trabaja en su propio periodo sin afectar al
// resto (otro usuario en otra sesión sigue viendo el periodo activo).
const claveStorage = (userId: number) => `periodo_sel_${userId}`;

export const PeriodoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodo, setPeriodoState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const puedeSeleccionar = user?.role === 'SUPER_USUARIO' || user?.role === 'ADMINISTRADOR';

  const refresh = useCallback(async () => {
    // El docente no gestiona periodos: su portal opera siempre con el activo.
    if (!user || user.role === 'PROFESOR') {
      setPeriodos([]);
      setPeriodoState(null);
      setLoading(false);
      return;
    }
    const res = await apiFetch<Periodo[]>('/periodos/activos', { silencioso: true });
    const lista = res.success && res.data ? res.data : [];
    setPeriodos(lista);

    const activo = lista.find((p) => p.estado === 'ACTIVO');
    // La selección guardada solo aplica si sigue existiendo como ACTIVO o
    // PLANIFICACION y el rol lo permite — si caducó (periodo cerrado o
    // eliminado) se cae al activo.
    const guardado = puedeSeleccionar ? localStorage.getItem(claveStorage(user.id)) : null;
    const valido = lista.some((p) => p.codigo === guardado);
    setPeriodoState(guardado && valido ? guardado : (activo?.codigo ?? null));
    setLoading(false);
  }, [user?.id, user?.role, puedeSeleccionar]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const setPeriodo = useCallback(
    (codigo: string) => {
      if (!puedeSeleccionar || !user) return;
      if (!periodos.some((p) => p.codigo === codigo)) return;
      localStorage.setItem(claveStorage(user.id), codigo);
      setPeriodoState(codigo);
    },
    [puedeSeleccionar, user, periodos]
  );

  const periodoInfo = periodos.find((p) => p.codigo === periodo) ?? null;
  const esPlanificacion = periodoInfo?.estado === 'PLANIFICACION';

  return (
    <PeriodoContext.Provider
      value={{
        periodos,
        periodo,
        periodoInfo,
        esPlanificacion,
        puedeSeleccionar,
        loading,
        setPeriodo,
        refresh,
      }}
    >
      {children}
    </PeriodoContext.Provider>
  );
};

export const usePeriodo = () => {
  const context = useContext(PeriodoContext);
  if (!context) {
    throw new Error('usePeriodo debe ser utilizado dentro de un PeriodoProvider');
  }
  return context;
};
