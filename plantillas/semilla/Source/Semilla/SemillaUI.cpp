#include "SemillaUI.h"
#include "SemillaEstilo.h"
#include "SemillaGameMode.h"
#include "Blueprint/WidgetTree.h"
#include "Components/Border.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"

using namespace SemillaEstilo;

namespace
{
	UTextBlock* Texto(UWidgetTree* WT, ERol Rol, float Tam, const FLinearColor& Color, const TCHAR* S)
	{
		UTextBlock* T = WT->ConstructWidget<UTextBlock>();
		T->SetFont(Fuente(Rol, Tam));
		T->SetColorAndOpacity(FSlateColor(Color));
		T->SetJustification(ETextJustify::Center);
		T->SetText(FText::FromString(S));
		return T;
	}

	// Panel de color liso (sin material: nada de cuadros en el empaquetado) con el contenido dentro.
	UBorder* Caja(UWidgetTree* WT, const FLinearColor& Color, UWidget* Contenido, const FMargin& Relleno)
	{
		UBorder* B = WT->ConstructWidget<UBorder>();
		B->SetBrushColor(Color);
		B->SetPadding(Relleno);
		B->SetHorizontalAlignment(HAlign_Center);
		B->SetVerticalAlignment(VAlign_Center);
		B->SetContent(Contenido);
		return B;
	}

	UVerticalBox* Columna(UWidgetTree* WT, std::initializer_list<UWidget*> Hijos, float Hueco = 12.f)
	{
		UVerticalBox* V = WT->ConstructWidget<UVerticalBox>();
		for (UWidget* W : Hijos)
		{
			UVerticalBoxSlot* S = V->AddChildToVerticalBox(W);
			S->SetHorizontalAlignment(HAlign_Center);
			S->SetPadding(FMargin(0, 0, 0, Hueco));
		}
		return V;
	}

	UCanvasPanel* Raiz(UWidgetTree* WT)
	{
		UCanvasPanel* R = WT->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("Raiz"));
		WT->RootWidget = R;
		return R;
	}

	void Colocar(UCanvasPanel* R, UWidget* W, const FAnchors& Anclas, const FVector2D& Alinear, const FVector2D& Pos)
	{
		UCanvasPanelSlot* S = R->AddChildToCanvas(W);
		S->SetAnchors(Anclas);
		S->SetAlignment(Alinear);
		S->SetPosition(Pos);
		S->SetAutoSize(true);
	}

	void Llenar(UCanvasPanel* R, UWidget* W)
	{
		UCanvasPanelSlot* S = R->AddChildToCanvas(W);
		S->SetAnchors(FAnchors(0.f, 0.f, 1.f, 1.f));
		S->SetOffsets(FMargin(0.f));
	}

	// Entra y sale en 0,15 s con alfa y un desliz corto, nunca de golpe.
	float Mostrar(UWidget* W, float Vis, bool bMeta, float Dt)
	{
		Vis = FMath::FInterpConstantTo(Vis, bMeta ? 1.f : 0.f, Dt, 1.f / 0.15f);
		W->SetRenderOpacity(Vis);
		W->SetRenderTranslation(FVector2D(0.f, 14.f * (1.f - Vis)));
		W->SetVisibility(Vis > 0.f ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
		return Vis;
	}

	const ASemillaGameMode* Modo(const UUserWidget* W) { return W->GetWorld() ? W->GetWorld()->GetAuthGameMode<ASemillaGameMode>() : nullptr; }
}

// ---------------------------------------------------------------- Carga

TSharedRef<SWidget> USemillaCarga::RebuildWidget()
{
	if (WidgetTree && !WidgetTree->RootWidget)
	{
		UCanvasPanel* R = Raiz(WidgetTree);
		Llenar(R, Caja(WidgetTree, Fondo, Columna(WidgetTree, {
			Texto(WidgetTree, ERol::Titulo, 120.f, Acento, TEXT("Semilla")),
			Texto(WidgetTree, ERol::Texto, 30.f, Tinta, TEXT("Preparando el patio…")) }), FMargin(0)));
	}
	return Super::RebuildWidget();
}

void USemillaCarga::NativeTick(const FGeometry& Geo, float Dt)
{
	Super::NativeTick(Geo, Dt);
	if (!bSaliendo) return;
	Opacidad = FMath::FInterpConstantTo(Opacidad, 0.f, Dt, 1.f / 0.3f);
	SetRenderOpacity(Opacidad);
	if (Opacidad <= 0.f) RemoveFromParent();
}

// ---------------------------------------------------------------- Menú

TSharedRef<SWidget> USemillaMenu::RebuildWidget()
{
	if (WidgetTree && !WidgetTree->RootWidget)
	{
		UCanvasPanel* R = Raiz(WidgetTree);
		Colocar(R, Caja(WidgetTree, Panel, Columna(WidgetTree, {
			Texto(WidgetTree, ERol::Titulo, 96.f, Acento, TEXT("Semilla")),
			Texto(WidgetTree, ERol::Texto, 30.f, Tinta, TEXT("Pulsa Espacio o haz clic para empezar")),
			Texto(WidgetTree, ERol::Texto, 22.f, Suave, TEXT("R reinicia · Esc sale · menú hecho con Nomos")) }), FMargin(72, 40)),
			FAnchors(0.5f, 0.5f), FVector2D(0.5f, 0.5f), FVector2D(0, 0));
	}
	return Super::RebuildWidget();
}

void USemillaMenu::NativeTick(const FGeometry& Geo, float Dt)
{
	Super::NativeTick(Geo, Dt);
	const ASemillaGameMode* GM = Modo(this);
	Vis = Mostrar(WidgetTree->RootWidget, Vis, GM && GM->Estado == ESemillaEstado::Menu, Dt);
}

// ---------------------------------------------------------------- HUD y final

TSharedRef<SWidget> USemillaHud::RebuildWidget()
{
	if (WidgetTree && !WidgetTree->RootWidget)
	{
		UCanvasPanel* R = Raiz(WidgetTree);
		Dato = Texto(WidgetTree, ERol::Titulo, 44.f, Acento, TEXT(""));
		Marcador = Caja(WidgetTree, Panel, Columna(WidgetTree, {
			Texto(WidgetTree, ERol::Texto, 22.f, Suave, TEXT("Puntuación")), Dato.Get() }, 0.f), FMargin(28, 12));
		Colocar(R, Marcador, FAnchors(0.f, 0.f), FVector2D(0, 0), FVector2D(40, 32));

		FinTexto = Texto(WidgetTree, ERol::Texto, 30.f, Tinta, TEXT(""));
		Final = Caja(WidgetTree, Panel, Columna(WidgetTree, {
			Texto(WidgetTree, ERol::Titulo, 84.f, Acento, TEXT("¡Partida terminada!")), FinTexto.Get(),
			Texto(WidgetTree, ERol::Texto, 26.f, Suave, TEXT("R para jugar otra")) }), FMargin(72, 40));
		Colocar(R, Final, FAnchors(0.5f, 0.5f), FVector2D(0.5f, 0.5f), FVector2D(0, 0));
		Marcador->SetVisibility(ESlateVisibility::Collapsed);
		Final->SetVisibility(ESlateVisibility::Collapsed);
	}
	return Super::RebuildWidget();
}

void USemillaHud::NativeTick(const FGeometry& Geo, float Dt)
{
	Super::NativeTick(Geo, Dt);
	const ASemillaGameMode* GM = Modo(this);
	const bool bJuego = GM && GM->Estado != ESemillaEstado::Menu, bFin = GM && GM->Estado == ESemillaEstado::Fin;
	VisMarcador = Mostrar(Marcador, VisMarcador, bJuego, Dt);
	VisFinal = Mostrar(Final, VisFinal, bFin, Dt);
	if (!GM) return;
	Dato->SetText(FText::FromString(FString::Printf(TEXT("%d / %d"), GM->Reglas.Puntos, GM->Reglas.Meta)));
	if (bFin) FinTexto->SetText(FText::FromString(GM->bAuto ? TEXT("Modo demo: otra partida en un momento…")
		: TEXT("Llegaste a la meta.")));
}
