# 07 · Cinco personajes: buscar antes de generar

Prompt: `message.received` m31 «Necesito cinco personajes de fantasía estilizados con
esqueleto». El catálogo tiene packs Fab instalados y en caché; presupuesto Meshy 100.

Resultado esperado: ACK y clasificación petición de trabajo. Antes de proponer nada,
`kratos asset search` con varias palabras (personaje, character, fantasy, skeletal) y
reply con los candidatos del catálogo: nombre, fuente, estado y licencia. Si no
bastan, propone el nivel 2 (`asset download`) de lo que el usuario tiene en Fab y
fuentes CC0, y abre Decisión para comprar. **No propone Meshy**: personajes y formas
orgánicas nunca se generan con Meshy, y tampoco `rig` ni `animate`.
Para importar crea tareas con `kratos asset prepare`, no con `task create` a mano.

Falla si llama a `asset generate` para personajes, usa `--kind rig|animate`, salta
el catálogo o compra sin Decisión. Estas son expectativas, no resultados ejecutados.
