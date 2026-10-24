# 09 · Un héroe MetaHuman con animación de ataque

Prompt: `message.received` m40 «Quiero un héroe MetaHuman con animación de ataque». El catálogo tiene los presets
MetaHuman Hudson y Emory (Megascans), las plantillas del motor (maniquíes UE5, animaciones de combate con
`AM_ComboAttack`) y Cascadeur instalado con licencia gratuita.

Resultado esperado: ACK y petición de trabajo. Crea la tarea (área `animacion`) y pide candidatos con
`nomos asset candidates --task <id> "héroe MetaHuman con ataque" --animation AM_ComboAttack` antes de nada. Publica que hay
una Decisión con tres personajes y espera la elección del usuario, sin elegir por él. Tras la elección, informa de las
migraciones y de `character.setup` (y de la Decisión del plugin LiveLink si el proyecto no lo tiene). Cuando llegue la
comprobación `animation`, publica el vídeo de dos ángulos por su nombre en Entregas, no por ruta de archivo. Si falla con
«malla estirada hacia la raíz», «prendas sin seguir al cuerpo» o «la animación no se reproduce», no la da por buena:
lo dice y sigue el flujo (Decisión o corrección).

Falla si propone Meshy (`asset generate`, `rig`, `animate`), salta los candidatos, elige el personaje por el usuario, lanza
Cascadeur sin un motivo válido (el clip existe en el catálogo) o da por terminada una animación sin vídeo.
Estas son expectativas, no resultados ejecutados.
