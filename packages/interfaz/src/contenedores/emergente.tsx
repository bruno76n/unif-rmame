/**
 * El emergente: un globo que sale junto a su botón (la campana, por ejemplo), con su título y su contenido; se cierra
 * al tocar fuera o con Escape.
 * Fase 19 · docs/interfaz/comunes.md («La barra superior»)
 *
 * Uso: `<Emergente etiqueta="Avisos" boton={<Bell />} titulo="Avisos" accion={…}>…</Emergente>`. El botón es de 44 px,
 * cuadrado, con su ícono; `marca` es la cifra roja encima (los avisos sin leer).
 */

import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";

/** Lo que recibe un emergente. */
export interface PropsDeEmergente {
	/** El nombre del botón para el lector de pantalla. */
	etiqueta: string;
	/** El ícono del botón. */
	boton: ReactNode;
	/** La cifra roja sobre el botón, si la hay. */
	marca?: number;
	titulo: string;
	/** Lo que va a la derecha del título («Marcar todos como leídos»). */
	accion?: ReactNode;
	children?: ReactNode;
}

/**
 * Un emergente con su botón.
 * @param props La etiqueta, el ícono, la cifra, el título, la acción y el contenido.
 */
export function Emergente({ etiqueta, boton, marca, titulo, accion, children }: PropsDeEmergente) {
	return (
		<Popover.Root>
			<Popover.Trigger
				aria-label={etiqueta}
				className="relative grid size-11 flex-none place-items-center rounded-mediano text-tinta2 hover:bg-riel"
			>
				{boton}
				{marca === undefined || marca === 0 ? null : (
					<span className="absolute top-1.5 right-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-estado-rojo px-1 font-bold text-[10px] text-white tabular-nums">
						{marca}
					</span>
				)}
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Positioner sideOffset={8} align="end" className="z-40">
					<Popover.Popup className="w-95 max-w-[calc(100vw-32px)] rounded-grande bg-panel p-2 shadow-flotante">
						<div className="flex items-center justify-between gap-3 px-2 py-1.5">
							<Popover.Title className="m-0 font-bold">{titulo}</Popover.Title>
							{accion}
						</div>
						<div className="max-h-[60vh] overflow-y-auto">{children}</div>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
