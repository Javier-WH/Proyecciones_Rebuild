import { apiFetch } from '../api/client.js';

// Encabezados de reporte persistidos en BD (tabla reportes_plantillas,
// una fila por clave de reporte). getEncabezado devuelve null si no hay
// plantilla guardada o si la petición falla → el reporte usa su default.
export const getEncabezado = async (reporte: string): Promise<string[] | null> => {
  const res = await apiFetch<{ reporte: string; encabezado: string[] | null }>(
    `/reportes/plantilla/${reporte}`
  );
  return res.success && Array.isArray(res.data?.encabezado) ? res.data!.encabezado : null;
};

export const saveEncabezado = async (reporte: string, encabezado: string[]): Promise<void> => {
  await apiFetch(`/reportes/plantilla/${reporte}`, {
    method: 'PUT',
    body: JSON.stringify({ encabezado }),
  });
};
