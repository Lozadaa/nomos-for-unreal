#include "SemillaReglas.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FSemillaReglasTest, "Semilla.Reglas",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)

bool FSemillaReglasTest::RunTest(const FString&)
{
	FSemillaReglas R;
	TestEqual(TEXT("empieza a cero"), R.Puntos, 0);
	R.Sumar(3);
	TestFalse(TEXT("3 de 5 no gana"), R.Ganada());
	R.Sumar(4);
	TestEqual(TEXT("no pasa de la meta"), R.Puntos, 5);
	TestTrue(TEXT("con la meta gana"), R.Ganada());
	R.Reiniciar();
	TestEqual(TEXT("reiniciar vuelve a cero"), R.Puntos, 0);
	return true;
}

#endif
