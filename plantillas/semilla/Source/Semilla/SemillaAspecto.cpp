#include "SemillaAspecto.h"
#include "SemillaEstilo.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/Actor.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"

namespace
{
	// /Game/Juego y /Engine/BasicShapes están en DirectoriesToAlwaysCook (Config/DefaultGame.ini)
	const TCHAR* Base = TEXT("/Game/Juego/M_Base.M_Base");

	struct FRol { const TCHAR* Malla; FVector Escala; FLinearColor Color; float Brillo; float Luz; };

	bool Datos(FName Rol, FRol& Out)
	{
		using namespace SemillaEstilo;
		// el protagonista brilla y lleva luz propia: se distingue del suelo en cualquier escena (revisar_imagen.py)
		if (Rol == TEXT("Protagonista")) { Out = {TEXT("/Engine/BasicShapes/Sphere.Sphere"), FVector(0.8), Acento, 6.f, 2500.f}; return true; }
		if (Rol == TEXT("Amenaza")) { Out = {TEXT("/Engine/BasicShapes/Cone.Cone"), FVector(0.9), FLinearColor(0.10f, 0.02f, 0.12f), 0.f, 0.f}; return true; }
		if (Rol == TEXT("Objetivo")) { Out = {TEXT("/Engine/BasicShapes/Cylinder.Cylinder"), FVector(0.6, 0.6, 1.2), Tinta, 1.5f, 0.f}; return true; }
		if (Rol == TEXT("Escenario")) { Out = {TEXT("/Engine/BasicShapes/Cube.Cube"), FVector(1.0), Suave, 0.f, 0.f}; return true; }
		return false;
	}
}

void FSemillaAspecto::Vestir(AActor* Actor, FName Rol)
{
	FRol R;
	if (!Actor) return;
	if (!Datos(Rol, R)) { UE_LOG(LogTemp, Warning, TEXT("SemillaAspecto: rol desconocido %s en %s"), *Rol.ToString(), *Actor->GetName()); return; }
	UStaticMeshComponent* Malla = Actor->FindComponentByClass<UStaticMeshComponent>();
	if (!Malla)
	{
		Malla = NewObject<UStaticMeshComponent>(Actor, TEXT("Aspecto"));
		if (USceneComponent* Raiz = Actor->GetRootComponent()) Malla->SetupAttachment(Raiz); else Actor->SetRootComponent(Malla);
		Malla->RegisterComponent();
		Actor->AddInstanceComponent(Malla);
	}
	Malla->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, R.Malla));
	Malla->SetRelativeScale3D(R.Escala);
	if (UMaterialInterface* M = LoadObject<UMaterialInterface>(nullptr, Base))
	{
		UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(M, Malla);
		MID->SetVectorParameterValue(TEXT("Color"), R.Color);
		MID->SetScalarParameterValue(TEXT("Brillo"), R.Brillo);
		Malla->SetMaterial(0, MID);
	}
	if (R.Luz > 0.f && !Actor->FindComponentByClass<UPointLightComponent>())
	{
		UPointLightComponent* Luz = NewObject<UPointLightComponent>(Actor, TEXT("LuzAspecto"));
		Luz->SetupAttachment(Malla);
		Luz->SetIntensity(R.Luz);
		Luz->SetLightColor(R.Color);
		Luz->SetAttenuationRadius(600.f);
		Luz->RegisterComponent();
		Actor->AddInstanceComponent(Luz);
	}
}
