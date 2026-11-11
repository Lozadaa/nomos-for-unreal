#pragma once

#include "CoreMinimal.h"

class AActor;

// El único sitio donde se decide cómo se ve cada actor: malla, material, luz y efectos según su rol.
// La mecánica crea actores y llama a Vestir; lo visible se cambia aquí, no en cada clase (SKILL de Nomos, Repartir).
// Trae un marcador (cubo magenta) que revisar_acabado.py rechaza: sustitúyelo siguiendo el plan de arte y el arsenal visual.
struct SEMILLA_API FSemillaAspecto
{
	// Roles: Protagonista, Amenaza, Objetivo, Escenario. Vestir etiqueta el actor con su rol (Tags) para las capturas de detalle.
	static void Vestir(AActor* Actor, FName Rol);
};
