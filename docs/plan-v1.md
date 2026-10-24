# Plan de desarrollo de Nomos para Unreal Engine

Plan propuesto · 22 de octubre de 2026

Nomos será una skill de Claude Code y un panel web de producción para desarrollar videojuegos en Unreal Engine mediante IA. La conversación de Claude donde se invoque la skill será el director: recibirá peticiones, dividirá el trabajo y levantará agentes, worktrees, generación de assets, revisiones y pruebas. El panel hará visible ese proceso y conservará sus resultados.

El producto estará dedicado a Unreal Engine y será reutilizable entre distintos juegos. Este plan define el desarrollo; todavía no constituye una implementación o integración probada.

## 1. Experiencia de uso acordada

1. Abrir Claude Code en la carpeta de un juego Unreal e invocar la skill. Nombre propuesto: `/nomos`.
2. La skill identifica el `.uproject` y repositorio, recupera el estado de producción, inicia o conecta los servicios locales y abre la web.
3. Esa sesión de Claude queda registrada como Nomos y arma la escucha de eventos.
4. El usuario escribe una petición en el chat central del panel. Nomos la convierte en tareas con criterios de aceptación, dependencias y responsables.
5. Nomos levanta workers de Codex o Claude Code en worktrees, solicita trabajos a Meshy/Blender y coordina el editor de Unreal.
6. El usuario ve tablero, timeline, conversaciones, cambios, assets y pruebas mientras se producen.
7. Nomos gestiona las correcciones con el responsable original. Una tarea termina cuando sus resultados están integrados y verificados y los worktrees temporales que tenga asignados se han cerrado.
8. Otra petición sobre ese resultado conserva la atribución y el contexto, aunque requiera crear un nuevo worktree.

La sesión del director es persistente y queda separada del ciclo temporal de cada worker. El panel es el lugar principal para operar; Claude Code sirve como punto de entrada y conversación que dirige la producción.

## 2. Arquitectura propuesta

```text
Claude Code existente
  └─ skill /nomos
       ├─ bootstrap: comprobar, iniciar, recuperar, abrir
       └─ Nomos: conversación central y dirección
            ▲                                  │
            │ eventos confirmados              │ comandos tipados
            │                                  ▼
        Bandeja durable ◄──── Servicio local de coordinación
            ▲                    ├─ tareas, dependencias y políticas
            │                    ├─ procesos y worktrees
Panel Ant Design ◄── SSE ────────┤─ evidencias, sesiones y eventos
       │                         └─ adaptadores
       └── peticiones HTTP ──────────┬─ Codex App Server
                                     ├─ Claude Code workers
                                     ├─ Meshy y Blender
                                     └─ Unreal, QA y builds
```

La primera versión será una web local con un servicio en el equipo que ejecuta Unreal. Ese servicio tendrá acceso controlado a Git, procesos, archivos y herramientas. Las claves permanecerán en el servicio y el almacenamiento seguro del sistema, fuera del navegador y de los worktrees.

El navegador enviará peticiones y recibirá eventos. El coordinador administrará los recursos y verificará los cambios de estado. Nomos decidirá qué trabajo ejecutar a través de herramientas con contratos definidos.

## 3. Skill y escucha basadas en el patrón de dojo

La referencia es la experiencia observada en `/dojo`: arranque de servidor, vigilante, eventos persistentes y presencia visible. Nomos tendrá su propio paquete y sus propios datos; no requiere modificar el dojo.

Para el primer prototipo se usará `Monitor` con un lector local de la bandeja. La documentación de Claude Code permite recibir líneas del proceso en la sesión abierta; sus monitores tienen duración limitada, requieren rearme y su disponibilidad depende del entorno. En Windows debe comprobarse Git Bash. Fuente: [Monitor de Claude Code](https://code.claude.com/docs/en/tools#monitor-tool).

Contrato de recepción propuesto:

1. La web registra la petición en almacenamiento durable y obtiene `messageId`.
2. El lector entrega el evento a la misma sesión de Nomos desde el último cursor confirmado.
3. Nomos confirma recepción y registra las acciones que va a iniciar.
4. El coordinador ejecuta los comandos de manera idempotente.
5. Nomos publica la respuesta asociada a la petición; la web la recibe por SSE.

Confirmar recepción no significa terminar la petición. El evento mantiene estado de ejecución hasta que su respuesta o sus tareas asociadas queden persistidas. La recuperación conserva pendientes y evita crear workers o trabajos pagos por duplicado.

La interfaz distinguirá servicio activo, listener activo, última recepción confirmada por Nomos y trabajo en curso. El latido de un proceso lector no basta para afirmar que el director está atendiendo.

Mientras el modo Nomos siga activo y la sesión permanezca abierta, Nomos rearma el monitor al expirar y recupera pendientes, también cuando espera nuevas peticiones sin tareas en curso. Si falla el rearme, la web muestra desconexión y conserva pendientes. Al cerrar Claude, el panel muestra al director desconectado. Los trabajos ya aceptados pueden conservar su estado y evidencias; las decisiones nuevas quedan pendientes hasta recuperar al director.

Una segunda vía podrá utilizar [Claude Code Channels](https://code.claude.com/docs/en/channels). Su estado actual es research preview y un canal propio requiere habilitación de arranque; la skill no debe asumir que puede activarlo retrospectivamente en cualquier sesión. Los hooks se usarán para telemetría y políticas, no como sustituto del canal de entrada.

Interfaz de skill propuesta: `/nomos`, `/nomos estado`, `/nomos reanudar`, `/nomos pausar` y `/nomos cerrar`. Pausar detiene nuevos despachos y mantiene el canal disponible para recibir instrucciones; cerrar termina la escucha de forma explícita y preserva el estado. El arranque será idempotente: otra invocación se conecta al entorno existente y evita duplicar servicios o directores.

## 4. Roles y responsabilidades

| Rol | Responsabilidad | Evidencia que entrega |
|---|---|---|
| Nomos | Entender peticiones, crear tareas, asignar, supervisar y solicitar correcciones | Plan, decisiones, relaciones entre tareas y resumen verificable |
| Worker de implementación | C++, Blueprints, UMG, sistemas y correcciones dentro de su alcance | Commits, archivos afectados y resultado de comprobaciones |
| Worker de arte | Coordinar Meshy/Blender, preparar y revisar assets | Modelos, versiones, procedencia, parámetros y previews |
| Revisor | Contrastar resultado con criterios y cambios | Observaciones vinculadas a una revisión concreta |
| QA Unreal | Ejecutar validadores, pruebas, capturas, recorridos y paquetes | Informes y artefactos del commit evaluado |
| Integrador | Aplicar cambios compatibles y validar la revisión integrada | Commit de integración y comprobaciones posteriores |
| Coordinador local | Procesos, worktrees, bandejas, recursos y estados | Eventos durables y resultados de operaciones |

Los roles se asignan por tarea y capacidad. Codex y Claude Code pueden ocupar distintos roles; la interfaz conserva proveedor, modelo, sesión e intento reales.

Nomos no concede DONE por el mensaje final de un worker. Solicita el cierre al coordinador, que exige evidencia y condiciones comprobables.

## 5. Panel con Ant Design claro

Diseño: tema claro, fondo gris suave, superficies blancas, acento azul, tipografía legible y jerarquía visual consistente. La actividad se presenta mediante tarjetas y artefactos; los logs técnicos quedan accesibles en el detalle. Ant Design soporta esta base mediante tokens y `ConfigProvider`. Fuente: [tema de Ant Design](https://ant.design/docs/react/customize-theme/).

### Producción

Kanban tipo Trello con columnas Pendiente, Preparada, Implementando, Revisando, Probando, Integrando, Cerrando y DONE. Bloqueos y decisiones pendientes se muestran sin ocultar la etapa actual.

Filtros de Unreal: Gameplay, UI/UMG, escenarios, assets, animación, audio, QA y builds. Cada tarjeta muestra responsable, dependencias, ejecución actual, worktree, última actividad y estado de pruebas.

### Actividad

Timeline cronológica con carriles para Nomos, Codex, Claude Code, Meshy, Blender, Unreal y builds. Relaciona petición, asignación, herramientas, cambios, pruebas y resultado. El usuario puede filtrar una tarea o ejecución y ver qué evento originó el siguiente.

El componente Timeline de Ant Design cubre secuencias de actividad. El tablero y los carriles temporales se compondrán específicamente; no se presupone un componente Kanban o Gantt nativo. Fuente: [Timeline](https://ant.design/components/timeline/).

### Entregas

Galería con modelos 3D, texturas, capturas, vídeos, comparaciones antes/después y builds. Cada resultado enlaza su tarea, autor, ejecución, revisión, motor y pruebas. Un visor GLB permite rotar y acercar los modelos generados.

### Chat y detalle de tarea

El chat central de Nomos estará siempre accesible. Abrir una tarjeta muestra un panel amplio con Resumen, Chat, Cambios, Pruebas, Assets y Timeline. La acción «Pedir cambios al responsable» conserva la relación con la tarea original y Nomos coordina su continuación.

Los mensajes web y los de la sesión inicial usan IDs y orígenes diferenciados para evitar ecos. Se mostrarán planes resumidos, acciones observables y resultados. Las conversaciones y llamadas a herramientas podrán atribuirse a cada worker y subagente.

Ant Design X puede aportar componentes de conversación, previa comprobación de compatibilidad con la versión fijada de Ant Design. Fuente: [Ant Design X](https://x.ant.design/components/overview/).

## 6. Ciclo de tareas y worktrees

```text
Petición → especificación → asignación → worktree → implementación
                         ↑                              │
                         └──── correcciones ◄── revisión/pruebas
                                                         │
                                             integración verificada
                                                         │
                                              preservación de evidencia
                                                         │
                                           parar procesos y cerrar worktree
                                                         │
                                                        DONE
```

El cierre requiere:

1. Cambios guardados en commits recuperables y revisión asociada a la versión final.
2. Criterios de aceptación y pruebas obligatorias satisfechos.
3. Integración en la rama objetivo; si la base cambió, resolver y volver a comprobar lo afectado.
4. Comprobaciones necesarias sobre el commit integrado.
5. Conversación, referencias de sesión, resumen técnico, commits y artefactos preservados fuera del worktree.
6. Procesos propios detenidos y recursos liberados.
7. Eliminación de los worktrees asignados que correspondan a la ejecución, una vez limpios; sin usar borrado forzado para ocultar cambios pendientes. Una tarea puramente remota no necesita crear un worktree para poder cerrarse.

Mientras se hace la limpieza, la tarjeta permanece en Cerrando. Si falla, muestra el motivo y conserva la recuperación. DONE implica que los worktrees temporales asociados ya se retiraron, cuando los haya. El workspace de integración y la conversación de Nomos tienen un ciclo propio.

Git protege por defecto la eliminación de worktrees con cambios o archivos no registrados. El coordinador respetará ese comportamiento. Fuente: [git worktree](https://git-scm.com/docs/git-worktree.html).

### Pedir cambios después de DONE

La tarea conserva quién implementó, quién revisó y qué se probó. Nomos crea una continuación o reabre el trabajo, reconstruye un worktree sobre la versión integrada vigente y recupera el contexto. Reanuda la sesión del proveedor cuando sea compatible; si no, entrega a una sesión nueva el historial útil y las referencias necesarias.

La continuidad depende de datos preservados y archivos recuperables. Un ID de sesión aislado no sustituye su almacenamiento. El proceso anterior puede haber terminado sin que se pierda la responsabilidad del trabajo.

## 7. Paralelismo específico de Unreal

Los worktrees aíslan archivos, pero no garantizan que dos cambios binarios sean integrables. Habrá reservas por asset/paquete para `.uasset`, `.umap`, widgets, materiales y esqueletos compartidos.

La primera versión tendrá un escritor por instancia de editor y una cola explícita para importación, guardado, PIE y capturas. Los workers de texto podrán trabajar en paralelo. Cada instancia administrada tendrá workspace y endpoint propios; la concurrencia adicional de editor/build se habilitará conforme a recursos medidos.

Las cachés diseñadas para compartirse, como DDC, se mantendrán separadas del estado de cada workspace. OFPA puede reducir solapamientos en mapas, pero no sustituye la coordinación de dependencias. Fuentes: [DDC](https://dev.epicgames.com/documentation/unreal-engine/using-derived-data-cache-in-unreal-engine?lang=en-US), [OFPA](https://dev.epicgames.com/documentation/unreal-engine/one-file-per-actor-in-unreal-engine?lang=en-US).

## 8. Integraciones

| Adaptador | Primera capacidad a implementar | Comprobación necesaria |
|---|---|---|
| Claude director | Skill y Monitor sobre la sesión original | Web → evento → recepción confirmada → respuesta web |
| Codex | App Server para tareas, mensajes, eventos y reanudación | Una tarea real, seguimiento y continuación en worktree |
| Claude workers | CLI estructurada o Agent SDK según autenticación validada | Inicio, mensajes posteriores, interrupción y recuperación |
| Meshy | Trabajo asíncrono, progreso y descarga de resultados | Job remoto persistido, modelo propio y estado reconciliado |
| Blender | Preparación/exportación con puente disponible | Un asset procesado con parámetros y salida trazables |
| Unreal | Capacidades del editor mediante MCP y operaciones comprobadas | Leer, modificar, guardar y probar en el editor correcto |
| Git/build | Worktrees, integración, UAT y ejecución de pruebas | Resultado asociado al commit y plataforma evaluados |

La documentación oficial de OpenAI ofrece App Server para gestionar conversaciones y recibir eventos. Su adaptación al panel seguirá el esquema de la versión instalada. Fuente: [Codex App Server](https://learn.chatgpt.com/docs/app-server).

Claude permite sesiones reanudables y salida estructurada. La modalidad de acceso y facturación se verificará para cada conector; no se supondrá que una suscripción cubre cualquier aplicación distribuida o uso SDK. Fuentes: [sesiones Claude](https://code.claude.com/docs/en/agent-sdk/sessions), [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), [CLI programática](https://code.claude.com/docs/en/headless).

### Meshy visible de extremo a extremo

Cada generación conserva ID remoto, parámetros, estado, progreso recibido, error, variantes y artefactos. Meshy es un trabajo externo vinculado a una tarea; no necesita un worktree de Git para generar.

La cadena visible será Solicitud → Preview → Refinado → Guardado → Revisión → Preparación → Importación Unreal → Prueba. Cada paso puede fallar o necesitar una decisión sin presentar el asset como terminado.

El MVP local usará progreso mediante SSE y reconciliación por consulta de estado. La cancelación se ofrecerá sólo donde el endpoint la soporte. Los webhooks podrán incorporarse después. Fuentes: [Text to 3D](https://docs.meshy.ai/en/api/text-to-3d), [webhooks](https://docs.meshy.ai/en/api/webhooks).

Se guardarán modelos, texturas y miniaturas en almacenamiento propio al completarse el trabajo. La política API documentada por Meshy contempla retención máxima de tres días fuera de condiciones Enterprise y URLs firmadas que vencen. Fuente: [retención de assets](https://docs.meshy.ai/en/api/asset-retention).

## 9. Pruebas y evidencia por tarea

| Cambio | Comprobaciones propuestas |
|---|---|
| C++ o plugin | Compilación, pruebas seleccionadas y arranque pertinente |
| Blueprint | Compilación, referencias y comportamiento en ejecución |
| UMG | Capturas en resoluciones objetivo, foco, navegación y acciones |
| Asset | Procedencia, escala, pivote, colisión, materiales e importación |
| Mapa o PCG | Carga, recorrido, navegación si aplica, semillas y rendimiento |
| Animación/audio | Integración con gameplay y observación/reproducción real |
| Entrega | Cook, paquete, arranque y recorrido desde el ejecutable |

Cada informe registra tarea, run, commit, versión de motor, mapa, configuración, fecha y archivos de evidencia. Los resultados posibles incluyen pendiente, ejecutando, aprobado, fallido, omitido y no disponible.

Un worker terminado, un screenshot o un proceso con salida cero no sustituyen las pruebas pertinentes. Las comprobaciones se seleccionan según el cambio, y el panel identifica qué se ejecutó realmente. Fuentes: [Automation Test Framework](https://dev.epicgames.com/documentation/en-us/unreal-engine/automation-test-framework-in-unreal-engine), [Data Validation](https://dev.epicgames.com/documentation/unreal-engine/data-validation-in-unreal-engine), [build y UAT](https://dev.epicgames.com/documentation/en-us/unreal-engine/build-operations-cooking-packaging-deploying-and-running-projects-in-unreal-engine).

## 10. Modelo de datos y contratos

Entidades principales: DevelopmentWorkspace, Request, Task, AgentIdentity, Conversation, Run, ProviderSession, Worktree, ResourceLease, ChangeSet, AssetJob, Artifact, TestRun, Integration y Event.

La atribución debe distinguir «implementó», «revisó», «generó», «integró» y «verificó». Una misma tarea puede tener varios intentos y responsables por rol.

Herramientas propuestas para Nomos:

- `create_task`: especificación, aceptación, dependencias y recursos.
- `start_worker`: tarea, rol, proveedor, modelo, base e historial a recuperar.
- `send_worker_message`: corrección o petición asociada a una ejecución.
- `inspect_task`: estado, hijos, eventos, cambios, artefactos y pruebas.
- `request_checks` y `request_review`: comprobaciones contra una revisión concreta.
- `request_asset_job`: generación/preparación bajo un presupuesto definido.
- `integrate_task`: candidato y revisión esperada de la rama destino.
- `finalize_task`: verificar condiciones, preservar datos y cerrar recursos.
- `ack_event` y `publish_reply`: recepción y respuesta del director.
- `control_run`: interrupción/cancelación compatibles con el proveedor.

Son nombres del contrato de Nomos que habrá que implementar; no herramientas ya disponibles por escribir el plan.

Los eventos incluirán versión, ID único, secuencia, fecha, origen, tarea, run, relación padre/hijo, correlación y causa. Ejemplos propios: `task.created`, `worker.started`, `message.received`, `tool.completed`, `artifact.created`, `test.failed`, `integration.completed`, `workspace.closed` y `task.done`.

## 11. Base técnica recomendada

- Frontend: React y TypeScript con Ant Design claro; Ant Design X para chat si supera la comprobación de compatibilidad.
- Servicio local: Node.js y TypeScript, API HTTP para comandos y SSE para actualizaciones del panel.
- Persistencia inicial: SQLite con transacciones, eventos durables y outbox. Artefactos y transcripciones en almacenamiento externo a los worktrees.
- Procesos: supervisor que registre propiedad, inicio y terminación de cada ejecución y sus hijos. En Windows se evaluará supervisión mediante Job Objects.
- Empaquetado: distribución del runtime junto a la skill/plugin, frontend compilado y migraciones versionadas. El arranque cotidiano no dependerá del servidor de desarrollo del frontend.
- Configuración: rutas y capacidades detectadas, presupuestos y concurrencia configurables; secretos en almacenamiento seguro. El repositorio del juego conserva configuración compartible, no tokens ni logs privados.

No será necesario introducir una infraestructura distribuida para el primer corte. El servicio local contiene las interfaces que permitirán añadir hosts de Unreal/GPU más adelante.

### Fiabilidad requerida desde el inicio

Persistir cada comando antes de ejecutarlo y usar IDs idempotentes. Reconectar el panel desde un cursor no vuelve a ejecutar tareas. Sólo un runner obtiene la reserva de cada ejecución.

Ante una creación remota de resultado incierto, reconciliar antes de reintentar. La deduplicación local no garantiza ejecución única en un proveedor externo; no repetir a ciegas una generación que podría haberse cobrado.

Separar fallo de conexión, ejecución fallida, cancelación solicitada y cancelación confirmada. Una capacidad ausente se muestra como tal. Limitar ciclos de corrección, presupuesto y concurrencia; cuando se agoten, Nomos presenta el bloqueo con evidencia.

## 12. Desarrollo por hitos

| Hito | Entrega | Criterio de salida |
|---|---|---|
| 0. Prueba de escucha | Skill mínima, servicio y página de intercambio | Una sola invocación conecta la sesión original; ida/vuelta y recuperación verificadas |
| 1. Base persistente y diseño | Arranque idempotente, estado durable y shell Ant Design | Reiniciar conserva datos; maqueta de tablero/chat/timeline validada; datos de prueba identificados |
| 2. Nomos y un worker real | Crear tarea, levantar Codex en worktree y ver eventos/chat | Petición → tarea → cambios → corrección al mismo responsable, sin pasos manuales de despacho |
| 3. Varios workers | Claude hijo, dependencias, revisión y reservas | Paralelismo de tareas independientes y exclusión comprobada sobre recursos compartidos |
| 4. Producción de assets | Meshy/Blender, galería y archivos propios | Generación y preparación trazables, progreso real y continuidad tras desconexión |
| 5. Unreal y QA | Puente comprobado, importación, comportamiento, capturas y build | Una petición produce un cambio real en Unreal con evidencia del resultado |
| 6. Integración y cierre | Verificación integrada, preservación y retirada de worktrees | DONE deja commits recuperables e historial accesible; una continuación crea un workspace nuevo |
| 7. Endurecimiento y acabado | Fallos/reintentos, límites y revisión visual integral | Recorrido completo estable, estados fiables y panel Ant Design coherente y usable |

Los hitos se ordenan por riesgo y dependencia. El diseño visual se desarrolla desde el hito 1 y se consolida mientras entran las integraciones; no se difiere toda la interfaz hasta el final.

El primer MVP completo comprende los hitos 0 a 7: skill, Nomos central, dos proveedores de agentes, tablero, chat, timeline, assets, Unreal, pruebas y worktrees con cierre seguro. Funciones posteriores: más hosts/GPU, colaboración multiusuario, streaming continuo del editor, comparación 3D avanzada y cadenas extensas de rigging/animación.

## 13. Pruebas de aceptación de la plataforma

1. Invocar `/nomos` dos veces deja una sola instancia de servicio y un único director propietario.
2. Un mensaje de la web llega a la sesión original, se confirma y recibe respuesta sin invocación manual adicional.
3. Expirar el vigilante, reconectar o reiniciar el servicio conserva pendientes y no duplica tareas.
4. Cerrar Claude cambia el estado visible de Nomos y conserva la bandeja.
5. Nomos crea tareas hijas, workers y worktrees con atribución trazable.
6. Dos workers solicitan el mismo widget: sólo uno consigue escritura y el otro muestra su espera.
7. Una tarea que declara implementación lista pero falla pruebas permanece fuera de DONE y vuelve al responsable.
8. Cada captura, modelo y prueba identifica su ejecución y la revisión evaluada.
9. Un job Meshy sobrevive a la recarga del panel y sus archivos se conservan antes de vencer los enlaces.
10. La integración detecta cambios en la rama destino y exige comprobar el resultado actualizado.
11. Un error al preservar evidencia o parar procesos impide retirar el worktree y deja un motivo recuperable.
12. DONE elimina el workspace temporal sin perder conversaciones, autores, commits o pruebas.
13. «Pídele al responsable que ajuste esto» crea una continuación con el contexto y atribución anteriores.
14. El paquete se ejecuta fuera del editor y su recorrido queda registrado.

## 14. Orden de la primera implementación

Empezar por el recorrido pequeño que concentra el mayor riesgo: **invocar skill → abrir panel → enviar petición → despertar Nomos → crear una tarea → levantar un worker en worktree → recibir un resultado → pedirle una corrección**.

Después incorporar un asset y una prueba real de Unreal, y completar integración/cierre. El avance se medirá por estos recorridos verificables y por la calidad de los resultados visibles.
