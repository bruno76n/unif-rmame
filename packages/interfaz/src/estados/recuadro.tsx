/**
 * El recuadro de aviso dentro de una pantalla o de un cajón: una franja suave con la orilla del color de lo que dice
 * (azul informa, ámbar advierte, verde está bien, rojo detiene) y su botón si lo lleva. No es el aviso de abajo.
 * Fase 19 · docs/interfaz/DISENO.md («Los colores») y docs/interfaz/comunes.md («El cajón»)
 *
 * Uso: `<Recuadro color="ambar" boton={<Boton chico>…</Boton>}>Sobran 20 piezas en producción.</Recuadro>`.
 */

import type { ReactNode } from "react";
import { unirClases } from "../clases.ts";

/** Los colores de un recuadro. */
export type ColorDeRecuadro = "azul" | "ambar" | "verde" | "rojo";

/** La orilla de cada color. */
const orilla: Readonly<Record<ColorDeRecuadro, string>> = {
	azul: "border-estado-azul",
	ambar: "border-estado-ambar",
	verde: "border-estado-verde",
	rojo: "border-estado-rojo",
};

/**
 * Un recuadro de aviso.
 * @param props Su color, su texto y su botón.
 */
export function Recuadro({
	color,
	children,
	boton,
}: {
	color: ColorDeRecuadro;
	children: ReactNode;
	boton?: ReactNode;
}) {
	return (
		<div
			role={color === "rojo" ? "alert" : "status"}
			className={unirClases(
				"flex flex-wrap items-center gap-3 rounded-mediano border-l-4 bg-suave px-4 py-3 font-semibold",
				orilla[color],
			)}
		>
			<span className="flex-1">{children}</span>
			{boton}
		</div>
	);
}
