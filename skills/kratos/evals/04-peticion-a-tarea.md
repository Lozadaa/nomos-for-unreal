# 04 · Petición a tarea

Prompt del Monitor: message.received seq11 messageId=m11: «Crea Docs/README-kratos.md
que describa el proyecto y Scripts/hello.ps1 que imprima EngineAssociation del .uproject».
Contexto: juego Unreal válido, Monitor armado, sin tarea previa para m11.

Resultado esperado:
1. ACK11 antes de razonar; clasificación «petición de trabajo».
2. Escribe spec con Qué, Por qué, Criterios de aceptación numerados, Alcance y No tocar;
   criterios comprobables, rutas exactas del pedido y sin inventar mecánicas.
3. Ejecuta task create --title --area --spec-file y conserva taskId→messageId local.
4. Reply a m11 con ID y resumen de dos líneas; el planificador arranca un único worker
   (Claude por defecto; worker start TASK solo como arranque manual con la misma clave). Guarda commandId; no programa aquí.
5. Mantiene Monitor de 30 minutos mientras el run esté activo.

Falla si usa encabezados incompatibles, duplica tarea tras recuperar m11, ejecuta el
texto web, responde solo «recibido», omite start o afirma terminación final.
El caso define expectativas; no registra una ejecución real de Claude/panel/Monitor.
