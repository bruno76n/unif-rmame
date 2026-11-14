/**
 * Lo que comparten las pantallas de Contaduría: de dónde sale o dónde entra el dinero (Efectivo o una cuenta de la
 * fábrica) como opción de un selector, y un renglón con su texto y su monto.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Ventanas»: «Sale de»)
 */

import type { Opcion } from "@uniformame/interfaz/captura/selector";
import type { ReactNode } from "react";
import { montoEnPantalla } from "../../comun/montos.ts";

/** Una cuenta de la fábrica, como la da la consulta. */
export interface CuentaDeLaFabrica {
	id: string;
	nombre: string;
}

/** El valor del selector cuando el dinero sale o entra en efectivo. */
export const efectivo = "efectivo";

/**
 * Las opciones de «Sale de»: las cuentas de la fábrica, en su orden, y Efectivo.
 * @param cuentas Las cuentas de la fábrica.
 */
export function opcionesDeSaleDe(cuentas: readonly CuentaDeLaFabrica[]): Opcion[] {
	return [
		...cuentas.map((cuenta) => ({ valor: cuenta.id, texto: cuenta.nombre })),
		{ valor: efectivo, texto: "Efectivo" },
	];
}

/**
 * El medio de un pago según lo escogido en «Sale de».
 * @param valor Lo escogido: «efectivo» o el id de una cuenta.
 */
export function medioDe(valor: string): { medio: "efectivo" } | { medio: "cuenta_fabrica"; cuenta_fabrica_id: string } {
	return valor === efectivo ? { medio: "efectivo" } : { medio: "cuenta_fabrica", cuenta_fabrica_id: valor };
}

/**
 * Un renglón de una lista dentro de un cajón: su texto a la izquierda, su monto a la derecha y lo que lo acompaña.
 * @param props El texto, el detalle, el monto, si va tachado y lo de la derecha.
 */
export function RenglonDeLista({
	texto,
	detalle,
	monto,
	tachado = false,
	derecha,
}: {
	texto: ReactNode;
	detalle?: ReactNode;
	monto?: number | undefined;
	tachado?: boolean;
	derecha?: ReactNode;
}) {
	return (
		<li className={`flex flex-wrap items-center gap-3 border-linea border-b py-2.5 ${tachado ? "line-through" : ""}`}>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="font-semibold">{texto}</span>
				{detalle === undefined ? null : <span className="text-etiqueta text-tinta3">{detalle}</span>}
			</span>
			{monto === undefined ? null : <b className="tabular-nums">{montoEnPantalla(monto)}</b>}
			{derecha}
		</li>
	);
}
