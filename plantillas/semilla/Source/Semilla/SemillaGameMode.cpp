#include "SemillaGameMode.h"
#include "SemillaPlayerController.h"

ASemillaGameMode::ASemillaGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	PlayerControllerClass = ASemillaPlayerController::StaticClass();
	DefaultPawnClass = nullptr;  // la cámara es la del nivel; tu juego pone aquí su pawn
}

void ASemillaGameMode::Cambiar(ESemillaEstado Nuevo)
{
	Estado = Nuevo;
	TiempoEstado = 0.f;
	OnEstado.Broadcast(Estado);
}

void ASemillaGameMode::Empezar() { if (Estado == ESemillaEstado::Menu) Cambiar(ESemillaEstado::Jugando); }
void ASemillaGameMode::Terminar() { if (Estado == ESemillaEstado::Jugando) Cambiar(ESemillaEstado::Fin); }
void ASemillaGameMode::Reiniciar() { Reglas.Reiniciar(); Cambiar(ESemillaEstado::Jugando); }

void ASemillaGameMode::Tick(float Dt)
{
	Super::Tick(Dt);
	TiempoEstado += Dt;
	// Ejemplo de un solo dato: un punto por segundo hasta la meta. El modo demo empieza, gana y vuelve a jugar solo.
	if (Estado == ESemillaEstado::Jugando && TiempoEstado >= Reglas.Puntos + 1.f) Reglas.Sumar();
	if (Estado == ESemillaEstado::Jugando && Reglas.Ganada()) Terminar();
	if (bAuto && Estado == ESemillaEstado::Menu && TiempoEstado > 1.5f) Empezar();
	if (bAuto && Estado == ESemillaEstado::Fin && TiempoEstado > 4.f) Reiniciar();
}
