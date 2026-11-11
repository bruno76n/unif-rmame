/**
 * `catalogo.precio_talla` y `catalogo.precio_sugerido`: el precio de una talla en una lista, y el sugerido a un
 * cliente externo.
 * Fase 8 · docs/modulos/catalogo/precios.md (regla 2, «El precio sugerido a un cliente externo», «Lecturas»)
 *
 * Las usan Catálogo, Ventas, Tienda en línea y las etiquetas. Los cinco pasos del sugerido son una función del
 * paquete compartido (`precioSugerido`).
 */

import { precioSugerido as calcularSugerido } from "@uniformame/compartido/calculos/precios";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { precioSinRecargo } from "../dominio/precios.ts";
import { categoriasMayoreo, listasPrecios, precios, productos, variantes } from "../tablas.ts";

/**
 * La variante con su producto: si es de pedido especial, su recargo y lo que aplica su categoría de mayoreo.
 * @throws `404` si no existe.
 */
async function varianteConProducto(transaccion: Transaccion, varianteId: string) {
	const [leida] = await transaccion
		.select({
			id: variantes.id,
			productoId: variantes.productoId,
			esPedidoEspecial: variantes.esPedidoEspecial,
			recargo: productos.recargoPedidoEspecialCentavos,
			aplica: categoriasMayoreo.porcentajeQueAplica,
		})
		.from(variantes)
		.innerJoin(productos, eq(productos.id, variantes.productoId))
		.innerJoin(categoriasMayoreo, eq(categoriasMayoreo.id, productos.categoriaMayoreoId))
		.where(eq(variantes.id, varianteId));
	if (leida === undefined) throw noExiste();
	return leida;
}

/** Los precios vigentes de un producto en unas listas, por lista. */
async function vigentesPorLista(transaccion: Transaccion, productoId: string, listaIds: readonly string[]) {
	const vigentes =
		listaIds.length === 0
			? []
			: await transaccion
					.select({ listaId: precios.listaId, varianteId: precios.varianteId, precioCentavos: precios.precioCentavos })
					.from(precios)
					.where(
						and(
							eq(precios.productoId, productoId),
							inArray(precios.listaId, [...listaIds]),
							isNull(precios.vigenteHasta),
						),
					);
	return (listaId: string | undefined) => vigentes.filter((precio) => precio.listaId === listaId);
}

/** Lo que recibe `catalogo.precio_talla`. */
const paraPrecioTalla = z.object({ lista_id: z.uuid(), variante_id: z.uuid() });

/**
 * `catalogo.precio_talla`: el precio vigente de una talla en una lista: el suyo o el base; en pedido especial,
 * el base más el recargo, y vacío en En línea y en Mayoreo.
 * @returns `precio_centavos`, o `null` («Sin precio»).
 */
export async function precioTalla(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = paraPrecioTalla.parse(datos);
	const { transaccion } = contexto;
	const variante = await varianteConProducto(transaccion, pedido.variante_id);
	const [lista] = await transaccion
		.select({ tipo: listasPrecios.tipo })
		.from(listasPrecios)
		.where(eq(listasPrecios.id, pedido.lista_id));
	if (lista === undefined) throw noExiste();
	if (variante.esPedidoEspecial && (lista.tipo === "en_linea" || lista.tipo === "mayoreo"))
		return { precio_centavos: null };
	const deLaLista = (await vigentesPorLista(transaccion, variante.productoId, [pedido.lista_id]))(pedido.lista_id);
	const precio = precioSinRecargo(deLaLista, variante);
	return { precio_centavos: precio === null ? null : precio + (variante.esPedidoEspecial ? variante.recargo : 0) };
}

/** Lo que recibe `catalogo.precio_sugerido`. */
const paraSugerido = z.object({ cliente_id: z.uuid(), variante_id: z.uuid() });

/**
 * `catalogo.precio_sugerido`: el precio que Ventas ve sugerido para una talla y un cliente.
 * @returns El precio, su origen, el porcentaje que se aplicó y el recargo de pedido especial aparte; el precio y
 * el origen vacíos en el paso 5.
 */
export async function precioSugerido(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = paraSugerido.parse(datos);
	const { transaccion } = contexto;
	const variante = await varianteConProducto(transaccion, pedido.variante_id);
	const listas = await transaccion
		.select({
			id: listasPrecios.id,
			tipo: listasPrecios.tipo,
			clienteId: listasPrecios.clienteId,
			pctBasicos: listasPrecios.pctBasicos,
			pctEspeciales: listasPrecios.pctEspeciales,
		})
		.from(listasPrecios)
		.where(isNull(listasPrecios.bajaEn));
	const delCliente = listas.find((lista) => lista.clienteId === pedido.cliente_id);
	const deTipo = (tipo: string) => listas.find((lista) => lista.tipo === tipo)?.id;
	const ids = [delCliente?.id, deTipo("mostrador"), deTipo("mayoreo")].flatMap((id) => (id === undefined ? [] : [id]));
	const deLaLista = await vigentesPorLista(transaccion, variante.productoId, ids);
	const enLaLista = (listaId: string | undefined) =>
		listaId === undefined ? null : precioSinRecargo(deLaLista(listaId), variante);
	const sugerido = calcularSugerido({
		listaCliente: enLaLista(delCliente?.id),
		pctBasicos: delCliente?.pctBasicos ?? null,
		pctEspeciales: delCliente?.pctEspeciales ?? null,
		aplica: z.enum(["basicos", "especiales", "ninguno"]).parse(variante.aplica),
		mostrador: enLaLista(deTipo("mostrador")),
		mayoreo: enLaLista(deTipo("mayoreo")),
		esPedidoEspecial: variante.esPedidoEspecial,
	});
	return {
		precio_sugerido_centavos: sugerido?.precio ?? null,
		origen_sugerido: sugerido?.origen ?? null,
		porcentaje_aplicado: sugerido?.porcentaje ?? null,
		recargo_especial_centavos: variante.esPedidoEspecial ? variante.recargo : 0,
	};
}
