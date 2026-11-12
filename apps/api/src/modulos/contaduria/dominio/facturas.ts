/**
 * Las facturas de proveedor por dentro: el valor recibido de cada orden, las tres puntas y la revisión de las
 * facturas de unas órdenes cuando cambia lo recibido o se cancela una factura.
 * Fase 17 · docs/modulos/contaduria/facturas-de-proveedor.md (reglas 4 a 7)
 *
 * El orden de los candados de las cuentas por pagar (decisión 698): las órdenes en orden de id (las bloquea
 * `compras.ordenes_para_factura`), las facturas en orden de id, sus cuentas y, al final, el folio. La recepción de
 * Aduana ya tiene su orden cuando llama `contaduria.revisar_facturas_de_orden`.
 */

import { aMilesimosConSigno } from "@uniformame/compartido/calculos/cuenta-material";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import {
	cuentasPorPagar,
	type EstadoDeFacturaProveedor,
	facturaProveedorOrdenes,
	facturasProveedor,
	terceros,
} from "../tablas.ts";
import { enPesos } from "./pagos.ts";

/** Una factura de proveedor como la lee quien la cambia. */
export type FacturaProveedor = typeof facturasProveedor.$inferSelect;

/** Una cuenta por pagar como la lee quien la cambia. */
export type CuentaPorPagar = typeof cuentasPorPagar.$inferSelect;

/** Lo que regresa `compras.ordenes_para_factura`. */
export const ordenesParaFactura = z.object({
	ordenes: z.array(
		z.object({
			orden_compra_id: z.uuid(),
			folio: z.string(),
			estado: z.string(),
			dias_credito: z.number().int().nullable(),
			proveedor_id: z.uuid(),
			tercero_id: z.uuid(),
			proveedor: z.string(),
			lineas: z.array(
				z.object({ orden_compra_linea_id: z.uuid(), material: z.string(), unidad: z.string(), pedido: z.string() }),
			),
		}),
	),
});

/** Una orden para su factura. */
export type OrdenParaFactura = z.infer<typeof ordenesParaFactura>["ordenes"][number];

/** Lo que regresa `inventario.recibido_de_ordenes` (solo sus líneas). */
const recibidoDeLineas = z.object({ lineas: z.record(z.string(), z.string()) });

/** Lo que regresa `compras.precio_vigente_lineas`. */
const preciosVigentes = z.record(z.string(), z.number().int());

/**
 * Lee unas órdenes con `compras.ordenes_para_factura`, que las bloquea en orden de id.
 * @param contexto El contexto de la acción.
 * @param ordenIds Las órdenes.
 * @returns Las órdenes que existen, en orden de id.
 */
export async function bloquearOrdenes(
	contexto: ContextoDeAccion,
	ordenIds: readonly string[],
): Promise<OrdenParaFactura[]> {
	if (ordenIds.length === 0) return [];
	return ordenesParaFactura.parse(
		await contexto.lectura("compras.ordenes_para_factura", { orden_compra_ids: [...new Set(ordenIds)] }),
	).ordenes;
}

/**
 * El orden en que se capturaron las facturas: el de su folio FP-, que se toma con las órdenes ya bloqueadas (por largo
 * y luego por texto, para que FP-10000 vaya después de FP-9999; decisión 716).
 */
export const enOrdenDeCaptura = [sql`char_length(${facturasProveedor.folio})`, asc(facturasProveedor.folio)] as const;

/** Lo recibido de una orden: su valor al precio vigente y si no ha llegado nada. */
export interface RecibidoDeOrden {
	valor: number;
	nada: boolean;
}

/**
 * Lo recibido de cada orden: por línea, lo recibido en aduana menos lo devuelto al proveedor (regla 9 de las
 * recepciones), por su precio vigente, redondeado al centavo; y si de la orden no ha llegado nada.
 * @param contexto El contexto de la acción.
 * @param ordenes Las órdenes con sus líneas.
 */
export async function recibidoDeOrdenes(
	contexto: ContextoDeAccion,
	ordenes: readonly OrdenParaFactura[],
): Promise<Map<string, RecibidoDeOrden>> {
	const lineaIds = ordenes.flatMap((orden) => orden.lineas.map((linea) => linea.orden_compra_linea_id));
	const recibido =
		lineaIds.length === 0
			? {}
			: recibidoDeLineas.parse(
					await contexto.lectura("inventario.recibido_de_ordenes", { orden_compra_linea_ids: lineaIds }),
				).lineas;
	const precios =
		lineaIds.length === 0
			? {}
			: preciosVigentes.parse(
					await contexto.lectura("compras.precio_vigente_lineas", { orden_compra_linea_ids: lineaIds }),
				);
	return new Map(
		ordenes.map((orden) => {
			let valor = 0n;
			let nada = true;
			for (const linea of orden.lineas) {
				const milesimos = aMilesimosConSigno(recibido[linea.orden_compra_linea_id] ?? "0");
				if (milesimos <= 0n) continue;
				nada = false;
				valor += valorDeMilesimos(milesimos, precios[linea.orden_compra_linea_id] ?? 0);
			}
			return [orden.orden_compra_id, { valor: Number(valor), nada }];
		}),
	);
}

/**
 * El valor de una cantidad en milésimos de su unidad a un precio por unidad, redondeado al centavo (medio sube).
 * @param milesimos La cantidad, en milésimos.
 * @param precio El precio por unidad, en centavos.
 */
export function valorDeMilesimos(milesimos: bigint, precio: number): bigint {
	return (milesimos * BigInt(precio) + 500n) / 1000n;
}

/** Lo de una orden en una factura, como se compara. */
export interface PuntaDeOrden {
	ordenCompraId: string;
	importe: number;
	/** Su valor recibido: lo recibido de la orden menos lo que ya cubren las facturas capturadas antes (regla 4). */
	valor: number;
	sinRecepcion: boolean;
}

/** Lo que dicen las tres puntas de una factura. */
export interface TresPuntas {
	estado: Extract<EstadoDeFacturaProveedor, "conciliada" | "detenida">;
	responsable: "aduana" | "contaduria" | null;
	motivo: string | null;
	valorRecibido: number;
}

/**
 * Las tres puntas de una factura (regla 5): si de alguna orden no ha llegado nada, detenida a cargo de Aduana; si lo
 * facturado de una orden pasa de su valor recibido, detenida a cargo de Contaduría; si no, conciliada. Menos que lo
 * recibido no detiene: puede ser parcial.
 * @param subtotal El subtotal de la factura.
 * @param ordenes Lo de cada orden.
 * @returns Su estado, a cargo de quién, su motivo y lo recibido que le toca: de cada orden, hasta lo facturado.
 */
export function tresPuntas(subtotal: number, ordenes: readonly PuntaDeOrden[]): TresPuntas {
	// Lo recibido que toca a esta factura: de cada orden, hasta lo que se le facturó; lo que llegó de más en una orden
	// no cubre lo que falta en otra (decisión 716).
	const valorRecibido = ordenes.reduce((suma, orden) => suma + Math.min(orden.importe, orden.valor), 0);
	if (ordenes.some((orden) => orden.sinRecepcion)) {
		return {
			estado: "detenida",
			responsable: "aduana",
			motivo: "Ya facturaron y la mercancía no ha llegado a aduana",
			valorRecibido,
		};
	}
	if (ordenes.some((orden) => orden.importe > orden.valor)) {
		return {
			estado: "detenida",
			responsable: "contaduria",
			motivo: `La factura dice ${enPesos(subtotal)} sin IVA y lo recibido suma ${enPesos(valorRecibido)}`,
			valorRecibido,
		};
	}
	return { estado: "conciliada", responsable: null, motivo: null, valorRecibido };
}

/**
 * Las puntas de cada factura no cancelada de unas órdenes. En cada orden, sus facturas en el orden en que se
 * capturaron: cada una cubre lo suyo, hasta su valor recibido, y lo que cubre ya no está para las que siguen.
 * @param contexto El contexto de la acción.
 * @param ordenes Las órdenes, ya bloqueadas.
 * @returns Por factura, lo de cada una de esas órdenes.
 */
export async function puntasDeOrdenes(
	contexto: ContextoDeAccion,
	ordenes: readonly OrdenParaFactura[],
): Promise<Map<string, PuntaDeOrden[]>> {
	const recibido = await recibidoDeOrdenes(contexto, ordenes);
	const partes = await contexto.transaccion
		.select({
			facturaId: facturaProveedorOrdenes.facturaProveedorId,
			ordenCompraId: facturaProveedorOrdenes.ordenCompraId,
			importe: facturaProveedorOrdenes.importeFacturadoCentavos,
		})
		.from(facturaProveedorOrdenes)
		.innerJoin(facturasProveedor, eq(facturasProveedor.id, facturaProveedorOrdenes.facturaProveedorId))
		.where(
			and(
				inArray(
					facturaProveedorOrdenes.ordenCompraId,
					ordenes.map((orden) => orden.orden_compra_id),
				),
				ne(facturasProveedor.estado, "cancelada"),
			),
		)
		.orderBy(...enOrdenDeCaptura);
	const cubierto = new Map<string, number>();
	const puntas = new Map<string, PuntaDeOrden[]>();
	for (const parte of partes) {
		const deLaOrden = recibido.get(parte.ordenCompraId) ?? { valor: 0, nada: true };
		const yaCubierto = cubierto.get(parte.ordenCompraId) ?? 0;
		const valor = Math.max(0, deLaOrden.valor - yaCubierto);
		cubierto.set(parte.ordenCompraId, yaCubierto + Math.min(parte.importe, valor));
		const suyas = puntas.get(parte.facturaId) ?? [];
		suyas.push({ ordenCompraId: parte.ordenCompraId, importe: parte.importe, valor, sinRecepcion: deLaOrden.nada });
		puntas.set(parte.facturaId, suyas);
	}
	return puntas;
}

/**
 * Bloquea una factura de proveedor.
 * @param transaccion La transacción.
 * @param id La factura.
 * @throws `404` si no existe.
 */
export async function bloquearFactura(transaccion: Transaccion, id: string): Promise<FacturaProveedor> {
	const [factura] = await transaccion
		.select()
		.from(facturasProveedor)
		.where(eq(facturasProveedor.id, id))
		.for("update");
	if (factura === undefined) throw noExiste();
	return factura;
}

/**
 * Bloquea la cuenta por pagar de una factura.
 * @param transaccion La transacción.
 * @param facturaId La factura.
 * @throws Error del programa si no tiene: nace con ella.
 */
export async function bloquearCuentaDeFactura(transaccion: Transaccion, facturaId: string): Promise<CuentaPorPagar> {
	const [cuenta] = await transaccion
		.select()
		.from(cuentasPorPagar)
		.where(eq(cuentasPorPagar.facturaProveedorId, facturaId))
		.for("update");
	if (cuenta === undefined) throw new Error(`la factura ${facturaId} no tiene cuenta por pagar`);
	return cuenta;
}

/**
 * Las órdenes de unas facturas.
 * @param transaccion La transacción.
 * @param facturaIds Las facturas.
 */
export async function ordenesDeFacturas(transaccion: Transaccion, facturaIds: readonly string[]): Promise<string[]> {
	if (facturaIds.length === 0) return [];
	const filas = await transaccion
		.selectDistinct({ ordenCompraId: facturaProveedorOrdenes.ordenCompraId })
		.from(facturaProveedorOrdenes)
		.where(inArray(facturaProveedorOrdenes.facturaProveedorId, [...facturaIds]));
	return filas.map((fila) => fila.ordenCompraId);
}

/**
 * Guarda las puntas de una factura: su valor recibido, su estado, su motivo y su responsable, y lo de cada orden.
 * @param transaccion La transacción.
 * @param factura La factura.
 * @param puntas Lo de cada orden.
 * @param resultado Sus tres puntas.
 */
export async function guardarPuntas(
	transaccion: Transaccion,
	factura: Pick<FacturaProveedor, "id">,
	puntas: readonly PuntaDeOrden[],
	resultado: TresPuntas,
): Promise<void> {
	await transaccion
		.update(facturasProveedor)
		.set({
			estado: resultado.estado,
			valorRecibidoCentavos: resultado.valorRecibido,
			motivoDetencion: resultado.motivo,
			responsableDetencion: resultado.responsable,
		})
		.where(eq(facturasProveedor.id, factura.id));
	for (const punta of puntas) {
		await transaccion
			.update(facturaProveedorOrdenes)
			.set({ valorRecibidoCentavos: punta.valor, sinRecepcion: punta.sinRecepcion })
			.where(
				and(
					eq(facturaProveedorOrdenes.facturaProveedorId, factura.id),
					eq(facturaProveedorOrdenes.ordenCompraId, punta.ordenCompraId),
				),
			);
	}
}

/**
 * Las órdenes ligadas a unas órdenes por sus facturas: ellas mismas y las demás órdenes de sus facturas no
 * canceladas. Son las que `revisarFacturas` compara juntas.
 * @param transaccion La transacción.
 * @param ordenIds Las órdenes.
 * Existe para que quien va a revisar las facturas bloquee todas esas órdenes de una vez, en orden de id, antes de
 * cualquier otra (decisiones 698 y 716): así no se cruza con un pago o una captura de las mismas órdenes.
 */
export async function ordenesLigadas(transaccion: Transaccion, ordenIds: readonly string[]): Promise<string[]> {
	if (ordenIds.length === 0) return [];
	const facturas = await transaccion
		.selectDistinct({ id: facturaProveedorOrdenes.facturaProveedorId })
		.from(facturaProveedorOrdenes)
		.innerJoin(facturasProveedor, eq(facturasProveedor.id, facturaProveedorOrdenes.facturaProveedorId))
		.where(
			and(inArray(facturaProveedorOrdenes.ordenCompraId, [...ordenIds]), ne(facturasProveedor.estado, "cancelada")),
		);
	const otras = await ordenesDeFacturas(
		transaccion,
		facturas.map((factura) => factura.id),
	);
	return [...new Set([...ordenIds, ...otras])];
}

/** Una factura que cambió al revisarla, para el mensaje y la bitácora de quien revisó. */
export interface FacturaRevisada {
	factura_proveedor_id: string;
	folio: string;
	estado: "conciliada" | "detenida";
	/** «{FP} quedó conciliada al recibir {OC}» o «{FP} quedó detenida: {motivo}». */
	descripcion: string;
}

/**
 * Vuelve a revisar las facturas no canceladas de unas órdenes (regla 6): las detenidas y conciliadas sin pagos
 * cambian con lo recibido de hoy, y su cuenta las sigue; las que tienen pagos o esperan o tienen la autorización de
 * Dirección no cambian, y si lo recibido bajó y ya no cuadran, avisan a Contaduría.
 * @param contexto El contexto de la acción.
 * @param ordenIds Las órdenes cuyo recibido cambió (o cuyas facturas hay que revisar).
 * @param porQue Lo que dice la bitácora de una factura que queda conciliada: «al recibir OC-0222».
 * @returns Las facturas que cambiaron de estado.
 */
export async function revisarFacturas(
	contexto: ContextoDeAccion,
	ordenIds: readonly string[],
	porQue: string,
): Promise<FacturaRevisada[]> {
	const { transaccion } = contexto;
	const facturasDe = () =>
		transaccion
			.selectDistinct({ id: facturasProveedor.id })
			.from(facturasProveedor)
			.innerJoin(facturaProveedorOrdenes, eq(facturaProveedorOrdenes.facturaProveedorId, facturasProveedor.id))
			.where(
				and(inArray(facturaProveedorOrdenes.ordenCompraId, [...ordenIds]), ne(facturasProveedor.estado, "cancelada")),
			)
			.orderBy(asc(facturasProveedor.id));
	// Primero todas las órdenes de esas facturas (una factura de varias órdenes se compara completa), luego las
	// facturas: el orden de los candados.
	const primeras = await facturasDe();
	if (primeras.length === 0) return [];
	const ordenes = await bloquearOrdenes(
		contexto,
		await ordenesDeFacturas(
			transaccion,
			primeras.map((factura) => factura.id),
		),
	);
	const facturas: FacturaProveedor[] = [];
	for (const { id } of await facturasDe()) facturas.push(await bloquearFactura(transaccion, id));
	const puntas = await puntasDeOrdenes(contexto, ordenes);
	const revisadas: FacturaRevisada[] = [];
	for (const factura of facturas) {
		const suyas = puntas.get(factura.id) ?? [];
		const resultado = tresPuntas(factura.subtotalCentavos, suyas);
		const cuenta = await bloquearCuentaDeFactura(transaccion, factura.id);
		const sinPagos =
			cuenta.saldoCentavos === cuenta.importeCentavos && ["detenida", "por_pagar"].includes(cuenta.estado);
		if ((factura.estado === "detenida" || factura.estado === "conciliada") && sinPagos) {
			await guardarPuntas(transaccion, factura, suyas, resultado);
			const estadoCuenta = resultado.estado === "detenida" ? "detenida" : "por_pagar";
			if (estadoCuenta !== cuenta.estado) {
				await transaccion
					.update(cuentasPorPagar)
					.set({ estado: estadoCuenta })
					.where(eq(cuentasPorPagar.id, cuenta.id));
			}
			// Sin cambio de estado, de quién la tiene ni de motivo, no hay nada que avisar (decisión 716).
			if (
				resultado.estado === factura.estado &&
				resultado.responsable === factura.responsableDetencion &&
				resultado.motivo === factura.motivoDetencion
			)
				continue;
			contexto.guardarEvento({
				tipo: resultado.estado === "conciliada" ? "factura_proveedor.liberada" : "factura_proveedor.detenida",
				datos: { factura_proveedor_id: factura.id },
				tablas: ["facturas_proveedor", "factura_proveedor_ordenes", "cuentas_por_pagar"],
				entidad: "facturas_proveedor",
				entidadId: factura.id,
				entidadFolio: factura.folio,
			});
			revisadas.push({
				factura_proveedor_id: factura.id,
				folio: factura.folio,
				estado: resultado.estado,
				descripcion:
					resultado.estado === "conciliada"
						? `${factura.folio} quedó conciliada ${porQue}`
						: `${factura.folio} quedó detenida: ${resultado.motivo ?? ""}`,
			});
			continue;
		}
		// Con pagos o con su autorización no cambia: si lo recibido bajó y ya no cuadra, Contaduría se entera.
		if (resultado.estado === "detenida" && resultado.valorRecibido < factura.valorRecibidoCentavos) {
			contexto.guardarEvento({
				tipo: "factura_proveedor.dejo_de_cuadrar",
				datos: { factura_proveedor_id: factura.id },
				tablas: ["facturas_proveedor"],
				entidad: "facturas_proveedor",
				entidadId: factura.id,
				entidadFolio: factura.folio,
			});
		}
	}
	return revisadas;
}

/**
 * El nombre de un tercero: el proveedor o el acreedor de una cuenta.
 * @param transaccion La transacción.
 * @param terceroId El tercero.
 */
export async function nombreDelTercero(transaccion: Transaccion, terceroId: string): Promise<string> {
	const [tercero] = await transaccion
		.select({ nombre: terceros.nombre })
		.from(terceros)
		.where(eq(terceros.id, terceroId));
	if (tercero === undefined) throw new Error(`el tercero ${terceroId} no existe`);
	return tercero.nombre;
}

/**
 * Lo que se pagaría de una factura que cobra de más (regla 6 de las cuentas por pagar): lo recibido más su IVA
 * proporcional, redondeado al centavo (medio sube).
 * @param factura Su subtotal, su IVA y su valor recibido.
 */
export function montoLoRecibido(
	factura: Pick<FacturaProveedor, "subtotalCentavos" | "ivaCentavos" | "valorRecibidoCentavos">,
): number {
	const recibido = BigInt(factura.valorRecibidoCentavos);
	const iva =
		(BigInt(factura.ivaCentavos) * recibido * 2n + BigInt(factura.subtotalCentavos)) /
		(BigInt(factura.subtotalCentavos) * 2n);
	return Number(recibido + iva);
}

/**
 * Las órdenes de una factura que ya quedaron pagadas: las cuentas de todas sus facturas no canceladas están pagadas.
 * Quien pregunta ya tiene las órdenes bloqueadas, así que dos pagos a facturas de la misma orden se ponen en fila y el
 * segundo ve el primero.
 * @param transaccion La transacción.
 * @param ordenIds Las órdenes.
 */
export async function ordenesPagadas(transaccion: Transaccion, ordenIds: readonly string[]): Promise<string[]> {
	if (ordenIds.length === 0) return [];
	const filas = await transaccion
		.select({ ordenCompraId: facturaProveedorOrdenes.ordenCompraId, estado: cuentasPorPagar.estado })
		.from(facturaProveedorOrdenes)
		.innerJoin(facturasProveedor, eq(facturasProveedor.id, facturaProveedorOrdenes.facturaProveedorId))
		.innerJoin(cuentasPorPagar, eq(cuentasPorPagar.facturaProveedorId, facturasProveedor.id))
		.where(
			and(inArray(facturaProveedorOrdenes.ordenCompraId, [...ordenIds]), ne(facturasProveedor.estado, "cancelada")),
		);
	return ordenIds.filter((ordenId) => {
		const suyas = filas.filter((fila) => fila.ordenCompraId === ordenId);
		return suyas.length > 0 && suyas.every((fila) => fila.estado === "pagada");
	});
}
