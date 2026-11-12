/**
 * Lo que comparten los pagos que entran y salen: la cuenta de la fábrica donde se recibió o de donde salió, el monto en
 * pesos enteros, cómo se lee un monto y el aviso del pago repetido.
 * Fase 15 · docs/modulos/contaduria/pagos-y-saldo-a-favor.md (reglas 3 y 10)
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import { centavos } from "@uniformame/compartido/tipos/base";
import { and, eq, isNull } from "drizzle-orm";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { errorDeCampo } from "../../../nucleo/http/errores.ts";
import { listas, listaValores } from "../../admin/tablas.ts";
import { listaDeCuentasFabrica } from "../siembra.ts";
import { pagos } from "../tablas.ts";

/** El medio de un pago, como lo trae la acción. */
export interface MedioPedido {
	medio: "efectivo" | "cuenta_fabrica" | "cuenta_tercero";
	cuenta_fabrica_id?: string | undefined;
	referencia?: string | undefined;
}

/**
 * Revisa dónde se recibió o de dónde salió el dinero: fuera de efectivo, la referencia; en una cuenta de la fábrica,
 * una vigente de la lista, o la única que hay si no se escogió. En la cuenta de un tercero no hay cuenta de la fábrica.
 * @param transaccion La transacción.
 * @param pedido El medio, la cuenta y la referencia que trajo la acción.
 * @param siempreReferencia Si la referencia va también en efectivo (lo que sale).
 * @returns La cuenta de la fábrica (o `null` en efectivo) y la referencia.
 * @throws `400` en `referencia` o en `cuenta_fabrica_id`.
 */
export async function revisarMedio(
	transaccion: Transaccion,
	pedido: MedioPedido,
	siempreReferencia: boolean,
): Promise<{ cuentaFabricaId: string | null; referencia: string | null }> {
	const referencia = pedido.referencia ?? null;
	if (referencia === null && (pedido.medio !== "efectivo" || siempreReferencia)) {
		throw errorDeCampo(
			"referencia",
			siempreReferencia ? "Escribe la referencia" : "Escribe la referencia del depósito",
		);
	}
	if (pedido.medio !== "cuenta_fabrica") return { cuentaFabricaId: null, referencia };
	const vigentes = await transaccion
		.select({ id: listaValores.id })
		.from(listaValores)
		.innerJoin(listas, eq(listas.id, listaValores.listaId))
		.where(and(eq(listas.clave, listaDeCuentasFabrica), isNull(listaValores.bajaEn)));
	const escogida =
		pedido.cuenta_fabrica_id === undefined
			? vigentes.length === 1
				? vigentes[0]?.id
				: undefined
			: vigentes.find((vigente) => vigente.id === pedido.cuenta_fabrica_id)?.id;
	if (escogida === undefined) throw errorDeCampo("cuenta_fabrica_id", "Escoge la cuenta.");
	return { cuentaFabricaId: escogida, referencia };
}

/**
 * El aviso del pago repetido: ya hay un pago registrado con la misma referencia y el mismo monto (regla 10).
 * @param transaccion La transacción.
 * @param referencia La referencia del pago nuevo.
 * @param monto Su monto.
 * @returns El aviso, o ninguno.
 */
export async function avisoDePagoRepetido(
	transaccion: Transaccion,
	referencia: string | null,
	monto: number,
): Promise<string[]> {
	if (referencia === null) return [];
	const [repetido] = await transaccion
		.select({ folio: pagos.folio })
		.from(pagos)
		.where(and(eq(pagos.referencia, referencia), eq(pagos.montoCentavos, monto), eq(pagos.estado, "registrado")))
		.limit(1);
	return repetido === undefined ? [] : [`Ya hay un pago con la referencia ${referencia}: ${repetido.folio}`];
}

/**
 * Un monto como se lee: «$8,000», o «$999.50» si trae centavos (un saldo que dejó una NC).
 * @param monto Los centavos.
 */
export function enPesos(monto: number): string {
	return centavosATexto(centavos(monto), { conCentavos: monto % 100 !== 0 });
}

/**
 * Revisa que un monto vaya en pesos enteros; con centavos solo entra si liquida exacto lo que queda (decisión 674).
 * @param monto El monto del pago o de la devolución.
 * @param loQueQueda El saldo de la nota o el saldo a favor.
 * @throws `400` en `monto_centavos`: «Escribe el monto en pesos, o el saldo exacto: {saldo}».
 */
export function revisarPesosEnteros(monto: number, loQueQueda: number): void {
	if (monto % 100 !== 0 && monto !== loQueQueda) {
		throw errorDeCampo("monto_centavos", `Escribe el monto en pesos, o el saldo exacto: ${enPesos(loQueQueda)}`);
	}
}
