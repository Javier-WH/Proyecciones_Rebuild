import { buildApp } from './app.js';
import { env } from './config/env.js';
import { initializeDatabase } from './db/init.js';
import fs from 'fs';
import path from 'path';

async function startServer() {
  try {
    // Asegurar directorio public
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Inicializar tablas de MariaDB/MySQL
    try {
      await initializeDatabase();
    } catch (dbErr: any) {
      console.warn('⚠️  [Base de Datos] No se pudo establecer conexión inicial con MariaDB/MySQL.');
      console.warn(`    Detalle: ${dbErr.message || dbErr}`);
      console.warn('👉  Verifique credenciales en backend/.env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).');
    }

    const app = buildApp();

    await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`🚀 Servidor ejecutándose exitosamente en http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    console.error('❌ Error fatal al iniciar el servidor:', err);
    process.exit(1);
  }
}

startServer();
