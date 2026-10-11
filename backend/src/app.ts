import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { env } from './config/env.js';
import { query } from './db/mysql.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { sagaRoutes } from './modules/saga/saga.routes.js';
import { proyeccionesRoutes } from './modules/proyecciones/proyecciones.routes.js';
import { periodosRoutes } from './modules/periodos/periodos.routes.js';
import { profesoresRoutes } from './modules/profesores/profesores.routes.js';
import { perfilesRoutes } from './modules/perfiles/perfiles.routes.js';
import { usuariosRoutes } from './modules/usuarios/usuarios.routes.js';
import { horariosRoutes } from './modules/horarios/horarios.routes.js';
import { reportesRoutes } from './modules/reportes/reportes.routes.js';
import { externoRoutes } from './modules/externo/externo.routes.js';
import { auditoriaRoutes } from './modules/auditoria/auditoria.routes.js';
import { buscarRoutes } from './modules/buscar/buscar.routes.js';

export function buildApp() {
  const app = Fastify({
    logger: true,
    // El token va en header Authorization — la clave API externa también.
    // Confiar en el primer salto de proxy (X-Forwarded-For) si el deploy lo
    // coloca detrás de un reverse proxy.
    trustProxy: true,
  });

  // 1. Plugins
  // Headers de seguridad básicos (nosniff, X-Frame-Options, HSTS si HTTPS).
  // CSP queda desactivada: la SPA usa estilos inline y documentos generados
  // por iframe para impresión; configurar una política compatible queda
  // como mejora futura.
  app.register(helmet, { contentSecurityPolicy: false });

  // Rate limit global permisivo; las rutas de autenticación lo endurecen
  // por ruta (ver auth.routes.ts).
  app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      message: 'Demasiadas solicitudes. Espere un momento e intente de nuevo.',
    }),
  });

  // CORS: mismo origen (sin header Origin) + la lista CORS_ORIGINS del .env.
  // El frontend se sirve por el mismo proceso en producción, así que la
  // lista puede quedar vacía allí; en dev está el Vite dev-server.
  const origenes = new Set(env.CORS_ORIGINS);
  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || origenes.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  });

  app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  // 2. Archivos públicos estáticos
  const publicPath = path.join(process.cwd(), 'public');
  app.register(fastifyStatic, {
    root: publicPath,
    prefix: '/public/',
  });

  // 2b. En producción el mismo proceso sirve la SPA compilada
  // (frontend/dist) si existe — así el deploy es un solo proceso:
  // `npm run build` (frontend) + `node dist/server.js` (backend).
  // Las rutas que no son /api ni /public devuelven index.html (SPA).
  const distPath = path.resolve(process.cwd(), '..', 'frontend', 'dist');
  const indexHtml = path.join(distPath, 'index.html');
  const servirFrontend =
    process.env.SERVE_FRONTEND !== '0' && fs.existsSync(indexHtml);
  if (servirFrontend) {
    // decorateReply:false — 'sendFile' ya lo agregó el registro de /public/
    // y repetirlo lanza FST_ERR_DEC_ALREADY_PRESENT. Además ese decorador
    // resolvería contra publicPath, así que el fallback SPA envía el
    // index.html leído en memoria.
    app.register(fastifyStatic, {
      root: distPath,
      prefix: '/',
      decorateReply: false,
    });
    const indexBuffer = fs.readFileSync(indexHtml);
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api') || request.raw.url?.startsWith('/public')) {
        return reply.status(404).send({ success: false, message: 'Ruta no encontrada.' });
      }
      return reply.type('text/html; charset=utf-8').send(indexBuffer);
    });
    app.log.info(`Sirviendo frontend desde ${distPath}`);
  }

  // 3. Health check (incluye ping a la base de datos)
  app.get('/api/health', async (_request, reply) => {
    let db: 'up' | 'down' = 'up';
    try {
      await query('SELECT 1');
    } catch {
      db = 'down';
    }
    const body = {
      status: db === 'up' ? 'OK' : 'DEGRADED',
      system: 'Proyecciones Académicas UPTLL Juana Ramírez',
      db,
      timestamp: new Date().toISOString(),
    };
    return reply.status(db === 'up' ? 200 : 503).send(body);
  });

  // 4. Módulos / Rutas API
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(sagaRoutes, { prefix: '/api/saga' });
  app.register(proyeccionesRoutes, { prefix: '/api/proyecciones' });
  app.register(periodosRoutes, { prefix: '/api/periodos' });
  app.register(profesoresRoutes, { prefix: '/api/profesores' });
  app.register(perfilesRoutes, { prefix: '/api/perfiles' });
  app.register(usuariosRoutes, { prefix: '/api/usuarios' });
  app.register(horariosRoutes, { prefix: '/api/horarios' });
  app.register(reportesRoutes, { prefix: '/api/reportes' });
  app.register(externoRoutes, { prefix: '/api/externo' });
  app.register(auditoriaRoutes, { prefix: '/api/auditoria' });
  app.register(buscarRoutes, { prefix: '/api/buscar' });

  return app;
}
