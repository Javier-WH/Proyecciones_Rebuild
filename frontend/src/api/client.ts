const API_BASE = '/api';

// Endpoints cuyo 401 es una respuesta esperada del negocio (credenciales
// inválidas), no una sesión expirada.
const ENDPOINTS_SESION_OPCIONAL = /^\/auth\/(login|profesor-login|recover-password|recovery-questions)/;

// La app escucha este evento para cerrar sesión globalmente.
export const EVENTO_SESION_EXPIRADA = 'proyecciones:sesion-expirada';

// ── Indicador global de red ─────────────────────────────────────────────
// Contador de peticiones en curso + etiqueta de la última iniciada; el
// componente <IndicadorRed/> lo consume para mostrar la barra/velo de
// "esperando respuesta del servidor" sin tocar cada llamada.
export interface ApiOpciones extends RequestInit {
  etiqueta?: string;   // texto contextual p. ej. "Cambiando aula…"
  silencioso?: boolean; // fetchs de fondo: no disparan el indicador
}

let pendientes = 0;
let etiquetaActual: string | null = null;
const suscriptores = new Set<() => void>();

export function estadoRed() {
  return { pendientes, etiqueta: etiquetaActual };
}

export function suscribirRed(fn: () => void): () => void {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}

function notificarRed() {
  suscriptores.forEach((fn) => fn());
}

function iniciarPeticion(etiqueta?: string) {
  pendientes++;
  if (etiqueta) etiquetaActual = etiqueta;
  notificarRed();
}

function terminarPeticion() {
  pendientes = Math.max(0, pendientes - 1);
  if (pendientes === 0) etiquetaActual = null;
  notificarRed();
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  connected?: boolean;
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: ApiOpciones = {}
): Promise<ApiResponse<T>> {
  const { etiqueta, silencioso, ...fetchOptions } = options;
  if (!silencioso) iniciarPeticion(etiqueta);
  const token = localStorage.getItem('token');

  const headers: Record<string, string> = {
    // Fastify rechaza bodies JSON vacíos (FST_ERR_CTP_EMPTY_JSON_BODY):
    // solo enviar Content-Type cuando realmente hay body.
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        // Token expirado, revocado o inválido. Si había sesión activa y la
        // ruta no es de autenticación (un 401 en login solo significa
        // credenciales incorrectas), notificamos a la app para que cierre
        // sesión y muestre el aviso correspondiente.
        const habiaSesion = !!token;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (habiaSesion && !ENDPOINTS_SESION_OPCIONAL.test(endpoint)) {
          window.dispatchEvent(new CustomEvent(EVENTO_SESION_EXPIRADA));
        }
      }
      return {
        success: false,
        message: data.message || `Error HTTP ${response.status}`,
        data: data.data,
      };
    }

    return data;
  } catch (error) {
    console.error(`Error en apiFetch (${endpoint}):`, error);
    return {
      success: false,
      message: 'Fallo de conexión con el servidor backend.',
    };
  } finally {
    if (!silencioso) terminarPeticion();
  }
}
