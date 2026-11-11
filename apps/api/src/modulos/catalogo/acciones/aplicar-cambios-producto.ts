/**
 * `catalogo.aplicar_cambios_producto`: Catálogo aplica juntos los cambios de la ficha de un producto.
 * Fase 8 · docs/modulos/catalogo/productos.md (reglas 3, 4, 8 y 9, «`catalogo.aplicar_cambios_producto`») y
 * precios.md (reglas 2 a 4 y 8, «Los avisos de la ficha»)
 *
 * Canales, categoría, recargo, tipo de prenda y precios van en una sola transacción, con la versión de la ficha.
 * Cada precio que cambia cierra el vigente y crea otro con origen `ficha`. Deja un renglón de bitácora por
 * cambio. Con `catalogo.etiqueta_lleva_precio`, las tallas impresas cuyo precio de Mostrador cambió quedan por
 * reimprimir. Pausar las publicaciones al apagar la tienda en línea llega con uniformame.mx (fase 18).
 */

import { avisosDeLaFicha, cambioEnPorCiento } from "@uniformame/compartido/calculos/precios";
import { aplicarCambiosProducto } from "@uniformame/compartido/contratos/catalogo/precios";
import { eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion, type RenglonDeBitacora } from "../../../nucleo/modulos.ts";
import {
	cambiarPrecio,
	eventoDePrecio,
	marcarPorReimprimir,
	mostradorPorTalla,
	type PrecioVigente,
	precioSinRecargo,
	preciosVigentes,
} from "../dominio/precios.ts";
import {
	eventoDeProducto,
	leerProducto,
	type Producto,
	revisarCanalEnLinea,
	revisarPrecioMaximo,
	revisarQueEstaActivo,
	textoDePrecio,
	tomarVersionDelProducto,
} from "../dominio/productos.ts";
import { categoriasMayoreo, listasPrecios, productos, secciones, tallas, tiposPrenda, variantes } from "../tablas.ts";

/** Lo que recibe. */
type Cambios = z.infer<typeof aplicarCambiosProducto.entrada>;

/** Una lista de precios, como la usa esta acción. */
type Lista = { id: string; tipo: string; nombre: string; bajaEn: string | null };

/** Cómo se nombra cada canal en la bitácora. */
const nombreDelCanal = { mostrador: "en mostrador", en_linea: "en línea", externos: "a externos" } as const;

/** Por tipo de lista, el canal en que aplica. */
const canalDeLaLista: Readonly<Record<string, keyof typeof nombreDelCanal>> = {
	mostrador: "mostrador",
	mayoreo: "mostrador",
	en_linea: "en_linea",
	cliente: "externos",
};

/** A dónde llega un cambio, para el mensaje. */
const destinoDeLaLista: Readonly<Record<string, string>> = {
	mostrador: "las tiendas",
	mayoreo: "las tiendas",
	en_linea: "la tienda en línea",
	cliente: "ventas a externos",
};

/**
 * Los canales del producto con los que cambian.
 * @throws `422 sin_canal`, `en_linea_solo_sin_escuela` o `servicio_en_linea`.
 */
function canalesNuevos(producto: Producto, cambios: Cambios) {
	const canales = {
		mostrador: cambios.canales?.mostrador ?? producto.canalMostrador,
		en_linea: cambios.canales?.en_linea ?? producto.canalEnLinea,
		externos: cambios.canales?.externos ?? producto.canalExternos,
	};
	if (!canales.mostrador && !canales.en_linea && !canales.externos) {
		throw errorDeRegla("sin_canal", "Marca al menos un lugar donde se vende, o descontinúa el producto.");
	}
	if (canales.en_linea !== producto.canalEnLinea) revisarCanalEnLinea(producto, canales.en_linea);
	return canales;
}

/**
 * Revisa los precios que cambian: su lista aplica, su talla es del producto y no es de pedido especial, y no
 * pasan del tope.
 * @throws `400`; `422 lista_no_aplica` o `precio_talla_especial`.
 */
async function revisarPrecios(
	contexto: ContextoDeAccion,
	producto: Producto,
	cambios: Cambios,
	listas: ReadonlyMap<string, Lista>,
	canales: Readonly<Record<keyof typeof nombreDelCanal, boolean>>,
	suyas: ReadonlyMap<string, { esPedidoEspecial: boolean; talla: string }>,
): Promise<void> {
	for (const precio of cambios.precios ?? []) {
		const lista = listas.get(precio.lista_id);
		if (lista === undefined || lista.bajaEn !== null)
			throw errorDeCampo("precios", "Escoge una lista de precios activa.");
		const canal = canalDeLaLista[lista.tipo];
		if (canal !== undefined && !canales[canal] && precio.precio_centavos !== null) {
			throw errorDeRegla(
				"lista_no_aplica",
				`${lista.nombre} no aplica a ${producto.nombre}: no se vende en ese canal.`,
			);
		}
		if (precio.variante_id !== null) {
			const variante = suyas.get(precio.variante_id);
			if (variante === undefined) throw errorDeCampo("precios", "Escoge una talla del producto.");
			if (variante.esPedidoEspecial) {
				throw errorDeRegla(
					"precio_talla_especial",
					`La talla ${variante.talla} es de pedido especial: cobra el precio base más ${textoDePrecio(producto.recargoPedidoEspecialCentavos)}.`,
				);
			}
		}
		if (precio.precio_centavos !== null) {
			await revisarPrecioMaximo(
				contexto,
				"precios",
				precio.precio_centavos,
				(tope) => `El precio de ${lista.nombre} va de $1 a ${tope}.`,
			);
		}
	}
}

/**
 * Revisa que después de los cambios estén los precios obligatorios: el de Mostrador si se vende en mostrador,
 * el de En línea si se vende en línea, y el base de una lista de cliente que ya lo tenía.
 * @throws `422 falta_precio`.
 */
function revisarObligatorios(
	listas: ReadonlyMap<string, Lista>,
	canales: Readonly<Record<keyof typeof nombreDelCanal, boolean>>,
	antes: readonly PrecioVigente[],
	baseDespues: (listaId: string) => number | null,
): void {
	const falta = (lista: Lista) => errorDeRegla("falta_precio", `Falta el precio de ${lista.nombre}.`);
	for (const lista of listas.values()) {
		if (lista.bajaEn !== null) continue;
		const obligatoria =
			(lista.tipo === "mostrador" && canales.mostrador) ||
			(lista.tipo === "en_linea" && canales.en_linea) ||
			(lista.tipo === "cliente" && antes.some((precio) => precio.listaId === lista.id && precio.varianteId === null));
		if (obligatoria && baseDespues(lista.id) === null) throw falta(lista);
	}
}

/**
 * El renglón de bitácora de un precio que cambia.
 * @returns La descripción: «Precio de {lista}, talla {t}: {antes} → {después} {+n%}», «(nuevo)» o «se quita».
 */
function descripcionDelPrecio(lista: string, talla: string | undefined, antes: number | null, despues: number | null) {
	const donde = `Precio de ${lista}${talla === undefined ? "" : `, talla ${talla}`}`;
	if (antes === null && despues !== null) return `${donde}: ${textoDePrecio(despues)} (nuevo)`;
	if (antes !== null && despues === null) return `${donde}: se quita (era ${textoDePrecio(antes)})`;
	if (antes !== null && despues !== null) {
		return `${donde}: ${textoDePrecio(antes)} → ${textoDePrecio(despues)} ${cambioEnPorCiento(antes, despues)}`;
	}
	return donde;
}

/** Junta los destinos en el mensaje: «las tiendas, la tienda en línea y mayoreo». */
function juntarDestinos(destinos: readonly string[]): string {
	if (destinos.length <= 1) return destinos[0] ?? "";
	return `${destinos.slice(0, -1).join(", ")} y ${destinos.at(-1)}`;
}

export const accionAplicarCambiosProducto = implementarAccion(
	aplicarCambiosProducto,
	async (contexto, datos, version) => {
		const { transaccion } = contexto;
		// Cada precio una sola vez: dos cambios al mismo precio no se pueden aplicar los dos.
		const llaves = (datos.precios ?? []).map((precio) => `${precio.lista_id}|${precio.variante_id}`);
		if (new Set(llaves).size !== llaves.length) throw errorDeCampo("precios", "Cada precio va una sola vez.");
		const producto = await leerProducto(transaccion, datos.producto_id);
		await tomarVersionDelProducto(contexto, producto, version);
		revisarQueEstaActivo(producto);
		const canales = canalesNuevos(producto, datos);
		const listas = new Map(
			(
				await transaccion
					.select({
						id: listasPrecios.id,
						tipo: listasPrecios.tipo,
						nombre: listasPrecios.nombre,
						bajaEn: listasPrecios.bajaEn,
					})
					.from(listasPrecios)
			).map((lista) => [lista.id, lista]),
		);
		const suyas = new Map(
			(
				await transaccion
					.select({ id: variantes.id, esPedidoEspecial: variantes.esPedidoEspecial, talla: tallas.nombre })
					.from(variantes)
					.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
					.where(eq(variantes.productoId, producto.id))
			).map((variante) => [variante.id, variante]),
		);
		await revisarPrecios(contexto, producto, datos, listas, canales, suyas);
		const vigentes = await preciosVigentes(transaccion, [producto.id]);
		const vigenteDe = (listaId: string, varianteId: string | null) =>
			vigentes.find((precio) => precio.listaId === listaId && precio.varianteId === varianteId);
		// Los precios que de verdad cambian.
		const preciosQueCambian = (datos.precios ?? []).filter(
			(precio) => (vigenteDe(precio.lista_id, precio.variante_id)?.precioCentavos ?? null) !== precio.precio_centavos,
		);
		const nuevoDe = new Map(
			preciosQueCambian.map((precio) => [`${precio.lista_id}|${precio.variante_id}`, precio.precio_centavos]),
		);
		revisarObligatorios(listas, canales, vigentes, (listaId) => {
			const llave = `${listaId}|null`;
			return nuevoDe.has(llave) ? (nuevoDe.get(llave) ?? null) : (vigenteDe(listaId, null)?.precioCentavos ?? null);
		});
		const renglones: RenglonDeBitacora[] = [];
		const destinos = new Set<string>();
		const deEsteProducto = { entidad: "productos", entidadId: producto.id };
		// Los canales.
		for (const canal of ["mostrador", "en_linea", "externos"] as const) {
			const antes = {
				mostrador: producto.canalMostrador,
				en_linea: producto.canalEnLinea,
				externos: producto.canalExternos,
			}[canal];
			if (canales[canal] === antes) continue;
			renglones.push({
				...deEsteProducto,
				descripcion: `${canales[canal] ? "Empieza a" : "Deja de"} venderse ${nombreDelCanal[canal]}`,
				antes: { [`canal_${canal}`]: antes },
				despues: { [`canal_${canal}`]: canales[canal] },
			});
			destinos.add("todos los canales");
		}
		// La categoría, el recargo y el tipo de prenda.
		if (datos.categoria_mayoreo_id !== undefined && datos.categoria_mayoreo_id !== producto.categoriaMayoreoId) {
			const nombres = await transaccion
				.select({ id: categoriasMayoreo.id, nombre: categoriasMayoreo.nombre })
				.from(categoriasMayoreo)
				.where(inArray(categoriasMayoreo.id, [producto.categoriaMayoreoId, datos.categoria_mayoreo_id]));
			const nombreDe = (id: string) => nombres.find((categoria) => categoria.id === id)?.nombre;
			if (nombreDe(datos.categoria_mayoreo_id) === undefined) {
				throw errorDeCampo("categoria_mayoreo_id", "Escoge la categoría de mayoreo.");
			}
			renglones.push({
				...deEsteProducto,
				descripcion: `${nombreDe(producto.categoriaMayoreoId)} a ${nombreDe(datos.categoria_mayoreo_id)}`,
				antes: { categoria_mayoreo_id: producto.categoriaMayoreoId },
				despues: { categoria_mayoreo_id: datos.categoria_mayoreo_id },
			});
			destinos.add("mayoreo");
		}
		const recargo = datos.recargo_pedido_especial_centavos;
		if (recargo !== undefined && recargo !== producto.recargoPedidoEspecialCentavos) {
			renglones.push({
				...deEsteProducto,
				descripcion: `Recargo de pedido especial: ${textoDePrecio(producto.recargoPedidoEspecialCentavos)} → ${textoDePrecio(recargo)}`,
				antes: { recargo_pedido_especial_centavos: producto.recargoPedidoEspecialCentavos },
				despues: { recargo_pedido_especial_centavos: recargo },
			});
		}
		if (datos.tipo_prenda_id !== undefined && datos.tipo_prenda_id !== producto.tipoPrendaId) {
			// Solo un producto de una sección con receta lleva tipo de prenda.
			const [seccion] = await transaccion
				.select({ llevaReceta: secciones.llevaReceta })
				.from(secciones)
				.where(eq(secciones.id, producto.seccionId));
			if (seccion?.llevaReceta !== true) {
				throw errorDeCampo("tipo_prenda_id", "Esa sección no lleva receta: sus productos no tienen tipo de prenda.");
			}
			const ids = [datos.tipo_prenda_id, ...(producto.tipoPrendaId === null ? [] : [producto.tipoPrendaId])];
			const nombres = await transaccion
				.select({ id: tiposPrenda.id, nombre: tiposPrenda.nombre })
				.from(tiposPrenda)
				.where(inArray(tiposPrenda.id, ids));
			const nombreDe = (id: string | null) => nombres.find((tipo) => tipo.id === id)?.nombre;
			if (nombreDe(datos.tipo_prenda_id) === undefined)
				throw errorDeCampo("tipo_prenda_id", "Escoge el tipo de prenda.");
			renglones.push({
				...deEsteProducto,
				descripcion: `Tipo de prenda: ${nombreDe(producto.tipoPrendaId) ?? "sin tipo"} → ${nombreDe(datos.tipo_prenda_id)}`,
				antes: { tipo_prenda_id: producto.tipoPrendaId },
				despues: { tipo_prenda_id: datos.tipo_prenda_id },
			});
		}
		const cambiaElProducto = renglones.length > 0;
		if (!cambiaElProducto && preciosQueCambian.length === 0) throw errorDeRegla("sin_cambios", "Sin cambios");
		if (cambiaElProducto) {
			await transaccion
				.update(productos)
				.set({
					canalMostrador: canales.mostrador,
					canalEnLinea: canales.en_linea,
					canalExternos: canales.externos,
					...(datos.categoria_mayoreo_id === undefined ? {} : { categoriaMayoreoId: datos.categoria_mayoreo_id }),
					...(recargo === undefined ? {} : { recargoPedidoEspecialCentavos: recargo }),
					...(datos.tipo_prenda_id === undefined ? {} : { tipoPrendaId: datos.tipo_prenda_id }),
				})
				.where(eq(productos.id, producto.id));
			eventoDeProducto(contexto, "producto.cambiado", producto, ["productos"]);
		}
		// Los precios: cada uno cierra el vigente y crea otro, con las etiquetas de Mostrador por reimprimir.
		const mostrador = [...listas.values()].find((lista) => lista.tipo === "mostrador");
		const mostradorAntes =
			mostrador === undefined ? new Map() : await mostradorPorTalla(transaccion, producto.id, mostrador.id);
		const listasQueCambian = new Set<string>();
		for (const precio of preciosQueCambian) {
			const lista = listas.get(precio.lista_id);
			if (lista === undefined) continue;
			const vigente = vigenteDe(precio.lista_id, precio.variante_id);
			await cambiarPrecio(
				contexto,
				{
					vigente,
					listaId: lista.id,
					productoId: producto.id,
					varianteId: precio.variante_id,
					precio: precio.precio_centavos,
				},
				{ origen: "ficha" },
			);
			renglones.push({
				...deEsteProducto,
				descripcion: descripcionDelPrecio(
					lista.nombre,
					precio.variante_id === null ? undefined : suyas.get(precio.variante_id)?.talla,
					vigente?.precioCentavos ?? null,
					precio.precio_centavos,
				),
				antes: {
					lista_id: lista.id,
					variante_id: precio.variante_id,
					precio_centavos: vigente?.precioCentavos ?? null,
				},
				despues: { lista_id: lista.id, variante_id: precio.variante_id, precio_centavos: precio.precio_centavos },
			});
			listasQueCambian.add(lista.id);
			destinos.add(destinoDeLaLista[lista.tipo] ?? "");
		}
		for (const listaId of listasQueCambian) eventoDePrecio(contexto, producto.id, listaId);
		const reimprimir =
			mostrador === undefined
				? 0
				: await marcarPorReimprimir(
						contexto,
						producto.id,
						mostradorAntes,
						await mostradorPorTalla(transaccion, producto.id, mostrador.id),
					);
		for (const renglon of renglones) contexto.bitacora(renglon);
		// Los avisos que no bloquean.
		const despuesDe = async (tipo: string) => {
			const lista = [...listas.values()].find((una) => una.tipo === tipo);
			return lista === undefined ? [] : await preciosVigentes(transaccion, [producto.id], lista.id);
		};
		const [mayoreoDespues, mostradorDespues] = [await despuesDe("mayoreo"), await despuesDe("mostrador")];
		const avisoPorCiento = Number(
			await contexto.lectura("admin.parametro", { clave: "catalogo.aviso_cambio_precio_pct" }),
		);
		const avisos = avisosDeLaFicha(
			preciosQueCambian.map((precio) => ({
				lista: listas.get(precio.lista_id)?.nombre ?? "",
				antes: vigenteDe(precio.lista_id, precio.variante_id)?.precioCentavos ?? null,
				despues: precio.precio_centavos,
			})),
			[...suyas]
				.filter(([, variante]) => !variante.esPedidoEspecial)
				.map(([id, variante]) => ({
					mayoreo: precioSinRecargo(mayoreoDespues, { id, esPedidoEspecial: variante.esPedidoEspecial }),
					mostrador: precioSinRecargo(mostradorDespues, { id, esPedidoEspecial: variante.esPedidoEspecial }),
				})),
			avisoPorCiento,
		);
		if (reimprimir > 0)
			avisos.push(
				`Cambió el precio de mostrador: ${reimprimir} etiquetas de ${producto.nombre} quedan por reimprimir.`,
			);
		return {
			resultado: {
				cambios: renglones.length,
				mensaje: `${renglones.length} ${renglones.length === 1 ? "cambio aplicado" : "cambios aplicados"} a ${producto.nombre}${destinos.size === 0 ? "" : `. Ya llegan a ${juntarDestinos([...destinos].filter((destino) => destino !== ""))}`}`,
				version: await versionActual(transaccion, productos, producto.id),
			},
			avisos,
			entidad: { nombre: "productos", id: producto.id },
		};
	},
);
