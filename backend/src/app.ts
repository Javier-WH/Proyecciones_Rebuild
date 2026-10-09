import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import path from 'path';
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

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  // 1. Plugins
  app.register(cors, {
    origin: true,
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

  return app;
}
