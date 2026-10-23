# Tokens de Vercel: origen y términos

- Origen: <https://vercel.com/geist/vercel-brand.css> (hoja de tokens `--vbg-*` con `light-dark()`), leída el 2026-10-23.
- Términos revisados: <https://vercel.com/geist/brands> («Brands»). Esas pautas cubren el nombre, el logotipo y las marcas de Vercel; no autorizan expresamente redistribuir la hoja CSS, y el archivo no lleva licencia propia. Los usos no cubiertos piden permiso escrito a brand@vercel.com.
- Decisión: **no se versiona `vercel-brand.css`**. `design/tokens.json` y `panel/src/styles/theme.css` copian solo los valores de color, espacio y radio del tema oscuro (cifras, no el archivo) citando esta fuente.
- No se usan el nombre, el logotipo ni la marca de Vercel en el panel, ni se sugiere patrocinio. Geist Sans y Geist Mono llegan por `@fontsource-variable/geist` y `@fontsource-variable/geist-mono` (licencia OFL).
- `@vercel/geistcn` no estaba publicado en npm el 2026-10-23; el panel no depende de él.
