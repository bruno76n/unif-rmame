/**
 * Las acciones de la orden de compra: levantarla en borrador, guardar el borrador, marcarla enviada, cancelarla o
 * descartarla, y cerrarla con faltante.
 * Fase 10 · docs/modulos/compras/ordenes-de-compra.md (reglas 1 a 12 y 16, «Acciones»)
 *
 * Un proveedor tiene un solo borrador: dos personas que levantan a la vez para el mismo proveedor esperan una a la
 * otra (un candado por proveedor) y la segunda suma al borrador de la primera. Al enviarla, el PDF se genera y se
 * guarda antes de confirmar: si falla, la orden no queda enviada.
 */

import { cantidadEnTexto } from "@uniformame/compartido/calculos/cuenta-material";
import { textoDeDia } from "@uniformame/compartido/calculos/fechas";
import {
	cancelarOrden,
	cerrarOrdenConFaltante,
	guardarBorradorOrden,
	levantarOrden,
	marcarOrdenEnviada,
} from "@uniformame/compartido/contratos/compras/ordenes";
import { and, eq, inArray, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { contextoDeDibujo, quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { subirVersion, tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import {
	eventoDeMaterial,
	leerMaterial,
	leerProveedor,
	precioATexto,
	registrarPrecio,
	revisarPrecio,
	revisarProveedorActivo,
} from "../dominio/comunes.ts";
import {
	eventoDeOrden,
	faltanteDeLineas,
	leerOrden,
	lineasDeOrdenes,
	type Orden,
	revisarCantidad,
	revisarFechaPrometida,
} from "../dominio/ordenes.ts";
import { materiales, materialProveedores, ordenCompraLineas, ordenesCompra } from "../tablas.ts";

/** Lo que regresa `admin.tomar_folio`. */
const folioTomado = z.object({ folio: z.string() });

/** Lo que regresa `admin.guardar_archivo`. */
const archivoGuardado = z.object({ archivo_id: z.uuid(), url: z.string() });

/** El tipo de la hoja de la orden de compra (la registra Compras en la fase 20; en las pruebas, el de prueba). */
const hojaDeLaOrden = "orden_compra";

/** El mensaje del precio de una línea. */
const mensajeDelPrecio = "Escribe el precio.";

/**
 * El aviso de un precio distinto del último que se le pagó a ese proveedor por ese material.
 * @returns «{material}: sube {n} % · antes ${precio}» o «baja…», o nada si es el mismo o no hay anterior.
 */
function avisoDePrecio(material: string, anterior: number | undefined, nuevo: number): string[] {
	if (anterior === undefined || anterior === nuevo) return [];
	const cambio = Math.round((Math.abs(nuevo - anterior) * 100) / anterior);
	return [`${material}: ${nuevo > anterior ? "sube" : "baja"} ${cambio} % · antes ${precioATexto(anterior)}`];
}

/**
 * Busca el borrador de un proveedor o lo crea, con un candado por proveedor: quien llega segundo ve el de quien
 * llegó primero.
 * @returns La orden y si nació.
 */
async function borradorDe(
	contexto: ContextoDeAccion,
	proveedor: { id: string; diasDiceTardar: number },
): Promise<{ id: string; folio: string; nueva: boolean }> {
	const { transaccion } = contexto;
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`borrador:${proveedor.id}`}, 0))`);
	const [existente] = await transaccion
		.select({ id: ordenesCompra.id, folio: ordenesCompra.folio })
		.from(ordenesCompra)
		.where(and(eq(ordenesCompra.proveedorId, proveedor.id), eq(ordenesCompra.estado, "borrador")))
		.for("update");
	if (existente !== undefined) return { ...existente, nueva: false };
	const { folio } = folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "orden_compra" }));
	const id = uuidv7();
	await transaccion.insert(ordenesCompra).values({
		id,
		folio,
		proveedorId: proveedor.id,
		fecha: contexto.diaDeNegocio.toString(),
		fechaPrometida: contexto.diaDeNegocio.add({ days: proveedor.diasDiceTardar }).toString(),
		creadoPor: quienCambia(contexto),
	});
	return { id, folio, nueva: true };
}

export const accionLevantarOrden = implementarAccion(levantarOrden, async (contexto, datos) => {
	const { transaccion } = contexto;
	const materialIds = [...new Set(datos.renglones.map((renglon) => renglon.material_id))];
	const deMateriales = await transaccion
		.select()
		.from(materiales)
		.where(inArray(materiales.id, materialIds))
		.for("share");
	const materialDe = new Map(deMateriales.map((material) => [material.id, material]));
	// Por proveedor, en orden por id: así dos que levantan para los mismos proveedores toman sus candados igual.
	const porProveedor = new Map<string, typeof datos.renglones>();
	for (const renglon of datos.renglones) {
		porProveedor.set(renglon.proveedor_id, [...(porProveedor.get(renglon.proveedor_id) ?? []), renglon]);
	}
	const ordenes: { orden_id: string; folio: string; proveedor: string; resultado: "nueva" | "sumada" }[] = [];
	const avisos: string[] = [];
	for (const proveedorId of [...porProveedor.keys()].sort()) {
		const proveedor = await leerProveedor(contexto, proveedorId, "share");
		revisarProveedorActivo(proveedor);
		const renglones = porProveedor.get(proveedorId) ?? [];
		const vistos = new Set<string>();
		for (const renglon of renglones) {
			const material = materialDe.get(renglon.material_id);
			if (material === undefined) throw errorDeCampo("renglones", "Escoge el material.");
			if (material.bajaEn !== null)
				throw errorDeRegla("material_dado_de_baja", `${material.nombre} está dado de baja.`);
			if (vistos.has(material.id)) {
				throw errorDeRegla("material_repetido", `${material.nombre} está dos veces con ${proveedor.nombre}.`);
			}
			vistos.add(material.id);
			await revisarCantidad(contexto, material, renglon.cantidad);
			await revisarPrecio(contexto, "renglones", mensajeDelPrecio, renglon.precio_centavos);
		}
		const orden = await borradorDe(contexto, proveedor);
		const ultimos = await transaccion
			.select({ materialId: materialProveedores.materialId, precio: materialProveedores.ultimoPrecioCentavos })
			.from(materialProveedores)
			.where(
				and(
					eq(materialProveedores.proveedorId, proveedor.id),
					inArray(
						materialProveedores.materialId,
						renglones.map((renglon) => renglon.material_id),
					),
				),
			);
		// Si el material ya estaba en el borrador, cambian su cantidad y su precio.
		for (const renglon of renglones) {
			await transaccion
				.insert(ordenCompraLineas)
				.values({
					id: uuidv7(),
					ordenCompraId: orden.id,
					materialId: renglon.material_id,
					cantidad: String(renglon.cantidad),
					precioOrdenCentavos: renglon.precio_centavos,
					creadoPor: quienCambia(contexto),
				})
				.onConflictDoUpdate({
					target: [ordenCompraLineas.ordenCompraId, ordenCompraLineas.materialId],
					set: { cantidad: String(renglon.cantidad), precioOrdenCentavos: renglon.precio_centavos },
				});
			const anterior = ultimos.find((ultimo) => ultimo.materialId === renglon.material_id)?.precio;
			avisos.push(
				...avisoDePrecio(materialDe.get(renglon.material_id)?.nombre ?? "", anterior, renglon.precio_centavos),
			);
		}
		if (!orden.nueva) await subirVersion(transaccion, ordenesCompra, orden.id);
		const nombres = renglones.map((renglon) => materialDe.get(renglon.material_id)?.nombre ?? "").join(", ");
		contexto.bitacora({
			descripcion: orden.nueva
				? `Levantó ${orden.folio} con ${proveedor.nombre}: ${nombres}`
				: `Sumó ${nombres} al borrador ${orden.folio}`,
			entidad: "ordenes_compra",
			entidadId: orden.id,
			entidadFolio: orden.folio,
			despues: {
				renglones: renglones.map((renglon) => ({
					material_id: renglon.material_id,
					cantidad: renglon.cantidad,
					precio_centavos: renglon.precio_centavos,
				})),
			},
		});
		eventoDeOrden(contexto, "orden_compra.levantada", orden);
		ordenes.push({
			orden_id: orden.id,
			folio: orden.folio,
			proveedor: proveedor.nombre,
			resultado: orden.nueva ? "nueva" : "sumada",
		});
	}
	const [unica] = ordenes;
	const folios = ordenes.map((orden) => orden.folio);
	return {
		resultado: {
			ordenes,
			mensaje:
				ordenes.length === 1 && unica !== undefined
					? `${unica.folio} quedó en borrador con ${unica.proveedor}`
					: `${ordenes.length} órdenes quedaron en borrador: ${folios.slice(0, -1).join(", ")} y ${folios.at(-1)}`,
		},
		avisos,
		...(unica !== undefined && ordenes.length === 1
			? { entidad: { nombre: "ordenes_compra", id: unica.orden_id } }
			: {}),
	};
});

/**
 * Lee el borrador con su versión tomada.
 * @throws `422 orden_no_es_borrador`: «{OC} ya se envió: después de enviada no cambia.».
 */
async function borradorConSuVersion(
	contexto: ContextoDeAccion,
	id: string,
	version: number | undefined,
): Promise<Orden> {
	const orden = await leerOrden(contexto, id);
	await tomarVersion(contexto, ordenesCompra, orden.id, version, async () => ({
		orden_compra_id: orden.id,
		estado: orden.estado,
	}));
	if (orden.estado !== "borrador") {
		throw errorDeRegla("orden_no_es_borrador", `${orden.folio} ya se envió: después de enviada no cambia.`);
	}
	return orden;
}

/**
 * Guarda en el borrador lo que se ve en el cajón: cada línea con su cantidad y su precio, y la fecha prometida.
 * @returns Las líneas como quedaron.
 */
async function guardarLoDelCajon(
	contexto: ContextoDeAccion,
	orden: Orden,
	datos: z.output<typeof guardarBorradorOrden.entrada>,
) {
	const { transaccion } = contexto;
	await revisarFechaPrometida(contexto, datos.fecha_prometida);
	const lineas = await lineasDeOrdenes(transaccion, [orden.id]);
	for (const renglon of datos.renglones) {
		const linea = lineas.find((suya) => suya.id === renglon.orden_compra_linea_id);
		if (linea === undefined) throw errorDeCampo("renglones", "Esa línea no es de la orden.");
		await revisarCantidad(contexto, linea, renglon.cantidad);
		await revisarPrecio(contexto, "renglones", mensajeDelPrecio, renglon.precio_centavos);
		await transaccion
			.update(ordenCompraLineas)
			.set({ cantidad: String(renglon.cantidad), precioOrdenCentavos: renglon.precio_centavos })
			.where(eq(ordenCompraLineas.id, linea.id));
	}
	await transaccion
		.update(ordenesCompra)
		.set({ fechaPrometida: datos.fecha_prometida })
		.where(eq(ordenesCompra.id, orden.id));
	return lineasDeOrdenes(transaccion, [orden.id]);
}

export const accionGuardarBorradorOrden = implementarAccion(guardarBorradorOrden, async (contexto, datos, version) => {
	const orden = await borradorConSuVersion(contexto, datos.orden_compra_id, version);
	await guardarLoDelCajon(contexto, orden, datos);
	eventoDeOrden(contexto, "orden_compra.cambiada", orden);
	return {
		resultado: {
			mensaje: `Borrador ${orden.folio} guardado`,
			version: await versionActual(contexto.transaccion, ordenesCompra, orden.id),
		},
		entidad: { nombre: "ordenes_compra", id: orden.id },
		// Guardar un borrador no deja renglón de bitácora.
		sinBitacora: true,
	};
});

/**
 * Genera y guarda el PDF de la orden, antes de confirmar: si falla, la acción falla y la orden no queda enviada.
 * @returns El archivo y su dirección firmada.
 */
async function guardarPdf(contexto: ContextoDeAccion, orden: Orden) {
	const tipo = contexto.registro.tiposDeEtiqueta.get(hojaDeLaOrden);
	if (tipo === undefined) throw new Error(`no está registrada la hoja ${hojaDeLaOrden}`);
	const pdf = await tipo.dibujar(contextoDeDibujo(contexto), { ids: [orden.id], formato: "pdf", copias: 1 });
	return archivoGuardado.parse(
		await contexto.interna("admin.guardar_archivo", {
			contenido: typeof pdf === "string" ? new TextEncoder().encode(pdf) : pdf,
			proposito: "pdf_documento",
			modulo: "compras",
			entidad: "ordenes_compra",
			entidad_id: orden.id,
			nombre_original: `${orden.folio}.pdf`,
			tipo_mime: "application/pdf",
		}),
	);
}

export const accionMarcarOrdenEnviada = implementarAccion(marcarOrdenEnviada, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const orden = await borradorConSuVersion(contexto, datos.orden_compra_id, version);
	const proveedor = await leerProveedor(contexto, orden.proveedorId, "share");
	revisarProveedorActivo(proveedor);
	const lineas = await guardarLoDelCajon(contexto, orden, datos);
	const pdf = await guardarPdf(contexto, orden);
	await transaccion
		.update(ordenesCompra)
		.set({
			estado: "enviada",
			enviadaEn: contexto.ahora.toString(),
			enviadaPor: quienCambia(contexto),
			diasCredito: proveedor.diasCredito,
			pdfArchivoId: pdf.archivo_id,
		})
		.where(eq(ordenesCompra.id, orden.id));
	// Cada precio distinto del último con ese proveedor (o el primero con él) entra al historial; y el proveedor
	// queda entre los que surten cada material de la orden. Sus proveedores son parte del material: se bloquea antes,
	// en el orden de su id (como quien agrega un proveedor), y si cambian sube su versión y se avisa.
	for (const materialId of [...new Set(lineas.map((linea) => linea.materialId))].sort()) {
		await leerMaterial(contexto, materialId);
	}
	const nuevos: { material: string; precio_centavos: number; anterior: number | null }[] = [];
	const cambiados = new Set<string>();
	for (const linea of lineas) {
		const [par] = await transaccion
			.select({
				id: materialProveedores.id,
				ultimo: materialProveedores.ultimoPrecioCentavos,
				bajaEn: materialProveedores.bajaEn,
			})
			.from(materialProveedores)
			.where(
				and(eq(materialProveedores.materialId, linea.materialId), eq(materialProveedores.proveedorId, proveedor.id)),
			);
		if (par === undefined || par.ultimo !== linea.precioOrdenCentavos) {
			const anterior = await registrarPrecio(contexto, {
				materialId: linea.materialId,
				proveedorId: proveedor.id,
				precioCentavos: linea.precioOrdenCentavos,
				origen: "orden",
				orden: { id: orden.id, lineaId: linea.id },
			});
			nuevos.push({ material: linea.material, precio_centavos: linea.precioOrdenCentavos, anterior });
			cambiados.add(linea.materialId);
		} else if (par.bajaEn !== null) {
			await transaccion
				.update(materialProveedores)
				.set({ bajaEn: null, bajaPor: null, motivoBaja: null, reactivadoEn: contexto.ahora.toString() })
				.where(eq(materialProveedores.id, par.id));
			cambiados.add(linea.materialId);
		}
	}
	for (const materialId of cambiados) {
		await subirVersion(transaccion, materiales, materialId);
		eventoDeMaterial(contexto, "material.cambiado", materialId);
	}
	const promete = textoDeDia(datos.fecha_prometida);
	contexto.bitacora({
		descripcion: `Mandó ${orden.folio} a ${proveedor.nombre}. Promete llegar el ${promete}`,
		entidad: "ordenes_compra",
		entidadId: orden.id,
		entidadFolio: orden.folio,
		despues: { estado: "enviada", fecha_prometida: datos.fecha_prometida, dias_credito: proveedor.diasCredito },
	});
	for (const nuevo of nuevos) {
		const antes = nuevo.anterior === null ? "" : `${precioATexto(nuevo.anterior)} → `;
		contexto.bitacora({
			descripcion: `Precio de ${nuevo.material} con ${proveedor.nombre}: ${antes}${precioATexto(nuevo.precio_centavos)} (${orden.folio})`,
			entidad: "ordenes_compra",
			entidadId: orden.id,
			entidadFolio: orden.folio,
		});
	}
	eventoDeOrden(contexto, "orden_compra.enviada", orden);
	const conPrecios =
		nuevos.length === 0
			? ""
			: `. Precio nuevo: ${nuevos.map((nuevo) => `${nuevo.material} a ${precioATexto(nuevo.precio_centavos)}`).join(", ")}`;
	return {
		resultado: {
			precios_nuevos: nuevos.map(({ material, precio_centavos }) => ({ material, precio_centavos })),
			pdf_url: pdf.url,
			mensaje: `${orden.folio} enviada a ${proveedor.nombre}. Promete llegar el ${promete}${conPrecios}`,
			version: await versionActual(transaccion, ordenesCompra, orden.id),
		},
		entidad: { nombre: "ordenes_compra", id: orden.id },
	};
});

/**
 * Lee una orden con su versión tomada.
 * @param contexto El contexto de la acción.
 * @param id La orden.
 * @param version La versión que se leyó.
 */
async function ordenConSuVersion(contexto: ContextoDeAccion, id: string, version: number | undefined): Promise<Orden> {
	const orden = await leerOrden(contexto, id);
	await tomarVersion(contexto, ordenesCompra, orden.id, version, async () => ({
		orden_compra_id: orden.id,
		estado: orden.estado,
	}));
	return orden;
}

/** Cómo se dice cada estado terminado en los mensajes. */
const estadoEnTexto: Readonly<Record<string, string>> = {
	recibida: "recibida",
	cerrada: "cerrada",
	cerrada_con_faltante: "cerrada con faltante",
	cancelada: "cancelada",
};

export const accionCancelarOrden = implementarAccion(cancelarOrden, async (contexto, datos, version) => {
	await revisarMotivo(contexto, datos.motivo);
	const orden = await ordenConSuVersion(contexto, datos.orden_compra_id, version);
	if (orden.estado === "recibida_en_parte") {
		throw errorDeRegla("orden_recibida_en_parte", `${orden.folio} ya recibió material: ciérrala con faltante.`);
	}
	if (orden.estado !== "borrador" && orden.estado !== "enviada") {
		throw errorDeRegla(
			"orden_terminada",
			`${orden.folio} ya está ${estadoEnTexto[orden.estado] ?? orden.estado}: no se cancela.`,
		);
	}
	const esBorrador = orden.estado === "borrador";
	await contexto.transaccion
		.update(ordenesCompra)
		.set({
			estado: "cancelada",
			canceladoEn: contexto.ahora.toString(),
			canceladoPor: quienCambia(contexto),
			motivoCancelacion: datos.motivo,
			// Un borrador descartado queda «Sin fecha».
			...(esBorrador ? { fechaPrometida: null } : {}),
		})
		.where(eq(ordenesCompra.id, orden.id));
	contexto.bitacora({
		descripcion: esBorrador
			? `Descartó el borrador ${orden.folio}: ${datos.motivo}`
			: `Canceló ${orden.folio}: ${datos.motivo}`,
		entidad: "ordenes_compra",
		entidadId: orden.id,
		entidadFolio: orden.folio,
		antes: { estado: orden.estado },
		despues: { estado: "cancelada", motivo: datos.motivo },
	});
	eventoDeOrden(contexto, "orden_compra.cancelada", orden);
	return {
		resultado: {
			mensaje: esBorrador
				? `${orden.folio} descartada. Queda en el historial con su motivo`
				: `${orden.folio} cancelada. Lo que faltaba ya no cuenta como en camino`,
			version: await versionActual(contexto.transaccion, ordenesCompra, orden.id),
		},
		entidad: { nombre: "ordenes_compra", id: orden.id },
	};
});

export const accionCerrarOrdenConFaltante = implementarAccion(
	cerrarOrdenConFaltante,
	async (contexto, datos, version) => {
		await revisarMotivo(contexto, datos.motivo);
		const orden = await ordenConSuVersion(contexto, datos.orden_compra_id, version);
		if (orden.estado !== "recibida_en_parte") {
			throw errorDeRegla(
				"orden_no_recibida_en_parte",
				`${orden.folio} no está recibida en parte: solo esas se cierran con faltante.`,
			);
		}
		const lineas = await lineasDeOrdenes(contexto.transaccion, [orden.id]);
		const faltante = await faltanteDeLineas(contexto, lineas);
		const loQueFalto = lineas
			.filter((linea) => (faltante.get(linea.id) ?? 0n) > 0n)
			.map((linea) => `${cantidadEnTexto(faltante.get(linea.id) ?? 0n)} ${linea.unidad} de ${linea.material}`)
			.join(", ");
		await contexto.transaccion
			.update(ordenesCompra)
			.set({
				estado: "cerrada_con_faltante",
				cerradaEn: contexto.ahora.toString(),
				cerradaPor: quienCambia(contexto),
				motivoCierre: datos.motivo,
			})
			.where(eq(ordenesCompra.id, orden.id));
		contexto.bitacora({
			descripcion: `Cerró ${orden.folio} con faltante (${loQueFalto}): ${datos.motivo}`,
			entidad: "ordenes_compra",
			entidadId: orden.id,
			entidadFolio: orden.folio,
			antes: { estado: orden.estado },
			despues: { estado: "cerrada_con_faltante", motivo: datos.motivo },
		});
		eventoDeOrden(contexto, "orden_compra.cerrada_con_faltante", orden);
		const primeraLetra = loQueFalto.charAt(0).toUpperCase() + loQueFalto.slice(1);
		return {
			resultado: {
				mensaje: `${orden.folio} cerrada con faltante. ${primeraLetra} ya no cuenta como en camino`,
				version: await versionActual(contexto.transaccion, ordenesCompra, orden.id),
			},
			entidad: { nombre: "ordenes_compra", id: orden.id },
		};
	},
);
