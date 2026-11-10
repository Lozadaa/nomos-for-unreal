#include "SemillaPlayerController.h"
#include "SemillaGameMode.h"
#include "SemillaUI.h"
#include "Camera/CameraActor.h"
#include "ContentStreaming.h"
#include "Engine/AssetManager.h"
#include "Engine/StreamableManager.h"
#include "EngineUtils.h"
#include "Kismet/KismetSystemLibrary.h"

ASemillaPlayerController::ASemillaPlayerController()
{
	bShowMouseCursor = true;
}

void ASemillaPlayerController::BeginPlay()
{
	Super::BeginPlay();
	if (!IsLocalController()) return;
	// modo demo: con SEMILLA_AUTO=1 el juego se juega solo (capturas y vídeo del .exe)
	if (ASemillaGameMode* GM = GetWorld()->GetAuthGameMode<ASemillaGameMode>())
		GM->bAuto = FPlatformMisc::GetEnvironmentVariable(TEXT("SEMILLA_AUTO")) == TEXT("1");
	// la cámara del nivel (montar_contenido.py la deja mirando el patio)
	for (TActorIterator<ACameraActor> It(GetWorld()); It; ++It) { SetViewTarget(*It); break; }

	Hud = CreateWidget<USemillaHud>(this, USemillaHud::StaticClass());
	Hud->AddToViewport(0);
	Menu = CreateWidget<USemillaMenu>(this, USemillaMenu::StaticClass());
	Menu->AddToViewport(10);
	Carga = CreateWidget<USemillaCarga>(this, USemillaCarga::StaticClass());
	Carga->AddToViewport(100);
	FInputModeGameAndUI Modo;
	Modo.SetHideCursorDuringCapture(false);
	SetInputMode(Modo);

	// Pantalla de carga: espera a los assets del juego y a sus texturas (mínimo 0,5 s, tope 5 s; acabado.md §5).
	TArray<FSoftObjectPath> Rutas = { FSoftObjectPath(TEXT("/Game/Fuentes/FF_CaveatBrush.FF_CaveatBrush")),
		FSoftObjectPath(TEXT("/Game/Fuentes/FF_PatrickHand.FF_PatrickHand")) };
	UAssetManager::GetStreamableManager().RequestAsyncLoad(MoveTemp(Rutas), FStreamableDelegate::CreateUObject(this, &ASemillaPlayerController::Cargado));
}

void ASemillaPlayerController::Cargado() { bCargado = true; }

void ASemillaPlayerController::PlayerTick(float Dt)
{
	Super::PlayerTick(Dt);
	const float T = GetWorld()->GetTimeSeconds();
	if (Carga && ((bCargado && T >= 0.5f) || T >= 5.f))
	{
		if (!bTexturas) { IStreamingManager::Get().StreamAllResources(FMath::Max(0.f, 5.f - T)); bTexturas = true; }
		Carga->Quitar();
		Carga = nullptr;
	}
	ASemillaGameMode* GM = GetWorld()->GetAuthGameMode<ASemillaGameMode>();
	if (!GM || Carga) return;
	if (WasInputKeyJustPressed(EKeys::Escape)) { UKismetSystemLibrary::QuitGame(this, this, EQuitPreference::Quit, false); return; }
	if (GM->Estado == ESemillaEstado::Menu && (WasInputKeyJustPressed(EKeys::SpaceBar) || WasInputKeyJustPressed(EKeys::LeftMouseButton)))
		GM->Empezar();
	if (GM->Estado == ESemillaEstado::Fin && WasInputKeyJustPressed(EKeys::R)) GM->Reiniciar();
}
