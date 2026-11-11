/** Símbolo de la marca v2 (docs/media/nomos-mark.svg): tres barras inclinadas forman la N y la diagonal va en brasa.
 *  Los montantes toman el color del texto (hueso en oscuro, negro en claro); la diagonal, el acento del tema. Mínimo legible: 32 px de ancho
 *  según las notas del logo; en la cabecera va a 28 px junto al nombre en texto, que también lo identifica. */
export function Mark({ size = 28 }: { size?: number }) {
  return <svg aria-hidden width={size} height={size} viewBox="16 40 224 176" className="shrink-0">
    <path fill="currentColor" d="M67 48L97 48L65.7 195.3L53 208L23 208L54.3 60.7Z" />
    <path className="fill-ember" d="M96 84L124 56L160 172L132 200Z" />
    <path fill="currentColor" d="M203 48L233 48L201.7 195.3L189 208L159 208L190.3 60.7Z" />
  </svg>
}
