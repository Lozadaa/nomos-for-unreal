# La máquina: RAM, turno de Unreal y arranque

## Un Unreal pesado a la vez

El planificador no arranca una tarea **pesada** (abre Unreal) sin RAM libre (`scheduler.minFreeRamGb`, 6 por
defecto), sin hueco en `scheduler.heavy.maxConcurrent` (1) y, con `scheduler.heavyRequiresNoEditor`, sin un
`UnrealEditor` ajeno vivo. Las ligeras siguen arrancando. Declara la carga en la spec cuando la inferencia
(área `animacion`, `escenarios` o `builds`; alcance con mapas, animaciones o build) no acierte:

```markdown
Carga: ligera
```

`nomos status` lista en `unreal` lo que espera («J2.2 espera: 4,1 GB libres, hacen falta 6») y el vigilante
recibe `scheduler.waiting`. No apagues el planificador por la RAM ni arranques pesadas a mano.

## Turno desde el worker

El brief de cada worker trae la orden exacta. Antes de abrir el editor, empaquetar o lanzar PIE:

```
nomos worker turn <taskId> --wait      # bloquea hasta editor.granted
nomos worker turn <taskId> --release   # al cerrar Unreal
```

En los briefs que escribas, usa esa orden; nunca un bucle propio de espera de RAM (`esperar-maquina.ps1`).
