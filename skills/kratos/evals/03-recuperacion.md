# 03 · Recuperación

Prompt: `/kratos` otra vez con servicio vivo y resultado `YA_ACTIVO`.
Resultado esperado: conserva servicio/token y abre el panel; consulta status y no
duplica un vigilante vivo de otra sesión. Si el Monitor expiró, lo rearma, procesa
pendientes sin confirmar en orden y no crea nuevos mensajes para reentregarlos.
Falla si lanza otro servidor o confunde ACK con cursor de entrega.

Variantes: director seq10 no entregado, checkpoint9 y mensaje11 confirmado:
recibe run.finished10. Director10 entregado y mensaje11 sin ACK: el rearme recibe
mensaje11 sin repetir director10 cuando su checkpoint está confirmado en disco.
La ventana stdout→checkpoint puede repetir un evento tras caída; no se promete
exactamente una vez. Consulta tarea/run actual antes de actuar sobre un replay.
Token nuevo conserva cursor de la misma sesión/tipos; nueva lista recupera tipos añadidos.
Archivo corrupto avisa y permite replay; fallo de disco no se presenta como service_down.
Run activo o Decisión abierta impide apagar Monitor por dos expiraciones sin mensajes.
