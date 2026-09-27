import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { hashPassword } from '../utils/security.js';

export async function initializeDatabase() {
  console.log('🔄 Verificando e inicializando base de datos MySQL/MariaDB...');
  
  // 1. Conexión sin especificar base de datos para asegurarnos de que la BD existe
  const tempConnection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  });

  await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await tempConnection.end();

  // 2. Conectar a la base de datos recién creada/existente
  const db = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  // 3. Crear tabla de Usuarios
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      nombre VARCHAR(150) NOT NULL,
      apellido VARCHAR(150) NOT NULL,
      email VARCHAR(150) NULL UNIQUE,
      role ENUM('SUPER_USUARIO', 'ADMINISTRADOR', 'REGULAR', 'PROFESOR') NOT NULL DEFAULT 'REGULAR',
      pnf_saga_id INT NULL,
      profesor_cedula VARCHAR(50) NULL,
      activo TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_username (username),
      INDEX idx_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 4. Crear tabla de PNFs
  await db.query(`
    CREATE TABLE IF NOT EXISTS pnf (
      id INT AUTO_INCREMENT PRIMARY KEY,
      saga_id INT UNIQUE NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      codigo VARCHAR(50) NULL,
      tipo ENUM('TRIMESTRAL', 'SEMESTRAL') DEFAULT 'TRIMESTRAL',
      activo TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_saga_id (saga_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 5. Crear tabla de Trayectos
  await db.query(`
    CREATE TABLE IF NOT EXISTS trayectos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      saga_id INT UNIQUE NOT NULL,
      nombre VARCHAR(100) NOT NULL,
      orden INT DEFAULT 1,
      INDEX idx_saga_id (saga_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 6. Crear tabla de Turnos
  await db.query(`
    CREATE TABLE IF NOT EXISTS turnos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      saga_id INT UNIQUE NOT NULL,
      nombre VARCHAR(50) NOT NULL,
      INDEX idx_saga_id (saga_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 6b. Tabla de Periodos Académicos
  await db.query(`
    CREATE TABLE IF NOT EXISTS periodos_academicos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(50) UNIQUE NOT NULL,
      nombre VARCHAR(150) NOT NULL,
      fecha_inicio DATE NULL,
      fecha_fin DATE NULL,
      estado ENUM('PLANIFICACION', 'ACTIVO', 'CERRADO') DEFAULT 'ACTIVO',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_estado (estado)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Insertar periodo inicial por defecto si la tabla está vacía
  const [existingPeriodos] = await db.query<any[]>('SELECT id FROM periodos_academicos LIMIT 1');
  if (existingPeriodos.length === 0) {
    await db.query(`
      INSERT INTO periodos_academicos (codigo, nombre, estado) 
      VALUES ('2026-1', 'Periodo Académico I - 2026', 'ACTIVO')
    `);
    console.log('✅ Periodo académico inicial por defecto creado: 2026-1');
  }

  // 7. Crear tabla de Proyecciones Académicas
  await db.query(`
    CREATE TABLE IF NOT EXISTS proyecciones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(100) UNIQUE NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      periodo_id INT NULL,
      pnf_saga_id INT NOT NULL,
      pnf_nombre VARCHAR(255) NOT NULL DEFAULT '',
      trayecto_saga_id INT NOT NULL,
      trayecto_nombre VARCHAR(100) NOT NULL DEFAULT '',
      maya_id INT NOT NULL,
      maya_descripcion VARCHAR(255) NOT NULL DEFAULT '',
      periodo_academico VARCHAR(50) NOT NULL,
      tipo_proyeccion ENUM('TRIMESTRAL', 'SEMESTRAL') DEFAULT 'TRIMESTRAL',
      activa TINYINT(1) DEFAULT 1,
      creado_por INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (creado_por) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_pnf_activa (pnf_saga_id, activa)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 7b. Tabla de Materias asociadas a una Proyección
  // seccion_id NULL = materia general (aplica a todas las secciones);
  // con valor = materia exclusiva de esa sección (pensum/malla diferente)
  await db.query(`
    CREATE TABLE IF NOT EXISTS proyeccion_materias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      proyeccion_id INT NOT NULL,
      seccion_id INT NULL,
      subject_saga_id INT NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      horas_totales INT NOT NULL DEFAULT 0,
      horas_semanales INT NOT NULL DEFAULT 0,
      q1 TINYINT(1) DEFAULT 0,
      q2 TINYINT(1) DEFAULT 0,
      q3 TINYINT(1) DEFAULT 0,
      semestre1 TINYINT(1) DEFAULT 0,
      semestre2 TINYINT(1) DEFAULT 0,
      eliminada TINYINT(1) DEFAULT 0,
      FOREIGN KEY (proyeccion_id) REFERENCES proyecciones(id) ON DELETE CASCADE,
      INDEX idx_proyeccion (proyeccion_id),
      INDEX idx_seccion (seccion_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 7c. Tabla de Secciones asociadas a una Proyección
  // maya_id NULL = la sección usa el pensum general de la proyección
  await db.query(`
    CREATE TABLE IF NOT EXISTS proyeccion_secciones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      proyeccion_id INT NOT NULL,
      nombre VARCHAR(100) NOT NULL,
      turno_saga_id INT NOT NULL DEFAULT 0,
      turno_nombre VARCHAR(50) NOT NULL,
      estudiantes_estimados INT DEFAULT 0,
      maya_id INT NULL,
      maya_descripcion VARCHAR(255) NULL,
      congelada TINYINT(1) DEFAULT 0,
      FOREIGN KEY (proyeccion_id) REFERENCES proyecciones(id) ON DELETE CASCADE,
      INDEX idx_proyeccion (proyeccion_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Migraciones idempotentes (se ejecutan DESPUÉS de crear las tablas base).
  // Nota: 'ADD COLUMN IF NOT EXISTS' solo existe en MariaDB; en MySQL se verifica
  // primero en information_schema para que la migración funcione en ambos motores.
  const columnasProyecciones: Array<{ nombre: string; definicion: string }> = [
    { nombre: 'periodo_id', definicion: "INT NULL AFTER nombre" },
    { nombre: 'pnf_nombre', definicion: "VARCHAR(255) NOT NULL DEFAULT '' AFTER pnf_saga_id" },
    { nombre: 'trayecto_nombre', definicion: "VARCHAR(100) NOT NULL DEFAULT '' AFTER trayecto_saga_id" },
    { nombre: 'maya_descripcion', definicion: "VARCHAR(255) NOT NULL DEFAULT '' AFTER maya_id" },
    { nombre: 'tipo_proyeccion', definicion: "ENUM('TRIMESTRAL','SEMESTRAL') DEFAULT 'TRIMESTRAL' AFTER periodo_academico" },
  ];
  for (const col of columnasProyecciones) {
    const [existe] = await db.query<any[]>(
      `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'proyecciones' AND COLUMN_NAME = ?`,
      [env.DB_NAME, col.nombre]
    );
    if (existe[0].total === 0) {
      await db.query(`ALTER TABLE proyecciones ADD COLUMN ${col.nombre} ${col.definicion}`);
      console.log(`✅ Columna '${col.nombre}' agregada a la tabla proyecciones`);
    }
  }

  // Migraciones de tablas relacionadas (misma técnica portable MySQL/MariaDB)
  const columnasExtra: Array<{ tabla: string; nombre: string; definicion: string }> = [
    { tabla: 'proyeccion_secciones', nombre: 'maya_id', definicion: 'INT NULL AFTER estudiantes_estimados' },
    { tabla: 'proyeccion_secciones', nombre: 'maya_descripcion', definicion: 'VARCHAR(255) NULL AFTER maya_id' },
    { tabla: 'proyeccion_materias', nombre: 'seccion_id', definicion: 'INT NULL AFTER proyeccion_id' },
    { tabla: 'proyeccion_materias', nombre: 'eliminada', definicion: 'TINYINT(1) DEFAULT 0 AFTER semestre2' },
  ];
  for (const col of columnasExtra) {
    const [existe] = await db.query<any[]>(
      `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [env.DB_NAME, col.tabla, col.nombre]
    );
    if (existe[0].total === 0) {
      await db.query(`ALTER TABLE ${col.tabla} ADD COLUMN ${col.nombre} ${col.definicion}`);
      console.log(`✅ Columna '${col.nombre}' agregada a la tabla ${col.tabla}`);
    }
  }

  // 8. Crear tabla de Aulas de Clase
  await db.query(`
    CREATE TABLE IF NOT EXISTS aulas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(50) UNIQUE NOT NULL,
      nombre VARCHAR(150) NOT NULL,
      capacidad INT DEFAULT 30,
      ubicacion VARCHAR(150) NULL,
      tipo ENUM('AULA_REGULAR', 'LABORATORIO', 'TALLER', 'AUDITORIO') DEFAULT 'AULA_REGULAR',
      activa TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 9a. Tabla de Tipos de Contrato (dedicación docente)
  // saga_id corresponde a dedicacion_id de SAGA; NULL = tipo creado localmente.
  // horas_semanales: carga horaria semanal que el contrato le otorga al profesor.
  await db.query(`
    CREATE TABLE IF NOT EXISTS tipos_contrato (
      id INT AUTO_INCREMENT PRIMARY KEY,
      saga_id INT NULL UNIQUE,
      nombre VARCHAR(100) NOT NULL,
      descripcion VARCHAR(255) NULL,
      horas_semanales INT NOT NULL DEFAULT 40,
      activo TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_saga_id (saga_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Sembrar tipos de contrato base si la tabla está vacía (editables desde la app)
  const [existingTipos] = await db.query<any[]>('SELECT id FROM tipos_contrato LIMIT 1');
  if (existingTipos.length === 0) {
    await db.query(
      `INSERT INTO tipos_contrato (nombre, descripcion, horas_semanales) VALUES
       ('Tiempo Completo', 'Dedicación exclusiva de tiempo completo', 40),
       ('Medio Tiempo', 'Dedicación de medio tiempo', 20),
       ('Tiempo Convencional', 'Dedicación por horas convencionales', 16)`
    );
    console.log('✅ Tipos de contrato base creados (Tiempo Completo, Medio Tiempo, Tiempo Convencional)');
  }

  // 9b. Tabla de Profesores (sincronizada con SAGA por cedula / saga_id)
  // origen = 'SAGA' proviene de la API externa; 'LOCAL' fue inscrito solo en la app.
  await db.query(`
    CREATE TABLE IF NOT EXISTS profesores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      saga_id INT NULL,
      cedula VARCHAR(30) NOT NULL UNIQUE,
      nombres VARCHAR(150) NOT NULL,
      apellidos VARCHAR(150) NOT NULL,
      nacionalidad VARCHAR(5) NOT NULL DEFAULT 'V',
      sexo VARCHAR(20) NULL,
      email VARCHAR(150) NULL,
      telefono VARCHAR(50) NULL,
      pnf_saga_id INT NULL,
      pnf_nombre VARCHAR(255) NOT NULL DEFAULT '',
      tipo_contrato_id INT NULL,
      foto_url VARCHAR(255) NULL,
      origen ENUM('SAGA', 'LOCAL') NOT NULL DEFAULT 'LOCAL',
      ultima_sincronizacion TIMESTAMP NULL,
      activo TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tipo_contrato_id) REFERENCES tipos_contrato(id) ON DELETE SET NULL,
      INDEX idx_cedula (cedula),
      INDEX idx_saga_id (saga_id),
      INDEX idx_pnf (pnf_saga_id),
      INDEX idx_activo (activo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 9c. Tabla de Asignaciones: qué profesor dicta cada materia en cada sección/lapso
  // La ausencia de fila = materia sin asignar. trimestre: 1..3 (trimestral) o 1..2 (semestral)
  await db.query(`
    CREATE TABLE IF NOT EXISTS proyeccion_asignaciones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      proyeccion_id INT NOT NULL,
      materia_id INT NOT NULL,
      seccion_id INT NOT NULL,
      trimestre TINYINT NOT NULL DEFAULT 1,
      profesor_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_asignacion (materia_id, seccion_id, trimestre),
      FOREIGN KEY (proyeccion_id) REFERENCES proyecciones(id) ON DELETE CASCADE,
      FOREIGN KEY (materia_id) REFERENCES proyeccion_materias(id) ON DELETE CASCADE,
      FOREIGN KEY (seccion_id) REFERENCES proyeccion_secciones(id) ON DELETE CASCADE,
      FOREIGN KEY (profesor_id) REFERENCES profesores(id) ON DELETE CASCADE,
      INDEX idx_proyeccion (proyeccion_id),
      INDEX idx_profesor (profesor_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 10. Verificar y crear usuario Super Usuario por defecto (admin / admin123)
  const [existingUsers] = await db.query<any[]>('SELECT id FROM users WHERE username = ?', ['admin']);
  if (existingUsers.length === 0) {
    const hashedPassword = await hashPassword('admin123');
    await db.query(
      `INSERT INTO users (username, password, nombre, apellido, email, role, activo) 
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      ['admin', hashedPassword, 'Administrador', 'Principal', 'admin@uptll.edu.ve', 'SUPER_USUARIO']
    );
    console.log('✅ Usuario por defecto creado: admin / admin123 (SUPER_USUARIO)');
  } else {
    console.log('ℹ️ Usuario admin existente en base de datos.');
  }

  await db.end();
  console.log('✅ Base de datos e índices inicializados correctamente.');
}

// Ejecutar init si es invocado directamente por CLI
if (process.argv[1] && process.argv[1].endsWith('init.ts')) {
  (async () => {
    try {
      await initializeDatabase();
    } catch (err: any) {
      console.error('⚠️  No se pudo conectar con la base de datos MariaDB/MySQL:');
      console.error(`    Detalle: ${err.message || err}`);
      console.error('👉  Asegúrate de configurar correctamente las variables DB_HOST, DB_PORT, DB_USER y DB_PASSWORD en backend/.env');
      process.exit(1);
    }
  })();
}
