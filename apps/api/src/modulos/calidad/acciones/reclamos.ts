/**
 * Las acciones de los reclamos: `calidad.registrar_reclamo` y `calidad.resolver_reclamo`.
 * Fase 13 · docs/modulos/calidad/reclamos-y-devoluciones.md (reglas 1 a 6, «Acciones»)
 *
 * Del código de la prenda se llega a la variante (`catalogo.variante_por_codigo`) y de ella a uno de sus lotes ya
 * revisados; la operación es una del flujo de ese lote que suele causar el defecto, y la persona se congela al
 * registrar (la que se escoja o la que propone `produccion.persona_que_la_hizo`). Los clientes y las notas de entrega
 * llegan con la fase 16: hasta entonces su id no se revisa contra su tabla.
 */

import { registrarReclamo, resolverReclamo } from "@uniformame/compartido/contratos/calidad/reclamos";
import { and, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { rastreoDeReclamo } from "../dominio/rastreo.ts";
import { defectos, reclamos, revisiones, revisionTallas } from "../tablas.ts";

/** Lo que regresa `catalogo.variante_por_codigo`. */
const deLaVariante = z
	.object({ variante_id: z.uuid(), producto_id: z.uuid(), producto: z.string(), talla_id: z.uuid(), talla: z.string() })
	.nullable();

/** Lo que regresa `produccion.persona_que_la_hizo`. */
const deLaPersona = z.object({ persona_id: z.uuid(), nombre: z.string() }).nullable();

export const accionRegistrarReclamo = implementarAccion(registrarReclamo, async (contexto, datos) => {
	const { transaccion } = contexto;
	// «Qué dice el cliente» con lo menos que pide la dueña (regla 4).
	const minimo = Number(await contexto.lectura("admin.parametro", { clave: "calidad.reclamo_min_letras" }));
	if (datos.que_dice_cliente.length < minimo) throw errorDeCampo("que_dice_cliente", "Escribe lo que dice el cliente.");
	// El de un cliente dice qué cliente; el de una tienda, qué tienda: una ubicación de tipo tienda (regla 1).
	if (datos.origen === "cliente_externo" && datos.cliente_id === undefined) {
		throw errorDeCampo("cliente_id", "Escoge el cliente.");
	}
	if (datos.origen === "tienda") {
		if (datos.ubicacion_id === undefined) throw errorDeCampo("ubicacion_id", "Escoge la tienda.");
		const [tienda] = await transaccion
			.select({ id: ubicaciones.id })
			.from(ubicaciones)
			.where(and(eq(ubicaciones.id, datos.ubicacion_id ?? ""), eq(ubicaciones.tipo, "tienda")));
		if (tienda === undefined) throw errorDeRegla("tienda_no_valida", "Escoge la tienda.");
	}
	// Del código a la variante, y de ella a uno de sus lotes revisados (regla 2).
	const variante = deLaVariante.parse(await contexto.lectura("catalogo.variante_por_codigo", { codigo: datos.codigo }));
	if (variante === null) throw errorDeRegla("codigo_desconocido", "Ese código no es de ninguna prenda.");
	const revisados = await transaccion
		.select({ loteId: revisiones.loteId })
		.from(revisiones)
		.innerJoin(revisionTallas, eq(revisionTallas.revisionId, revisiones.id))
		.where(eq(revisionTallas.varianteId, variante.variante_id));
	if (revisados.length === 0) {
		throw errorDeRegla("sin_lotes_revisados", "Esa prenda no tiene lotes revisados por Calidad.");
	}
	if (!revisados.some((revisado) => revisado.loteId === datos.lote_id)) {
		throw errorDeRegla("lote_no_corresponde", "Ese lote no tiene esa prenda revisada.");
	}
	// La operación: del flujo del lote, y ligada al defecto (regla 3).
	const [defecto] = await transaccion
		.select({ nombre: defectos.nombre })
		.from(defectos)
		.where(eq(defectos.id, datos.defecto_id));
	if (defecto === undefined) throw errorDeCampo("defecto_id", "Escoge el defecto.");
	const { rows } = await transaccion.execute(sql`
		SELECT 1 FROM lotes l
		JOIN flujo_operaciones f ON f.flujo_id = l.flujo_id AND f.id = ${datos.flujo_operacion_id}
		JOIN defecto_operaciones d ON d.operacion_id = f.operacion_id AND d.defecto_id = ${datos.defecto_id}
			AND d.baja_en IS NULL
		WHERE l.id = ${datos.lote_id}`);
	if (rows.length === 0) {
		throw errorDeRegla("operacion_no_ligada", `Esa operación no suele causar ese defecto en ${variante.producto}.`);
	}
	// La persona se congela: la que se escogió o la que propone Producción.
	const persona =
		datos.persona_id ??
		deLaPersona.parse(
			await contexto.lectura("produccion.persona_que_la_hizo", {
				lote_id: datos.lote_id,
				flujo_operacion_id: datos.flujo_operacion_id,
				variante_id: variante.variante_id,
			}),
		)?.persona_id ??
		null;
	const { folio } = z
		.object({ folio: z.string() })
		.parse(await contexto.interna("admin.tomar_folio", { tipo: "reclamo" }));
	const reclamoId = uuidv7();
	await transaccion.insert(reclamos).values({
		id: reclamoId,
		folio,
		fecha: contexto.diaDeNegocio.toString(),
		origen: datos.origen,
		clienteId: datos.origen === "cliente_externo" ? (datos.cliente_id ?? null) : null,
		ubicacionId: datos.origen === "tienda" ? (datos.ubicacion_id ?? null) : null,
		salidaTiendaId: datos.salida_tienda_id ?? null,
		notaEntregaId: datos.nota_entrega_id ?? null,
		varianteId: variante.variante_id,
		loteId: datos.lote_id,
		defectoId: datos.defecto_id,
		flujoOperacionId: datos.flujo_operacion_id,
		personaId: persona,
		piezas: datos.piezas,
		queDiceCliente: datos.que_dice_cliente,
		creadoPor: quienCambia(contexto),
	});
	const rastreo = await rastreoDeReclamo(contexto, {
		loteId: datos.lote_id,
		flujoOperacionId: datos.flujo_operacion_id,
		personaId: persona,
	});
	contexto.guardarEvento({
		tipo: "reclamo.registrado",
		datos: { reclamo_id: reclamoId, lote_id: datos.lote_id },
		tablas: ["reclamos"],
		entidad: "reclamos",
		entidadId: reclamoId,
		entidadFolio: folio,
	});
	// El nombre del cliente llega con los clientes (fase 16, decisión 624).
	const deQuien = datos.origen === "tienda" ? "una tienda" : "un cliente externo";
	contexto.bitacora({
		descripcion: `Registró el reclamo ${folio} de ${deQuien}: ${defecto.nombre}, ${datos.piezas} piezas, lote ${rastreo.lote}`,
		entidad: "reclamos",
		entidadId: reclamoId,
		entidadFolio: folio,
		despues: { ...datos, variante_id: variante.variante_id, persona_id: persona },
	});
	return {
		resultado: {
			mensaje: `${folio} registrado. Del código se llega al lote ${rastreo.lote}`,
			reclamo_id: reclamoId,
			folio,
			rastreo,
		},
		entidad: { nombre: "reclamos", id: reclamoId },
	};
});

export const accionResolverReclamo = implementarAccion(resolverReclamo, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const [reclamo] = await transaccion
		.select({ id: reclamos.id, folio: reclamos.folio, estado: reclamos.estado })
		.from(reclamos)
		.where(eq(reclamos.id, datos.reclamo_id));
	if (reclamo === undefined) throw noExiste();
	await tomarVersion(contexto, reclamos, reclamo.id, version, async () => ({
		reclamo_id: reclamo.id,
		estado: reclamo.estado,
	}));
	if (reclamo.estado === "resuelto") throw errorDeRegla("reclamo_ya_resuelto", "Ese reclamo ya está resuelto.");
	const resolucion = datos.resolucion === undefined || datos.resolucion === "" ? null : datos.resolucion;
	await transaccion
		.update(reclamos)
		.set({ estado: "resuelto", resueltoEn: contexto.ahora.toString(), resueltoPor: quienCambia(contexto), resolucion })
		.where(eq(reclamos.id, reclamo.id));
	contexto.guardarEvento({
		tipo: "reclamo.resuelto",
		datos: { reclamo_id: reclamo.id },
		tablas: ["reclamos"],
		entidad: "reclamos",
		entidadId: reclamo.id,
		entidadFolio: reclamo.folio,
	});
	contexto.bitacora({
		descripcion: `Marcó resuelto ${reclamo.folio}`,
		entidad: "reclamos",
		entidadId: reclamo.id,
		entidadFolio: reclamo.folio,
		antes: { estado: "por_resolver" },
		despues: { estado: "resuelto", resolucion },
	});
	return { resultado: { mensaje: `${reclamo.folio} queda resuelto` }, entidad: { nombre: "reclamos", id: reclamo.id } };
});
