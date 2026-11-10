#include "Modules/ModuleManager.h"
#include "MoviePlayer.h"
#include "SemillaEstilo.h"
#include "Brushes/SlateColorBrush.h"
#include "Brushes/SlateRoundedBoxBrush.h"
#include "UObject/UObjectGlobals.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"

// Pantalla de carga desde el primer fotograma: el reproductor de carga del motor tapa la carga del mapa con el fondo y un punto
// del acento (sin texto: aquí aún no hay fuentes propias). Al acabar, USemillaCarga (UMG, mismo fondo) toma el relevo.
class FSemillaModule : public FDefaultGameModuleImpl
{
public:
	virtual void StartupModule() override
	{
		FCoreUObjectDelegates::PreLoadMap.AddRaw(this, &FSemillaModule::Preparar);
		Preparar(FString());  // la primera carga de mapa ocurre antes de que exista ningún widget
	}

private:
	void Preparar(const FString&)
	{
		if (!IsMoviePlayerEnabled() || IsRunningDedicatedServer()) return;
		static FSlateColorBrush Fondo(SemillaEstilo::Fondo);
		static FSlateRoundedBoxBrush Punto(SemillaEstilo::Acento, 14.f);
		FLoadingScreenAttributes A;
		A.bAutoCompleteWhenLoadingCompletes = true;
		A.WidgetLoadingScreen = SNew(SBorder).BorderImage(&Fondo).HAlign(HAlign_Center).VAlign(VAlign_Center)
			[SNew(SBox).WidthOverride(28.f).HeightOverride(28.f)[SNew(SBorder).BorderImage(&Punto)]];
		GetMoviePlayer()->SetupLoadingScreen(A);
	}
};

IMPLEMENT_PRIMARY_GAME_MODULE(FSemillaModule, Semilla, "Semilla");
