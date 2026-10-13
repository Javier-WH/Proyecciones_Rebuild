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
#        .env               ← se edita UNA vez en el servidor
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

# ── 1. Frontend: instalar (si hace falta) y compilar ─────────────────────
echo "==> [1/5] Frontend: dependencias + build..."
cd "$ROOT/frontend"
[ -d node_modules ] || npm ci
npm run build

# ── 2. Backend: instalar (si hace falta) y compilar ──────────────────────
echo "==> [2/5] Backend: dependencias + build..."
cd "$ROOT/backend"
[ -d node_modules ] || npm ci
npm run build

# ── 3. Armar el bundle ───────────────────────────────────────────────────
echo "==> [3/5] Armando build/ ..."
rm -rf "$BUILD"
mkdir -p "$BUILD/backend" "$BUILD/frontend"

cp -r "$ROOT/backend/dist"      "$BUILD/backend/dist"
cp    "$ROOT/backend/package.json" "$BUILD/backend/"
cp    "$ROOT/backend/package-lock.json" "$BUILD/backend/"
cp -r "$ROOT/backend/public"    "$BUILD/backend/public"
cp -r "$ROOT/frontend/dist"     "$BUILD/frontend/dist"

# ── 4. node_modules de producción DENTRO del bundle ──────────────────────
# El servidor no puede correr npm install: las dependencias de producción
# se instalan aquí (misma plataforma linux) y viajan con el paquete.
echo "==> [4/5] Instalando dependencias de producción en el bundle..."
cd "$BUILD/backend"
npm ci --omit=dev --no-audit --no-fund

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

Pasos:
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

Reinstalar/actualizar: copiar el nuevo build/ encima y `pm2 restart proyecciones`.
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
echo "════════════════════════════════════════════════════════════════"
