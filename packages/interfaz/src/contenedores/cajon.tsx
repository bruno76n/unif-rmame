/**
 * El cajón: el panel que entra por la derecha sobre la página, que se oscurece detrás. Encabezado con el folio y su
 * contexto en chico y el nombre grande; los botones con cifra arriba del cuerpo; el cuerpo; y el pie con cerrar,
 * regresar o descartar a la izquierda y la acción principal a la derecha. De 620 px, o 860 el ancho; en el teléfono
 * ocupa toda la pantalla.
 * Fase 19 · docs/interfaz/comunes.md («El cajón») y docs/interfaz/DISENO.md («Cajón»)
 *
 * Con cambios sin guardar, cerrarlo pregunta antes: «Tienes cambios sin guardar. ¿Salir sin guardar?», con «Volver» y
 * «Salir sin guardar». La pantalla hace lo mismo al cambiar de pestaña o salir por el menú con `preguntarAntesDeSalir`.
 */

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Boton } from "../botones/boton.tsx";
import { unirClases } from "../clases.ts";
import { Ventana } from "./ventana.tsx";

/** La pregunta antes de perder lo capturado. */
export const textoCambiosSinGuardar = "Tienes cambios sin guardar. ¿Salir sin guardar?";

/** Lo que recibe un cajón. */
export interface PropsDeCajon {
	abierto: boolean;
	alCerrar: () => void;
	/** El folio y su contexto, en chico arriba («PE-0145 · Colegio Morelos»). */
	contexto?: string;
	titulo: string;
	ancho?: boolean;
	/** Si hay cambios sin guardar: cerrar pregunta antes. */
	conCambios?: boolean;
	/** Los botones con cifra, arriba del cuerpo. */
	relacionados?: ReactNode;
	/** A la izquierda del pie; sin esto, «Cerrar». */
	pieIzquierda?: ReactNode;
	/** La acción principal, a la derecha del pie. */
	accion?: ReactNode;
	children?: ReactNode;
}

/**
 * Un cajón a la derecha.
 * @param props Si está abierto, qué hacer al cerrarlo, su encabezado, si hay cambios, lo relacionado, su pie y su cuerpo.
 */
export function Cajon({
	abierto,
	alCerrar,
	contexto,
	titulo,
	ancho = false,
	conCambios = false,
	relacionados,
	pieIzquierda,
	accion,
	children,
}: PropsDeCajon) {
	const [preguntando, setPreguntando] = useState(false);
	const pedirCerrar = () => (conCambios ? setPreguntando(true) : alCerrar());
	return (
		<>
			<Dialog.Root open={abierto} onOpenChange={(abrir) => (abrir ? undefined : pedirCerrar())}>
				<Dialog.Portal>
					<Dialog.Backdrop className="fixed inset-0 z-30 bg-tinta/35" />
					<Dialog.Popup
						className={unirClases(
							"fixed top-3 right-3 bottom-3 z-30 flex w-[calc(100vw-24px)] flex-col rounded-grande bg-panel shadow-flotante",
							"max-telefono:inset-0 max-telefono:w-full max-telefono:rounded-none",
							ancho ? "max-w-cajon-ancho" : "max-w-cajon",
						)}
					>
						<div className="flex items-start gap-4 border-linea border-b px-6 pt-5 pb-4">
							<div className="min-w-0 flex-1">
								{contexto === undefined ? null : (
									<div className="font-semibold text-etiqueta text-tinta3">{contexto}</div>
								)}
								<Dialog.Title className="m-0 font-bold text-titulo-cajon text-tinta leading-tight max-telefono:text-titulo-cajon-telefono">
									{titulo}
								</Dialog.Title>
							</div>
							<button
								type="button"
								aria-label="Cerrar"
								onClick={pedirCerrar}
								className="grid size-9 flex-none place-items-center rounded-mediano text-tinta2 hover:bg-suave"
							>
								<X aria-hidden="true" size={18} strokeWidth={1.9} />
							</button>
						</div>
						{relacionados === undefined ? null : <div className="flex flex-wrap gap-2 px-6 pt-4">{relacionados}</div>}
						<div className="flex-1 overflow-auto px-6 py-4">{children}</div>
						<div className="flex items-center justify-between gap-3 rounded-b-grande border-linea border-t bg-suave px-6 py-4 max-telefono:rounded-none">
							{pieIzquierda ?? (
								<Boton variante="fantasma" onClick={pedirCerrar}>
									Cerrar
								</Boton>
							)}
							{accion}
						</div>
					</Dialog.Popup>
				</Dialog.Portal>
			</Dialog.Root>
			<Ventana
				abierta={preguntando}
				alCerrar={() => setPreguntando(false)}
				titulo={textoCambiosSinGuardar}
				accion={
					<Boton
						variante="peligro"
						onClick={() => {
							setPreguntando(false);
							alCerrar();
						}}
					>
						Salir sin guardar
					</Boton>
				}
			/>
		</>
	);
}
