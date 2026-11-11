#include "SemillaAspecto.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/Actor.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"

// NOMOS_SIN_ASPECTO: marcador feo a propósito (un cubo magenta para todo) y revisar_acabado.py lo rechaza.
// No lo copies ni lo retoques: escribe antes el plan de arte (docs/direccion.md, «## Plan de arte») y, para cada rol, usa la
// herramienta que diga ue-oficio/references/arsenal-visual.md (malla procedural con normales suaves, Geometry Script, Fab,
// Meshy, materiales con variación, Niagara…). Una forma de /Engine/BasicShapes solo con `// forma-basica: <motivo>` y nunca
// para Protagonista, Amenaza u Objetivo.
namespace
{
	const TCHAR* Marcador = TEXT("/Engine/BasicShapes/Cube.Cube");
	const TCHAR* Base = TEXT("/Game/Juego/M_Base.M_Base");
}

void FSemillaAspecto::Vestir(AActor* Actor, FName Rol)
{
	if (!Actor) return;
	// la etiqueta del rol la usan las capturas de detalle del juez de arte (nomos_demo.py): consérvala en tu Vestir
	Actor->Tags.AddUnique(Rol);
	UStaticMeshComponent* Malla = Actor->FindComponentByClass<UStaticMeshComponent>();
	if (!Malla)
	{
		Malla = NewObject<UStaticMeshComponent>(Actor, TEXT("Aspecto"));
		if (USceneComponent* Raiz = Actor->GetRootComponent()) Malla->SetupAttachment(Raiz); else Actor->SetRootComponent(Malla);
		Malla->RegisterComponent();
		Actor->AddInstanceComponent(Malla);
	}
	Malla->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, Marcador));
	if (UMaterialInterface* M = LoadObject<UMaterialInterface>(nullptr, Base))
	{
		UMaterialInstanceDynamic* MID = UMaterialInstanceDynamic::Create(M, Malla);
		MID->SetVectorParameterValue(TEXT("Color"), FLinearColor(1.f, 0.f, 1.f));
		Malla->SetMaterial(0, MID);
	}
	UE_LOG(LogTemp, Warning, TEXT("SemillaAspecto: %s (%s) sin aspecto propio: haz el plan de arte"), *Actor->GetName(), *Rol.ToString());
}
