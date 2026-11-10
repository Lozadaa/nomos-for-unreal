#pragma once

#include "CoreMinimal.h"
#include "Fonts/SlateFontInfo.h"

// Dirección de arte en un sitio (docs/direccion.md): dos fuentes propias y la paleta. Cambia aquí, no en cada widget.
namespace SemillaEstilo
{
	enum class ERol : uint8 { Titulo, Texto };

	// UFont compuesto en C++ sobre el FontFace importado (en 5.9 la importación por Python no crea el UFont): nítido en Shipping.
	SEMILLA_API FSlateFontInfo Fuente(ERol Rol, float Tam);

	// Tokens de paleta (lineales).
	inline const FLinearColor Fondo(0.012f, 0.014f, 0.024f);
	inline const FLinearColor Panel(0.035f, 0.040f, 0.065f, 0.92f);
	inline const FLinearColor Tinta(0.930f, 0.880f, 0.780f);
	inline const FLinearColor Acento(1.000f, 0.420f, 0.090f);
	inline const FLinearColor Suave(0.520f, 0.500f, 0.470f);
	inline const FLinearColor Borde(0.420f, 0.200f, 0.070f);  // filo de los paneles: distinto del interior
}
