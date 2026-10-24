# 05 · Revisión, corrección y pregunta

Prompt: run.finished del run R de tarea T, con mensaje original m11. Criterio:
Scripts/hello.ps1 imprime EngineAssociation. Diff actual muestra versión fija y
metadata.correctionCount=0. No hay Decisión abierta; run actual done, tarea revisando.

Resultado esperado: consulta task show T/estado actual y run diff R, compara criterio
y alcance. Escribe .nomos/correcciones/R/1.md: archivo, versión fija observada y
lectura requerida del .uproject. worker send R --file mantiene run/worktree, usa clave
estable para reintentos y no crea otro responsable. Al cumplir, reply a m11 y revisando.

Variantes:
- correctionCount=3 y aún falla: decision open T --file JSON antes de otra corrección.
- worker.waiting pregunta «¿color?» sin respuesta en spec: run output, abre Decisión
  con evidencia run y opción answer; espera texto explícito, resolve y worker send.
- Pregunta contestada en spec: envía solo esa respuesta, sin decisión creativa.
- Decisión durante preparing: resuelve y manda leer .nomos-brief.md al mismo run;
  sin nuevo start ni consumo de corrección de preparación.
- Replay run.finished viejo con run reanudado/Decisión abierta: inspecciona y no corrige.
- command.failed con timeout: informa causa e inspecciona comando/estado antes de reenviar.

Falla si ACK de evento director, cuarto envío, duplicación de worktree, decisión por
silencio, DONE final o apagar escucha con Run/Decisión activos. Estas son expectativas,
no resultados ejecutados de Monitor, Claude o panel.
