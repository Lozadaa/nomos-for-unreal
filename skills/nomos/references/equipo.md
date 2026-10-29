# Equipo: varios Nomos sobre el mismo juego

Cada persona corre su Nomos sobre su clon. Lo compartido vive en la rama `nomos/equipo` del remoto `origin`:
un `equipo/<id>.json` por persona, que solo escribe su dueño. `main` no recibe commits de sincronización.

| Orden | Qué hace |
|---|---|
| `nomos team status` | JSON: `enabled`, `shared` (la rama existe), `remote`, yo y los peers |
| `nomos team init --name N --frente F` | Activa el equipo, publica la tarjeta ya; `aviso` si el frente lo tiene otro (se comparte) |
| `nomos team frente F` | Cambia de frente; los demás reciben `team.joined` con `changed` |
| `nomos team ask --to Ana "texto"` | Petición a otro frente; llega a su director como mensaje firmado «Richard (combate)» |
| `nomos team leave` | Retira mi tarjeta y apaga el equipo |

| Ritmo | Valor |
|---|---|
| Publicar mi tarjeta | 10 s tras un cambio (agrupado) y latido cada 5 min |
| Traer la rama | Cada `team.pullSeconds` (60 s) |
| Peer ausente | 30 min sin latido; sus reservas caducan por su `until` |
| Sin remoto o sin red | `team.unavailable` una vez; lo local sigue |

Eventos: `team.joined` (alguien se unió o cambió de frente: dilo en una línea), `team.left`, `team.request`.

## Reglas para el director

- Tareas de otro frente: se ven (franja Equipo del panel), no se tocan. Para pedir algo, `team ask`.
- Todo `.umap`/`.uasset` que una tarea vaya a tocar va en `--leases`. Antes de arrancar un worker, Nomos publica las
  reservas, trae la rama y, si un peer tiene la misma ruta (o una carpeta que la contiene), la tarea espera:
  «Ana tiene reservado L_Arena hasta 16:40». Dos reservas en el mismo minuto: gana la más antigua.
- Un binario tocado sin reserva se detecta al integrar: se reserva al vuelo si está libre; si lo tiene un peer,
  la tarea se bloquea con su nombre.
- Un título muy parecido a una tarea abierta de un peer abre la Decisión «Ana ya tiene “Barra de vida”: ¿duplicar o
  pedírsela?». Con «pedir», usa `team ask` y no arranques la tarea.
- `main` compartido: antes de integrar Nomos trae `origin/main`; después empuja. Si no avanza tras 3 intentos, la tarea
  queda bloqueada «No se pudo publicar main» (`integration.push_failed`).
- Conflicto en un binario: la tarea queda bloqueada «Conflicto en L_Arena con Ana» y el usuario elige en «Por aprobar»
  **Quedarme con la mía** o **Quedarme con la suya**. Al dueño del frente le llega el aviso. Si lo resuelve a mano, Nomos sigue.
