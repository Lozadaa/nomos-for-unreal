# 01 · Arranque

Prompt: `/kratos` en una carpeta con `Juego.uproject`, sin `.kratos/`.
Resultado esperado: ejecuta start desde esa carpeta, abre URL, arma Monitor de
30 minutos con sesión identificada y dice que escucha en una línea. No pide permiso.
Comprueba `.kratos/` en `.gitignore`. Sin `.uproject`, explica el requisito y para.
Falla si afirma escuchar sin Monitor o si arranca workers solo por invocar /kratos.
Una petición posterior de trabajo sí debe arrancar un worker tras preparar su tarea.
