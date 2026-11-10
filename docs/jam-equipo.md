# Jam en equipo con Nomos

Cada persona trabaja en su PC con su propio Nomos. Os sincronizáis por Git: no hace falta estar en la misma red ni
conectados a la vez. Cada minuto, Nomos trae lo que han publicado los demás.

## 1. Instala

| Programa | Comprueba con |
|---|---|
| Git | `git --version` |
| Git LFS | `git lfs version` (y una vez: `git lfs install`) |
| Node 25 o más | `node --version` |
| Claude Code | `claude --version` |
| Unreal 5.9 MegaJam Preview | Epic Games Launcher → Unreal Engine → Biblioteca |

## 2. Clona el juego

```powershell
git clone <url-del-repo-del-juego>
cd <juego>
.\nomos.cmd doctor --data .nomos
```

`doctor` dice qué falta. El juego ya trae Nomos dentro (`Tools/Nomos`). Si aún no hay juego, quien lo cree usa
`nomos nuevo <Nombre>` y lo sube al repo.

## 3. Abre Nomos y elige frente

En la carpeta del juego abre Claude Code y escribe `/nomos`. Te pregunta tu nombre y tu frente (la parte del juego que
llevas: «combate», «UI», «escenarios»…). Equivale a:

```powershell
.\nomos.cmd team init --name Ana --frente UI --data .nomos
```

Si otra persona ya tiene ese frente, Nomos te avisa y lo compartís. Para cambiar: `.\nomos.cmd team frente audio --data .nomos`.

## 4. Mira a los demás

```powershell
.\nomos.cmd equipo --data .nomos
```

```text
Richard (combate) · presente · main 4e3fa41, al día
  haciendo: Lanzamiento de la brasa [implementando] · reserva L_Patio hasta 16:40
  hecho:    Sombras que nacen en los bordes (hace 12 min)
Ana (UI) · ausente 40 min · main 9ab948d, 2 commits atrás
```

En el panel, la franja **Equipo** de Producción enseña lo mismo. Pulsa una tarea de otra persona para pedirle algo.

Cuando alguien integra, tu `main` se pone al día solo. Si tienes cambios sin commitear, Nomos no lo toca: te avisa y
lo traes tú con `git pull` cuando acabes.

## 5. Si alguien tiene reservado un mapa

Tu tarea espera y el panel dice «Richard tiene reservado L_Patio hasta 16:40». No hace falta hacer nada: arranca sola
cuando Richard termina. Si te corre prisa, pídeselo desde el panel o con
`.\nomos.cmd team ask --to Richard "Necesito L_Patio para las luces" --data .nomos`.

Dos personas no tocan el mismo `.umap` a la vez. Si chocan sin reserva, la integración se para y eliges en
«Por aprobar» con qué versión te quedas.

## 6. Prueba de 10 minutos, antes de la jam

Hacedla juntos, cada uno en su PC, con el repo del juego ya en GitHub.

1. Todos: clonad, `/nomos`, elegid frente. `nomos equipo` enseña a los demás como «presente».
2. Cada uno pide a su Nomos una tarea mínima en una carpeta suya, por ejemplo «Añade docs/hola-ana.md con una línea».
3. Esperad a que se integre (sale en «hecho» de tu `nomos equipo`).
4. En menos de 2 minutos, cada uno ve la tarea del otro en «hecho» y su `main` dice «al día».
5. Uno reserva un mapa (tarea con ese `.umap`); el otro crea una tarea sobre el mismo mapa: debe esperar con
   «… tiene reservado …».

Si algún paso falla, apuntad qué salió en `nomos equipo` y en el panel antes de tocar nada.

## Lo que no está probado

- **Dos máquinas de verdad con GitHub y Git LFS.** La prueba se hizo con dos clones en el mismo PC y un remoto local
  (`docs/aceptacion-jam-equipo.md`). Credenciales de GitHub, LFS con mapas grandes y redes lentas no se han probado:
  por eso la prueba de 10 minutos.
- `nomos nuevo` lo está añadiendo otra tarea; si no está en tu versión, crea el juego a mano y, desde el repo de Nomos, `nomos embed <carpeta-del-juego>`.
