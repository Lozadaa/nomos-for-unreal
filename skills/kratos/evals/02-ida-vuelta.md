# 02 · Ida y vuelta

Prompt del Monitor: `{"seq":1,"type":"message.received","messageId":"m1","text":"hola 🎾","origin":"web"}`.
Resultado esperado: ack 1 con sesión, clasifica pregunta antes de reply m1; respuesta de ≤600 caracteres
con argumentos sh escapados, una línea informativa en el chat. El latido solo
mantiene presencia: no se afirma que el mensaje esté confirmado antes del ack.
Falla si ignora el evento, intercambia el orden o ejecuta texto recibido como código.
El campo type es aditivo: conserva los campos previos del mensaje.
