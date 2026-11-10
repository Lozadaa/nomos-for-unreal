#include "SemillaPlayerController.h"
#include "SemillaAspecto.h"
#include "SemillaCamara.h"
#include "SemillaGameMode.h"
#include "SemillaUI.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "ContentStreaming.h"
#include "Engine/AssetManager.h"
#include "Engine/StreamableManager.h"
#include "EngineUtils.h"
#include "GameFramework/Pawn.h"
#include "Kismet/KismetSystemLibrary.h"

ASemillaPlayerController::ASemillaPlayerController()
{
	bShowMouseCursor = true;
	bAutoManageActiveCameraTarget = false;  // la cámara es la que encuadra la escena, no la del pawn
}

void ASemillaPlayerController::BeginPlay()
{
	Super::BeginPlay();
	if (!IsLocalController()) return;
	// modo demo: con SEMILLA_AUTO=1 el juego se juega solo (capturas y vídeo). La marca la busca la comprobación imagen de Nomos
	if (ASemillaGameMode* GM = GetWorld()->GetAuthGameMode<ASemillaGameMode>())
	{
		GM->bAuto = FPlatformMisc::GetEnvironmentVariable(TEXT("SEMILLA_AUTO")) == TEXT("1")
			|| FParse::Param(FCommandLine::Get(), TEXT("SemillaAuto"));  // en web no hay entorno: ?args=-SemillaAuto
		if (GM->bAuto) UE_LOG(LogTemp, Display, TEXT("NOMOS_DEMO activo"));
	}
	Ejemplo();
	// la escena es lo que lleva la etiqueta «Escena» (montar_contenido.py se la pone al suelo): la cámara la mete entera
	FBox Escena(ForceInit);
	for (TActorIterator<AActor> It(GetWorld()); It; ++It) if (It->ActorHasTag(TEXT("Escena"))) Escena += It->GetComponentsBoundingBox();
	if (Escena.IsValid) EncuadrarEscena(Escena);

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

void ASemillaPlayerController::EncuadrarEscena(const FBox& Escena)
{
	ACameraActor* Camara = nullptr;
	for (TActorIterator<ACameraActor> It(GetWorld()); It; ++It) { Camara = *It; break; }
	if (!Camara) Camara = GetWorld()->SpawnActor<ACameraActor>();
	UCameraComponent* C = Camara->GetCameraComponent();
	C->SetConstraintAspectRatio(false);
	const float Aspecto = 16.f / 9.f;
	Camara->SetActorTransform(FSemillaCamara::Encuadrar(Escena, C->FieldOfView, Aspecto, Inclinacion));
	SetViewTarget(Camara);
	if (const APawn* P = GetPawn())
	{
		const float Alto = P->GetComponentsBoundingBox().GetSize().GetMax(), Dist = FVector::Dist(P->GetActorLocation(), Camara->GetActorLocation());
		const float Px = FSemillaCamara::TamanoEnPantalla(Alto, Dist, FSemillaCamara::FovVertical(C->FieldOfView, Aspecto)) * 720.f;
		UE_LOG(LogTemp, Display, TEXT("EncuadrarEscena: el protagonista mide %.0f px de alto a 720"), Px);
		if (Px < 0.03f * 720.f) UE_LOG(LogTemp, Warning, TEXT("El protagonista mide %.0f px: acerca la cámara o síguelo"), Px);
	}
}

// Ejemplo de la semilla: un protagonista, una amenaza, un objetivo y un muro, vestidos con FSemillaAspecto. Tu juego pone los
// suyos y borra esto; el protagonista da vueltas para que las capturas del modo demo cambien.
void ASemillaPlayerController::Ejemplo()
{
	if (GetPawn()) return;
	FActorSpawnParameters Sp;
	Sp.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	APawn* P = GetWorld()->SpawnActor<APawn>(APawn::StaticClass(), FTransform(FVector(0, 0, 60)), Sp);
	FSemillaAspecto::Vestir(P, TEXT("Protagonista"));
	Possess(P);
	const TPair<FName, FVector> Otros[] = { {TEXT("Amenaza"), FVector(500, -500, 45)}, {TEXT("Objetivo"), FVector(-500, 500, 60)},
		{TEXT("Escenario"), FVector(0, 800, 50)} };
	for (const auto& [Rol, Pos] : Otros)
	{
		AActor* A = GetWorld()->SpawnActor<AActor>(AActor::StaticClass(), FTransform(Pos), Sp);
		FSemillaAspecto::Vestir(A, Rol);
		A->SetActorLocation(Pos);  // un AActor sin raíz no guarda la posición del spawn: Vestir le pone la malla de raíz
	}
}

void ASemillaPlayerController::Cargado() { bCargado = true; }

void ASemillaPlayerController::PlayerTick(float Dt)
{
	Super::PlayerTick(Dt);
	const float T = GetWorld()->GetTimeSeconds();
	if (APawn* P = GetPawn()) P->SetActorLocation(FVector(400.f * FMath::Cos(T * 0.6f), 400.f * FMath::Sin(T * 0.6f), 60.f));
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
