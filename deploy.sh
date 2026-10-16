#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  Build de deploy — Sistema de Proyecciones Académicas UPTLL
#
#  Uso:   ./deploy.sh        (o: npm run build desde la raíz del repo)
#
#  Genera ./build/ — un paquete AUTOSUFICIENTE listo para copiar al
#  servidor (incluye node_modules de producción: no hace falta npm
#  install en el destino):
#
#    build/
#      backend/
#        dist/              backend compilado (tsc)
#        node_modules/      solo dependencias de producción (npm ci --omit=dev)
#        public/            archivos estáticos (fotos de profesores, etc.)
#        package.json
#        .env               ← se edita en el servidor (preservarlo al actualizar)
#        ecosystem.config.js  config lista para pm2
#      frontend/
#        dist/              SPA compilada (vite build)
#
#  En el servidor:
#    1. Editar build/backend/.env (DB, SAGA, etc.)
#    2. cd build/backend && pm2 start ecosystem.config.js && pm2 save
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$ROOT/build"
cd "$ROOT"

command -v node >/dev/null 2>&1 || { echo "ERROR: node no está instalado." >&2; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "ERROR: npm no está instalado." >&2; exit 1; }

# Instala dependencias solo si falta node_modules. Prefiere 'npm ci'
# (reproducible, usa el lockfile commiteado) y cae a 'npm install' si el
# lockfile no existe, para no romper el build en clones incompletos.
instalar_deps() {
  [ -d node_modules ] && return 0
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
}

# ── 1. Frontend: instalar (si hace falta) y compilar ─────────────────────
echo "==> [1/5] Frontend: dependencias + build..."
cd "$ROOT/frontend"
instalar_deps
npm run build

# ── 2. Backend: instalar (si hace falta) y compilar ──────────────────────
echo "==> [2/5] Backend: dependencias + build..."
cd "$ROOT/backend"
instalar_deps
npm run build

# ── 3. Armar el bundle ───────────────────────────────────────────────────
echo "==> [3/5] Armando build/ ..."
rm -rf "$BUILD"
mkdir -p "$BUILD/backend" "$BUILD/frontend"

cp -r "$ROOT/backend/dist"         "$BUILD/backend/dist"
cp    "$ROOT/backend/package.json" "$BUILD/backend/"
# El lockfile viaja al bundle para que el 'npm ci' del paso 4 sea
# reproducible. Si no existe (clon sin npm install previo) no abortamos:
# el bundle cae a 'npm install'.
if [ -f "$ROOT/backend/package-lock.json" ]; then
  cp "$ROOT/backend/package-lock.json" "$BUILD/backend/"
else
  echo "  AVISO: backend/package-lock.json no existe — el bundle usará 'npm install'."
fi
# public/ es un directorio de runtime (fotos de profesores, logo): su
# contenido está gitignored y puede no existir en un clon fresco. El
# servidor también lo crea al arrancar si falta.
mkdir -p "$ROOT/backend/public"
cp -r "$ROOT/backend/public"    "$BUILD/backend/public"
cp -r "$ROOT/frontend/dist"     "$BUILD/frontend/dist"

# ── 4. node_modules de producción DENTRO del bundle ──────────────────────
# El servidor no puede correr npm install: las dependencias de producción
# se instalan aquí (misma plataforma linux) y viajan con el paquete.
echo "==> [4/5] Instalando dependencias de producción en el bundle..."
cd "$BUILD/backend"
if [ -f package-lock.json ]; then
  npm ci --omit=dev --no-audit --no-fund
else
  npm install --omit=dev --no-audit --no-fund
fi

# Los módulos nativos (binarios .node) NO son portables entre plataformas.
# Hoy todas las dependencias son JS puro, pero si se agrega una nativa el
# bundle debe compilarse en la misma plataforma del servidor (o en CI).
if find "$BUILD/backend/node_modules" -name '*.node' -print -quit 2>/dev/null | grep -q .; then
  echo ""
  echo "  ⚠️  AVISO: el bundle contiene módulos nativos compilados para"
  echo "      $(uname -s)/$(uname -m). Solo funcionará si el servidor usa"
  echo "      la misma plataforma y arquitectura."
fi

# ── 5. .env + ecosystem.config.js ────────────────────────────────────────
echo "==> [5/5] Generando .env y ecosystem.config.js..."

# Si ya había un .env dentro de un build anterior lo reutilizamos no aplica
# (rm -rf lo borró); se genera desde .env.example con JWT_SECRET aleatorio
# para que producción arranque sin configuración extra.
cp "$ROOT/backend/.env.example" "$BUILD/backend/.env"
JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$JWT/" "$BUILD/backend/.env"

cat > "$BUILD/backend/ecosystem.config.js" <<'EOF'
module.exports = {
  apps: [
    {
      name: 'proyecciones',
      script: 'dist/server.js',
      // IMPORTANTE: el backend resuelve ../frontend/dist y ./public
      // desde el cwd — debe apuntar a esta carpeta backend/.
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
      restart_delay: 3000,
    },
  ],
};
EOF

# Instrucciones dentro del paquete, por si el bundle viaja solo.
cat > "$BUILD/LEEME.txt" <<'EOF'
SISTEMA DE PROYECCIONES — PAQUETE DE DEPLOY
==========================================

Contenido autocontenido: NO hace falta npm install en el servidor.
Requisitos en el servidor: Node.js (>=18), pm2, MariaDB/MySQL.

Primera instalación:
  1. Editar backend/.env con los valores del servidor:
       DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
       API_URL / API_USER / API_PASSWORD   (sistema SAGA)
       EXTERNAL_API_KEY                     (solo si se usan integraciones)
       PORT                                 (default 4000)

  2. Arrancar:
       cd backend
       pm2 start ecosystem.config.js
       pm2 save

  3. La aplicación queda en http://<servidor>:4000
     (el backend sirve la web compilada desde ../frontend/dist)

Sin pm2 (alternativa): cd backend && node dist/server.js

Actualizar una instalación existente:
  El backend/.env de este paquete trae valores por defecto y un
  JWT_SECRET nuevo. NO sobrescribas el .env ya configurado del servidor:

    1. cp backend/.env /tmp/proyecciones.env   # respaldar la config actual
    2. Copiar el contenido del nuevo build/ encima
    3. cp /tmp/proyecciones.env backend/.env   # restaurar la config
    4. pm2 restart proyecciones

  (Si se sobrescribe el .env: hay que reeditarlo y, además, el nuevo
  JWT_SECRET invalida las sesiones activas — los usuarios tendrán que
  volver a iniciar sesión.)
EOF

# ── Resumen ─────────────────────────────────────────────────────────────
SIZE=$(du -sh "$BUILD" | cut -f1)
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Bundle listo: $BUILD  ($SIZE)"
echo ""
echo "  Copia la carpeta build/ completa al servidor, edita"
echo "  backend/.env y arranca con:"
echo "    cd backend && pm2 start ecosystem.config.js"
echo ""
echo "  Si el servidor YA tiene un .env configurado, respáldalo antes"
echo "  de copiar el build encima (instrucciones en build/LEEME.txt)."
echo "════════════════════════════════════════════════════════════════"
