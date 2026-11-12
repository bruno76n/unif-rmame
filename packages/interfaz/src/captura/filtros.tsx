/**
 * Los filtros por grupo: «Todos» y cada grupo con su conteo y, si lo lleva, el punto de su color; el activo, en negro.
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento», regla 3)
 *
 * Uso: `<Filtros filtros={[{ clave: "todos", texto: "Todos", conteo: 5 }, …]} activo={filtro} alEscoger={...} />`. El
 * filtro activo vive en la dirección: quien lo usa lo lee de ahí y lo cambia ahí.
 */

import { unirClases } from "../clases.ts";

/** Un filtro. */
export interface Filtro {
	clave: string;
	texto: string;
	conteo?: number;
	/** El punto de color del grupo (la clase de fondo de su tipo, `bg-rojo`). */
	punto?:
		| "bg-rojo"
		| "bg-ambar"
		| "bg-azul"
		| "bg-verde"
		| "bg-violeta"
		| "bg-verde-azulado"
		| "bg-pizarra"
		| "bg-rosa";
}

/** Lo que reciben los filtros. */
export interface PropsDeFiltros {
	filtros: readonly Filtro[];
	activo: string;
	alEscoger: (clave: string) => void;
	/** Para el lector de pantalla: qué se filtra («Filtrar pendientes»). */
	nombre: string;
}

/**
 * Los filtros por grupo.
 * @param props Los filtros, el activo, qué hacer al escoger y su nombre.
 */
export function Filtros({ filtros, activo, alEscoger, nombre }: PropsDeFiltros) {
	return (
		<div role="toolbar" aria-label={nombre} className="flex flex-wrap gap-2">
			{filtros.map((filtro) => {
				const esActivo = filtro.clave === activo;
				return (
					<button
						key={filtro.clave}
						type="button"
						aria-pressed={esActivo}
						onClick={() => alEscoger(filtro.clave)}
						className={unirClases(
							"inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-semibold text-sm",
							esActivo ? "border-tinta bg-tinta text-white" : "border-linea2 bg-panel text-tinta hover:bg-suave",
						)}
					>
						{filtro.punto === undefined || esActivo ? null : (
							<span aria-hidden="true" className={unirClases("size-1.5 rounded-full", filtro.punto)} />
						)}
						<span>{filtro.texto}</span>
						{filtro.conteo === undefined ? null : (
							<span className={unirClases("tabular-nums", esActivo ? "text-white/80" : "text-tinta3")}>
								{filtro.conteo}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
