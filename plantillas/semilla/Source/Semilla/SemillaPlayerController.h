#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "SemillaPlayerController.generated.h"

class USemillaCarga;
class USemillaMenu;
class USemillaHud;

// Crea la pantalla de carga, el menú y el HUD; Espacio o clic empieza, R reinicia, Esc sale.
UCLASS()
class SEMILLA_API ASemillaPlayerController : public APlayerController
{
	GENERATED_BODY()
public:
	ASemillaPlayerController();
	virtual void BeginPlay() override;
	virtual void PlayerTick(float Dt) override;
	// Coloca la cámara que mete la caja entera en cuadro (FSemillaCamara::Encuadrar) y avisa si el pawn queda por debajo del 3 %.
	void EncuadrarEscena(const FBox& Escena);
	// Grados hacia abajo de la cámara que encuadra: 55 es «desde arriba, algo inclinada»; 20-30, una vista de lado.
	float Inclinacion = 55.f;
private:
	void Ejemplo();
	void Cargado();
	UPROPERTY() TObjectPtr<USemillaCarga> Carga;
	UPROPERTY() TObjectPtr<USemillaMenu> Menu;
	UPROPERTY() TObjectPtr<USemillaHud> Hud;
	bool bCargado = false, bTexturas = false;
};
