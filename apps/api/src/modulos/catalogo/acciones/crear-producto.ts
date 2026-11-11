/**
 * `catalogo.crear_producto`: el alta de un producto desde cero, a partir de otro o desde un pedido de Ventas.
 * Fase 8 · docs/modulos/catalogo/productos.md («`catalogo.crear_producto`») y variantes-codigos-y-etiquetas.md
 * (reglas 1 y 2); fase 10 · la receta (docs/modulos/patronaje/recetas.md, reglas 1 y 9)
 *
 * Toma un bloque de códigos seguidos, uno por talla, en un solo paso; sin códigos suficientes no crea nada.
 * Resuelve el tipo de prenda, el recargo y el precio en línea que no vienen. A partir de otro copia también los
 * precios propios de talla del base. En una sección que lleva receta, la receta nace con el producto
 * (`patronaje.iniciar_receta`): a partir de otro, copiada del base con las medidas del alta. Sin receta en el base,
 * las medidas se descartan con su aviso. El origen `desarrollo` llega con los desarrollos (parte 3).
 */

import { aPesoEntero } from "@uniformame/compartido/calculos/dinero";
import { crearProducto } from "@uniformame/compartido/contratos/catalogo/productos";
import { centavos } from "@uniformame/compartido/tipos/base";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { ErrorDeApi, errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
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
	tiposPrenda,
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
	// Con `FOR SHARE`: mientras el alta no confirme, el base no se descontinúa.
	const [base] = await contexto.transaccion
		.select()
		.from(productos)
		.where(eq(productos.id, datos.producto_base_id))
		.for("share");
	if (base === undefined) throw errorDeCampo("producto_base_id", "Escoge el producto base.");
	if (base.bajaEn !== null || base.esServicio) {
		throw errorDeRegla("base_no_disponible", `${base.nombre} ya no está activo: escoge otro producto base.`);
	}
	return base;
}

/**
 * Las tallas del alta, que existan y sigan en su grupo; desde cero, solo normales. A partir de otro son las del
 * base (normales y de pedido especial, sin las descontinuadas ni las dadas de baja) que caen en los grupos de las
 * tallas marcadas. Se leen con `FOR SHARE`: mientras el alta no confirme, nadie las quita ni las renombra.
 * @returns Por talla, su id, su nombre y si es de pedido especial, en el orden de sus grupos.
 * @throws `400` si una se repite; `422 especial_desde_cero` o `talla_no_disponible`.
 */
async function tallasDelAlta(contexto: ContextoDeAccion, datos: DatosDelAlta, base: Producto | undefined) {
	if (datos.modo === "desde_cero" && datos.tallas.some((talla) => talla.es_pedido_especial)) {
		throw errorDeRegla(
			"especial_desde_cero",
			"Desde cero no hay tallas de pedido especial: se agregan después en la ficha.",
		);
	}
	const ids = datos.tallas.map((talla) => talla.talla_id);
	if (new Set(ids).size !== ids.length) throw errorDeCampo("tallas", "Una talla va una sola vez.");
	const pedidas = await leerTallas(contexto, ids);
	if (pedidas.length !== ids.length) throw errorDeCampo("tallas", "Marca al menos un grupo de tallas.");
	const especial = new Set(datos.tallas.filter((talla) => talla.es_pedido_especial).map((talla) => talla.talla_id));
	const elegidas =
		base === undefined
			? pedidas.map((talla) => ({ ...talla, esPedidoEspecial: especial.has(talla.id) }))
			: await tallasDelBase(contexto, base, new Set(pedidas.map((talla) => talla.grupo)));
	const quitada = elegidas.find((talla) => talla.bajaEn !== null);
	if (quitada !== undefined)
		throw errorDeRegla("talla_no_disponible", `La talla ${quitada.nombre} ya no está en su grupo.`);
	if (elegidas.length === 0) throw errorDeCampo("tallas", "Marca al menos un grupo de tallas.");
	return elegidas.map((talla) => ({ id: talla.id, nombre: talla.nombre, esPedidoEspecial: talla.esPedidoEspecial }));
}

/**
 * Lee unas tallas con `FOR SHARE`, en el orden de sus grupos.
 * @param ids Las tallas.
 */
async function leerTallas(contexto: ContextoDeAccion, ids: readonly string[]) {
	return contexto.transaccion
		.select({ id: tallas.id, nombre: tallas.nombre, bajaEn: tallas.bajaEn, grupo: tallas.grupoTallaId })
		.from(tallas)
		.where(inArray(tallas.id, [...ids]))
		.orderBy(tallas.grupoTallaId, tallas.orden)
		.for("share");
}

/**
 * Las tallas vivas del producto base que caen en esos grupos, con si son de pedido especial.
 * @param grupos Los grupos de las tallas marcadas.
 */
async function tallasDelBase(contexto: ContextoDeAccion, base: Producto, grupos: ReadonlySet<string>) {
	const delBase = await contexto.transaccion
		.select({ tallaId: variantes.tallaId, esPedidoEspecial: variantes.esPedidoEspecial })
		.from(variantes)
		.where(and(eq(variantes.productoId, base.id), isNull(variantes.bajaEn), isNull(variantes.descontinuadaEn)));
	const especial = new Map(delBase.map((variante) => [variante.tallaId, variante.esPedidoEspecial]));
	const leidas = await leerTallas(contexto, [...especial.keys()]);
	return leidas
		.filter((talla) => grupos.has(talla.grupo))
		.map((talla) => ({ ...talla, esPedidoEspecial: especial.get(talla.id) === true }));
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
	const deListas = datos.precios.map((precio) => precio.lista_id);
	if (new Set(deListas).size !== deListas.length) throw errorDeCampo("precios", "Cada lista va una sola vez.");
	for (const { lista_id, precio_centavos } of datos.precios) {
		if (!listas.some((lista) => lista.id === lista_id))
			throw errorDeCampo("precios", "Escoge una lista de precios activa.");
		await revisarPrecioMaximo(contexto, "precios", precio_centavos, (tope) => `Un precio entero, de $1 a ${tope}.`);
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
 * @throws `400` si una no existe; `422 escuela_dada_de_baja` o `falta_tipo_prenda`.
 */
async function loQueLoUbica(contexto: ContextoDeAccion, datos: DatosDelAlta, base: Producto | undefined) {
	const { transaccion } = contexto;
	const [seccion] = await transaccion.select().from(secciones).where(eq(secciones.id, datos.seccion_id));
	if (seccion === undefined) throw errorDeCampo("seccion_id", "Escoge la sección.");
	if (datos.escuela_id !== null) {
		// Con `FOR SHARE`: mientras el alta no confirme, la escuela no se da de baja.
		const [escuela] = await transaccion
			.select({ id: escuelas.id, nombre: escuelas.nombre, bajaEn: escuelas.bajaEn })
			.from(escuelas)
			.where(eq(escuelas.id, datos.escuela_id))
			.for("share");
		if (escuela === undefined) throw errorDeCampo("escuela_id", "Escoge la escuela.");
		if (escuela.bajaEn !== null) {
			throw errorDeRegla("escuela_dada_de_baja", `${escuela.nombre} está dada de baja: reactívala antes.`);
		}
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
	if (tipoPrendaId !== null) {
		const [tipo] = await transaccion
			.select({ id: tiposPrenda.id })
			.from(tiposPrenda)
			.where(eq(tiposPrenda.id, tipoPrendaId));
		if (tipo === undefined) throw errorDeCampo("tipo_prenda_id", "Escoge el tipo de prenda.");
	}
	return { tipoPrendaId, llevaReceta: seccion.llevaReceta && datos.es_servicio !== true };
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

/** Lo que regresa `patronaje.iniciar_receta`. */
const recetaIniciada = z.object({
	receta_id: z.uuid(),
	estado: z.enum(["sin_receta", "sin_verificar", "verificada"]),
	avisos: z.array(z.string()),
});

export const accionCrearProducto = implementarAccion(crearProducto, async (contexto, datos) => {
	const { transaccion } = contexto;
	revisarQuienDaElAlta(contexto, datos.origen);
	if (datos.origen === "desarrollo") throw errorDeCampo("origen", "El alta desde un desarrollo llega con Patronaje.");
	if (datos.origen === "pedido" && datos.cliente_id === undefined)
		throw errorDeCampo("cliente_id", "Escoge el cliente.");
	const base = await leerBase(contexto, datos);
	revisarCanales(datos);
	const { tipoPrendaId, llevaReceta } = await loQueLoUbica(contexto, datos, base);
	const deLasTallas = await tallasDelAlta(contexto, datos, base);
	const porLista = await preciosDelAlta(contexto, datos);
	// El recargo inicial es un parámetro en centavos: se lleva a peso entero, como todo precio.
	const recargo =
		datos.recargo_pedido_especial_centavos ??
		base?.recargoPedidoEspecialCentavos ??
		aPesoEntero(
			centavos(
				Number(
					await contexto.lectura("admin.parametro", { clave: "catalogo.recargo_pedido_especial_inicial_centavos" }),
				),
			),
		);
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
	// La receta nace con el producto; a partir de otro, como copia de la del base, con las medidas del alta.
	const receta = llevaReceta
		? recetaIniciada.parse(
				await contexto.interna("patronaje.iniciar_receta", {
					producto_id: productoId,
					...(base === undefined ? {} : { producto_base_id: base.id }),
					...(datos.medidas === undefined ? {} : { medidas: datos.medidas }),
				}),
			)
		: undefined;
	const medidasDescartadas = receta === undefined && (datos.medidas ?? []).length > 0;
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
			receta_id: receta?.receta_id ?? null,
			receta_estado: receta?.estado ?? null,
			mensaje:
				datos.origen === "pedido"
					? `${datos.nombre} creado en Catálogo y agregado al pedido`
					: `${datos.nombre} creado con ${nuevas.length} variantes, códigos ${primero} a ${ultimo}`,
		},
		avisos: [
			...(receta?.avisos ?? []),
			...(medidasDescartadas ? ["Las medidas se capturan con la receta en Patronaje"] : []),
		],
		entidad: { nombre: "productos", id: productoId },
	};
});
