# Luz, exposición y postproceso para que las capturas digan la verdad

## Exposición primero

- Antes de juzgar una captura: un PostProcessVolume sin límites (`bUnbound`), `AutoExposureMethod=AEM_Manual`,
  `ApplyPhysicalCameraExposure=false` y `AutoExposureBias` como único dial de brillo. La autoexposición cambia el
  resultado entre capturas. [probado]
- El bias está en EV y depende de cómo esté calibrada la escena: no copies números. Referencias que funcionaron: piedra
  clara −0,4 a −1, ladrillo +0,5, +0,3 en otra escena. Un bias de 10-11 multiplica la luz ~1000× y quema a blanco. [probado]
- El aviso de Lumen «cached lighting… clipped» es un desajuste de exposición, no de luces. [probado]
- Si hay dos PostProcessVolume sin límites, configura los dos o se pelean. [probado]
- En 5.8 el postproceso ya no tiene `bOverride_ScreenPercentage`: usa la CVar `r.ScreenPercentage`. [probado]
- Para capturas estables: `MotionBlurAmount=0` en el PPV y `t.MaxFPS 30`. [probado]

## Sol y cielo

- Lee la intensidad actual del sol antes de cambiarla: en una escena calibrada con valores de un dígito, meter lux
  reales (50 000) satura a blanco. La intensidad y la exposición van juntas. [probado]
- Mínimo para un mapa vacío que se vea: sol (DirectionalLight) + SkyAtmosphere + SkyLight con `bRealTimeCapture=true`.
  [probado] Sin SkyAtmosphere, `bRealTimeCapture` da un aviso y satura el ambiente. [probado]
- Huecos negros en el cielo: falta SkyAtmosphere y SkyLight, o la luz no tiene `bAtmosphereSunLight=true`. [plan]
- Sin SkyAtmosphere, un sol bajo (por encima de −15° de pitch) con la niebla por defecto da todo blanco. Arreglo
  probado: pitch −13 → −35, intensidad 2000 → 2600, 4500 → 5200 K. [probado]
- Puntos de partida: 6500 K neutro (4000 K quedó demasiado naranja); pitch −8° atardecer, ≈ −38° mediodía. [probado]
- Hora dorada con SkyAtmosphere: pitch −6…−12, 3700-4300 K con LightColor blanco y `bAtmosphereSunLight=true`; deja
  que la atmósfera tiña el cielo en vez de tocar Rayleigh y Mie. [plan]
- Ventanas que brillan al atardecer: emisivo HDR ≈6 con `BloomThreshold=1`, así solo brilla lo emisivo. [plan]
- Interiores: luces reales (Rect, Point) además de los emisivos. [plan]
- No cambies la movilidad de las luces en caliente. [fuente]

## Niebla

- No dupliques: dos SkyAtmosphere o dos ExponentialHeightFog dan neblina azul. [plan]
- Para quitar neblina, `FogMaxOpacity` cuenta tanto como la densidad. Secuencia que funcionó: densidad 0,01 → 0,0003,
  `FogMaxOpacity` 1 → 0,2, `StartDistance` 20 000 → 40 000 y niebla volumétrica apagada. [probado]
- Una franja gris en el horizonte a contraluz es `FogMaxOpacity` demasiado alto. Revisa el aspecto también con el sol
  detrás de la cámara: la neblina solo se ve en esa dirección. [probado]
- En 5.8 `FogInscatteringColor` y `DirectionalInscatteringColor` dan error: el color viene de SkyAtmosphere. [probado]
- Ciudades altas: `FogHeightFalloff` ≈0,0008, o los pisos altos quedan sin niebla. [plan]

## Deshacer

- Si un ajuste de luz sale mal, recarga el nivel sin guardar en vez de revertir propiedad a propiedad. [probado]
