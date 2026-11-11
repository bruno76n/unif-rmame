/**
 * `catalogo.crear_producto`: el alta de un producto desde cero, a partir de otro o desde un pedido de Ventas.
 * Fase 8 · docs/modulos/catalogo/productos.md («`catalogo.crear_producto`») y variantes-codigos-y-etiquetas.md
 * (reglas 1 y 2)
 *
 * Toma un bloque de códigos seguidos, uno por talla, en un solo paso; sin códigos suficientes no crea nada.
 * Resuelve el tipo de prenda, el recargo y el precio en línea que no vienen. A partir de otro copia también los
 * precios propios de talla del base. El origen `desarrollo`, la receta y las medidas llegan con Patronaje
 * (fase 10); hasta entonces las medidas se descartan con su aviso.
 */

import { crearProducto } from "@uniformame/compartido/contratos/catalogo/productos";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { z } from "zod";
import { ErrorDeApi, errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { quienCambia } from "../dominio/comunes.ts";
import {
	eventoDeProducto,
	type Producto,
	revisarCanalEnLinea,
	revisarPrecioMaximo,
	tomarCodigos,
} from "../dominio/productos.ts";
import {
	categoriasMayoreo,
	escuelas,
	listasPrecios,
	precios,
	productos,
	secciones,
	tallas,
	variantes,
} from "../tablas.ts";

/** Lo que recibe el alta. */
type DatosDelAlta = z.infer<typeof crearProducto.entrada>;

/**
 * Revisa quién da el alta: Catálogo, con cualquier origen; Ventas a externos, solo desde un pedido.
 * @throws `403 sin_departamento`.
 */
function revisarQuienDaElAlta(contexto: ContextoDeAccion, origen: DatosDelAlta["origen"]): void {
	const { quien } = contexto;
	if (quien.tipo !== "cuenta") throw new ErrorDeApi("sin_permiso", "fuera_de_alcance");
	if (quien.esDuena || quien.departamentos.includes("catalogo")) return;
	if (origen === "pedido" && quien.departamentos.includes("ventas")) return;
	throw new ErrorDeApi("sin_permiso", "sin_departamento");
}

/**
 * El producto base, activo y que no es servicio.
 * @throws `400` si falta; `422 base_no_disponible`.
 */
async function leerBase(contexto: ContextoDeAccion, datos: DatosDelAlta): Promise<Producto | undefined> {
	if (datos.modo === "desde_cero") return undefined;
	if (datos.producto_base_id === undefined) throw errorDeCampo("producto_base_id", "Escoge el producto base.");
	const [base] = await contexto.transaccion.select().from(productos).where(eq(productos.id, datos.producto_base_id));
	if (base === undefined) throw errorDeCampo("producto_base_id", "Escoge el producto base.");
	if (base.bajaEn !== null || base.esServicio) {
		throw errorDeRegla("base_no_disponible", `${base.nombre} ya no está activo: escoge otro producto base.`);
	}
	return base;
}

/**
 * Las tallas del alta, que existan y sigan en su grupo; desde cero, solo normales.
 * @returns Por talla, su id, su nombre y si es de pedido especial, en el orden de sus grupos.
 * @throws `400` si una se repite; `422 especial_desde_cero` o `talla_no_disponible`.
 */
async function tallasDelAlta(contexto: ContextoDeAccion, datos: DatosDelAlta) {
	if (datos.modo === "desde_cero" && datos.tallas.some((talla) => talla.es_pedido_especial)) {
		throw errorDeRegla(
			"especial_desde_cero",
			"Desde cero no hay tallas de pedido especial: se agregan después en la ficha.",
		);
	}
	const ids = datos.tallas.map((talla) => talla.talla_id);
	if (new Set(ids).size !== ids.length) throw errorDeCampo("tallas", "Una talla va una sola vez.");
	const leidas = await contexto.transaccion
		.select({
			id: tallas.id,
			nombre: tallas.nombre,
			bajaEn: tallas.bajaEn,
			grupo: tallas.grupoTallaId,
			orden: tallas.orden,
		})
		.from(tallas)
		.where(inArray(tallas.id, ids))
		.orderBy(tallas.grupoTallaId, tallas.orden);
	if (leidas.length !== ids.length) throw errorDeCampo("tallas", "Marca al menos un grupo de tallas.");
	const quitada = leidas.find((talla) => talla.bajaEn !== null);
	if (quitada !== undefined)
		throw errorDeRegla("talla_no_disponible", `La talla ${quitada.nombre} ya no está en su grupo.`);
	const especial = new Set(datos.tallas.filter((talla) => talla.es_pedido_especial).map((talla) => talla.talla_id));
	return leidas.map((talla) => ({ id: talla.id, nombre: talla.nombre, esPedidoEspecial: especial.has(talla.id) }));
}

/**
 * Revisa los canales: desde un pedido, a externos; en línea, sin escuela y sin servicio.
 * @throws `422 externos_obligatorio`, `en_linea_solo_sin_escuela` o `servicio_en_linea`.
 */
function revisarCanales(datos: DatosDelAlta): void {
	if (datos.origen === "pedido" && !datos.canales.includes("externos")) {
		throw errorDeRegla("externos_obligatorio", "Desde un pedido, el producto se vende a externos.");
	}
	revisarCanalEnLinea(
		{ escuelaId: datos.escuela_id, esServicio: datos.es_servicio ?? false },
		datos.canales.includes("en_linea"),
	);
}

/**
 * Los precios base del alta: los que vienen, con el de En línea tomado del de Mostrador si falta.
 * @returns Por lista, su precio.
 * @throws `400` si una lista no existe o un precio pasa del tope; `422 falta_precio_mostrador`,
 * `falta_precio_en_linea` o `falta_precio_cliente`.
 */
async function preciosDelAlta(contexto: ContextoDeAccion, datos: DatosDelAlta): Promise<Map<string, number>> {
	const listas = await contexto.transaccion
		.select({
			id: listasPrecios.id,
			tipo: listasPrecios.tipo,
			corta: listasPrecios.nombreCorto,
			clienteId: listasPrecios.clienteId,
		})
		.from(listasPrecios)
		.where(isNull(listasPrecios.bajaEn));
	const porLista = new Map<string, number>();
	for (const { lista_id, precio_centavos } of datos.precios) {
		if (!listas.some((lista) => lista.id === lista_id))
			throw errorDeCampo("precios", "Escoge una lista de precios activa.");
		await revisarPrecioMaximo(contexto, "precios", precio_centavos, "Un precio entero, de $1 a $99,999.");
		porLista.set(lista_id, precio_centavos);
	}
	const deTipo = (tipo: string) => listas.find((lista) => lista.tipo === tipo);
	const mostrador = deTipo("mostrador");
	const precioMostrador = mostrador === undefined ? undefined : porLista.get(mostrador.id);
	if (datos.canales.includes("mostrador") && precioMostrador === undefined) {
		throw errorDeRegla("falta_precio_mostrador", "Falta el precio de mostrador.");
	}
	const enLinea = deTipo("en_linea");
	if (datos.canales.includes("en_linea") && enLinea !== undefined && !porLista.has(enLinea.id)) {
		if (precioMostrador === undefined)
			throw errorDeRegla("falta_precio_en_linea", "Falta el precio de la tienda en línea.");
		porLista.set(enLinea.id, precioMostrador);
	}
	if (datos.origen === "pedido") {
		const delCliente = listas.find((lista) => lista.clienteId !== null && lista.clienteId === datos.cliente_id);
		if (delCliente === undefined) throw errorDeCampo("cliente_id", "Escoge un cliente con lista de precios activa.");
		if (!porLista.has(delCliente.id)) {
			throw errorDeRegla("falta_precio_cliente", `Falta el precio de ${delCliente.corta ?? "la lista del cliente"}.`);
		}
	}
	return porLista;
}

/**
 * La sección, la escuela y la categoría; y el tipo de prenda que le toca: el que viene, el del base o el de la
 * sección. En una sección sin receta no lleva.
 * @throws `400` si una no existe; `422 falta_tipo_prenda`.
 */
async function loQueLoUbica(contexto: ContextoDeAccion, datos: DatosDelAlta, base: Producto | undefined) {
	const { transaccion } = contexto;
	const [seccion] = await transaccion.select().from(secciones).where(eq(secciones.id, datos.seccion_id));
	if (seccion === undefined) throw errorDeCampo("seccion_id", "Escoge la sección.");
	if (datos.escuela_id !== null) {
		const [escuela] = await transaccion
			.select({ id: escuelas.id })
			.from(escuelas)
			.where(eq(escuelas.id, datos.escuela_id));
		if (escuela === undefined) throw errorDeCampo("escuela_id", "Escoge la escuela.");
	}
	const [categoria] = await transaccion
		.select({ id: categoriasMayoreo.id })
		.from(categoriasMayoreo)
		.where(eq(categoriasMayoreo.id, datos.categoria_mayoreo_id));
	if (categoria === undefined) throw errorDeCampo("categoria_mayoreo_id", "Escoge la categoría de mayoreo.");
	const tipoPrendaId = seccion.llevaReceta
		? (datos.tipo_prenda_id ?? base?.tipoPrendaId ?? seccion.tipoPrendaDefectoId)
		: null;
	if (seccion.llevaReceta && tipoPrendaId === null)
		throw errorDeRegla("falta_tipo_prenda", "Escoge el tipo de prenda.");
	return { tipoPrendaId };
}

/**
 * Los precios propios de talla del base, en las mismas tallas y en las listas que lleva el producto nuevo.
 * @returns Los renglones de `precios` que se copian.
 */
async function preciosDeTallaDelBase(
	contexto: ContextoDeAccion,
	base: Producto,
	listas: ReadonlySet<string>,
	varianteDeTalla: ReadonlyMap<string, { id: string; esPedidoEspecial: boolean }>,
) {
	const deTalla = await contexto.transaccion
		.select({ listaId: precios.listaId, tallaId: variantes.tallaId, precio: precios.precioCentavos })
		.from(precios)
		.innerJoin(variantes, eq(variantes.id, precios.varianteId))
		.where(and(eq(precios.productoId, base.id), isNotNull(precios.varianteId), isNull(precios.vigenteHasta)));
	return deTalla.flatMap((suyo) => {
		const variante = varianteDeTalla.get(suyo.tallaId);
		// Nunca una talla de pedido especial: cobra el base más el recargo.
		if (variante === undefined || variante.esPedidoEspecial || !listas.has(suyo.listaId)) return [];
		return [{ listaId: suyo.listaId, varianteId: variante.id, precio: suyo.precio }];
	});
}

export const accionCrearProducto = implementarAccion(crearProducto, async (contexto, datos) => {
	const { transaccion } = contexto;
	revisarQuienDaElAlta(contexto, datos.origen);
	if (datos.origen === "desarrollo") throw errorDeCampo("origen", "El alta desde un desarrollo llega con Patronaje.");
	if (datos.origen === "pedido" && datos.cliente_id === undefined)
		throw errorDeCampo("cliente_id", "Escoge el cliente.");
	const base = await leerBase(contexto, datos);
	revisarCanales(datos);
	const { tipoPrendaId } = await loQueLoUbica(contexto, datos, base);
	const deLasTallas = await tallasDelAlta(contexto, datos);
	const porLista = await preciosDelAlta(contexto, datos);
	const recargo =
		datos.recargo_pedido_especial_centavos ??
		base?.recargoPedidoEspecialCentavos ??
		Number(await contexto.lectura("admin.parametro", { clave: "catalogo.recargo_pedido_especial_inicial_centavos" }));
	const quien = quienCambia(contexto);
	const productoId = uuidv7();
	const [creado] = await transaccion
		.insert(productos)
		.values({
			id: productoId,
			nombre: datos.nombre,
			seccionId: datos.seccion_id,
			escuelaId: datos.escuela_id,
			tipoPrendaId,
			categoriaMayoreoId: datos.categoria_mayoreo_id,
			esServicio: datos.es_servicio ?? false,
			canalMostrador: datos.canales.includes("mostrador"),
			canalEnLinea: datos.canales.includes("en_linea"),
			canalExternos: datos.canales.includes("externos"),
			recargoPedidoEspecialCentavos: recargo,
			productoBaseId: base?.id ?? null,
			creadoPor: quien,
		})
		.onConflictDoNothing()
		.returning({ id: productos.id });
	if (creado === undefined) {
		throw errorDeRegla(
			"nombre_repetido",
			base === undefined
				? "Ya existe una prenda con ese nombre para ese modelo."
				: "Ya existe una prenda con ese nombre para ese modelo: cámbiale el nombre o el modelo.",
		);
	}
	// Los códigos, seguidos y en un solo paso: si no alcanzan, no se crea nada.
	const codigos = await tomarCodigos(
		contexto,
		deLasTallas.length,
		`No quedan códigos de barras de fábrica para ${deLasTallas.length} tallas. Avisa a soporte.`,
	);
	const nuevas = deLasTallas.map((talla, i) => ({
		id: uuidv7(),
		productoId,
		tallaId: talla.id,
		talla: talla.nombre,
		codigo: codigos[i] ?? "",
		esPedidoEspecial: talla.esPedidoEspecial,
		estadoEtiqueta: talla.esPedidoEspecial ? "al_fabricar" : "por_imprimir",
	}));
	await transaccion
		.insert(variantes)
		.values(nuevas.map(({ talla: _talla, ...variante }) => ({ ...variante, creadoPor: quien })));
	const desde = contexto.ahora.toString();
	const varianteDeTalla = new Map(nuevas.map((variante) => [variante.tallaId, variante]));
	const deTalla =
		base === undefined ? [] : await preciosDeTallaDelBase(contexto, base, new Set(porLista.keys()), varianteDeTalla);
	const renglones = [
		...[...porLista].map(([listaId, precio]) => ({ listaId, varianteId: null, precio })),
		...deTalla,
	].map((precio) => ({
		id: uuidv7(),
		listaId: precio.listaId,
		productoId,
		varianteId: precio.varianteId,
		precioCentavos: precio.precio,
		vigenteDesde: desde,
		origen: "alta_producto",
		creadoPor: quien,
	}));
	if (renglones.length > 0) await transaccion.insert(precios).values(renglones);
	const primero = nuevas[0]?.codigo ?? "";
	const ultimo = nuevas.at(-1)?.codigo ?? "";
	contexto.bitacora({
		descripcion: `Producto nuevo con ${nuevas.length} variantes, códigos ${primero} a ${ultimo}${base === undefined ? "" : `, a partir de ${base.nombre}`}`,
		entidad: "productos",
		entidadId: productoId,
		despues: {
			nombre: datos.nombre,
			escuela_id: datos.escuela_id,
			canales: datos.canales,
			recargo_pedido_especial_centavos: recargo,
			variantes: nuevas.map((variante) => ({
				talla: variante.talla,
				codigo: variante.codigo,
				es_pedido_especial: variante.esPedidoEspecial,
			})),
			precios: renglones.map((renglon) => ({
				lista_id: renglon.listaId,
				variante_id: renglon.varianteId,
				precio_centavos: renglon.precioCentavos,
			})),
		},
	});
	eventoDeProducto(contexto, "producto.creado", { id: productoId }, ["productos", "variantes", "precios"]);
	const medidasDescartadas = (datos.medidas ?? []).length > 0;
	return {
		resultado: {
			producto_id: productoId,
			variantes: nuevas.map((variante) => ({
				variante_id: variante.id,
				talla_id: variante.tallaId,
				talla: variante.talla,
				codigo: variante.codigo,
			})),
			codigo_desde: primero,
			codigo_hasta: ultimo,
			mensaje:
				datos.origen === "pedido"
					? `${datos.nombre} creado en Catálogo y agregado al pedido`
					: `${datos.nombre} creado con ${nuevas.length} variantes, códigos ${primero} a ${ultimo}`,
		},
		avisos: medidasDescartadas ? ["Las medidas se capturan con la receta en Patronaje"] : [],
		entidad: { nombre: "productos", id: productoId },
	};
});
