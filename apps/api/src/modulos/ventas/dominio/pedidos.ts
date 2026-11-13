/**
 * Lo que comparten las acciones de los pedidos: leer un pedido con su cliente, sus renglones vigentes, revisar al
 * cliente y los renglones, y poner el precio de cada talla.
 * Fase 16 · docs/modulos/ventas/pedidos.md (reglas 1 a 5)
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import { precioUnitario } from "@uniformame/compartido/calculos/ventas";
import { centavos } from "@uniformame/compartido/tipos/base";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { productos, tallas, variantes } from "../../catalogo/tablas.ts";
import { terceros } from "../../contaduria/tablas.ts";
import { clientes, pedidoRenglones, pedidos } from "../tablas.ts";

/** Un pedido con el nombre de su cliente. */
export type PedidoConCliente = typeof pedidos.$inferSelect & { cliente: string };

/** Un renglón vigente de un pedido. */
export type Renglon = typeof pedidoRenglones.$inferSelect;

/** Un renglón como lo trae la acción. */
export interface RenglonPedido {
	variante_id: string;
	cantidad: number;
	precio_dado_centavos?: number | undefined;
}

/** Un monto como se lee: «$185». */
export const enPesos = (monto: number) => centavosATexto(centavos(monto));

/**
 * Un pedido con el nombre de su cliente.
 * @param transaccion La transacción.
 * @param pedidoId El pedido.
 * @param bloquear Si lo bloquea hasta el final de la acción.
 * @throws `404` si no existe.
 */
export async function leerPedido(
	transaccion: Transaccion,
	pedidoId: string,
	bloquear = false,
): Promise<PedidoConCliente> {
	const consulta = transaccion
		.select({ fila: pedidos, cliente: terceros.nombre })
		.from(pedidos)
		.innerJoin(clientes, eq(clientes.id, pedidos.clienteId))
		.innerJoin(terceros, eq(terceros.id, clientes.terceroId))
		.where(eq(pedidos.id, pedidoId));
	const [leido] = bloquear ? await consulta.for("update", { of: pedidos }) : await consulta;
	if (leido === undefined) throw noExiste();
	return { ...leido.fila, cliente: leido.cliente };
}

/**
 * Los renglones vigentes de un pedido, en orden de variante.
 * @param transaccion La transacción.
 * @param pedidoId El pedido.
 */
export async function renglonesVigentes(transaccion: Transaccion, pedidoId: string): Promise<Renglon[]> {
	return transaccion
		.select()
		.from(pedidoRenglones)
		.where(and(eq(pedidoRenglones.pedidoId, pedidoId), isNull(pedidoRenglones.hastaVersion)))
		.orderBy(pedidoRenglones.varianteId);
}

/** Cuándo se revisa al cliente: lo que impide su semáforo depende de lo que se hace. */
export type MomentoDelPedido = "nuevo" | "borrador" | "confirmar" | "version";

/** Lo que regresa `contaduria.credito_de_cliente`. */
const creditoDeCliente = z.object({
	semaforo: z.string(),
	tiene_credito: z.boolean(),
	dias_credito: z.number().int(),
	cerca_del_limite: z.boolean(),
});

/**
 * Revisa al cliente de un pedido (regla 4): de baja no, detenido según el momento, y «Crédito» solo con límite.
 * @param contexto El contexto de la acción.
 * @param clienteId El cliente.
 * @param formaPago La forma de pago del pedido.
 * @param momento Qué se hace: con un borrador que ya existía, el semáforo no detiene.
 * @param sumaPiezas En una versión, si sube el total de piezas.
 * @returns Los días de crédito que congela el pedido (0 fuera de crédito) y sus avisos.
 */
export async function revisarCliente(
	contexto: ContextoDeAccion,
	clienteId: string,
	formaPago: string,
	momento: MomentoDelPedido,
	sumaPiezas = false,
): Promise<{ diasCredito: number; avisos: string[] }> {
	const [cliente] = await contexto.transaccion
		.select({ nombre: terceros.nombre, bajaEn: clientes.bajaEn })
		.from(clientes)
		.innerJoin(terceros, eq(terceros.id, clientes.terceroId))
		.where(eq(clientes.id, clienteId))
		// Compartido hasta el final: una baja del mismo cliente a la vez espera, y luego ve el pedido abierto.
		.for("share", { of: clientes });
	if (cliente === undefined) throw errorDeCampo("cliente_id", "Escoge el cliente.");
	if (cliente.bajaEn !== null) throw errorDeRegla("cliente_dado_de_baja", `${cliente.nombre} está dado de baja.`);
	const credito = creditoDeCliente.parse(
		await contexto.lectura("contaduria.credito_de_cliente", { cliente_id: clienteId }),
	);
	if (credito.semaforo === "detenido") {
		const detenido = {
			nuevo: "no se le pueden levantar pedidos nuevos.",
			borrador: "",
			confirmar: "el pedido no se confirma hasta que Contaduría lo libere.",
			version: sumaPiezas ? "la versión no puede sumar piezas." : "",
		}[momento];
		if (detenido !== "") {
			throw errorDeRegla("cliente_detenido", `${cliente.nombre} está detenido por crédito: ${detenido}`);
		}
	}
	if (formaPago === "credito" && !credito.tiene_credito) {
		throw errorDeRegla("sin_credito", "Sin crédito: de contado o con anticipo hasta que Contaduría le ponga límite.");
	}
	return {
		diasCredito: formaPago === "credito" ? credito.dias_credito : 0,
		avisos: credito.cerca_del_limite ? ["Cerca de su límite de crédito"] : [],
	};
}

/** Una variante con lo que se revisa de ella para venderla. */
interface VarianteParaVender {
	id: string;
	prenda: string;
	talla: string;
	canalExternos: boolean;
	productoDeBaja: boolean;
	tallaDeBaja: boolean;
	descontinuada: boolean;
}

/**
 * Las variantes de unos renglones, con su prenda, su talla y lo que se revisa para venderlas.
 * @param transaccion La transacción.
 * @param ids Las variantes.
 */
export async function variantesParaVender(
	transaccion: Transaccion,
	ids: readonly string[],
): Promise<Map<string, VarianteParaVender>> {
	if (ids.length === 0) return new Map();
	const filas = await transaccion
		.select({
			id: variantes.id,
			prenda: productos.nombre,
			talla: tallas.nombre,
			canalExternos: productos.canalExternos,
			productoBajaEn: productos.bajaEn,
			tallaBajaEn: variantes.bajaEn,
			descontinuadaEn: variantes.descontinuadaEn,
		})
		.from(variantes)
		.innerJoin(productos, eq(productos.id, variantes.productoId))
		.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
		.where(inArray(variantes.id, [...ids]));
	return new Map(
		filas.map((fila) => [
			fila.id,
			{
				id: fila.id,
				prenda: fila.prenda,
				talla: fila.talla,
				canalExternos: fila.canalExternos,
				productoDeBaja: fila.productoBajaEn !== null,
				tallaDeBaja: fila.tallaBajaEn !== null,
				descontinuada: fila.descontinuadaEn !== null,
			},
		]),
	);
}

/**
 * Revisa los renglones de un pedido (regla 4): una talla una vez, de 0 a `ventas.piezas_max_talla`, alguna con piezas;
 * la prenda se vende a externos y no está descontinuada; la talla no está de baja. Una talla descontinuada avisa.
 * @param contexto El contexto de la acción.
 * @param renglones Los renglones que llegaron.
 * @returns Las variantes revisadas y los avisos.
 */
export async function revisarRenglones(
	contexto: ContextoDeAccion,
	renglones: readonly RenglonPedido[],
): Promise<{ variantes: Map<string, VarianteParaVender>; avisos: string[] }> {
	const ids = renglones.map((renglon) => renglon.variante_id);
	if (new Set(ids).size !== ids.length) throw errorDeCampo("renglones", "Pon las piezas por talla");
	const maximo = z
		.number()
		.int()
		.parse(await contexto.lectura("admin.parametro", { clave: "ventas.piezas_max_talla" }));
	if (renglones.some((renglon) => renglon.cantidad > maximo))
		throw errorDeCampo("renglones", "Pon las piezas por talla");
	if (renglones.every((renglon) => renglon.cantidad === 0)) {
		throw errorDeCampo("renglones", "Agrega al menos una prenda con piezas.");
	}
	const leidas = await variantesParaVender(contexto.transaccion, ids);
	const avisos: string[] = [];
	for (const id of ids) {
		const variante = leidas.get(id);
		if (variante === undefined) throw errorDeCampo("renglones", "Pon las piezas por talla");
		if (!variante.canalExternos) {
			throw errorDeRegla(
				"no_se_vende_a_externos",
				`${variante.prenda} no se vende a clientes externos. Catálogo lo prende en su ficha.`,
			);
		}
		if (variante.productoDeBaja) {
			throw errorDeRegla(
				"producto_descontinuado",
				`${variante.prenda} está descontinuado: Catálogo lo puede reactivar.`,
			);
		}
		if (variante.tallaDeBaja) {
			throw errorDeRegla("talla_dada_de_baja", `${variante.prenda} talla ${variante.talla} está dada de baja.`);
		}
		if (variante.descontinuada) {
			avisos.push(
				`${variante.prenda} talla ${variante.talla} está descontinuada: ya no se fabrica; solo sale lo que hay en bodega.`,
			);
		}
	}
	return { variantes: leidas, avisos };
}

/** El precio de un renglón: el sugerido con su origen, el dado, el recargo y el unitario. */
export interface PrecioDeRenglon {
	precioSugeridoCentavos: number | null;
	origenSugerido: string | null;
	porcentajeAplicado: string | null;
	precioDadoCentavos: number | null;
	recargoEspecialCentavos: number;
	precioUnitarioCentavos: number;
}

/** Lo que regresa `catalogo.precio_sugerido`. */
const sugerido = z.object({
	precio_sugerido_centavos: z.number().int().nullable(),
	origen_sugerido: z.string().nullable(),
	porcentaje_aplicado: z.union([z.string(), z.number()]).nullable(),
	recargo_especial_centavos: z.number().int(),
});

/**
 * El precio de hoy de una talla para un cliente (regla 3): el dado, o el sugerido de Catálogo, más el recargo de una
 * talla especial.
 * @param contexto El contexto de la acción.
 * @param clienteId El cliente.
 * @param variante La variante, con su prenda para el mensaje.
 * @param dado El precio que dio Ventas, si lo dio.
 * @throws `422 sin_precio` sin precio dado ni sugerido.
 */
export async function precioDeHoy(
	contexto: ContextoDeAccion,
	clienteId: string,
	variante: { id: string; prenda: string },
	dado: number | undefined,
): Promise<PrecioDeRenglon> {
	const deCatalogo = sugerido.parse(
		await contexto.lectura("catalogo.precio_sugerido", { cliente_id: clienteId, variante_id: variante.id }),
	);
	const base = dado ?? deCatalogo.precio_sugerido_centavos;
	if (base === null) throw errorDeRegla("sin_precio", `${variante.prenda}: sin precio para este cliente en Catálogo.`);
	return {
		precioSugeridoCentavos: deCatalogo.precio_sugerido_centavos,
		origenSugerido: deCatalogo.origen_sugerido,
		porcentajeAplicado: deCatalogo.porcentaje_aplicado === null ? null : String(deCatalogo.porcentaje_aplicado),
		precioDadoCentavos: dado ?? null,
		recargoEspecialCentavos: deCatalogo.recargo_especial_centavos,
		precioUnitarioCentavos: precioUnitario(base, deCatalogo.recargo_especial_centavos),
	};
}

/**
 * Guarda el evento de un pedido.
 * @param contexto El contexto de la acción.
 * @param tipo El tipo del evento.
 * @param pedido El pedido, con su folio.
 */
export function eventoDePedido(
	contexto: ContextoDeAccion,
	tipo: "pedido.guardado" | "pedido.confirmado" | "pedido.version_guardada" | "pedido.cancelado" | "pedido.entregado",
	pedido: { id: string; folio: string },
): void {
	contexto.guardarEvento({
		tipo,
		datos: { pedido_id: pedido.id },
		tablas: ["pedidos", "pedido_renglones"],
		entidad: "pedidos",
		entidadId: pedido.id,
		entidadFolio: pedido.folio,
	});
}
