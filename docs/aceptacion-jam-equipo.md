# Aceptación · equipo sincronizado por Git (fase 4 de jam-rápido)

Fecha: 2026-11-10, rama `jam-equipo`. Un PC, un remoto desnudo local y dos clones: Richard (escenarios) y Ana (luz).

## Cómo se hizo

- Juego mínimo en una carpeta temporal: `Prueba.uproject` (`EngineAssociation` 5.9), `.gitignore` con `.nomos/` y un
  `Content/Mapas/L_Patio.umap` de mentira. `nomos nuevo` aún no existe (lo hace otra tarea) y no hizo falta `nomos embed`:
  se usó el servicio de este worktree.
- **Ana: servicio de verdad** (`nomos start --no-open --port 47911 --data <clon>/.nomos`, `NOMOS_LAUNCHER=process` y un
  `claude.cmd` en el `PATH` que llama a `tests/fakes/claude.mjs`). Su tarea se crea con `nomos task create` contra ese servicio.
- **Richard: las funciones del servicio en un proceso**, con el mismo bucle de equipo cada 10 s (`syncTeam`). Su tarea
  llega a `integrando` como en `tests/service/team-fixture.ts` (worktree, commit, revisión aprobada, comprobación
  pasada) y se integra con `integrateRun`, que trae `origin/main`, fusiona, firma y empuja. El cierre se marca a mano
  (`cerrando` → `done`). Motivo: llevar una tarea de punta a punta con servicio real pide un director y un revisor;
  con el `claude` falso no hay quien los haga. Lo que se mide aquí (lo que viaja por Git y lo que ve Ana) es código real.
- Richard deja otra tarea en curso, «Antorchas del patio», con `L_Patio.umap` reservado. Ana crea «Luces del patio»
  sobre el mismo mapa.
- Las horas de la reserva salen en hora local (UTC-3); las marcas `[hh:mm:ss]` del registro, en UTC.

## Salida

```text
[06:38:43] Ana · nomos start: URL http://127.0.0.1:47911/#token=… | ARRANCADO
[06:38:44] Richard publica su tarjeta con la reserva de L_Patio
[06:38:46] Richard integra: {"integrated":true,"commit":"88f36a1"}
[06:38:46] origin/main = 88f36a1
[06:38:46] Ana crea la tarea 15c85a81-a3da-4046-91cf-c9d43bb4e28a
[06:38:51] la tarea de Ana espera a los 3 s: Richard tiene reservado L_Patio hasta 07:38
[06:39:00] Ana ve «hecho» a los 12 s
[06:39:00] main de Ana avanzó solo a los 12 s

--- nomos equipo (clon de Ana) ---
Ana (luz) · presente · main 88f36a1, al día
Richard (escenarios) · presente · main 88f36a1, al día
  haciendo: Antorchas del patio [implementando] · reserva L_Patio hasta 07:38
  hecho:    Suelo de piedra del patio (hace 0 min)

--- nomos equipo (clon de Richard) ---
Richard (escenarios) · presente · main 88f36a1, al día
  haciendo: Antorchas del patio [implementando] · reserva L_Patio hasta 07:38
  hecho:    Suelo de piedra del patio (hace 0 min)
Ana (luz) · presente · main 07d4f53, 2 commits atrás

--- git log -1 en el clon de Ana ---
88f36a1 Integrar Suelo de piedra del patio (nomos/suelo)
Nomos-Equipo: 5639fc3a Richard (escenarios) tarea 19425036-6457-459c-a31d-f23a2aff4519

--- eventos team.main_moved de Ana ---
{"commit":"88f36a151d4828de04125fbbe4c493929054c3de","by":"Richard","title":"Suelo de piedra del patio","files":["docs/patio.md"]}

--- espera de la tarea de Ana ---
{"title":"Luces del patio","state":"preparada","blocked_reason":null,"wait_reason":"Richard tiene reservado L_Patio hasta 07:38"}

RESULTADO hecho=12.145s main=12.145s espera=3.4s (límite 70 s)
[06:39:02] Ana · nomos stop: DETENIDO
Borrado C:\Users\richa\AppData\Local\Temp\nomos-acept-OYoOZp
```

## Lectura

| Criterio | Resultado |
|---|---|
| `nomos equipo` en el clon de Ana enseña la tarea de Richard en «hecho» en menos de 70 s | Sí, 12 s |
| El `main` de Ana avanzó solo (servicio de Ana, sin integrar nada) | Sí, 12 s; `team.main_moved` con `by: "Richard"` |
| La tarea de Ana sobre el mismo `.umap` espera con «Richard tiene reservado…» | Sí, 3 s, la pone el planificador del servicio |

- 12 s porque el servicio de Ana acababa de arrancar y su primer pase trae la rama. El peor caso es un pase (10 s) más
  `team.pullSeconds` (60 s): 70 s.
- `nomos equipo` trae la rama `nomos/equipo` por su cuenta, así que «hecho» sale en cuanto Richard publica su tarjeta.
- En el clon de Richard, Ana sale «2 commits atrás»: es la última tarjeta que Richard trajo, anterior a que el `main`
  de Ana avanzara. Se corrige en su siguiente pase (60 s).
- El caso «checkout con cambios sin commitear: avisa y no se mueve» está en la prueba
  `tests/service/team-main.test.ts` («main al día…»), no en esta pasada.

## Sin probar

- Dos máquinas de verdad, GitHub (credenciales, latencia) y Git LFS con mapas grandes.
- Richard con servicio de verdad y una tarea hecha por un worker real de punta a punta.
- La franja Equipo del panel con datos reales (sí con su prueba de componente).

Al acabar: servicio de Ana parado (`DETENIDO`), ningún `node` con la carpeta temporal y la carpeta borrada.
