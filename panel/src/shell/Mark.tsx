/** Símbolo de la marca (nomos-media/logo/nomos-simbolo.svg): la N de tres piezas, en la arcilla del tema (clara en oscuro).
 *  En la cabecera va el símbolo y el nombre en texto: la firma completa con «for Unreal» solo se lee desde 320 px de ancho. */
export function Mark({ size = 22 }: { size?: number }) {
  return <svg aria-hidden width={size} height={size} viewBox="0 0 256 256" fill="currentColor" className="shrink-0 text-clay">
    <path d="M40 36 C51 35 65 36 75 36 Q80 36 80 41 L79 216 Q79 221 74 221 L40 220 Q35 220 35 215 L36 41 Q36 36 40 36Z" />
    <path d="M90 50 Q90 47 93 51 L165 145 Q167 148 167 152 L166 204 Q166 209 163 205 L92 112 Q89 108 89 104Z" />
    <path d="M181 36 L216 35 Q221 35 221 40 L220 215 Q220 220 215 220 L181 221 Q176 221 176 216 L177 41 Q177 36 181 36Z" />
  </svg>
}
