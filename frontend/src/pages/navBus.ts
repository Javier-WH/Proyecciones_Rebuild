// Canal de navegación profunda hacia el módulo de Horarios.
// `irAHorarios` guarda el destino en `pending` (por si HorariosPage aún no
// está montada) y además dispara un evento global (por si ya lo está).
export interface NavHorarios {
  vista: 'seccion' | 'aula' | 'profesor';
  id: number;
  lapso?: string; // 'TRIMESTRAL:1', 'SEMESTRAL:2'…
}

export const NAV_EVENT = 'proyecciones:nav-horarios';

export const navBus: { pending: NavHorarios | null } = { pending: null };

export const irAHorarios = (nav: NavHorarios) => {
  navBus.pending = nav;
  window.dispatchEvent(new CustomEvent<NavHorarios>(NAV_EVENT, { detail: nav }));
};

export const tomarNavPendiente = (): NavHorarios | null => {
  const n = navBus.pending;
  navBus.pending = null;
  return n;
};
