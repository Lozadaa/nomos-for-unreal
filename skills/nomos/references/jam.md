# Modo jam

Para una game jam: alcance mínimo, algo jugable cada día aprobado por el usuario y lo aprendido en Second Brain.
El contraejemplo es el plan de Block Kings (7 hitos, 30 tareas, el 44 % del trabajo fuera del plan).

## Arrancar

```
nomos jam init --data .nomos --tema "<tema>" --dias <n>
```

Escribe `docs/plan-jam.md` en el juego y marca `config.json` con `jam: {enabled: true, days: n, start: <fecha>}`.
También deja `director.mode: "evento"`: sin director permanente, una sesión corta por evento ([modo evento](../SKILL.md#modo-evento)).
En un juego solo de Blueprints (sin `.cpp`/`.h` en `Source/`) graphify queda apagado: no ve Blueprints ni mapas.
Un segundo `init` no sobrescribe el plan sin `--force`. Rellena el plan con el usuario antes de crear tareas:

| Sección | Qué lleva |
|---|---|
| Idea en una frase | Quién eres, qué haces y por qué divierte |
| Una mecánica | La única acción que el jugador repite |
| Una arena | Un solo mapa pequeño |
| Qué se ve el día 1 / mitad / último día | Tres filas; cada una se puede jugar |
| Recortes si falta tiempo | Cinco cosas que se quitan, en orden |
| Hitos | Uno por día, cada uno con su tarea «Cierre J<n>» jugable |

## Dirigir con `jam.enabled`

- Crea como máximo las tareas del día en curso y la de cierre del día. Nada de adelantar días.
- Ninguna tarea nueva fuera del plan de jam sin una Decisión del usuario que la acepte (opciones «Aceptar» y
  «Fuera del plan»). Si el usuario pide algo nuevo en el chat, primero esa Decisión.
- Cada tarea de cierre (`role: cierre` o título que empieza por «Cierre») necesita build estampada
  (`nomos build stamp Build/Windows-actual`) y el «Aprobar» del usuario en «Por aprobar» después del último
  commit. Sin eso el servicio no la pasa a `done` (`task.closing_blocked` «Falta tu aprobación sobre la build jugable»).
- Un hito con más de 24 h sin aprobación abre la Decisión «Hoy no hay build jugable aprobada»:
  «Recortar» = aplica el siguiente recorte del plan; «Seguir» = sigue sin recortar.
- El informe del cierre termina con `## Lecciones` (1 a 5 líneas reutilizables en otro juego); el servicio
  las guarda en Second Brain al cerrar ([cierre](cierre.md#lecciones)).
