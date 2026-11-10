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
private:
	void Cargado();
	UPROPERTY() TObjectPtr<USemillaCarga> Carga;
	UPROPERTY() TObjectPtr<USemillaMenu> Menu;
	UPROPERTY() TObjectPtr<USemillaHud> Hud;
	bool bCargado = false, bTexturas = false;
};
