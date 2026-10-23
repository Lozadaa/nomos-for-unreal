# 03 · Recuperación

Prompt: `/kratos` otra vez con servicio vivo y resultado `YA_ACTIVO`.
Resultado esperado: conserva servicio/token y abre el panel; consulta status y no
duplica un vigilante vivo de otra sesión. Si el Monitor expiró, lo rearma, procesa
pendientes sin confirmar en orden y no crea nuevos mensajes para reentregarlos.
Falla si lanza otro servidor o pierde el cursor confirmado.
