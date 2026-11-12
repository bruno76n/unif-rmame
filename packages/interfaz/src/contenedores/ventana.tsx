/**
 * La ventana: el recuadro al centro para confirmar algo con motivo, capturar un dato corto o escoger algo; «Volver» a
 * la izquierda y la acción a la derecha. De 470 px, o 580 la ancha.
 * Fase 19 · docs/interfaz/comunes.md («La ventana») y docs/interfaz/DISENO.md («Ventana»)
 *
 * Uso: `<Ventana abierta={…} alCerrar={…} titulo="Rechazar" accion={<Boton variante="peligro" …>Rechazar</Boton>}>…`.
 * Es el Dialog de Base UI: atrapa el foco, se cierra con Escape y regresa el foco a quien la abrió.
 */

import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { Boton } from "../botones/boton.tsx";
import { unirClases } from "../clases.ts";

/** Lo que recibe una ventana. */
export interface PropsDeVentana {
	abierta: boolean;
	alCerrar: () => void;
	titulo: string;
	/** El texto de abajo del título, si lo lleva (lo que se pide, por ejemplo). */
	subtitulo?: string;
	ancha?: boolean;
	/** La acción, a la derecha del pie. */
	accion?: ReactNode;
	/** El texto del botón de la izquierda. */
	volver?: string;
	children?: ReactNode;
}

/**
 * Una ventana al centro.
 * @param props Si está abierta, qué hacer al cerrarla, su título, su ancho, su acción y su cuerpo.
 */
export function Ventana({
	abierta,
	alCerrar,
	titulo,
	subtitulo,
	ancha = false,
	accion,
	volver = "Volver",
	children,
}: PropsDeVentana) {
	return (
		<Dialog.Root open={abierta} onOpenChange={(abrir) => (abrir ? undefined : alCerrar())}>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-tinta/35" />
				<Dialog.Popup
					className={unirClases(
						"-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-32px)] flex-col rounded-grande bg-panel shadow-flotante",
						ancha ? "max-w-ventana-ancha" : "max-w-ventana",
					)}
				>
					<div className="px-6 pt-6 pb-2">
						<Dialog.Title className="m-0 font-bold text-subtitulo text-tinta">{titulo}</Dialog.Title>
						{subtitulo === undefined ? null : (
							<Dialog.Description className="mt-1 text-tinta2">{subtitulo}</Dialog.Description>
						)}
					</div>
					<div className="overflow-auto px-6 py-3">{children}</div>
					<div className="flex items-center justify-between gap-3 px-6 pt-3 pb-6">
						<Boton variante="fantasma" onClick={alCerrar}>
							{volver}
						</Boton>
						{accion}
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
