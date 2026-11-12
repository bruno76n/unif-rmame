/**
 * La página de un departamento: el título grande y, abajo, sus pestañas; la primera es siempre «Pendientes», con su
 * conteo, roja si algo urge. En el teléfono las pestañas se desplazan de lado con la activa al centro.
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento», reglas 1, 2 y 5)
 *
 * Uso: `<PaginaDepartamento titulo="Bodega" pestanas={…} activa="pendientes" alEscoger={(clave) => navegar(…)}>…`.
 * La pestaña activa vive en la dirección: quien usa la página la lee y la cambia ahí.
 */

import { type ReactNode, useEffect, useRef } from "react";
import { unirClases } from "../clases.ts";

/** Una pestaña. */
export interface Pestana {
	clave: string;
	texto: string;
	conteo?: number;
	/** Si algo urge: su conteo va en rojo. */
	rojo?: boolean;
}

/** Lo que recibe la página de un departamento. */
export interface PropsDePaginaDepartamento {
	titulo: string;
	pestanas: readonly Pestana[];
	activa: string;
	alEscoger: (clave: string) => void;
	children?: ReactNode;
}

/**
 * La página de un departamento con sus pestañas.
 * @param props El título, las pestañas, la activa, qué hacer al escoger y el contenido.
 */
export function PaginaDepartamento({ titulo, pestanas, activa, alEscoger, children }: PropsDePaginaDepartamento) {
	const activaRef = useRef<HTMLButtonElement>(null);
	// En el teléfono, la pestaña activa queda al centro.
	useEffect(() => {
		activaRef.current?.scrollIntoView?.({ inline: "center", block: "nearest" });
	}, []);
	return (
		<div className="flex flex-col">
			<div className="border-linea border-b px-8 pt-6 max-telefono:px-4">
				<h1 className="m-0 font-bold text-titulo-departamento leading-tight max-telefono:text-titulo-departamento-telefono">
					{titulo}
				</h1>
				<div role="tablist" aria-label={`Pestañas de ${titulo}`} className="mt-4 flex gap-1 overflow-x-auto">
					{pestanas.map((pestana) => {
						const esActiva = pestana.clave === activa;
						return (
							<button
								key={pestana.clave}
								ref={esActiva ? activaRef : undefined}
								type="button"
								role="tab"
								aria-selected={esActiva}
								onClick={() => alEscoger(pestana.clave)}
								className={unirClases(
									"-mb-px inline-flex flex-none items-center gap-2 whitespace-nowrap border-b-2 px-2.5 pb-3 font-semibold",
									esActiva ? "border-tinta text-tinta" : "border-transparent text-tinta2 hover:text-tinta",
								)}
							>
								{pestana.texto}
								{pestana.conteo === undefined || pestana.conteo === 0 ? null : (
									<span
										className={unirClases(
											"rounded-full px-2 font-bold text-xs tabular-nums",
											pestana.rojo === true ? "bg-estado-rojo/15 text-estado-rojo" : "bg-riel text-tinta2",
										)}
									>
										{pestana.conteo}
									</span>
								)}
							</button>
						);
					})}
				</div>
			</div>
			<div className="mx-auto flex w-full max-w-pagina flex-col gap-5 px-8 py-6 max-telefono:px-4">{children}</div>
		</div>
	);
}
