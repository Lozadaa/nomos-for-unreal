#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "SemillaReglas.h"
#include "SemillaGameMode.generated.h"

UENUM()
enum class ESemillaEstado : uint8 { Menu, Jugando, Fin };

DECLARE_MULTICAST_DELEGATE_OneParam(FSemillaOnEstado, ESemillaEstado);

// Flujo Menu → Jugando → Fin y reinicio. Las reglas viven en FSemillaReglas; aquí solo el estado y el tiempo.
UCLASS()
class SEMILLA_API ASemillaGameMode : public AGameModeBase
{
	GENERATED_BODY()
public:
	ASemillaGameMode();

	FSemillaReglas Reglas;
	ESemillaEstado Estado = ESemillaEstado::Menu;
	float TiempoEstado = 0.f;
	bool bAuto = false;  // modo demo: SEMILLA_AUTO=1, el juego se juega solo
	FSemillaOnEstado OnEstado;

	void Empezar();
	void Terminar();
	void Reiniciar();

	virtual void Tick(float Dt) override;

private:
	void Cambiar(ESemillaEstado Nuevo);
};
