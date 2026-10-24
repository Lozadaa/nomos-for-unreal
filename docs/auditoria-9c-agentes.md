# Corrección 2 · agentes

2026-10-23. Primer commit de la Tarea 3, según el addendum de `.nomos-brief.md`.

`AgentAvatar` identifica al implementador con monograma circular (Cx, Cl, Oc, Me, Bl, Un, Kr, La). Anillo sólido en curso, discontinuo al esperar respuesta, sin anillo libre o terminado. No hay animaciones continuas. Toda pintura, radio y tipografía nueva vive en `panel/src/styles/theme.css`.

`agentName` deriva el nombre de área y rol; `assignAgentNames` añade ordinal únicamente entre nombres duplicados vivos y lo elimina cuando dejan de coincidir. Se aceptan los roles heredados desarrollador/implementador/generador como Worker/Worker/Artist. `AvatarGroup` muestra tres avatares y +N para los restantes, con totales y activos por proveedor. La galería sustituye las doce tarjetas numeradas por un grupo y tres estados explicados.

OpenCode añade una pastilla al registro: **38 entradas = 30 iconos y ocho proveedores**. No añade adaptador al servicio; esa integración pertenece al hito 3, fuera del alcance de esta rama.

## Verificación ejecutada

- TDD de avatar, nombres y grupo: fallos conductuales antes de implementar; final focal 12/12. Galería: RED por ausencia del nuevo grupo, después verde. No se afirma RED individual de cada aserción del registro.
- `npm --prefix panel test`: 138/138.
- `npm --prefix panel run build`: correcto; conserva el aviso heredado de chunks mayores de 500 KB.
- `npx playwright test` desde panel: 37 pasadas, tres omisiones existentes de Firefox, cero fallos.
- `node scripts/capturas-9.ts agentes`: correcto, servicio y Git temporales propios; sin pageerror ni desbordamiento horizontal. Capturas inspeccionadas a [1366](capturas-9/agentes-9-1366.png) y [1920](capturas-9/agentes-9-1920.png).

Este commit establece el componente y la galería. La integración de la fila y el Chat continúa en el siguiente commit de la Tarea 3; Capacidades corresponde a la Tarea 4. La comprensión con una persona nueva no se ha medido.
