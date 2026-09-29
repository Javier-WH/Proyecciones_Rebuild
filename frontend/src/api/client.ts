const API_BASE = '/api';

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  connected?: boolean;
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
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
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        // Token expirado o inválido
        localStorage.removeItem('token');
        localStorage.removeItem('user');
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
  }
}
