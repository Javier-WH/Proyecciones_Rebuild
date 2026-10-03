import { apiFetch } from '../../api/client.js';

// Materia del catálogo global (SAGA): nombre + de qué PNF/malla/trayecto viene.
// Los IDs de SAGA permiten reconstruir el árbol PNF→malla→trayecto→materia.
export interface MateriaOpcion {
  nombre: string;
  pnf: string;
  maya: string;
  trayecto: string;
  pnf_saga_id?: number;
  maya_id?: number;
  trayecto_saga_id?: number;
  horas?: number;
  materia_id?: number;
}

// Caché en memoria del catálogo global de materias (se pierde al recargar la
// página). La app lo precarga en segundo plano al iniciar sesión; mientras no
// esté listo, las vistas que lo usan muestran su loading normal.
let catalogoCache: MateriaOpcion[] | null = null;
let catalogoPromise: Promise<MateriaOpcion[]> | null = null;

export const precargarCatalogoMaterias = (): Promise<MateriaOpcion[]> => {
  if (catalogoCache) return Promise.resolve(catalogoCache);
  catalogoPromise ??= apiFetch<MateriaOpcion[]>('/horarios/materias')
    .then((r) => (catalogoCache = r.success && r.data ? r.data : []))
    .catch(() => {
      catalogoPromise = null; // permite reintentar la próxima vez
      return [] as MateriaOpcion[];
    });
  return catalogoPromise;
};

// Devuelve el catálogo ya cacheado (o null si aún no está listo)
export const catalogoMateriasListo = () => catalogoCache;

// Invalida el caché para forzar una recarga desde SAGA la próxima vez
export const invalidarCatalogoMaterias = () => {
  catalogoCache = null;
  catalogoPromise = null;
};
