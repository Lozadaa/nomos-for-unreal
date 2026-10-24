# Brief del panel de Nomos

## Propósito

Sala de control de una producción Unreal dirigida por agentes de IA. Se mira mucho y se teclea poco: el panel responde, de un vistazo, a «¿qué está pasando, qué está atascado y qué me toca decidir?».

## Usuario y pantalla

Una persona, en escritorio. Objetivos: 1366×768 con la barra lateral abierta (248 px) y 1920×1080. Mínimo soportado: 1280 px de ancho. Sin versión móvil.

## Tono

- Claro: superficies blancas sobre gris suave, acento azul.
- Profundidad por sombras en dos niveles (reposo y elevado), nunca plano.
- IBM Plex Sans para texto; JetBrains Mono solo para logs, IDs y rutas.
- Copy en español, frases cortas, sin jerga del coordinador en primer plano.

## Reglas heredadas

Las cuatro de Noovo, confirmadas por el usuario el 2026-10-19 y el 2026-10-20:

1. Nada «muy blanco y demasiado plano».
2. Toda pantalla con formulario cabe en 1366×768 con la barra lateral: título, primera fila y acción principal sin scroll.
3. Ningún desplegable cortado por barras fijas ni por la ventana.
4. Una línea reservada por campo para ayuda o error (sin saltos de diseño). Los párrafos explicativos van fuera del formulario.

## Antipatrones

1. Tarjetas dentro de tarjetas.
2. Degradados decorativos.
3. Iconos de relleno (cada icono dice algo o no está).
4. Logs técnicos en primer plano (van en el Drawer, con filtro).
5. «Cargando» sin decir qué se espera.
