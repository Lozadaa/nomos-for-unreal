# Qué probar con tests y qué con QA de la IA

Un test es barato de repetir y caza regresiones cuando otra pista integra; el QA de la IA (jugar la demo, mirar
el vídeo) ve lo que un test no ve, pero tarda minutos, gasta tokens y no da siempre el mismo veredicto.

| Comprobar | Con | Por qué |
|---|---|---|
| Compila y el mapa carga sin caerse | Build + test de humo | Segundos; lo rompe cualquier cambio |
| Reglas: quién pierde, turnos, puntos, estados | Test de automatización (TDD) | Lógica pura, estable, se recorre sola al integrar |
| Física, sensación, tamaños, cámara | QA jugando la demo con vídeo | Los tests de física salen frágiles (metras: media hora perdida en una pista) |
| Cómo se ve: HUD, materiales, luz, cielo | QA visual | Un test no ve el fondo negro; la IA mirando el vídeo sí |

- Prototipo, jam o modo rápido: solo los esenciales (humo y 2-3 de reglas). Nada de tests de física ni de visual.
- Proyecto largo (semanas): más tests de reglas y de guardado, porque las regresiones se acumulan.
- Un test frágil más de 10 min se borra y ese criterio se comprueba jugando la demo.
- Nomos mismo (el servicio) no entra aquí: su suite se mantiene; mientras trabajas, solo los tests de lo tocado y la completa antes de fusionar.
