/**
 * `catalogo.imprimir_etiquetas`: el PDF de las etiquetas de prenda, por variante o de unos productos.
 * Fase 8 · docs/modulos/catalogo/variantes-codigos-y-etiquetas.md (reglas 4 a 6, «`catalogo.imprimir_etiquetas`»)
 *
 * El PDF se dibuja con el tipo de etiqueta `prenda` y se guarda antes de confirmar: si algo falla, nada queda
 * marcado. Las variantes por imprimir o por reimprimir que entraron pasan a impresas y su producto sube de
 * versión; las ya impresas no cambian. Un renglón de bitácora por producto. El dibujo de la etiqueta llega en la
 * fase 20 (decisión 451).
 */

import { imprimirEtiquetas } from "@uniformame/compartido/contratos/catalogo/etiquetas";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, type ContextoDeConsulta, implementarAccion } from "../../../nucleo/modulos.ts";
import { quienCambia } from "../dominio/comunes.ts";
import { subirVersionDelProducto } from "../dominio/precios.ts";
import { productos, tallas, variantes } from "../tablas.ts";

/** El tipo de etiqueta con que se dibujan las prendas. */
const tipoDeEtiquetaDePrenda = "prenda";

/** Lo que regresa `admin.guardar_archivo`. */
const archivoGuardado = z.object({ archivo_id: z.uuid(), url: z.string() });

/**
 * Las variantes con lo que hace falta para etiquetarlas. Primero bloquea sus productos, en orden por id, y luego
 * las variantes: el mismo orden que siguen las tallas, el alta y «Aplicar cambios».
 */
async function leerVariantes(
	contexto: ContextoDeAccion,
	donde: ReturnType<typeof and>,
	productoIds?: readonly string[],
) {
	// Con productos, se bloquean esos; por variante, los de esas variantes.
	const suyos =
		productoIds?.map((id) => ({ id })) ??
		(await contexto.transaccion.selectDistinct({ id: variantes.productoId }).from(variantes).where(donde));
	if (suyos.length > 0) {
		await contexto.transaccion
			.select({ id: productos.id })
			.from(productos)
			.where(
				inArray(
					productos.id,
					suyos.map((producto) => producto.id),
				),
			)
			.orderBy(productos.id)
			.for("update");
	}
	return contexto.transaccion
		.select({
			id: variantes.id,
			productoId: variantes.productoId,
			producto: productos.nombre,
			talla: tallas.nombre,
			esPedidoEspecial: variantes.esPedidoEspecial,
			estado: variantes.estadoEtiqueta,
			descontinuadaEn: variantes.descontinuadaEn,
			bajaEn: variantes.bajaEn,
		})
		.from(variantes)
		.innerJoin(productos, eq(productos.id, variantes.productoId))
		.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
		.where(donde)
		.orderBy(productos.nombre, tallas.orden)
		.for("update", { of: variantes });
}

/**
 * Lo que entra al PDF: por variante, cuántas etiquetas.
 * @throws `400` si una pide más de `catalogo.etiquetas_max_por_talla` o el total es cero; con `renglones`,
 * `422 talla_especial`, `talla_dada_de_baja` o `talla_descontinuada`.
 */
async function queEntra(contexto: ContextoDeAccion, datos: z.infer<typeof imprimirEtiquetas.entrada>) {
	const pendiente = (estado: string) => estado === "por_imprimir" || estado === "por_reimprimir";
	if (datos.producto_ids !== undefined) {
		// Con productos, las tallas que no se etiquetan simplemente no entran.
		const activas = await leerVariantes(
			contexto,
			and(
				inArray(variantes.productoId, datos.producto_ids),
				eq(variantes.esPedidoEspecial, false),
				isNull(variantes.descontinuadaEn),
				isNull(variantes.bajaEn),
			),
			datos.producto_ids,
		);
		return activas
			.filter((variante) => datos.solo_pendientes !== true || pendiente(variante.estado))
			.map((variante) => ({ variante, cuantas: 1 }));
	}
	const renglones = datos.renglones ?? [];
	const maximo = Number(await contexto.lectura("admin.parametro", { clave: "catalogo.etiquetas_max_por_talla" }));
	const leidas = await leerVariantes(
		contexto,
		and(
			inArray(
				variantes.id,
				renglones.map((renglon) => renglon.variante_id),
			),
		),
	);
	return renglones
		.map((renglon) => {
			const variante = leidas.find((leida) => leida.id === renglon.variante_id);
			if (variante === undefined) throw noExiste();
			if (renglon.cuantas > maximo) throw errorDeCampo("renglones", `Hasta ${maximo} etiquetas de una talla.`);
			if (variante.esPedidoEspecial) {
				throw errorDeRegla(
					"talla_especial",
					`La talla ${variante.talla} es de pedido especial: se etiqueta al fabricar el pedido.`,
				);
			}
			if (variante.bajaEn !== null) {
				throw errorDeRegla(
					"talla_dada_de_baja",
					`La talla ${variante.talla} está dada de baja: su código ya no se imprime.`,
				);
			}
			if (variante.descontinuadaEn !== null) {
				throw errorDeRegla("talla_descontinuada", `La talla ${variante.talla} está descontinuada: ya no se etiqueta.`);
			}
			return { variante, cuantas: renglon.cuantas };
		})
		.filter(({ variante }) => datos.solo_pendientes !== true || pendiente(variante.estado));
}

/**
 * El contexto con que se dibuja la etiqueta: el de la acción, como lo ve quien la pide. Dibujar no apunta
 * consultas sensibles: la etiqueta de prenda no lleva ninguna.
 * @throws Si la pide el sistema: las etiquetas siempre las pide una cuenta.
 */
function contextoDeDibujo(contexto: ContextoDeAccion): ContextoDeConsulta {
	const { quien } = contexto;
	if (quien.tipo === "sistema") throw new Error("las etiquetas las pide una cuenta");
	return {
		base: contexto.transaccion,
		quien,
		ahora: contexto.ahora,
		diaDeNegocio: contexto.diaDeNegocio,
		apuntarConsultaSensible: async () => undefined,
	};
}

export const accionImprimirEtiquetas = implementarAccion(imprimirEtiquetas, async (contexto, datos) => {
	const { transaccion } = contexto;
	// Una de las dos listas: por variante o por producto.
	if ((datos.renglones === undefined) === (datos.producto_ids === undefined)) {
		throw errorDeCampo("renglones", "Sin etiquetas");
	}
	const entran = await queEntra(contexto, datos);
	const total = entran.reduce((suma, renglon) => suma + renglon.cuantas, 0);
	if (total === 0) throw errorDeCampo("renglones", "Sin etiquetas");
	const tipo = contexto.registro.tiposDeEtiqueta.get(tipoDeEtiquetaDePrenda);
	if (tipo === undefined) throw new Error(`no está registrado el tipo de etiqueta ${tipoDeEtiquetaDePrenda}`);
	// El PDF primero, y guardado antes de marcar nada: si falla, la acción falla y nada queda marcado.
	const pdf = await tipo.dibujar(contextoDeDibujo(contexto), {
		ids: entran.flatMap(({ variante, cuantas }) => Array.from({ length: cuantas }, () => variante.id)),
		formato: "pdf",
		copias: 1,
	});
	const productosDelPdf = [...new Map(entran.map(({ variante }) => [variante.productoId, variante.producto]))];
	const [unico] = productosDelPdf;
	const guardado = archivoGuardado.parse(
		await contexto.interna("admin.guardar_archivo", {
			contenido: typeof pdf === "string" ? new TextEncoder().encode(pdf) : pdf,
			proposito: "etiqueta",
			modulo: "catalogo",
			nombre_original:
				productosDelPdf.length === 1 && unico !== undefined ? `etiquetas-${unico[1]}.pdf` : "etiquetas.pdf",
			tipo_mime: "application/pdf",
		}),
	);
	// Las pendientes pasan a impresas, y su producto sube de versión.
	const pendientes = entran
		.map(({ variante }) => variante)
		.filter((variante) => variante.estado === "por_imprimir" || variante.estado === "por_reimprimir");
	if (pendientes.length > 0) {
		await transaccion
			.update(variantes)
			.set({
				estadoEtiqueta: "impresa",
				etiquetaImpresaEn: contexto.ahora.toString(),
				etiquetaImpresaPor: quienCambia(contexto),
				reimprimirDesde: null,
			})
			.where(inArray(variantes.id, [...new Set(pendientes.map((variante) => variante.id))]));
		for (const productoId of new Set(pendientes.map((variante) => variante.productoId))) {
			await subirVersionDelProducto(transaccion, productoId);
		}
	}
	for (const [productoId, nombre] of productosDelPdf) {
		const deEste = entran.filter(({ variante }) => variante.productoId === productoId);
		const cuantas = deEste.reduce((suma, renglon) => suma + renglon.cuantas, 0);
		contexto.bitacora({
			descripcion: `Imprimió ${cuantas} etiquetas de ${nombre}`,
			entidad: "productos",
			entidadId: productoId,
			despues: { archivo_id: guardado.archivo_id, etiquetas: cuantas },
		});
	}
	contexto.guardarEvento({
		tipo: "etiquetas.impresas",
		datos: { archivo_id: guardado.archivo_id, etiquetas: total },
		tablas: ["variantes"],
		entidad: "archivos",
		entidadId: guardado.archivo_id,
	});
	return {
		resultado: {
			archivo_id: guardado.archivo_id,
			url: guardado.url,
			etiquetas: total,
			mensaje:
				datos.solo_pendientes === true && productosDelPdf.length === 1 && unico !== undefined
					? `PDF de ${total} etiquetas de ${unico[1]} listo. Ya se pueden recibir en las tiendas`
					: `PDF de ${total} etiquetas listo`,
		},
		entidad: { nombre: "archivos", id: guardado.archivo_id },
	};
});
