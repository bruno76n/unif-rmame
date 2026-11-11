/**
 * `catalogo.agregar_talla`, `catalogo.descontinuar_talla`, `catalogo.reactivar_talla` y
 * `catalogo.dar_baja_talla`: las tallas de un producto.
 * Fase 8 · docs/modulos/catalogo/tallas-y-tipos-de-prenda.md (reglas 3 a 10, «Acciones»)
 *
 * Cada cambio de una talla toma y sube la versión del producto. Una talla dada de baja no vuelve: agregarla otra
 * vez crea otra variante con código nuevo. Los candados que retienen una talla (existencia, reservas, lotes y
 * pedidos) los agrega la fase de cada módulo.
 */

import {
	agregarTalla,
	darBajaTalla,
	descontinuarTalla,
	reactivarTalla,
} from "@uniformame/compartido/contratos/catalogo/productos";
import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { quienCambia, revisarMotivo } from "../dominio/comunes.ts";
import {
	eventoDeProducto,
	leerProducto,
	leerVariante,
	type Producto,
	revisarQueEstaActivo,
	tomarCodigos,
	tomarVersionDelProducto,
	type Variante,
} from "../dominio/productos.ts";
import { productos, tallas, variantes } from "../tablas.ts";

/**
 * Lee la talla del producto, bloquea su producto y toma su versión.
 * @returns La variante y su producto.
 */
async function tallaConSuProducto(
	contexto: ContextoDeAccion,
	varianteId: string,
	version: number | undefined,
): Promise<{ variante: Variante; producto: Producto }> {
	const { transaccion } = contexto;
	const [deLaVariante] = await transaccion
		.select({ productoId: variantes.productoId })
		.from(variantes)
		.where(eq(variantes.id, varianteId));
	if (deLaVariante === undefined) throw noExiste();
	// El producto primero: el mismo orden que el alta y «Aplicar cambios».
	const producto = await leerProducto(transaccion, deLaVariante.productoId);
	const variante = await leerVariante(transaccion, varianteId);
	await tomarVersionDelProducto(contexto, producto, version);
	return { variante, producto };
}

/** Lo que regresan las acciones de una talla: el mensaje y la versión nueva del producto. */
async function respuestaDeTalla(contexto: ContextoDeAccion, producto: Producto, mensaje: string) {
	return {
		resultado: { mensaje, version: await versionActual(contexto.transaccion, productos, producto.id) },
		entidad: { nombre: "productos", id: producto.id },
	};
}

export const accionAgregarTalla = implementarAccion(agregarTalla, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const producto = await leerProducto(transaccion, datos.producto_id);
	await tomarVersionDelProducto(contexto, producto, version);
	revisarQueEstaActivo(producto);
	const [talla] = await transaccion.select().from(tallas).where(eq(tallas.id, datos.talla_id));
	if (talla === undefined) throw noExiste();
	// Solo las tallas de los grupos del producto (los grupos de sus variantes).
	const suyas = await transaccion
		.select({ tallaId: variantes.tallaId, grupo: tallas.grupoTallaId, bajaEn: variantes.bajaEn })
		.from(variantes)
		.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
		.where(eq(variantes.productoId, producto.id));
	if (!suyas.some((suya) => suya.grupo === talla.grupoTallaId) || talla.bajaEn !== null) {
		throw errorDeRegla(
			"talla_de_otro_grupo",
			`La talla ${talla.nombre} no es de los grupos de tallas de ${producto.nombre}.`,
		);
	}
	if (suyas.some((suya) => suya.tallaId === talla.id && suya.bajaEn === null)) {
		throw errorDeRegla("talla_ya_existe", `${producto.nombre} ya tiene la talla ${talla.nombre}.`);
	}
	const [codigo] = await tomarCodigos(contexto, 1, "No quedan códigos de barras de fábrica. Avisa a soporte.");
	if (codigo === undefined) throw new Error("no se tomó el código de la talla");
	const id = uuidv7();
	const especial = datos.es_pedido_especial;
	await transaccion.insert(variantes).values({
		id,
		productoId: producto.id,
		tallaId: talla.id,
		codigo,
		esPedidoEspecial: especial,
		estadoEtiqueta: especial ? "al_fabricar" : "por_imprimir",
		creadoPor: quienCambia(contexto),
	});
	contexto.bitacora({
		descripcion: especial
			? `Talla ${talla.nombre} por pedido especial agregada con el código ${codigo}`
			: `Talla ${talla.nombre} agregada con el código ${codigo}`,
		entidad: "productos",
		entidadId: producto.id,
		despues: { variante_id: id, talla: talla.nombre, codigo, es_pedido_especial: especial },
	});
	eventoDeProducto(contexto, "variante.agregada", producto, ["variantes"]);
	return {
		resultado: {
			variante_id: id,
			codigo,
			mensaje: especial
				? `Talla ${talla.nombre} agregada con el código ${codigo}. Se etiqueta al fabricar el pedido`
				: `Talla ${talla.nombre} agregada con el código ${codigo}. Falta imprimir su etiqueta`,
			version: await versionActual(transaccion, productos, producto.id),
		},
		entidad: { nombre: "productos", id: producto.id },
	};
});

export const accionDescontinuarTalla = implementarAccion(descontinuarTalla, async (contexto, datos, version) => {
	await revisarMotivo(contexto, datos.motivo);
	const { variante, producto } = await tallaConSuProducto(contexto, datos.variante_id, version);
	if (variante.bajaEn !== null)
		throw errorDeRegla("talla_dada_de_baja", `La talla ${variante.talla} ya está dada de baja.`);
	if (variante.descontinuadaEn !== null) {
		throw errorDeRegla("talla_ya_descontinuada", `La talla ${variante.talla} ya está descontinuada.`);
	}
	const despues = {
		descontinuadaEn: contexto.ahora.toString(),
		descontinuadaPor: quienCambia(contexto),
		motivoDescontinuada: datos.motivo,
	};
	await contexto.transaccion.update(variantes).set(despues).where(eq(variantes.id, variante.id));
	contexto.bitacora({
		descripcion: `Talla ${variante.talla} descontinuada. ${datos.motivo}`,
		entidad: "productos",
		entidadId: producto.id,
		antes: { descontinuada_en: null, descontinuada_por: null, motivo_descontinuada: null },
		despues: {
			descontinuada_en: despues.descontinuadaEn,
			descontinuada_por: despues.descontinuadaPor,
			motivo_descontinuada: datos.motivo,
		},
	});
	eventoDeProducto(contexto, "variante.descontinuada", producto, ["variantes"]);
	return respuestaDeTalla(contexto, producto, `Talla ${variante.talla} descontinuada: se vende hasta acabarla`);
});

export const accionReactivarTalla = implementarAccion(reactivarTalla, async (contexto, datos, version) => {
	const { variante, producto } = await tallaConSuProducto(contexto, datos.variante_id, version);
	if (variante.bajaEn !== null) {
		throw errorDeRegla(
			"talla_dada_de_baja",
			`La talla ${variante.talla} está dada de baja: agrégala otra vez y lleva código nuevo.`,
		);
	}
	if (variante.descontinuadaEn === null) {
		throw errorDeRegla("talla_no_descontinuada", `La talla ${variante.talla} no está descontinuada.`);
	}
	await contexto.transaccion
		.update(variantes)
		.set({
			descontinuadaEn: null,
			descontinuadaPor: null,
			motivoDescontinuada: null,
			reactivadaEn: contexto.ahora.toString(),
			reactivadaPor: quienCambia(contexto),
		})
		.where(eq(variantes.id, variante.id));
	contexto.bitacora({
		descripcion: `Talla ${variante.talla} vuelve a fabricarse`,
		entidad: "productos",
		entidadId: producto.id,
		antes: { descontinuada: true, motivo: variante.motivoDescontinuada },
		despues: { descontinuada: false },
	});
	eventoDeProducto(contexto, "variante.reactivada", producto, ["variantes"]);
	return respuestaDeTalla(contexto, producto, `Talla ${variante.talla} vuelve a fabricarse`);
});

/** Lo que regresa `inventario.piezas_de_variante`. */
const loQueRetiene = z.object({
	existencias: z.array(z.object({ ubicacion: z.string(), piezas: z.number() })),
	reservas: z.array(z.object({ piezas: z.number(), motivo: z.string() })),
});

/** Cómo se nombra el documento de una reserva en un mensaje, hasta que cada fase dé su folio. */
const documentoDeReserva: Readonly<Record<string, string>> = {
	pedido_externo: "pedido externo",
	nota_entrega: "nota de entrega",
	pedido_linea: "pedido en línea",
	apartado_tienda: "apartado",
	pedido_especial_tienda: "pedido especial",
};

/**
 * Los candados de inventario de la baja: ninguna existencia distinta de cero (también negativa, en Tránsito o
 * En camino a aduana) y ninguna reserva activa.
 * @throws `422 talla_con_existencia` o `talla_con_reservas`.
 */
function revisarQueNadaLaRetiene(talla: string, retiene: z.infer<typeof loQueRetiene>): void {
	if (retiene.existencias.length > 0) {
		const piezas = retiene.existencias.reduce((suma, existencia) => suma + Math.abs(existencia.piezas), 0);
		const donde = retiene.existencias.map((existencia) => existencia.ubicacion).join(", ");
		throw errorDeRegla(
			"talla_con_existencia",
			`Todavía hay ${piezas} piezas de la talla ${talla} en ${donde}. Descontinúala: se vende hasta acabarla.`,
		);
	}
	if (retiene.reservas.length > 0) {
		const piezas = retiene.reservas.reduce((suma, reserva) => suma + reserva.piezas, 0);
		const documentos = [
			...new Set(retiene.reservas.map((reserva) => documentoDeReserva[reserva.motivo] ?? reserva.motivo)),
		];
		throw errorDeRegla(
			"talla_con_reservas",
			`La talla ${talla} tiene ${piezas} piezas apartadas (${documentos.join(", ")}). Espera a que se entreguen o se liberen.`,
		);
	}
}

export const accionDarBajaTalla = implementarAccion(darBajaTalla, async (contexto, datos, version) => {
	await revisarMotivo(contexto, datos.motivo);
	// Primero el candado de inventario de la variante (el mismo orden que un movimiento): ningún movimiento ni
	// reserva se cruza con la baja.
	const retiene = loQueRetiene.parse(
		await contexto.lectura("inventario.piezas_de_variante", { variante_id: datos.variante_id, bloquear: true }),
	);
	const { variante, producto } = await tallaConSuProducto(contexto, datos.variante_id, version);
	if (variante.bajaEn !== null)
		throw errorDeRegla("talla_dada_de_baja", `La talla ${variante.talla} ya está dada de baja.`);
	revisarQueNadaLaRetiene(variante.talla, retiene);
	await contexto.transaccion
		.update(variantes)
		.set({ bajaEn: contexto.ahora.toString(), bajaPor: quienCambia(contexto), motivoBaja: datos.motivo })
		.where(and(eq(variantes.id, variante.id), isNull(variantes.bajaEn)));
	contexto.bitacora({
		descripcion: `Talla ${variante.talla}, código ${variante.codigo}. ${datos.motivo}`,
		entidad: "productos",
		entidadId: producto.id,
		antes: { variante_id: variante.id, dada_de_baja: false },
		despues: { variante_id: variante.id, dada_de_baja: true, motivo: datos.motivo },
	});
	eventoDeProducto(contexto, "variante.dada_de_baja", producto, ["variantes"]);
	return respuestaDeTalla(
		contexto,
		producto,
		`Talla ${variante.talla} dada de baja. El código ${variante.codigo} no se vuelve a usar`,
	);
});
