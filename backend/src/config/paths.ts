import path from 'path';

// Raíz del backend resuelta desde la ubicación de ESTE archivo, no del cwd.
// Tanto en dev (src/config/) como compilado (dist/config/ — incluido el
// bundle build/backend/dist/config/) la profundidad es la misma, así que
// ../.. siempre cae en la raíz del backend. Esto permite arrancar con
// `node dist/server.js` desde cualquier directorio sin romper .env,
// public/, logs/ ni el frontend.
export const APP_ROOT = path.resolve(__dirname, '..', '..');
export const ENV_PATH = path.join(APP_ROOT, '.env');
export const PUBLIC_DIR = path.join(APP_ROOT, 'public');
export const PROFESORES_FOTOS_DIR = path.join(PUBLIC_DIR, 'profesores');
export const LOGS_DIR = path.join(APP_ROOT, 'logs');
export const FRONTEND_DIST = path.resolve(APP_ROOT, '..', 'frontend', 'dist');
