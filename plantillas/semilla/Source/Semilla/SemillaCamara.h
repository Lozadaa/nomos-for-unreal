#pragma once

#include "CoreMinimal.h"

// Cámara que encuadra la escena entera, sin mundo: funciones puras que prueba Semilla.Camara.
struct SEMILLA_API FSemillaCamara
{
	// Transform de una cámara (FOV horizontal, aspecto ancho/alto) inclinada InclinacionGrados hacia abajo y mirando a +X
	// que mete la caja entera en cuadro con Margen (fracción de media pantalla) libre en cada borde.
	static FTransform Encuadrar(const FBox& Escena, float FovGrados, float Aspecto, float InclinacionGrados, float Margen = 0.08f);

	// Fracción del alto de pantalla que ocupa algo de AltoCm a DistanciaCm con un FOV vertical de FovGrados.
	static float TamanoEnPantalla(float AltoCm, float DistanciaCm, float FovGrados);

	// FOV vertical a partir del horizontal de Unreal y el aspecto.
	static float FovVertical(float FovHorizontalGrados, float Aspecto);
};
