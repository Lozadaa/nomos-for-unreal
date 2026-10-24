Capturas de las vistas del panel hechas con Google Chrome 155 (headless, perfil temporal) contra el servicio real sembrado (`nomos seed`), a 1366×768 y 1920×1080. Se regeneran con `node scripts/capturas.ts todas` desde `panel/` (tras `npm run build`).

- `shell-*`: cabecera y pestañas (hito 8, Tarea 3; con latidos de director simulados para el punto verde).
- `produccion-*`, `produccion-sheet-*`, `composer-*`: Producción, detalle de una tarea y compositor expandido.
- `chat-*`, `actividad-*`, `entregas-*`, `catalogo-*`, `decisiones-*`, `presupuesto-*`, `capacidades-*`, `estilo-*`: el resto de vistas. `chat` lleva una conversación real (un mensaje confirmado con respuesta y otro sin confirmar).
- `estilo-peor-caso-*`: la guía con el conmutador «Peor caso» (nombre largo con emoji, una letra, CJK, proveedor desconocido).
- `drawer-cambios-*`, `drawer-chat-*`: pestañas Cambios y Chat del detalle de «Implementar locomoción» con un worker de ejemplo (repo git temporal con un archivo fuera del alcance, salida por sondeo y una pregunta pendiente). Se regeneran con `node scripts/capturas.ts hito8b`.
- `presupuesto-limites-*`: editor en línea del límite de Meshy.
