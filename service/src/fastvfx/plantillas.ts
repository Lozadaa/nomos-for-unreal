/** FASTVFX: registro de plantillas. Una plantilla es un sistema determinista que construye un generador de Python
 *  (service/unreal/nomos_fastvfx.py); la receta solo elige plantilla y valores. Subir `version` = cambio estructural:
 *  la caché reconstruye el maestro o el sistema base y todo lo que cuelga de él. */

export type Param =
  | {tipo: 'escalar'; min: number; max: number; defecto: number; destino: 'material' | 'usuario'}
  | {tipo: 'entero'; min: number; max: number; defecto: number; destino: 'usuario'}
  | {tipo: 'color'; defecto: [number, number, number, number]; destino: 'material'}
  | {tipo: 'switch'; defecto: boolean; destino: 'estatico'};

export type Plantilla = {
  id: string; version: number; tipo: 'material' | 'niagara'; descripcion: string;
  /** Asset que se construye una vez (maestro o sistema base) */
  base: string;
  /** Lo que el generador lee del motor: si cambia la versión de UE, cambia la clave */
  dependencias: string[];
  parametros: Record<string, Param>;
  /** Niagara: maestro del que cuelgan las MIs de cada emisor y lo que fija cada una */
  maestro?: string;
  roles?: Record<string, {escalares?: Record<string, number>; switches?: Record<string, boolean>; intensidad: number}>;
};

/** Versión de nomos_fastvfx.py (GENERADOR allí): si cambia, todo es estructural. */
export const generador = 1;
export const raiz = '/Game/FastVfx';
export const escenario = `${raiz}/L_FastVfxPreview`;

const esc = (min: number, max: number, defecto: number): Param => ({tipo: 'escalar', min, max, defecto, destino: 'material'});
const sw = (defecto: boolean): Param => ({tipo: 'switch', defecto, destino: 'estatico'});

const vfx: Plantilla = {
  id: 'M_Master_VFX', version: 1, tipo: 'material', base: `${raiz}/Maestros/M_Master_VFX`,
  descripcion: 'Material maestro de efectos: emisivo aditivo sin luz, color, opacidad, máscara radial (disco o anillo que crece con la edad de la partícula), Fresnel, ruido animado y distorsión opcional. La receta crea una Material Instance.',
  dependencias: ['/Engine/EngineMaterials/Good64x64TilingNoiseHighFreq'],
  parametros: {
    Color: {tipo: 'color', defecto: [1, 0.45, 0.1, 1], destino: 'material'},
    Intensidad: esc(0, 200, 6), Opacidad: esc(0, 1, 1),
    RadioInicio: esc(0, 1, 0.6), RadioFin: esc(0, 1, 0.9), Suavidad: esc(0.01, 1, 0.25),
    Anillo: esc(0, 1, 0), AnchoAnillo: esc(0.01, 1, 0.1), Caida: esc(0.1, 8, 1.5),
    FresnelExp: esc(0.1, 20, 3), FresnelPeso: esc(0, 1, 1),
    RuidoEscala: esc(0.01, 50, 2), RuidoVelocidad: esc(-10, 10, 0.2), RuidoPeso: esc(0, 1, 0.5),
    DistorsionFuerza: esc(0, 1, 0.05),
    UsarMascaraRadial: sw(true), DesvanecerConEdad: sw(true), UsarFresnel: sw(false), UsarRuido: sw(true), UsarDistorsion: sw(false),
  },
};

const holo: Plantilla = {
  id: 'M_Master_Hologram', version: 1, tipo: 'material', base: `${raiz}/Maestros/M_Master_Hologram`,
  descripcion: 'Material maestro de holograma: borde Fresnel, líneas de barrido en Z del mundo que se desplazan y parpadeo senoidal. La receta crea una Material Instance.',
  dependencias: [],
  parametros: {
    Color: {tipo: 'color', defecto: [0.1, 0.7, 1, 1], destino: 'material'},
    Intensidad: esc(0, 200, 3), Opacidad: esc(0, 1, 0.6), FresnelExp: esc(0.1, 20, 2.5), BrilloInterior: esc(0, 1, 0.15),
    LineasDensidad: esc(0, 20, 0.4), LineasVelocidad: esc(-20, 20, 0.6), LineasPeso: esc(0, 1, 0.6),
    Parpadeo: esc(0, 1, 0.15), ParpadeoVelocidad: esc(0, 100, 14),
  },
};

const energia: Plantilla = {
  id: 'FX_Energy_Base', version: 1, tipo: 'niagara', base: `${raiz}/Sistemas/FX_Energy_Base`, maestro: vfx.base,
  descripcion: 'Estallido de energía en Niagara: destello central, onda expansiva, chispas con gravedad y partículas secundarias que flotan. Se construye una vez con el emisor vacío y los módulos del motor; la receta crea una variante (copia con sus propias MIs). Particulas, Vida y Escala son parámetros de usuario del sistema.',
  dependencias: ['/Niagara/DefaultAssets/Templates/CascadeConversion/CompletelyEmpty', '/Niagara/Modules/Emitter/EmitterState',
    '/Niagara/Modules/Emitter/SpawnBurst_Instantaneous', '/Niagara/Modules/Spawn/Initialization/V2/InitializeParticle',
    '/Niagara/Modules/Spawn/Velocity/AddVelocity', '/Niagara/Modules/Update/Forces/GravityForce', '/Niagara/Modules/Update/Forces/Drag',
    '/Niagara/Modules/Solvers/SolveForcesAndVelocity', '/Niagara/Modules/Update/Lifetime/ParticleState'],
  parametros: {
    Color: {tipo: 'color', defecto: [1, 0.45, 0.1, 1], destino: 'material'},
    Intensidad: esc(0, 20, 1),
    Particulas: {tipo: 'entero', min: 0, max: 5000, defecto: 80, destino: 'usuario'},
    Vida: {tipo: 'escalar', min: 0.05, max: 20, defecto: 1, destino: 'usuario'},
    Escala: {tipo: 'escalar', min: 0.05, max: 20, defecto: 1, destino: 'usuario'},
  },
  roles: {
    Nucleo: {intensidad: 12, escalares: {RadioInicio: 0.5, RadioFin: 1}},
    Onda: {intensidad: 6, escalares: {Anillo: 1, RadioInicio: 0.1, RadioFin: 0.95, AnchoAnillo: 0.08}},
    Chispas: {intensidad: 20, escalares: {RadioInicio: 0.9, RadioFin: 0.9, Suavidad: 0.6}, switches: {UsarRuido: false}},
    Secundarias: {intensidad: 4, escalares: {RadioInicio: 0.8, RadioFin: 0.8, Suavidad: 0.8}},
  },
};

export const plantillas: Record<string, Plantilla> = {[vfx.id]: vfx, [holo.id]: holo, [energia.id]: energia};

/** Lo que fija la calidad: siempre parámetros estáticos (otra permutación de shader), nunca el grafo. */
export const calidades: Record<string, Record<string, boolean>> = {
  alta: {}, media: {UsarDistorsion: false}, baja: {UsarRuido: false, UsarDistorsion: false},
};

/** Valores por defecto de una plantilla, en el formato que lee el generador. */
export function defectos(p: Plantilla): Record<string, unknown> {
  return Object.fromEntries(Object.entries(p.parametros).map(([k, v]) => [k, v.defecto]));
}
