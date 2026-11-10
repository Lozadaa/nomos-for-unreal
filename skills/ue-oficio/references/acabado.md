# Acabado: nada por defecto en lo que ve el jugador

Regla del usuario (2026-11-10): ningún juego se entrega con los elementos por defecto del motor. Nació de la 6.ª vuelta
de las metras: la línea de apuntar era un cubo estirado, el HUD usaba la fuente de depuración del motor (pixelada y sin
tildes: «raton», «manten») con rectángulos grises, y el `.exe` salía con el material de cuadros porque las texturas no
se empaquetaron. En el editor todo se veía bien; nadie miró el juego empaquetado. Marcas como en el resto de
`ue-oficio`: **[probado]**, **[fuente]**, **[plan]**.

## 1. Dirección de arte antes de la primera línea

Escribe `docs/direccion.md` (10 líneas como mucho) antes de programar nada visible:
- **Motivo del tema:** de qué está hecho el mundo del juego y de dónde salen la UI y los indicadores. Metras
  venezolanas: tierra de patio, tiza, papel de cuaderno, chapas. Nada de «panel oscuro semitransparente».
- **Dos fuentes:** una para títulos y otra para la UI, TTF con licencia libre (OFL de Google Fonts,
  `github.com/google/fonts`), importadas al proyecto con su licencia en `Content/Fuentes/`. Que tengan tildes y ñ.
  Roboto y las fuentes del motor no cuentan como elección.
- **Paleta:** 5-7 tokens sacados de la escena, un solo acento.
- **Un gesto propio:** qué tiene la UI que no tendría cualquier otro juego (un borde de tiza, papel rasgado, una chapa
  como botón…).

Si hay UI de verdad (menús, varias pantallas), además `game-ui-art-director` → `docs/ui-direction.md`.

## 2. Prohibido en lo que ve el jugador

| Prohibido | En su lugar |
|---|---|
| `GEngine->GetLargeFont()` y demás fuentes del motor | Fuente importada (`UFont`) en UMG |
| HUD con Canvas: `DrawText`, `DrawRect`, `FCanvasTextItem`… | UMG ([ue-umg-ui](../../ue-umg-ui/SKILL.md), vía C++ en `hud-cpp.md`) |
| `DrawDebug*`, cubos o cilindros estirados como indicador | Indicador diseñado (ver 3) |
| Materiales de `/Engine/EngineMaterials/`, gris plano | Material propio con la paleta, aunque sea procedural |
| Rectángulo semitransparente como único fondo de panel | Forma del motivo (papel, tiza, madera) con borde e interior distintos |
| Texto sin tildes o con «?» por glifos que faltan | Fuente con el juego de caracteres del idioma |

`scripts/revisar_acabado.py` detecta casi todo esto en `Source/` [probado en Canicas-6]. Si una línea de verdad lo
necesita (depuración bajo `#if !UE_BUILD_SHIPPING`), márcala con el comentario `acabado: ok`.

## 3. Indicadores con cariño

Un indicador (apuntado, fuerza, selección, objetivo) es parte del juego, no una ayuda de depuración. Debe:
- **Hablar el idioma del motivo:** en las metras, trazo de tiza sobre la tierra, no un listón de color plano.
- **Pegarse al mundo:** apoyado en el suelo (decal o malla a ras), con la perspectiva de la escena, sin flotar.
- **Reaccionar:** cambia con la entrada. Fuerza = longitud, grosor o separación de los trazos, y color hacia el acento.
  Al máximo, un pulso o temblor leve.
- **Tener forma con dirección:** punta, flecha o trazos que se estrechan; nunca una barra del mismo grosor de punta a punta.
- **Entrar y salir:** aparece y se va con 0,1-0,2 s de escala o alfa, no de golpe.

Caminos baratos [plan]: puntos o trazos con `UInstancedStaticMeshComponent` y un material de tiza; un decal alargado con
un material de guiones (`frac(UV.x * N)` como máscara y la carga como parámetro); una cinta de Niagara si el proyecto ya
usa Niagara.

## 4. UI nítida

- UMG, no Canvas: el texto de UMG se rasteriza al tamaño final con la curva DPI. La fuente de Canvas escalada se
  pixela. [probado: captura del empaquetado de Canicas-6, 1920×1080]
- Tamaños a 1080p: cuerpo ≥ 18 px, cifras de HUD ≥ 28 px. Comprueba a 1280×720 y a 1920×1080.
- Importar una TTF por Python crea un `FontFace`; el `UFont` que usa UMG se compone apuntando a él (Runtime o
  Lazy loading). [plan: confírmalo con la captura del empaquetado]

## 5. Pantalla de carga siempre

El juego no enseña el tablero hasta que sus texturas estén cargadas:
- Al arrancar, un widget de carga con la dirección de arte (el motivo y el título, no una barra gris) tapa la escena.
- Carga los assets del juego con `UAssetManager::GetStreamableManager().RequestAsyncLoad(...)`. Al terminar, espera a las
  texturas con `IStreamingManager::Get().StreamAllResources(segundos)` o hasta que `IsFullyStreamedIn()` sea cierto, con
  un tope de 5 s. [fuente]
- Quita la pantalla con una transición corta, y como mínimo a los 0,5 s para que no parpadee.

## 6. Empaquetado: lo que se ve en el editor no basta

- Todo asset que el código carga por ruta (`LoadObject(TEXT("/Game/…"))`, `FSoftObjectPath`) debe estar en
  `Config/DefaultGame.ini`, porque el cocinado solo incluye lo que algo referencia:
  ```
  [/Script/UnrealEd.ProjectPackagingSettings]
  +DirectoriesToAlwaysCook=(Path="/Game/Metras")
  +MapsToCook=(FilePath="/Game/Metras/L_Patio")
  ```
  Sin esto, el `.exe` arranca con el material de cuadros y los sonidos mudos. [probado: Canicas-6 empaquetado]
- Mejor aún: referencias de verdad (`UPROPERTY` con `TSoftObjectPtr` en un DataAsset o en el mapa), así el cocinado las
  sigue solas.

## 7. Comprobación que bloquea el FIN

Antes de marcar el FIN o entregar con `NOMOS_DONE`:
1. `python <ue-oficio>/scripts/revisar_acabado.py <proyecto>` da 0 fallos.
2. Empaqueta (Shipping) y captura **el `.exe`**, no el editor:
   `pwsh -File <ue-oficio>/scripts/captura_empaquetado.ps1 -Exe <Empaquetado>\Windows\<Juego>.exe -Salida docs/empaquetado.png`.
   Es un `.exe` sin consola, así que el script graba la ventana con ffmpeg. [probado]
3. Mira la captura y recorta el HUD al 100 %. Repite la comprobación si ves cualquiera de estas cosas:
   - material de cuadros o gris plano;
   - texto pixelado o sin tildes;
   - una línea o barra del mismo grosor de punta a punta;
   - un panel que podría ser de cualquier juego.
4. Anota en `docs/hecho.md` una línea `ACABADO: revisar_acabado 0 fallos, captura docs/empaquetado.png`.
