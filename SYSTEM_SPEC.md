# Especificación del Sistema de Proyecciones Académicas
**Universidad Politécnica Territorial de los Llanos "Juana Ramírez" (UPTLL Juana Ramírez)**

---

## 1. Descripción del Sistema
Este software universitario está diseñado para automatizar, gestionar y proyectar la oferta académica y la elaboración de horarios docentes de la **Universidad Politécnica Territorial de los Llanos "Juana Ramírez"**. 

El sistema optimiza la asignación de profesores, espacios físicos (aulas), materias y secciones por cada Programa Nacional de Formación (PNF), garantizando el cumplimiento estricto de restricciones académicas, disponibilidad docente y capacidades físicas, integrándose directamente con el sistema core universitario (**SAGA**).

---

## 2. Glosario y Definición de Términos

- **Proyección**: Establecimiento formal por parte del coordinador de un PNF para un periodo académico de las secciones, turnos, materias, y profesores asignados.
- **PNF (Programa Nacional de Formación)**: Carreras universitarias ofrecidas (ej. Informática, Administración, Agropecuaria, Veterinaria). Pueden ser de régimen **trimestral** o **semestral**.
- **Periodo Académico**: Espacio de tiempo académico donde los coordinadores establecen proyecciones. Una proyección trimestral abarca 3 trimestres por periodo; una semestral abarca 2 semestres.
- **Sección**: Grupo de estudiantes pertenecientes a un PNF y trayecto (ej. 60 estudiantes divididos en Sección 1 y Sección 2 de 30 estudiantes c/u).
- **Turno**: Franja temporal diaria asignada a una sección (Mañana, Tarde, Noche, Diurno). El turno diurno abarca mañana y tarde.
- **Hora Académica**: Unidad mínima de tiempo lectivo (normalmente 45 minutos).
- **Trimestre / Semestre**: Etapas secuenciales de evaluación que componen un periodo académico según el régimen del PNF.
- **Coordinador de PNF**: Usuario regular del sistema que gestiona proyecciones y horarios de su PNF asignado.
- **Estudiante**: Alumno matriculado que cursa asignaturas de un PNF.
- **Profesor**: Docente que imparte clases evaluativas y/o cumple horas administrativas.
- **Materias / Unidades Curriculares (UC)**: Disciplinas académicas del pensum que deben ser dictadas por profesores con perfil compatible.
- **Hora Administrativa**: Horas asignadas a docentes para labores no lectivas (investigación, gestión, tutorías).
- **Aula de Clase / Salón**: Espacio físico disponible para impartir clases a una sección en un bloque horario.
- **Cohorte**: Pensum oficial vigente asignado a un trayecto.
- **Pensum / Malla Curricular**: Matriz de materias ordenadas por trayecto y trimestre/semestre.
- **Trayecto**: Nivel o año académico en la estructura de un PNF (ej. Trayecto Inicial, Trayecto I, II, III, IV).

---

## 3. Esquema Jerárquico del Periodo Académico

```
Periodo Académico (Año Escolar)
   └── Trayecto (Nivel Académico)
        └── Trimestre o Semestre (Según régimen PNF)
             └── Secciones (Grupos de Estudiantes)
                  └── Horarios (Bloques Materia + Profesor + Aula + Turno)
```

---

## 4. Stack Tecnológico y Restricciones de Servidor

### Restricciones de Infraestructura
- **Servidor Universitario**: Procesador de 4 hilos (vCPU), 4 GB RAM.
- **Entorno Compartido**: El servidor ejecuta simultáneamente otras bases de datos y aplicaciones.
- **Prioridad Crítica**: Ultra optimización de rendimiento en backend y frontend, bajo consumo de memoria RAM, consultas indexadas y bundles de React extremadamente livianos con lazy-loading y fragmentación eficiente de chunks.

### Arquitectura Seleccionada
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + Radix UI / Shadcn UI.
  - *Optimización*: Code-splitting por ruta, componentes reusables, renderizado virtualizado para grillas de horarios pesadas, cero runtime CSS overhead.
- **Backend**: Node.js + Fastify + TypeScript.
  - *Optimización*: Fastify por su mínima huella de memoria y baja latencia, Worker Threads para algoritmos pesados de auto-resolución de horarios.
- **Base de Datos**: MariaDB / MySQL (servidor existente).
  - *Optimización*: Pool de conexiones controlado, índices en `saga_id`, `profesor_id`, `seccion_id` y `proyeccion_id`.
- **Comunicación en Tiempo Real**: WebSockets nativos (`ws`) para sincronización multiusuario con overhead mínimo.

---

## 5. Requerimientos Funcionales (RF-01 a RF-59)

### 1. Autenticación y Usuarios
- **RF-01**: Login de usuarios con sesión persistente (JWT + credenciales usuario/contraseña).
- **RF-02**: Logout explícito y expiración controlada de sesión.
- **RF-03**: Roles de usuario:
  - *Super Usuario*: Acceso y control total del sistema.
  - *Administrador*: Gestión de usuarios, catálogos y aulas.
  - *Regular (Coordinador PNF)*: Restringido exclusivamente a su PNF asignado.
  - *Profesor*: Lectura exclusiva de su propio horario y materias asignadas.
- **RF-04**: CRUD completo de usuarios (crear, editar, eliminar, listar) — solo Administradores y Super Usuarios.
- **RF-05**: Restricción de datos por rol (RLS/Middleware de autorización).

### 2. Gestión de Datos Académicos Base
- **RF-06**: CRUD de PNFs sincronizados con sistema SAGA externo vía `saga_id`.
- **RF-07**: CRUD de trayectos (niveles académicos con orden secuencial).
- **RF-08**: CRUD de turnos (Mañana, Tarde, Noche, Diurno) con franjas horarias configurables.
- **RF-09**: CRUD de catálogos de soporte: tipos de contrato docentes y géneros.
- **RF-10**: Consulta de mallas curriculares (pensum) desde la API de SAGA filtrado por tipo de pensum (regular / prosecución).

### 3. Gestión de Profesores
- **RF-11**: Registro de profesores: datos personales, cédula, género, tipo de contrato, título, PNF adscrito.
- **RF-12**: Edición, activación/desactivación y búsqueda de profesores (por nombre, apellido, cédula, perfil).
- **RF-13**: Soporte para Profesores "Placeholder" (genéricos/temporales que no computan en estadísticas globales).
- **RF-14**: Gestión de perfiles docentes: creación de perfiles disciplinares y asignación de materias del pensum.
- **RF-15**: Validación estricta de compatibilidad perfil-materia (un docente solo puede dictar materias afines a su perfil registrado).
- **RF-16**: Restricciones de disponibilidad docente: días bloqueados y rangos de horas no disponibles.
- **RF-17**: Cálculo dinámico de carga horaria por periodo: horas de contrato vs. horas lectivas/administrativas asignadas, con alertas visuales de sobrecarga.

### 4. Proyecciones Académicas
- **RF-18**: Crear proyección seleccionando PNF + Trayecto + Malla Curricular, consumiendo pensum e inscripciones de SAGA.
- **RF-19**: Cálculo automático de horas semanales por materia según régimen (trimestral o semestral).
- **RF-20**: Estimación automática del número de secciones necesarias por turno a partir de inscritos/aprobados.
- **RF-21**: Asignación de materias a profesores por trimestre/semestre con validación inmediata de perfil y carga de horas.
- **RF-22**: Reasignación ágil de materias entre profesores.
- **RF-23**: Control de proyección activa única por PNF/Periodo (solo una proyección activa a la vez; activar/desactivar).
- **RF-24**: Listar, editar y eliminar proyecciones (al eliminar, se limpian en cascada los horarios asociados).
- **RF-25**: Validación de integridad: detección de materias con datos nulos o horas semanales $\le 0$.
- **RF-26**: Soporte de materias vinculadas entre secciones (*linked sections*) que comparten el mismo bloque horario y aula.

### 5. Generación Automática de Horarios
- **RF-27**: Generador automático de horarios por sección (PNF + Trayecto + Sección + Trimestre/Semestre).
- **RF-28**: Respeto de restricciones duras (*hard constraints*): disponibilidad del profesor, aulas exclusivas/preferidas, máximo de horas diarias por materia.
- **RF-29**: Cumplimiento de reglas de negocio (*soft constraints*): no repetir materia en bloques discontinuos el mismo día, bloques mínimos consecutivos, prevención de huecos de 1 hora, recesos configurables.
- **RF-30**: Pipeline multi-pase de auto-solución (ejecutado en Worker Thread):
  1. Ordenamiento por MRV (*Minimum Remaining Values*).
  2. Búsqueda estricta.
  3. Relajación progresiva de aulas.
  4. Compactación de huecos (*gaps*).
  5. *Swap* con cascada (profundidad 2).
- **RF-31**: Detección y reporte detallado de conflictos: solapamiento de profesor, aula o sección en el mismo bloque.
- **RF-32**: Respeto de secciones congeladas/bloqueadas: eventos fijados manualmente nunca son alterados en la regeneración.
- **RF-33**: Configuración de parámetros de generación: días activos, turnos, preservación de ranuras (`conserveSlots`), distribución equitativa.

### 6. Modo Oficial (Edición Manual)
- **RF-34**: Dos etapas independientes: cálculo automático y modo oficial congelado.
- **RF-35**: Congelar/descongelar secciones específicas para permitir edición manual.
- **RF-36**: Área de depósito (*staging area*): banco temporal para mover bloques de materias fuera de la grilla.
- **RF-37**: Drag & Drop interactivo: entre grilla $\leftrightarrow$ depósito y celda $\leftrightarrow$ celda, desplazando bloques completos (incluyendo huecos $\le 30$ min).
- **RF-38**: Intercambio (*swap*) automático de eventos al soltar sobre celdas ocupadas.
- **RF-39**: Solapamiento visual de conflictos sin bloqueo (los indicadores visuales advierten la colisión pero permiten el movimiento).
- **RF-40**: Persistencia de cambios manuales en `lockedSections`.
- **RF-41**: Botón de limpieza de materias huérfanas (proyecciones eliminadas previamente) desde cualquier vista.

### 7. Vistas y Consulta de Horarios
- **RF-42**: Vista por PNF/Sección: grilla semanal interactiva con filtros por PNF, trayecto, turno, sección y trimestre.
- **RF-43**: Vista por Profesor: horario consolidado del docente (incluye todas sus secciones y PNFs distintos).
- **RF-44**: Vista por Aula: ocupación semanal y disponibilidad de cada salón.
- **RF-45**: Eventos fantasma *cross-quarter*: visualización de materias solapadas de trimestres/semestres contiguos en el calendario.
- **RF-46**: Fusión visual de bloques consecutivos de la misma materia.
- **RF-47**: Modal explicativo de errores de generación con detalle de materias que no pudieron ser asignadas.

### 8. Aulas
- **RF-48**: CRUD de aulas de clase con capacidad máxima y estado activo/inactivo.
- **RF-49**: Restricciones de aula por materia (aulas preferidas y aulas exclusivas/laboratorios).
- **RF-50**: *Overrides* puntuales de aula: reasignación de salón a eventos específicos del horario.

### 9. Versionado y Persistencia
- **RF-51**: Guardar versiones nombradas del horario (snapshots) y posibilidad de restaurarlas.
- **RF-52**: Sincronización en tiempo real multiusuario mediante WebSockets (estado autoritativo gestionado en backend).
- **RF-53**: Persistencia completa del estado del horario en snapshot JSON por proyección.

### 10. Reportes e Impresión
- **RF-54**: Exportar datos de proyección trimestral y anual a formato Excel (.xlsx).
- **RF-55**: Generación de PDF optimizado para impresión (vista imprimible adaptable).
- **RF-56**: Exportación rápida de horarios individuales por sección, profesor o aula.

### 11. Integración Externa (SAGA)
- **RF-57**: Autenticación contra API externa (SAGA) mediante tokens Bearer.
- **RF-58**: Consumo resiliente de endpoints de SAGA: inscripciones, materias/UCs, mallas curriculares, programas, trayectos, turnos y docentes.
- **RF-59**: Manejo elegante de caídas e indisponibilidad de la API SAGA con mensajes de error descriptivos y fallback.

---

## 6. Especificación Técnica de Integración con API Externa (SAGA)

### Configuración `.env`
```env
API_URL=http://<host-saga>:8000/api/v1
API_USER=<usuario_saga>
API_PASSWORD=<password_saga>
```
*Base URL por defecto si la variable no está configurada*: `http://0.0.0.0:8000/api/v1`.

### Autenticación y Helper `getApiToken()`
- Método: `POST {API_URL}/login`
- Body: `{ "user": "<API_USER>", "password": "<API_PASSWORD>" }`
- Respuesta Exitosa (`status 200`): `{ "status": 200, "data": { "token": "<jwt>" }, "message": null }`
- Regla: Todos los demás endpoints son `GET` con headers `Authorization: Bearer <token>` y `Content-Type: application/json`.
- Envoltorio de respuesta: SAGA envuelve sus respuestas en `{ data: ... }`. El backend siempre extrae `response.data`. Si `status !== 200` o hay un fallo de red, se retorna `null` y se registra el log.

### Endpoints SAGA y Mapeo
1. `GET /programas`: Obtiene PNFs (`id`, `programa`).
2. `GET /trayectos`: Obtiene niveles académicos (`id`, `trayecto`).
3. `GET /turnos`: Obtiene turnos (`id`, `turno`).
4. `GET /teachers`: Obtiene docentes (`NombreProfesor`, `ApellidoProfesor`, `CedulaProfesor`, `sexo`, `email1`, `email2`).
5. `GET /maya/:pnfSagaId`: Mallas de un PNF (`id`, `descripcion`, `tipopensum_id`: 1=regular, 2=prosecución).
6. `GET /ucslist/:pnfSagaId/:trayectoSagaId/:mayaId`: Materias con `hours.total`, `hours.times`, `quarters.{q1, q2, q3}`.
7. `GET /student/inscription`: Inscripciones masivas (`student_id`, `grade`, `pnf_info.id`, `uc_info.trayecto_id`, `turno_info`).
8. `GET /prelations`: Prelaciones entre materias.

### Flujo de Creación de Proyección (Backend)
Cuando se crea una proyección, el backend efectúa el siguiente flujo:
1. `POST /login` $\rightarrow$ obtiene Bearer Token.
2. `GET /maya/{pnfSagaId}` $\rightarrow$ obtiene lista de mallas vigentes.
3. `GET /ucslist/{pnfSagaId}/{trayectoSagaId}/{mayaId}` $\rightarrow$ obtiene UCs y calcula horas semanales (`total / times`).
4. `GET /student/inscription` $\rightarrow$ filtra por `pnf_info.id` y `uc_info.trayecto_id`, separa aprobados (`grade >= 10`), deduplica por `student_id` y agrupa por turno para estimar las secciones requeridas.

*Nota de asignación de IDs*: Los parámetros en los paths de SAGA son los `saga_id` almacenados en las tablas locales (`pnf`, `trayectos`, `maya`), no los autoincrementables primarios locales.

---

## 7. Estrategia de Rendimiento y Memoria en Servidor

Para garantizar estabilidad continua en un servidor con **4 vCPU / 4 GB RAM**:

1. **Worker Threads en Node.js**: El motor de auto-resolución de horarios (MRV + swap en cascada) se ejecuta en un hilo de trabajo secundario para no bloquear el Event Loop de Fastify.
2. **Consultas a DB y Pooling en MySQL**: Limitar el pool de conexiones a máximo 10-15 conexiones simultáneas para no agotar la RAM de MariaDB. Indexar llaves compuestas en la tabla de horarios `(proyeccion_id, seccion_id, dia, hora_inicio)`.
3. **Optimización del Bundle de Frontend**:
   - `vite.config.ts` configurado con `manualChunks` para separar React, Lucide Icons y Radix Primitives en chunks independientes < 150 KB.
   - Componentes modal y vistas complejas importados dinámicamente con `React.lazy()` y `Suspense`.
4. **Grilla Virtualizada**: En las vistas de consulta de horarios masivas por PNF o Profesor, se utiliza renderizado condicional/virtualizado para no sobrecargar el DOM del navegador.
