#pragma once

#include "CoreMinimal.h"

class AActor;

// El único sitio donde se decide cómo se ve cada actor: malla, material, luz y efectos según su rol.
// La mecánica crea actores y llama a Vestir; lo visible se cambia aquí, no en cada clase (SKILL de Nomos, Repartir).
// Ejemplo con formas básicas y la paleta de SemillaEstilo: sustitúyelo por el aspecto de tu juego.
struct SEMILLA_API FSemillaAspecto
{
	// Roles: Protagonista, Amenaza, Objetivo, Escenario. Un rol desconocido deja el actor como está y avisa en el log.
	static void Vestir(AActor* Actor, FName Rol);
};
