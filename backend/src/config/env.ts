import dotenv from 'dotenv';
import { ENV_PATH } from './paths.js';

dotenv.config({ path: ENV_PATH });

const NODE_ENV = process.env.NODE_ENV || 'development';
const esProduccion = NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || '';

// En producción el secreto JWT es obligatorio: firmar tokens con un secreto
// público (el default de desarrollo) permitiría forjar sesiones de Master.
if (esProduccion && !JWT_SECRET) {
  throw new Error(
    'JWT_SECRET no está configurado. Defínalo en backend/.env antes de ' +
      'arrancar en producción (ej: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))").'
  );
}
if (!esProduccion && !JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET no definido: usando secreto de desarrollo (no usar en producción).');
}
if (!process.env.API_USER || !process.env.API_PASSWORD) {
  console.warn('⚠️  API_USER/API_PASSWORD no definidos: usando credenciales SAGA por defecto.');
}

export const env = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV,
  get esProduccion() {
    return esProduccion;
  },
  JWT_SECRET: JWT_SECRET || 'uptll_juana_ramirez_secret_jwt_2026',

  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: parseInt(process.env.DB_PORT || '3306', 10),
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
  DB_NAME: process.env.DB_NAME || 'proyecciones_uptll',

  API_URL: process.env.API_URL || 'http://127.0.0.1:8000/api/v1',
  API_USER: process.env.API_USER || 'defaultAdmin',
  API_PASSWORD: process.env.API_PASSWORD || '123456789',

  // Clave para integraciones externas (app de asistencias, etc.)
  // Sin default: si está vacía, /api/externo responde 503.
  EXTERNAL_API_KEY: process.env.EXTERNAL_API_KEY || '',

  // Orígenes con acceso a la API (además de requests same-origin, que no
  // llevan header Origin). Lista separada por comas; en desarrollo se
  // permite el Vite dev-server por defecto.
  CORS_ORIGINS: (process.env.CORS_ORIGINS ??
    (esProduccion ? '' : 'http://localhost:3000,http://127.0.0.1:3000'))
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};
