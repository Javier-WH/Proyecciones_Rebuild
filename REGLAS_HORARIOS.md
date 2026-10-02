# Reglas del Módulo de Horarios

Documento de referencia obligatorio para cualquier cambio en el módulo de horarios (`backend/src/modules/horarios/`, `frontend/src/pages/horarios/`). Consultar antes de modificar lógica de agendamiento, generación automática, bloques o aulas.

## Modelo de datos

- `turnos`: turnos de clase (sincronizados desde SAGA o locales). `dias_semana` es un CSV de días 1–7 (Lun–Dom); `saga_id` puede ser NULL en turnos locales.
- `turno_bloques`: bloques horarios ordenados por turno (`hora_inicio`, `hora_fin`, `es_receso`, `orden`).
- `horario_entries`: una fila = una clase (materia × sección × lapso) en un (día, bloque, aula). `profesor_id` es un snapshot denormalizado que se sincroniza al cambiar la asignación.
- `aulas`: catálogo universal (no depende del periodo). `pnf_saga_id`/`pnf_nombre` = PNF **preferido** (prioridad, no exclusividad).
- `horario_config`: fila única (id=1) con las reglas de generación automática.

## Reglas de agendamiento (backend, `PUT /api/horarios/entries`)

1. La sección solo usa bloques de **su propio turno** (`turno_saga_id` → `turnos.saga_id`).
2. No se puede agendar en un bloque de **receso**.
3. El día debe estar habilitado en `dias_semana` del turno.
4. Conflictos por **solape horario real** (`seTraslapan` sobre `hora_inicio`/`hora_fin`), no por `bloque_id`:
   - **Aula**: una aula ocupada a las 7 en el turno Diurno bloquea ese horario también para Mañana/Tarde.
   - **Sección**: una sección no puede tener dos clases solapadas.
   - **Profesor**: un profesor no puede tener dos clases solapadas (NULL = sin profesor, nunca choca).
5. El solape también valida **lapsos rivales** (SEMESTRAL S1 coexiste con TRIMESTRAL T1/T2, etc., vía `lapsosRivales`).
6. La **capacidad del aula NO se toma en cuenta**.
7. Sin `aula_id` se **auto-asigna**: prioriza aulas del PNF de la sección → tipo `AULA_REGULAR` → menor uso → código. La preferencia de PNF es informativa: cualquier aula libre puede usarse.
8. Materias **sin profesor asignado** igual se agendan.
9. Las claves únicas de `horario_entries` evitan choques dentro del mismo bloque; los choques entre turnos/lapsos se validan por tiempo en código (el constraint de BD no basta).

## Reglas de generación automática (`POST /api/horarios/generar`)

Configurables en `horario_config` (editable desde la tuerca → "Configuración de Horarios"; SUPER_USUARIO y ADMINISTRADOR):

- **`min_horas_bloque`** (default 2): tamaño mínimo de una sesión consecutiva de una materia. Con 2 no se generan horas sueltas; con 3 solo sesiones de 3+ horas.
- **`max_horas_dia`** (default 3): tope de horas de una misma materia en un día. Ej.: 5h semanales con máx 3 → 3h + 2h en días distintos.

Comportamiento del generador:

1. Divide las horas faltantes de cada unidad (materia × sección × lapso) en **sesiones** de tamaño `[min, max]`. Si el resto no puede partirse respetando las reglas (ej. 4h con min 3/max 3), queda pendiente con motivo.
2. Cada sesión se coloca como un **run de bloques consecutivos** (`orden` contiguo, sin receso intermedio) en **un solo día y un mismo aula** — así la grilla los muestra fusionados.
3. Se respeta `usadasDia + s <= maxDia` contando también las entries previas (modo completar).
4. Dos pasadas: primero días sin esa materia (reparte entre días), luego cualquier día.
5. Genera todo lo que pueda (greedy, más restringidas primero) y reporta pendientes con motivo.
6. Modos: `completar` (solo horas faltantes) y `regenerar` (borra el lapso y recalcula).
7. Estas reglas **solo rigen la generación automática**. El agendamiento manual es libre: al arrastrar se muestra una **advertencia momentánea ámbar** si se viola el mínimo o el máximo, sin bloquear.

## Reglas de la interfaz

- Grilla por sección: días × bloques con drag & drop; bloques consecutivos de la **misma materia + misma aula** se fusionan visualmente en un solo bloque (rowSpan), también en las vistas por aula/profesor.
- Recesos se muestran como filas grises y rompen la fusión.
- Modificar bloques de un turno con clases agendadas exige **desagendarlas** primero (modal de conflicto con opción de desagendar + reintentar).
- Vistas por aula y profesor son de **solo lectura**.
- La configuración de aulas es **universal** entre periodos; el selector de PNF muestra todos los PNFs del sistema (endpoint `/api/horarios/pnfs`).
