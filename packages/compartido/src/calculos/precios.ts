/**
 * Las cuentas de los precios de venta que se ven mientras se escribe y la API repite al guardar: el precio
 * sugerido a un cliente externo, el cambio en bloque y los avisos de la ficha.
 * Fase 8 · docs/modulos/catalogo/precios.md («El precio sugerido…», «`catalogo.cambiar_precios_en_bloque`», «Los
 * avisos de la ficha»)
 *
 * Puro: los topes y el redondeo llegan como parámetros ya leídos. Todo en centavos enteros.
 */

import { type Centavos, centavos } from "../tipos/base.ts";
import { aPesoEntero, aplicarPorcentaje, centavosATexto, descontarPorcentajeAPesoEntero } from "./dinero.ts";

/** Lo que dice un cambio en bloque. */
export interface CambioEnBloque {
	direccion: "subir" | "bajar";
	modo: "por_ciento" | "pesos";
	/** De 1 a 999: por ciento o pesos. */
	cantidad: number;
	redondear: boolean;
}

/**
 * El precio que deja un cambio en bloque: el de antes más o menos la cantidad (por ciento o pesos); con
 * `redondear`, al múltiplo más cercano de `redondeo` (la mitad, hacia arriba); siempre a peso entero.
 * @param antes El precio de antes, en centavos.
 * @param cambio La dirección, el modo, la cantidad y si redondea.
 * @param redondeo `catalogo.bloque_redondeo_centavos`: el múltiplo, en centavos. Si no es de pesos enteros, se toma
 * el múltiplo de peso que le sigue ($2.50 redondea a $3), para que el precio siempre sea de pesos enteros.
 * @returns El precio nuevo. Puede salir del rango: eso lo revisa quien lo aplica, sin recortarlo.
 */
export function precioDelCambioEnBloque(antes: Centavos, cambio: CambioEnBloque, redondeo: number): number {
	const signo = cambio.direccion === "subir" ? 1 : -1;
	const diferencia =
		cambio.modo === "pesos" ? cambio.cantidad * 100 : Number(aplicarPorcentaje(antes, cambio.cantidad));
	const exacto = antes + signo * diferencia;
	if (!cambio.redondear) return aPesoEntero(centavos(exacto));
	const multiplo = Math.max(100, Math.ceil(redondeo / 100) * 100);
	return Math.floor((exacto + multiplo / 2) / multiplo) * multiplo;
}

/**
 * Revisa los topes de un cambio en bloque.
 * @param cambio El cambio.
 * @param topes `catalogo.bloque_tope_pct` y `catalogo.bloque_tope_centavos`.
 * @returns El código del tope que pasa, o `undefined` si está dentro.
 */
export function topeDelCambioEnBloque(
	cambio: CambioEnBloque,
	topes: { porCiento: number; centavos: number },
): "tope_por_ciento" | "tope_pesos" | undefined {
	if (cambio.modo === "por_ciento" && cambio.cantidad > topes.porCiento) return "tope_por_ciento";
	if (cambio.modo === "pesos" && cambio.cantidad * 100 > topes.centavos) return "tope_pesos";
	return undefined;
}

/**
 * El cambio de un precio en por ciento, como lo dice la bitácora: «+10%» o «−5%», al entero más cercano.
 * @param antes El precio de antes.
 * @param despues El precio nuevo.
 */
export function cambioEnPorCiento(antes: number, despues: number): string {
	const porCiento = Math.round(((despues - antes) / antes) * 100);
	return `${porCiento >= 0 ? "+" : "−"}${Math.abs(porCiento)}%`;
}

/** Un precio de la ficha que cambia. */
export interface PrecioQueCambia {
	/** El nombre de la lista. */
	lista: string;
	antes: number | null;
	despues: number | null;
}

/** El precio de una talla en Mayoreo y en Mostrador, después de los cambios. */
export interface MayoreoYMostrador {
	mayoreo: number | null;
	mostrador: number | null;
}

/**
 * Los avisos que no bloquean de la ficha: Mayoreo arriba de Mostrador en una talla, y un precio que cambia más
 * de `catalogo.aviso_cambio_precio_pct`.
 * @param cambios Los precios que cambian.
 * @param porTalla Por talla, Mayoreo y Mostrador después de los cambios.
 * @param avisoPorCiento `catalogo.aviso_cambio_precio_pct`.
 * @returns Los avisos, sin repetir.
 */
export function avisosDeLaFicha(
	cambios: readonly PrecioQueCambia[],
	porTalla: readonly MayoreoYMostrador[],
	avisoPorCiento: number,
): string[] {
	const texto = (monto: number) => centavosATexto(centavos(monto));
	const avisos = new Set<string>();
	for (const { mayoreo, mostrador } of porTalla) {
		if (mayoreo !== null && mostrador !== null && mayoreo > mostrador) {
			avisos.add(`Ojo: Mayoreo (${texto(mayoreo)}) quedó arriba de mostrador (${texto(mostrador)}).`);
		}
	}
	for (const { lista, antes, despues } of cambios) {
		if (antes === null || despues === null || antes === 0) continue;
		if ((Math.abs(despues - antes) / antes) * 100 > avisoPorCiento) {
			avisos.add(
				`Ojo: El precio de ${lista} cambia más de ${avisoPorCiento}% (${texto(antes)} a ${texto(despues)}). ¿Es correcto?`,
			);
		}
	}
	return [...avisos];
}

/** Lo que necesita el precio sugerido de una talla para un cliente externo. */
export interface DatosDelSugerido {
	/** El precio de la talla en la lista del cliente (el suyo o el base; en pedido especial, el base). */
	listaCliente: number | null;
	/** Los porcentajes del cliente, como los guarda su lista; vacío si no tiene. */
	pctBasicos: string | number | null;
	pctEspeciales: string | number | null;
	/** Qué porcentaje le toca por la categoría de mayoreo del producto. */
	aplica: "basicos" | "especiales" | "ninguno";
	/** El precio de la talla en Mostrador y en Mayoreo (el suyo o el base; en pedido especial, el base). */
	mostrador: number | null;
	mayoreo: number | null;
	esPedidoEspecial: boolean;
}

/** El precio sugerido y de dónde salió. */
export interface PrecioSugerido {
	precio: number;
	origen: "lista_cliente" | "porcentaje_cliente" | "mayoreo" | "mostrador";
	/** El porcentaje que se descontó, en el paso 2. */
	porcentaje: number | null;
}

/**
 * El precio sugerido a un cliente externo, en cinco pasos: su lista; su porcentaje sobre Mostrador (redondeado a
 * peso entero); Mayoreo (nunca en pedido especial); Mostrador; y si no hay ninguno, nada. El recargo de pedido
 * especial va aparte: el porcentaje nunca lo toca.
 * @param datos Los precios de la talla en cada lista, los porcentajes del cliente y su categoría.
 * @returns El sugerido, o `undefined` en el paso 5 («Sin precio para este cliente en Catálogo»).
 */
export function precioSugerido(datos: DatosDelSugerido): PrecioSugerido | undefined {
	if (datos.listaCliente !== null) return { precio: datos.listaCliente, origen: "lista_cliente", porcentaje: null };
	const tienePorcentaje = datos.pctBasicos !== null || datos.pctEspeciales !== null;
	const queLeToca =
		datos.aplica === "ninguno" ? 0 : datos.aplica === "basicos" ? datos.pctBasicos : datos.pctEspeciales;
	if (tienePorcentaje && queLeToca !== null && datos.mostrador !== null) {
		return {
			precio: descontarPorcentajeAPesoEntero(centavos(datos.mostrador), queLeToca),
			origen: "porcentaje_cliente",
			porcentaje: Number(queLeToca),
		};
	}
	if (!datos.esPedidoEspecial && datos.mayoreo !== null)
		return { precio: datos.mayoreo, origen: "mayoreo", porcentaje: null };
	if (datos.mostrador !== null) return { precio: datos.mostrador, origen: "mostrador", porcentaje: null };
	return undefined;
}
