/**
 * El menú de opciones: un renglón que al tocarlo abre una lista corta de opciones (el menú de la cuenta, con «Mis
 * sesiones» y «Salir»). Se usa con teclado: flechas, Enter y Escape.
 * Fase 19 · docs/interfaz/comunes.md («El menú lateral», regla 5)
 *
 * Uso: `<MenuDeOpciones boton={<…avatar y nombre…/>} opciones={[{ texto: "Salir", icono: LogOut, peligro: true,
 * alTocar }]} />`.
 */

import { Menu } from "@base-ui/react/menu";
import type { LucideIcon } from "lucide-react";
import { ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { unirClases } from "../clases.ts";

/** Una opción del menú. */
export interface Opcion {
	texto: string;
	icono: LucideIcon;
	/** En rojo («Salir»). */
	peligro?: boolean;
	alTocar: () => void;
}

/** Lo que recibe el menú de opciones. */
export interface PropsDeMenuDeOpciones {
	/** Lo que se ve en el renglón que lo abre. */
	boton: ReactNode;
	opciones: readonly Opcion[];
	/** Hacia dónde sale: arriba (abajo del menú lateral) o abajo. */
	lado?: "top" | "bottom";
}

/**
 * Un menú de opciones.
 * @param props El renglón, las opciones y hacia dónde sale.
 */
export function MenuDeOpciones({ boton, opciones, lado = "top" }: PropsDeMenuDeOpciones) {
	return (
		<Menu.Root>
			<Menu.Trigger className="flex w-full items-center gap-2.5 rounded-mediano p-2 text-left hover:bg-suave">
				<span className="flex min-w-0 flex-1 items-center gap-2.5">{boton}</span>
				<ChevronsUpDown aria-hidden="true" size={16} className="flex-none text-tinta3" />
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner side={lado} sideOffset={8} className="z-40">
					<Menu.Popup className="w-55 rounded-grande bg-panel p-1.5 shadow-flotante">
						{opciones.map(({ texto, icono: Icono, peligro, alTocar }) => (
							<Menu.Item
								key={texto}
								onClick={alTocar}
								className={unirClases(
									"flex cursor-pointer items-center gap-2.5 rounded-mediano px-2.5 py-2 font-semibold data-[highlighted]:bg-suave",
									peligro === true ? "text-estado-rojo" : "text-tinta",
								)}
							>
								<Icono aria-hidden="true" size={17} strokeWidth={1.9} />
								{texto}
							</Menu.Item>
						))}
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	);
}
