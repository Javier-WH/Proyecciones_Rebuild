import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from './AuthContext.js';

export interface PnfCatalogItem {
  id: number; // saga_id del PNF
  nombre: string;
  color: string | null;
}

interface PnfColorContextType {
  // Mapa pnf_saga_id -> color '#RRGGBB' (solo los que tienen color asignado)
  pnfColors: Record<number, string>;
  // Atajo: devuelve el color del PNF o null si no tiene
  colorDePnf: (pnfSagaId: number | null | undefined) => string | null;
  catalogo: PnfCatalogItem[];
  refresh: () => Promise<void>;
}

const PnfColorContext = createContext<PnfColorContextType | undefined>(undefined);

export const PnfColorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [catalogo, setCatalogo] = useState<PnfCatalogItem[]>([]);

  const refresh = useCallback(async () => {
    const res = await apiFetch<PnfCatalogItem[]>('/horarios/pnfs');
    if (res.success && res.data) setCatalogo(res.data);
  }, []);

  useEffect(() => {
    // Solo cargar cuando hay sesión activa
    if (user) refresh();
    else setCatalogo([]);
  }, [user, refresh]);

  const pnfColors = useMemo(() => {
    const m: Record<number, string> = {};
    for (const p of catalogo) if (p.color) m[p.id] = p.color;
    return m;
  }, [catalogo]);

  const colorDePnf = useCallback(
    (pnfSagaId: number | null | undefined) => (pnfSagaId == null ? null : pnfColors[pnfSagaId] ?? null),
    [pnfColors]
  );

  return (
    <PnfColorContext.Provider value={{ pnfColors, colorDePnf, catalogo, refresh }}>
      {children}
    </PnfColorContext.Provider>
  );
};

export const usePnfColors = () => {
  const ctx = useContext(PnfColorContext);
  if (!ctx) throw new Error('usePnfColors debe ser utilizado dentro de un PnfColorProvider');
  return ctx;
};
