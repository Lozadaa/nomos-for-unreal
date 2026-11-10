#include "SemillaCamara.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FSemillaCamaraTest, "Semilla.Camara",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)

bool FSemillaCamaraTest::RunTest(const FString&)
{
	const FBox Escena(FVector(-1500, -1500, 0), FVector(1500, 1500, 200));
	const float Fov = 60.f, Aspecto = 16.f / 9.f, Margen = 0.08f;
	const FTransform T = FSemillaCamara::Encuadrar(Escena, Fov, Aspecto, 55.f, Margen);
	const FRotator Rot = T.Rotator();
	TestEqual(TEXT("inclinada 55° hacia abajo"), Rot.Pitch, -55.0, 0.01);
	const FVector Fw = Rot.Vector(), Dch = FRotationMatrix(Rot).GetScaledAxis(EAxis::Y), Arr = FRotationMatrix(Rot).GetScaledAxis(EAxis::Z);
	const float TanH = FMath::Tan(FMath::DegreesToRadians(Fov) / 2.f), TanV = TanH / Aspecto;
	float Mayor = 0.f;
	for (int32 I = 0; I < 8; ++I)
	{
		const FVector P((I & 1) ? Escena.Max.X : Escena.Min.X, (I & 2) ? Escena.Max.Y : Escena.Min.Y, (I & 4) ? Escena.Max.Z : Escena.Min.Z);
		const FVector V = P - T.GetLocation();
		const float Prof = FVector::DotProduct(V, Fw);
		TestTrue(TEXT("esquina delante de la cámara"), Prof > 0.f);
		const float X = FVector::DotProduct(V, Dch) / (Prof * TanH), Y = FVector::DotProduct(V, Arr) / (Prof * TanV);
		TestTrue(FString::Printf(TEXT("esquina %d en cuadro con margen (%.3f, %.3f)"), I, X, Y), FMath::Abs(X) <= 1.f - Margen + 1e-3f && FMath::Abs(Y) <= 1.f - Margen + 1e-3f);
		Mayor = FMath::Max(Mayor, FMath::Max(FMath::Abs(X), FMath::Abs(Y)));
	}
	TestTrue(TEXT("y sin sobrar: alguna esquina toca el margen"), Mayor > 1.f - Margen - 0.01f);
	TestEqual(TEXT("1 m a 10 m con 90° ocupa el 5 %"), FSemillaCamara::TamanoEnPantalla(100.f, 1000.f, 90.f), 0.05f, 0.005f);
	return true;
}

#endif
