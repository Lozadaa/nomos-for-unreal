#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "SemillaUI.generated.h"

class UTextBlock;
class UWidget;

// Widgets UMG construidos en C++ con SemillaEstilo: sin Canvas, sin fuentes del motor, sin Blueprint de widget.

// Pantalla de carga: tapa la escena hasta Quitar() y se va con un fundido de 0,3 s.
UCLASS()
class SEMILLA_API USemillaCarga : public UUserWidget
{
	GENERATED_BODY()
public:
	void Quitar() { bSaliendo = true; }
protected:
	virtual TSharedRef<SWidget> RebuildWidget() override;
	virtual void NativeTick(const FGeometry& Geo, float Dt) override;
private:
	bool bSaliendo = false;
	float Opacidad = 1.f;
};

// Menú de inicio: título y cómo empezar. Visible solo en el estado Menu.
UCLASS()
class SEMILLA_API USemillaMenu : public UUserWidget
{
	GENERATED_BODY()
protected:
	virtual TSharedRef<SWidget> RebuildWidget() override;
	virtual void NativeTick(const FGeometry& Geo, float Dt) override;
private:
	float Vis = 1.f;
};

// HUD de un solo dato y pantalla de final con reinicio (R).
UCLASS()
class SEMILLA_API USemillaHud : public UUserWidget
{
	GENERATED_BODY()
protected:
	virtual TSharedRef<SWidget> RebuildWidget() override;
	virtual void NativeTick(const FGeometry& Geo, float Dt) override;
private:
	UPROPERTY() TObjectPtr<UTextBlock> Dato;
	UPROPERTY() TObjectPtr<UTextBlock> FinTexto;
	UPROPERTY() TObjectPtr<UWidget> Marcador;
	UPROPERTY() TObjectPtr<UWidget> Final;
	float VisMarcador = 0.f, VisFinal = 0.f;
};
