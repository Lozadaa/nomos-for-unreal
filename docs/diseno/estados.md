# Vistas y estados del panel

Cada vista del plan v2 §2.3 con todos sus estados, el copy exacto que se ve y la acción disponible. Reglas de copy: español, tú, frases cortas, mayúscula solo inicial. Nunca aparecen «outbox», «SSE», «worktree», «listener», «run» ni «token»; sí «espacio de trabajo», «conexión», «ejecución». Todo estado vacío lleva una acción. Ningún estado se distingue solo por color: lleva icono y texto.

Estados de la tarjeta (`.k-state-*`): pendiente, preparada, implementando, revisando, probando, integrando, cerrando, done («Hecha»), bloqueada, decision («Espera decisión»).

## Franja del director (siempre visible)

Muestra: servicio, escucha, última recepción confirmada, trabajo en curso, y Pausar o Reanudar. El texto principal de los cinco estados coincide con el hito 0.

| Estado | Qué se ve | Copy exacto | Acción disponible |
|---|---|---|---|
| Esperando (`.k-director-esperando`) | Icono de reloj, tono neutro | `Servicio activo · esperando a Kratos` · apoyo: `Todavía no hay una sesión conectada.` | Ver cómo conectar |
| Escuchando (`.k-director-escuchando`) | Icono de ondas, tono verde | `Kratos escuchando` · apoyo: `Última recepción confirmada hace 12 s.` | Pausar |
| Atendiendo (`.k-director-atendiendo`) | Icono de engranaje, tono azul | `Kratos atendiendo 3 mensajes` · apoyo: `Ahora: Habilidad Meteorito.` | Pausar |
| Vigilante caído (`.k-director-vigilante-caido`) | Icono de aviso (triángulo), tono ámbar | `Vigilante caído · 2 mensajes en espera` · apoyo: `Rearmando la escucha. Tus mensajes no se pierden.` | Volver a escuchar |
| Desconectado (`.k-director-desconectado`) | Icono de enchufe cortado, tono rojo | `Servicio desconectado` · apoyo: `Sin conexión con el servicio. Los mensajes nuevos esperan.` | Reintentar conexión |
| En pausa (sobre cualquiera) | Icono de pausa, texto añadido | `En pausa · Kratos no recibirá mensajes` | Reanudar |

## Producción (tablero)

Ocho columnas: Pendiente, Preparada, Implementando, Revisando, Probando, Integrando, Cerrando, Hecha. La tarjeta muestra responsable, dependencias, ejecución, espacio de trabajo, habilidades cargadas, última actividad y pruebas. Las tarjetas no se arrastran: se mueven solas cuando el coordinador avanza la tarea.

| Estado | Qué se ve | Copy exacto | Acción disponible |
|---|---|---|---|
| Tablero vacío | Las 8 columnas vacías y, en el centro, mensaje con icono | `Escribe la primera petición a Kratos` · apoyo: `Kratos la convierte en tareas y las reparte.` | Botón `Nueva petición` |
| Columna vacía (primera) | Texto discreto en la columna | `Nada pendiente` | Enlace `Nueva petición` |
| Columna vacía (resto) | Texto discreto en la columna | `Aquí aparecen las tareas cuando Kratos las mueve` | Enlace `Ver actividad` |
| Tarjeta normal | Título, responsable y pruebas; la antigüedad, al pasar el cursor | `Habilidad Meteorito` · `Codex · 4/6 pruebas` | Abrir (panel de detalle) |
| Nombre largo o con emoji | Una línea con elipsis; nombre completo al pasar el cursor | `Nude_Tennis_Racket_🎾…` | Abrir (panel de detalle) |
| Bloqueada | Borde e icono rojos, línea de motivo | `Bloqueada · 9 min` · motivo (al pasar el cursor y en el panel): `Falta el pack de texturas.` | `Ver bloqueo` |
| Espera decisión | Icono ámbar, línea de pregunta | `Espera decisión · 3 min` · pregunta en el panel: `Elige entre dos candidatos.` | `Decidir` |
| Cerrando con fallo | Icono ámbar en la columna Cerrando, motivo visible | `No se pudo cerrar · 12 min` · motivo (al pasar el cursor y en el panel): `Quedó un espacio de trabajo sin retirar.` | `Reintentar cierre` |

## Actividad (carriles)

Siete carriles: Kratos, Codex, Claude Code, Meshy, Blender, Unreal, Compilaciones. Filtro por tarea o ejecución; cada evento muestra causa y efecto.

| Estado | Qué se ve | Copy exacto | Acción disponible |
|---|---|---|---|
| Vacío | Carriles sin eventos | `Aún no hay actividad` · apoyo: `Aparecerá cuando Kratos empiece a trabajar.` | Botón `Nueva petición` |
| Sin resultados | Carriles filtrados, vacíos | `Ningún evento coincide con el filtro` | `Quitar filtro` |
| Hueco por desconexión | Franja rayada en el carril con el intervalo | `Sin datos de 14:02 a 14:09 · servicio desconectado` | `Ver detalle` |

## Entregas (galería)

Modelos, texturas, capturas, vídeos, antes y después, compilaciones. Visor 3D para modelos.

| Estado | Qué se ve | Copy exacto | Acción disponible |
|---|---|---|---|
| Vacía | Cuadrícula vacía | `Aún no hay entregas` · apoyo: `Los modelos y capturas aparecerán aquí.` | Botón `Nueva petición` |
| Trabajo en progreso | Miniatura con barra y tiempo | `Generando modelo · Meshy · unos 3 min` | `Cancelar` |
| Enlace vencido con copia propia | Miniatura normal, aviso discreto | `El enlace original venció. Se muestra la copia guardada.` | `Descargar copia` |
| Importación fallida | Miniatura con icono rojo | `No se pudo importar a Unreal` · motivo: `El formato no es compatible.` | `Reintentar` |

## Catálogo

Assets propios e indexados: origen, estado, licencia, miniatura, compatibilidad.

| Estado | Qué se ve | Copy exacto | Acción disponible |
|---|---|---|---|
| Sin indexar | Tabla vacía con mensaje | `Aún no se ha indexado nada` · apoyo: `Kratos busca aquí antes de generar un asset nuevo.` | Botón `Indexar ahora` |
| Indexando | Barra de avance sobre la tabla | `Indexando proyectos · 3 de 10` | `Cancelar` |
| Fila normal | Miniatura, nombre, origen, licencia, compatibilidad | `Free_Tennisball` · `Fab · Licencia estándar · UE 5.8` | `Preparar para Unreal` |
| Licencia desconocida | Etiqueta ámbar con icono | `Licencia desconocida` | `Revisar licencia` |
| Prohibido para IA | Etiqueta roja con icono; sin botón de preparar (dato `is_ai_forbidden`) | `Prohibido para IA · no se puede usar con agentes` | `Ver motivo` |
| Instalado en proyecto | Etiqueta verde con icono | `Instalado en CrazyPadel` | `Ver en el proyecto` |
| Sin resultados | Tabla vacía tras buscar | `Ningún asset coincide con tu búsqueda` | `Quitar filtros` |

## Chat y detalle de tarea

Chat central. El panel de detalle (720 px) tiene seis pestañas: Resumen, Chat, Cambios, Pruebas, Assets, Línea de tiempo. «Pedir cambios al responsable» envía el mensaje a quien hizo la tarea.

| Estado | Qué se ve | Copy exacto | Acción disponible |
|---|---|---|---|
| Chat vacío | Campo de texto y una sugerencia | `Cuéntale a Kratos qué quieres construir` | Botón `Enviar` |
| No confirmado | Mensaje con reloj junto a la hora | `Enviado · esperando confirmación de Kratos` | `Reenviar` |
| Pendiente | Mensaje con una marca | `Recibido · Kratos lo atenderá en breve` | — |
| Continuación tras Hecha | Aviso arriba del panel | `Esta tarea ya está hecha. Tu mensaje abre una continuación con Codex, que la hizo.` | `Pedir cambios` |
| Sin pruebas | Pestaña Pruebas vacía | `Esta tarea aún no tiene pruebas` | `Ver resumen` |
| Cargando detalle | Esqueleto del panel con texto | `Cargando el detalle de la tarea` | — |

## Decisiones

Bloqueos con evidencia y opciones; se cierran con una elección registrada.

| Estado | Qué se ve | Copy exacto | Acción disponible |
|---|---|---|---|
| Vacía | Lista vacía | `No tienes decisiones pendientes` · apoyo: `Cuando Kratos necesite tu criterio, aparecerá aquí.` | Botón `Ver producción` |
| N pendientes | Lista, con el número junto al menú lateral | `Tienes 2 decisiones pendientes` | Elegir una opción |
| Con dos opciones | Pregunta, evidencia y dos botones | `¿Qué shader usamos para el pack?` · `Advanced Cel Shader Lite` / `Material propio` | Un botón con el nombre de cada opción |
| Elegida | Aviso breve que no roba el foco, con la consecuencia dicha | `Elegiste Advanced Cel Shader Lite. Codex continúa.` · apoyo bajo las opciones: `Se registra tu elección y Codex continúa. Podrás deshacerla unos segundos.` | `Deshacer` |
| Caducada | Decisión atenuada, aviso | `Esta decisión caducó porque cambió el contexto. Kratos la prepara de nuevo.` | `Ver la nueva` |

## Presupuesto

Gasto por tarea y proveedor (créditos de Meshy, uso de los modelos de IA, minutos de compilación) y sus límites.

| Estado | Qué se ve | Copy exacto | Acción disponible |
|---|---|---|---|
| Sin límite | Cifras sin barra | `Sin límite definido` · apoyo: `Kratos no se detendrá por gasto.` | Botón `Definir límite` |
| Con límite | Cifra y barra de progreso | `Meshy · 120 de 400 créditos` | `Cambiar límite` |
| Agotado | Barra llena, icono rojo | `Meshy · límite agotado` · apoyo: `Kratos te pedirá una decisión antes de seguir.` | `Subir límite` |

## Capacidades

Conectores y habilidades detectados y comprobados en cada espacio de trabajo.

| Estado | Qué se ve | Copy exacto | Acción disponible |
|---|---|---|---|
| Ausente | Fila gris con icono | `No instalado` | `Ver cómo instalar` |
| Detectado | Fila con icono de ojo | `Detectado · sin comprobar` | `Comprobar ahora` |
| Comprobado | Fila verde con marca | `Comprobado hace 5 min` | `Volver a comprobar` |
| Roto | Fila roja con icono | `No responde` · motivo: `La última comprobación falló.` | `Reintentar` |

## `/estilo` (solo desarrollo)

Galería de referencia: tokens y todos los componentes en todos sus estados. Sustituye a Storybook.

| Estado | Qué se ve | Copy exacto | Acción disponible |
|---|---|---|---|
| Galería | Índice fijo a la izquierda y secciones con ancla | `Guía de estilo` | Ir a una sección |

## Revisión con ux-writing

Pasada de la skill `ux-writing` sobre todo el copy (títulos 3-6 palabras, botones de 2-4 palabras con verbo en infinitivo o imperativo, errores con qué falló y qué hacer, sin culpar al usuario):

- «Drawer» y «token» no aparecen en la interfaz: «panel de detalle» y «uso de los modelos de IA».
- «Timeline» pasa a «Línea de tiempo»; «Done» a «Hecha»; «run» a «ejecución»; «worktree» a «espacio de trabajo».
- Los errores dicen la causa y siguen con una acción («No se pudo cerrar» + motivo + `Reintentar cierre`).
- «Volver a escuchar» sustituye a «reactivar vigilante»: la acción describe el resultado, no la pieza interna. El nombre «Vigilante caído» se mantiene porque lo fija el hito 0.
- Cada estado vacío explica por qué está vacío y ofrece una acción.
