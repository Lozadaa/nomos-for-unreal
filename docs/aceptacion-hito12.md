# Aceptación del hito 12 · OpenCode como proveedor barato

Fecha: 2026-10-24. Rama `opencode-adapter` sobre `main@2768cec`.

## Estado: aceptación real NO ejecutada

La Tarea 4 (run real en KratosFabTest, revisión Claude, captura de Producción) no se hizo:
OpenCode rechaza las credenciales de esta máquina (confirmado también por Fable a las 18:20 UTC) y
el usuario decidió cerrar sin ella. No hay capturas en `docs/capturas-12/`: no existe un run real
que capturar. La aceptación queda **reproducible** con `scripts/aceptacion-hito12.ps1` (abajo).

## Prueba del 401 (sin secretos)

```text
PS> opencode run --model opencode/beam-free "Responde solo: hola"
Error: Upstream request failed: Invalid credential

PS> opencode run --standalone --print-logs --log-level info --model opencode/beam-free hola
… level=WARN message="failed to load OpenCode provider config"
    cause="HttpClientError: StatusCode: non 2xx status code (401 GET https://opencode.ai/console/api/v2/config)"
… level=ERROR message="Failed to drain Session" cause="AI.Error: Upstream request failed: Invalid credential …"
Error: Upstream request failed: Invalid credential
```

Mismo resultado con `opencode/deepseek-v4.1-flash-free`, `opencode/flint-40b-free`,
`opencode-go/beam-free` y `opencode/claude-haiku-5-5`; con el servicio en segundo plano y con
`--standalone`; con la `OPENCODE_API_KEY` de usuario y sin ella (solo la credencial guardada de
«OpenCode Console»). `opencode auth list` sí lista ambos proveedores: están registrados, pero el
servidor no los acepta. El script de aceptación lo detecta en su primer paso; ejecutado hoy:

```text
[15:20:40] Comprobando credenciales de OpenCode con opencode/beam-free
OpenCode rechazó las credenciales: ejecuta opencode auth login Error: Upstream request failed: Invalid credential
```

No creó `.nomos-hito12` ni arrancó servicio.

## Qué hace el servicio cuando OpenCode no puede arrancar

`opencode run` imprime `Error: Upstream request failed: Invalid credential` y vuelve al prompt; si
`opencode` no está en el PATH, cmd imprime `'opencode' is not recognized as an internal or external
command,` (texto capturado hoy en un terminal real de Orca). En ambos casos el sondeo del worker
(`opencodeFatal` + `discardOpencode`):

1. cierra el terminal y quita el árbol de Orca (nada se hizo en él);
2. termina la run en `failed` con la causa, `uncertain: false` y `discarded: true`, y libera reservas;
3. emite `worker.failed` `{runId, taskId, provider: "opencode", reason, reassignedTo: "claude"}` con
   `reason` = «OpenCode rechazó las credenciales: ejecuta opencode auth login» o
   «OpenCode no está instalado o no está en el PATH del terminal»;
4. devuelve la tarea a `preparada`, `assigneeProvider: "claude"`, sin árbol, sin bloqueo y con esa
   causa como `waitReason`. **No abre Decisión**: el planificador la arranca con Claude en cuanto
   haya hueco (la run descartada no cuenta como «Requiere reconciliar worker existente»).

Si el árbol no se puede quitar, cae al fallo normal de worker (run incierta, Decisión de
reconciliar), porque entonces no se sabe qué quedó. Cubierto por
`tests/service/worker-opencode.test.ts` con fake Orca y Git real (antes de esta corrección la run
quedaba incierta y la tarea pedía reconciliar).

## Qué se comprobó en real

- `opencode --version` → `v2.0.14`; `opencode models` lista 111 modelos, entre ellos los
  gratuitos `opencode/beam-free`, `opencode/deepseek-v4.1-flash-free`, `opencode/flint-40b-free`
  y los baratos `opencode/claude-haiku-5-5`, `opencode/deepseek-v4.1-flash`.
- En un terminal real de Orca (cmd.exe) `opencode run --auto --model … --title … <mensaje>`
  arranca y su salida se lee con `orca terminal read` como texto plano (`source: stream`).
- `opencode stats`: 20 sesiones y 15.1 M tokens en 2026; no muestra importe. Este hito no gastó
  crédito: ninguna llamada llegó al modelo.

## Qué queda sin verificar

1. Que `NOMOS_DONE`/`NOMOS_ASK` salen en la cola del terminal al principio de línea con
   `opencode run`. Si llevan sangría o viñeta, no se verán y habrá que pasar a la TUI
   (`opencode --auto` + `readyPattern` + brief por `terminalSend`).
2. Que `run` une las palabras del mensaje sin comillas (la orden no lleva comillas porque
   `terminalSend` las rechaza); el diseño se apoya en `message...` de `opencode run --help`.
3. Que `opencode run --continue` en el árbol retoma la sesión del worker para correcciones.
4. Que la línea de credencial rechazada llega tal cual a la cola del terminal durante un run
   del servicio (hoy se vio en la consola, no dentro de una run de Nomos).
5. El ciclo completo con la pastilla «OpenCode» en Producción.

## Pendiente: ejecutar cuando OpenCode vuelva a autenticar

1. `opencode auth login` (o corregir la `OPENCODE_API_KEY` de usuario) y comprobar que
   `opencode run --model opencode/beam-free "Responde solo: ok"` responde.
2. Desde la raíz de esta rama, en PowerShell:

   ```powershell
   pwsh -File scripts/aceptacion-hito12.ps1
   # opcional: -Game "<otro juego>" -Model opencode/deepseek-v4.1-flash-free -TimeoutMinutes 45
   ```

   El script: comprueba credenciales; escribe `.nomos-hito12/config.json`
   (`{"concurrency":{"claude":1,"opencode":1},"opencodeModel":…,"workerModel":"sonnet"}`); arranca el
   servicio en un puerto libre (no toca el del 8780); crea la tarea «Notas de OpenCode»
   (`Docs/OpenCode.md`, área `builds`, `--provider opencode`); espera `revisando` con la run de
   OpenCode `done`; pide `task review` y exige revisor Claude aprobado; `task integrate` y
   `task finalize` hasta `done`; captura Producción a 1920 en
   `docs/capturas-12/produccion-12-1920.png` (`panel/scripts/capturas-12.ts`, espera el texto
   «OpenCode»); muestra `opencode stats`; y **siempre** para el servicio de `.nomos-hito12`.
   Se detiene con mensaje claro ante `worker.failed`, una Decisión abierta o el tiempo agotado.
3. Anotar aquí: id de la tarea, modelo, resumen del run, revisor, commit integrado, gasto y
   las respuestas a «Qué queda sin verificar». No commitear `Config/DefaultEngine.ini` de
   KratosFabTest (sin seguir a propósito).

Ejecutado hoy solo hasta el paso 1 del script (ver «Prueba del 401»); los pasos de servicio,
revisión, cierre y captura no se han ejecutado nunca contra OpenCode real.

## Pruebas automáticas (fake Orca + Git real)

`npm test` 566/566 dos veces, `npm run test:panel` 283/283, `npm run build` correcto,
skillsmith 98. Cubren: orden y modelo de OpenCode, `opencode.json` fuera de Git, brief no
reenviado, DONE → revisando, credencial rechazada y falta de PATH → `worker.failed` y tarea a
Claude sin Decisión, corrección con `--continue`, validación de `opencodeModel` y todas las
reglas del planificador.
