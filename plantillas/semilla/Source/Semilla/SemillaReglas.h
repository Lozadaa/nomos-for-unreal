#pragma once

#include "CoreMinimal.h"

// Reglas del juego en C++ puro, sin UObject ni mundo: se prueban con `nomos ue test Semilla.Reglas`.
// La semilla trae un ejemplo de un solo dato (puntos hasta una meta); cámbialo por las reglas de tu juego.
struct FSemillaReglas
{
	int32 Puntos = 0;
	int32 Meta = 5;

	void Reiniciar() { Puntos = 0; }
	void Sumar(int32 N = 1) { if (!Ganada()) Puntos = FMath::Min(Meta, Puntos + N); }
	bool Ganada() const { return Puntos >= Meta; }
};
