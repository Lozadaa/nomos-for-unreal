# WeLoveIndies para Nomos (jam 12-15 nov 2026)

Investigado el 2026-11-10, sin cuenta. Ventaja de la Epic MegaJam: «Sound and music for non-commercial use»
(<https://www.weloveindies.com/en/epicmegajam>).

## Qué dicen el sitio y sus términos

- **robots.txt**: `User-agent: *` / `Disallow:` vacío. No cierra nada a los programas.
- **Términos** (<https://www.weloveindies.com/en/agb>, versión del 10.08.2026): no hay cláusula sobre bots, scripts,
  scraping ni descargas automáticas. Sí:
  - la cuenta no se comparte: «not allowed to share the WEBSITE account with any third-party»;
  - lo bajado con el botón de cada archivo no está licenciado: «Using unlicensed assets (such as from the
    1-click-download) for any purpose except internal testing is strictly forbidden»;
  - la licencia **Free & Demo (F)**: betas, pitches, demos y «non-commercial releases without budget»; ligada al
    proyecto y al licenciatario, intransferible, hasta 100 sonidos y 10 temas por proyecto;
  - no hace falta atribución en la licencia de pago; en la gratuita piden mostrar su tráiler de intro.
- **FAQ** (<https://www.weloveindies.com/en/faq>): la cuenta gratuita deja probar 100 sonidos y 5 temas cada 30
  días; para una publicación no comercial, su tráiler en los créditos de inicio.
- **Página de la jam**: lo licenciado sigue ligado al proyecto tras el evento; no se reutiliza en otro; si el
  proyecto da dinero, hay que pedir licencia comercial.
- **Premios en metálico**: ni los términos ni la página de la jam los mencionan. **Pendiente del usuario: confirmar
  con WeLoveIndies (<https://www.weloveindies.com/en/contact>) que Free & Demo cubre una entrega a una jam con
  premios.** Hasta entonces, cada `.licencia.json` y `CREDITOS.md` lo recuerdan.

Conclusión: el acceso por programa a ritmo humano no está prohibido, y se construyó. Lo que sí limita la licencia
es el uso: lo de `bajar` es de prueba hasta licenciarlo en el cofre.

## Cómo funciona el sitio

- Web Vue sobre una API JSON del mismo dominio.
- Búsqueda **pública, sin sesión**: `GET /api/search?search-params=<q>&q=<q>` (efectos) y `&for-music=true`
  (música). Devuelve hasta 100 resultados con `id`, `title`, `duration` (s), `artist` (efectos), `file.url`
  (mp3 de escucha, público), `hqFile.url` (`/protected/…wav`) y `hqMp3File`.
- `GET /api/user` devuelve `[]` sin sesión: así se detecta la sesión (Nomos solo lee sí o no).
- Con sesión, cada archivo tiene botón de descarga (`/protected/…wav`): es el «1-click-download» de prueba.
- Lo licenciado pasa por el **cofre** (Chest): se añaden sonidos y temas al proyecto, se elige licencia
  («Choose your Licence») y se descarga un zip que conserva las carpetas. Elegir licencia es aceptar términos: lo
  hace el usuario, no Nomos.
- Entrada: <https://www.weloveindies.com/en/account-authentication/page/login> (email y contraseña, o Google).
- No hay API pública documentada.

## Qué hace Nomos (`service/src/sonido.ts`)

- `nomos sonido login`: Chrome con perfil propio en `%USERPROFILE%\.nomos\navegador\weloveindies\perfil`
  (fuera del repo y del juego; no el Chrome personal) y `--remote-debugging-port=0`; espera a que `/api/user`
  diga que hay usuario y escribe `sesion.json` con la fecha. Nunca toca los campos ni ve la contraseña.
- `nomos sonido buscar`: `fetch` de Node a la búsqueda pública; guarda las fichas en `fichas.json` para `bajar`.
- `nomos sonido bajar`: el mismo perfil con `--headless=new`; la descarga se hace con `fetch` dentro de la página
  (las cookies no salen de Chrome) y los bytes vuelven por el protocolo de DevTools en trozos de 3 MB. Una
  descarga cada 4 s (`NOMOS_WLI_PAUSA_MS`). Sin sesión o caducada: «Ejecuta `nomos sonido login`».
- `nomos sonido importar`: lo descargado del cofre ya licenciado.
- `doctor`: fila «WeLoveIndies» con la fecha de la sesión guardada, nada más.

## Probado con el sitio real (2026-11-10)

- `nomos sonido buscar "door creak" --tipo efecto --limite 3` y `buscar tension --tipo musica`: resultados reales.
- `bajar` con una marca de sesión falsa: Chrome sin cabeza abre el sitio, `/api/user` dice que no hay sesión, borra
  la marca y responde «Ejecuta `nomos sonido login`» (2,5 s); Chrome se cierra.
- No probado sin la cuenta: `login` real y descarga real de `/protected/…`.

## Prueba pendiente del usuario

1. Crea la cuenta gratis en <https://www.weloveindies.com/en/epicmegajam>.
2. `nomos sonido login` → entra en la ventana → «Sesión guardada». `nomos doctor` muestra «WeLoveIndies presente».
3. `nomos sonido buscar "wood creak" --tipo efecto --limite 3` y apunta un id.
4. En la carpeta de un juego: `nomos sonido bajar <id> --juego .` → mira `Importar/Audio/` y `CREDITOS.md`.
5. Ejecuta la orden `nomos ue receta …` que imprime y comprueba el `SoundWave` en `/Game/Audio`.
6. Si algo falla (la sesión no se detecta, la descarga vuelve como HTML), avisa: puede que `/api/user` o la ruta
   `/protected/` se comporten distinto con cuenta.

## Plan B manual

Si el sitio cambiara o la automatización dejara de valer: el usuario añade los sonidos al cofre, elige la
licencia, descarga y descomprime el zip, y `nomos sonido importar <carpeta> --juego <juego>` los mete con su
licencia y su línea de créditos.
