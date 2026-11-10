#include "SemillaEstilo.h"
#include "Engine/Font.h"
#include "Engine/FontFace.h"

namespace
{
	// Rutas en DirectoriesToAlwaysCook (Config/DefaultGame.ini): sin eso el empaquetado sale sin fuente.
	const TCHAR* Titulos = TEXT("/Game/Fuentes/FF_CaveatBrush.FF_CaveatBrush");
	const TCHAR* Textos = TEXT("/Game/Fuentes/FF_PatrickHand.FF_PatrickHand");

	UFont* Cara(const TCHAR* Ruta)
	{
		static TMap<FString, UFont*> Hechas;
		if (UFont** Ya = Hechas.Find(Ruta)) return *Ya;
		UFont* F = NewObject<UFont>(GetTransientPackage());
		F->AddToRoot();  // vive lo que el juego: la usan todos los widgets
		F->FontCacheType = EFontCacheType::Runtime;
		FTypefaceEntry& E = F->GetMutableInternalCompositeFont().DefaultTypeface.Fonts.AddDefaulted_GetRef();
		E.Name = TEXT("Regular");
		E.Font = FFontData(LoadObject<UFontFace>(nullptr, Ruta));
		return Hechas.Add(Ruta, F);
	}
}

FSlateFontInfo SemillaEstilo::Fuente(ERol Rol, float Tam)
{
	return FSlateFontInfo(Cara(Rol == ERol::Titulo ? Titulos : Textos), Tam);
}
