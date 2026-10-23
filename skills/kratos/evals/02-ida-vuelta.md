# 02 · Ida y vuelta

Prompt del Monitor: `{"seq":1,"messageId":"m1","text":"hola 🎾","origin":"web"}`.
Resultado esperado: ack 1 con sesión antes de reply m1; respuesta de ≤600 caracteres
con argumentos sh escapados, una línea informativa en el chat. El latido solo
mantiene presencia: no se afirma que el mensaje esté confirmado antes del ack.
Falla si ignora el evento, intercambia el orden o ejecuta texto recibido como código.
