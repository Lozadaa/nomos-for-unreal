# Equipo: varios Nomos sobre el mismo juego

Fecha: 2026-10-29. Estado: aprobado por el usuario el 29 oct (respuestas en la tabla de decisiones); revisado por un constructor independiente, sus cuatro dudas quedan resueltas abajo.

## Para qué

Un equipo pequeño (2-5 personas) hace un juego juntos. Cada persona corre su propio Nomos sobre su clon del repositorio. Hoy cada Nomos cree que está solo: dos directores pueden crear la misma tarea, dos workers pueden tocar el mismo mapa y la integración lo descubre tarde, cuando ya hay que tirar trabajo.

Petición del usuario (29 oct, literal): «que nomos sepa que pueden existir otros nomos de otras personas conectadas, no para todos pero sí para lo necesario… cada nomos de la red se concentre en trabajar en una funcionalidad y en local debe saberlo, porque no pueden estar todos haciendo lo mismo… se tiene que hacer sync, al inicio del proyecto se tiene que preguntar si es compartido, tiene que saber cuando alguien se une, ir haciendo sync mientras trabaja para evitar conflictos y saber resolverlos cuando sucedan».

## Decisiones del usuario (29 oct)

| Tema | Decisión |
|---|---|
| Medio compartido | Una rama del repositorio Git del juego. Sin servidor, sin red local. |
| Reparto del trabajo | Por **frentes** (combate, arena, UI…). Cada persona elige el suyo al unirse; Nomos avisa si ya está tomado. |
| Tareas de otro frente | Se ven y se puede pedir («para Ana»), no se tocan. Solo el dueño del frente mueve sus tareas. |
| Conflictos en mapas y Blueprints | Se evitan con reservas obligatorias sincronizadas: nadie toca un mapa o Blueprint sin reserva; el segundo espera. Si aun así chocan, **decide quien choca** (la persona cuya integración encontró el conflicto) desde su «Por aprobar»; el dueño del frente recibe el aviso con lo elegido. |
| Publicar `main` | Lo hace Nomos tras cada integración: trae `origin/main` antes de integrar y empuja después. Así los demás ven el trabajo enseguida y los choques aparecen pronto. |
| Arranque | Al iniciar un juego, Nomos pregunta si es compartido. |
| Unirse | Sin pedir permiso a nadie. La persona llega con la consigna de su compañero («levanta Nomos y vamos a trabajar en X») y su Nomos toma el frente X y lo anuncia. |
| Ritmo | Sincroniza mientras se trabaja; avisa cuando alguien se une. |
| Conflictos que pasan igual | Se resuelven en Git, que ya es el lugar de los conflictos: el worker resuelve el código; en binarios la persona elige versión y Nomos aplica la elección como resolución de Git. |
| Dónde vive Nomos | Dentro del mismo repositorio del juego. Quien clona el juego y abre Claude Code ahí tiene Nomos entero sin instalar nada externo: lo adquiere a través del proyecto. |

## Metas, no metas, antimetas

- **Metas:** cada director sabe quién está, en qué frente, qué tareas tiene y qué tiene reservado; dos workers nunca tocan el mismo archivo binario a la vez; un conflicto que pasa igual tiene un dueño claro y dos botones.
- **Metas (añadido):** un compañero clona el juego, abre Claude Code en la carpeta, escribe `/nomos` y tiene su Nomos arrancado y unido al equipo sin instalar nada aparte de Git, Node, Claude Code y Unreal.
- **No metas:** chat entre personas, compartir tokens o runs, fusionar binarios de Unreal, servidor central, trabajo sin remoto Git, instalador global de Nomos.
- **Antimetas:** que un Nomos pueda mover o cerrar tareas ajenas; que la sincronización ensucie `main` del juego; que un fallo de red pare el trabajo local.

## Cómo se comporta

### Nomos viaja con el juego

Hoy Nomos vive en `C:/Users/richa/Documents/nomos`, la skill es un enlace en `~/.claude/skills` y los workers se lanzan a través de Orca. Nada de eso existe en el equipo de un compañero. Cambia a:

| Qué | Dónde queda en el repo del juego |
|---|---|
| Servicio y CLI (Node, sin dependencias) y panel compilado | `Tools/Nomos/` (≈ 3,5 MB), con `VERSION` |
| Skills de Nomos y de UI | `.claude/skills/` del juego (Claude Code las carga solas al abrir el proyecto) |
| Instrucciones para Claude | Sección «Nomos» en el `CLAUDE.md` del juego: qué es, cómo arrancarlo (`node Tools/Nomos/...` o el envoltorio `nomos.cmd` de la raíz), que `/nomos` existe |
| Datos locales | `.nomos/` sigue fuera de Git (`.gitignore`) |
| Estado del equipo | Rama `nomos/equipo` del mismo repositorio |

- `nomos embed` desde el repo de Nomos copia todo eso a un juego y lo deja listo para commit; `nomos embed --update` lo renueva. Los compañeros reciben la misma versión con `git pull`; el servicio comprueba `VERSION` contra sus datos y migra, como hoy.
- **Workers sin Orca.** Si Orca no está instalado, Nomos lanza `claude` como proceso hijo con su salida a un archivo que el servicio lee igual que hoy lee la terminal de Orca. Con Orca presente, todo sigue igual. `doctor` dice cuál usa.
- Lo que sí hace falta en cada equipo y Nomos no puede traer: Git, Node 25 o superior, Claude Code y Unreal. `doctor` lo comprueba y lo dice en una tabla. Second Brain, graphify y ponytail son opcionales: si no están, Nomos funciona y lo dice en una línea.

### Arranque y unión

1. Al iniciar un juego nuevo (`/nomos` por primera vez) el director pregunta: «¿Este proyecto es compartido con otras personas?». Si no, todo sigue como hoy; `nomos team init` lo activa más tarde.
2. Si sí: pide **nombre** y **frente**. Nomos crea la rama `nomos/equipo` en el remoto del juego (vacía, sin tocar `main`) y publica `equipo/<id>.json` con su tarjeta.
3. Quien clona el juego y arranca su Nomos ve que la rama existe: «Este proyecto es compartido. Están Richard (combate) y Ana (UI). ¿Tu nombre y en qué vas a trabajar?». La persona responde con lo que le dijo su compañero («voy con el audio») y su Nomos **toma ese frente sin pedir permiso a nadie** y publica su tarjeta. Si el frente ya lo tiene otro, Nomos lo dice en una línea y lo comparte igual; no bloquea.
4. Cuando aparece una tarjeta nueva, cada Nomos emite `team.joined`: el panel lo enseña y el brief del director lleva una línea «Se unió Ana · UI». Cambiar de frente más tarde: `nomos team frente "<nuevo>"`, mismo anuncio.

### Qué se comparte (y nada más)

Cada persona escribe **solo su propio archivo** `equipo/<id>.json`:

| Campo | Contenido |
|---|---|
| `name`, `frente`, `updatedAt` | Tarjeta y latido (cada 5 min o al cambiar algo) |
| `tasks` | Sus tareas abiertas: id, título, estado, área |
| `leases` | Reservas activas: ruta o área, tarea, hasta cuándo |
| `decisions` | Decisiones abiertas: id, título |
| `build` | Última build aprobada: commit, fecha |
| `requests` | Peticiones a otros: para quién, título, texto, fecha |

No se comparten runs, tokens, mensajes privados ni eventos.

### Sincronización

- Cada Nomos hace `fetch` de `nomos/equipo` cada 60 s y `push` de su archivo cuando cambia (agrupado 10 s). Como cada archivo tiene un único autor, nunca hay conflicto de fusión en la rama.
- Un peer sin latido en 30 min aparece **ausente**; sus reservas caducan por su propio `until`.
- Sin remoto o sin red: un aviso `team.unavailable` una vez, y el Nomos sigue trabajando solo con lo último que vio.

### `main` compartido

Hoy la integración fusiona la rama del worker en el `main` local y nadie trae ni empuja el remoto. En equipo:

- Antes de integrar, Nomos trae `origin/main` y pone la rama del worker al día sobre él. Después de integrar, empuja `main`. Si alguien se adelantó (el push no avanza), vuelve a traer y reintenta hasta 3 veces; si sigue sin poder, la tarea queda bloqueada «No se pudo publicar main» con la causa y el director lo ve.
- La integración trabaja en su propio espacio (como hoy); el clon abierto de la persona no se toca. `main` del clon avanza solo si está limpio.
- Sin remoto configurado, Nomos lo dice una vez y sigue integrando en local como hasta ahora.

### Evitar pisarse

- Antes de que un worker arranque, Nomos publica la reserva, espera un `fetch` y comprueba que ningún peer tenga la misma ruta o área. Si la tiene, la tarea queda **esperando** con el motivo «Ana tiene reservado L_Arena hasta 16:40» y el director lo ve en el brief. Si dos la publican en el mismo minuto, gana la de fecha más antigua y la otra espera.
- Mapas (`.umap`) y assets (`.uasset`) exigen reserva siempre. Se exige en dos sitios: el director los lista en las reservas al crear la tarea (regla de la skill) y, si el worker tocó un binario sin reserva, Nomos lo detecta en la revisión o la integración: lo reserva al vuelo si está libre, o bloquea la tarea con «L_Arena lo tiene Ana» si no. El código sigue con la regla actual.
- Una reserva compartida dura lo que la run (`until` = su límite) y se renueva mientras el worker siga vivo.
- Crear una tarea cuyo título se parece mucho al de una abierta de un peer abre una Decisión: «Ana ya tiene “Barra de vida”: ¿duplicar o pedírsela?». No se compara por área: el enum de áreas es demasiado grueso.

### Pedir algo a otro frente

`nomos team ask --to Ana "Falta el sonido del golpe"` (o desde la ficha de una tarea ajena) deja una petición en mi archivo. El Nomos de Ana la ve en el siguiente `fetch` y la entrega a su director como un mensaje del panel firmado «Richard (combate)». Ana decide si crea la tarea.

### Cuando el conflicto pasa igual

Git ya es el lugar donde se resuelven los conflictos; Nomos no inventa otro. En la integración (fusión de `main` del juego):

1. **Código** (`.cpp`, `.h`, `.ini`, texto): Git intenta fusionar; si hay conflicto, el worker de la tarea lo resuelve en su worktree, como hoy, y la revisión lo mira.
2. **Binarios** (`.umap`, `.uasset`): Git no puede fusionar. La integración se detiene con el conflicto abierto; la tarea queda bloqueada «Conflicto en L_Arena con Ana».
3. Se abre una aprobación en el «Por aprobar» de **quien chocó** (su integración lo detectó; decide al momento, sin esperar a otra máquina). Muestra las dos versiones: quién, qué tarea, cuándo, y la captura o vídeo de cada una si existe.
4. Dos botones que Nomos ejecuta como resolución de Git (`--ours` / `--theirs` sobre ese archivo): **Quedarme con la mía** o **Quedarme con la suya**. Si me quedo con la mía, la tarea del peer que ya había integrado recibe el aviso y vuelve a `implementando` sobre la versión nueva; si me quedo con la suya, es mi tarea la que vuelve.
5. El **dueño del frente** del archivo recibe en su panel y en su brief el aviso «Conflicto en L_Arena: Richard se quedó con su versión», con enlace a las dos.
6. Si la persona prefiere resolverlo a mano en su clon, puede: Nomos detecta que el conflicto ya no existe y sigue la integración.

### Verlo

- Panel: franja **Equipo** en Producción, una línea por persona: nombre · frente · presente/ausente · tareas en curso · reservas · build. Las fichas ajenas abren en solo lectura con «Pedir» como única acción.
- Brief del director (hito 27): sección «Equipo» de ≤ 1 línea por persona al principio.
- `nomos status`: tabla de peers. `nomos team status`, `nomos team leave`.

## Restricciones

- Sin dependencias nuevas; Git por línea de órdenes como ya hace Nomos.
- `main` del juego no recibe ningún commit de sincronización.
- Las pruebas usan un repositorio Git local como remoto; nada sale a GitHub.
- Todo lo que el usuario lee: corto, en tablas, sobre comportamiento (regla del hito 23).

## Lo que decide el constructor

Formato exacto del JSON, nombres de eventos y tablas, cómo se detecta el dueño del frente de un archivo, cómo se agrupan los `push`, estructura del componente del panel, cadencia exacta de latidos. Si algo de arriba se puede hacer más simple sin cambiar el comportamiento, hazlo y dilo.

## Orden de construcción

1. Nomos dentro del repo del juego y workers sin Orca (hito 30).
2. Equipo: unión, sincronización, reservas, conflictos, vista (hito 29).
3. El brief del director por evento (hito 27) incorpora la sección «Equipo».

## Lo que decidió el diseñador (no el usuario)

- Latido cada 5 min y ausencia a los 30 min.
- Reserva obligatoria solo en `.umap` y `.uasset`; el código sigue con la regla actual.
- Las peticiones a otro frente llegan como mensaje al director del otro, no como tarea creada directamente.
- Dos reservas en el mismo minuto: gana la más antigua.
- Carpeta `Tools/Nomos/` y skills en `.claude/skills/` del juego; `nomos.cmd` en la raíz como envoltorio.
- La Decisión de duplicado compara títulos, no áreas. Las reservas siguen siendo rutas; una carpeta (`Content/Mapas`) es una ruta reservable.
- Binarios sin reserva: se detectan en revisión e integración y se reservan al vuelo si están libres.
- Identidad por persona y clon (`.nomos/identity.json`), no por máquina.
- Sin Orca, los workers son procesos hijos de `claude` con salida a archivo; no se añade otra herramienta de terminales.
