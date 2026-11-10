#include "SemillaCamara.h"

namespace
{
	// ¿Caben las ocho esquinas con la cámara en Origen? Proyección en perspectiva sobre los ejes de la rotación.
	bool Caben(const FBox& B, const FVector& Origen, const FRotator& Rot, float TanH, float TanV, float Limite)
	{
		const FVector Fw = Rot.Vector(), Dch = FRotationMatrix(Rot).GetScaledAxis(EAxis::Y), Arr = FRotationMatrix(Rot).GetScaledAxis(EAxis::Z);
		for (int32 I = 0; I < 8; ++I)
		{
			const FVector P((I & 1) ? B.Max.X : B.Min.X, (I & 2) ? B.Max.Y : B.Min.Y, (I & 4) ? B.Max.Z : B.Min.Z);
			const FVector V = P - Origen;
			const float Prof = FVector::DotProduct(V, Fw);
			if (Prof <= 1.f) return false;
			if (FMath::Abs(FVector::DotProduct(V, Dch) / (Prof * TanH)) > Limite) return false;
			if (FMath::Abs(FVector::DotProduct(V, Arr) / (Prof * TanV)) > Limite) return false;
		}
		return true;
	}
}

float FSemillaCamara::FovVertical(float FovHorizontalGrados, float Aspecto)
{
	return FMath::RadiansToDegrees(2.f * FMath::Atan(FMath::Tan(FMath::DegreesToRadians(FovHorizontalGrados) / 2.f) / FMath::Max(Aspecto, 0.01f)));
}

float FSemillaCamara::TamanoEnPantalla(float AltoCm, float DistanciaCm, float FovGrados)
{
	return AltoCm / FMath::Max(DistanciaCm, 1.f) / (2.f * FMath::Tan(FMath::DegreesToRadians(FovGrados) / 2.f));
}

FTransform FSemillaCamara::Encuadrar(const FBox& Escena, float FovGrados, float Aspecto, float InclinacionGrados, float Margen)
{
	const FRotator Rot(-InclinacionGrados, 0.f, 0.f);
	const float TanH = FMath::Tan(FMath::DegreesToRadians(FovGrados) / 2.f), TanV = TanH / FMath::Max(Aspecto, 0.01f);
	const FVector Centro = Escena.GetCenter(), Atras = -Rot.Vector();
	// la distancia mínima que mete la caja: búsqueda binaria (cuanto más lejos, más cabe)
	float Cerca = 1.f, Lejos = FMath::Max(Escena.GetExtent().Size(), 100.f) * 100.f;
	for (int32 I = 0; I < 60; ++I)
	{
		const float Medio = (Cerca + Lejos) / 2.f;
		(Caben(Escena, Centro + Atras * Medio, Rot, TanH, TanV, 1.f - Margen) ? Lejos : Cerca) = Medio;
	}
	return FTransform(Rot, Centro + Atras * Lejos);
}
