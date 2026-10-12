import { buildApp } from './app.js';
import { env } from './config/env.js';
import { initializeDatabase } from './db/init.js';
import { query } from './db/mysql.js';
import { limpiarLogsViejos, registrarExcepcion } from './utils/errorLog.js';
import fs from 'fs';
import path from 'path';

// Errores fuera del ciclo request/response también caen al archivo del día;
// en uncaughtException PM2 reiniciará el proceso tras registrar el fallo.
process.on('unhandledRejection', (err) =>
  registrarExcepcion('UNHANDLED_REJECTION', err)
);
process.on('uncaughtException', (err) =>
  registrarExcepcion('UNCAUGHT_EXCEPTION', err)
);

async function startServer() {
  try {
    // Rotación de logs de error: conserva 30 días (logs/YYYY-MM-DD.log)
    limpiarLogsViejos();

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

    // Coherencia del reloj: el servidor puede perder la hora en reinicios
    // por fallos eléctricos (RTC viejo). Con reloj atrasado pero monótono
    // el sistema sigue operando (los JWT se firman y verifican contra el
    // mismo reloj, e 'iat' futuro no se rechaza); avisamos solo si la fecha
    // es imposible o si MySQL (que estampa la auditoría y purga tokens
    // revocados con NOW()) difiere del reloj del proceso.
    const anioSistema = new Date().getFullYear();
    if (anioSistema < 2025) {
      console.warn(`⚠️  [Reloj] La fecha del sistema es ${anioSistema}: el reloj probablemente se perdió tras un reinicio.`);
      console.warn('    La app seguirá funcionando, pero auditoría y reportes mostrarán esa fecha.');
      console.warn('    Corrija con: sudo timedatectl set-ntp true  (o instale fake-hwclock si no hay NTP).');
    }
    try {
      const rows = await query<any[]>('SELECT UNIX_TIMESTAMP() AS db_ts');
      const difMs = Math.abs(Number(rows[0]?.db_ts ?? 0) * 1000 - Date.now());
      if (difMs > 5 * 60_000) {
        console.warn(`⚠️  [Reloj] El reloj de MySQL difiere del del servidor en ${Math.round(difMs / 60000)} min.`);
        console.warn('    Las marcas de auditoría y la expiración de tokens pueden desincronizarse.');
      }
    } catch {
      /* sin conexión a BD ya se avisó arriba */
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
