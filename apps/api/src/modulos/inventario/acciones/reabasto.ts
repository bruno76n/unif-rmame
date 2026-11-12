/**
 * `inventario.mover_a_tienda` e `inventario.sugerir_fabricar`: Bodega mueve a las tiendas lo que les falta y le sugiere
 * a Producción lo que hay que fabricar.
 * Fase 14 · docs/modulos/inventario/minimos-y-reabasto.md (reglas 9 a 12, «Acciones»)
 *
 * «Mover» toma primero el candado de cada variante y nunca pasa de los libres de Bodega en ese momento: dos «Mover» a
 * la vez se ponen en fila y el segundo ve lo que dejó el primero. Cada llamada hace un A- `reabasto` por tienda; antes
 * de buscar el RB- del día toma el candado del reabasto de esa tienda y ese día, así dos «Mover» a la vez comparten el
 * mismo. Los candados de las tiendas se toman todos, en orden, antes de cualquier folio (decisión 658). Una tienda sin
 * caja recibe igual (regla 12).
 */

import { moverATienda, sugerirFabricar } from "@uniformame/compartido/contratos/inventario/reabasto";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { candadoDeVariantes } from "../dominio/candados.ts";
import { escribirMovimiento } from "../dominio/escribir-movimiento.ts";
import { ubicacionDeTipo } from "../dominio/recepciones.ts";
import { libresEn, nombreDeVariante } from "../dominio/reservas.ts";
import { crearTraspaso } from "../dominio/traspasos.ts";
import { minimos, sugerenciasReabasto, traspasos, ubicaciones } from "../tablas.ts";

/** Toma el candado del reabasto de una tienda y del día: dos «Mover» a esa tienda se ponen en fila. */
async function candadoDeReabasto(contexto: ContextoDeAccion, tiendaId: string): Promise<void> {
	const hoy = contexto.diaDeNegocio.toString();
	await contexto.transaccion.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${`reabasto:${tiendaId}:${hoy}`}, 0))`,
	);
}

/**
 * El RB- de una tienda para hoy: el de los «Mover» de hoy a esa tienda o, si no hay, uno nuevo. Quien lo pide ya tiene
 * el candado del reabasto de esa tienda.
 */
async function reabastoDeHoy(contexto: ContextoDeAccion, tiendaId: string): Promise<string> {
	const { transaccion } = contexto;
	const hoy = contexto.diaDeNegocio.toString();
	const [deHoy] = await transaccion
		.select({ folioRb: traspasos.folioRb })
		.from(traspasos)
		.where(
			and(
				eq(traspasos.tipo, "reabasto"),
				eq(traspasos.destinoUbicacionId, tiendaId),
				isNotNull(traspasos.folioRb),
				sql`(${traspasos.enviadoEn} AT TIME ZONE 'America/Mexico_City')::date = ${hoy}::date`,
			),
		)
		.limit(1);
	if (deHoy?.folioRb != null) return deHoy.folioRb;
	return z.object({ folio: z.string() }).parse(await contexto.interna("admin.tomar_folio", { tipo: "reabasto" })).folio;
}

export const accionMoverATienda = implementarAccion(moverATienda, async (contexto, datos) => {
	const { transaccion } = contexto;
	const destinos = [...new Set(datos.renglones.map((renglon) => renglon.ubicacion_destino_id))];
	const tiendas = await transaccion
		.select({ id: ubicaciones.id, nombre: ubicaciones.nombre })
		.from(ubicaciones)
		.where(and(inArray(ubicaciones.id, destinos), eq(ubicaciones.tipo, "tienda"), isNull(ubicaciones.bajaEn)));
	if (tiendas.length !== destinos.length) throw errorDeRegla("destino_no_tienda", "Escoge a qué tienda va.");
	// Lo disponible en Bodega, con el candado de cada variante: nunca se mueve de más (regla 9).
	await candadoDeVariantes(
		transaccion,
		datos.renglones.map((renglon) => renglon.variante_id),
	);
	const bodega = await ubicacionDeTipo(transaccion, "bodega");
	const enCamino = await ubicacionDeTipo(transaccion, "en_camino_aduana");
	const disponible = new Map<string, number>();
	for (const id of new Set(datos.renglones.map((renglon) => renglon.variante_id))) {
		disponible.set(id, Math.max(0, await libresEn(transaccion, bodega, id)));
	}
	const avisos: string[] = [];
	const movidos: { varianteId: string; tiendaId: string; piezas: number }[] = [];
	for (const renglon of datos.renglones) {
		const hay = disponible.get(renglon.variante_id) ?? 0;
		const piezas = Math.min(renglon.piezas, hay);
		disponible.set(renglon.variante_id, hay - piezas);
		if (piezas < renglon.piezas) {
			const { prenda, talla } = await nombreDeVariante(transaccion, renglon.variante_id);
			avisos.push(`${prenda} talla ${talla}: solo se movieron ${piezas}`);
		}
		if (piezas > 0) movidos.push({ varianteId: renglon.variante_id, tiendaId: renglon.ubicacion_destino_id, piezas });
	}
	if (movidos.length === 0) {
		const [primero] = datos.renglones;
		const { prenda, talla } = await nombreDeVariante(transaccion, primero?.variante_id ?? "");
		throw errorDeRegla("sin_libres", `${prenda} talla ${talla}: solo hay 0 libres en bodega.`);
	}
	// Los candados del reabasto de cada tienda y su RB- de hoy, todos antes de crear cualquier A-, en orden de tienda:
	// dos «Mover» a la vez nunca se cruzan con el folio A- (decisión 658).
	const conPiezas = tiendas
		.filter((tienda) => movidos.some((movido) => movido.tiendaId === tienda.id))
		.sort((una, otra) => (una.id < otra.id ? -1 : una.id > otra.id ? 1 : 0));
	for (const tienda of conPiezas) await candadoDeReabasto(contexto, tienda.id);
	const rbDe = new Map<string, string>();
	for (const tienda of conPiezas) rbDe.set(tienda.id, await reabastoDeHoy(contexto, tienda.id));
	// Un A- por tienda, con su RB-, y su movimiento de Bodega a En camino a aduana.
	const hechos: { traspaso_id: string; folio: string; folio_rb: string; tienda: string }[] = [];
	for (const [i, tienda] of conPiezas.entries()) {
		const suyos = movidos.filter((movido) => movido.tiendaId === tienda.id);
		const folioRb = rbDe.get(tienda.id) ?? "";
		const nuevo = await crearTraspaso(contexto, {
			tipo: "reabasto",
			estado: "en_camino_aduana",
			origen: { ubicacionId: bodega },
			destino: { ubicacionId: tienda.id },
			renglones: suyos.map((suyo) => ({ varianteId: suyo.varianteId, piezas: suyo.piezas })),
			referencias: { folioRb },
		});
		await escribirMovimiento(contexto, {
			tipo: "surtido_bodega",
			documento: { tipo: "traspaso", id: nuevo.traspasoId, folio: nuevo.folio },
			renglones: suyos.map((suyo) => ({
				origen: bodega,
				destino: enCamino,
				varianteId: suyo.varianteId,
				piezas: suyo.piezas,
				traspasoId: nuevo.traspasoId,
			})),
			numero: i + 1,
		});
		contexto.guardarEvento({
			tipo: "traspaso.en_camino_aduana",
			datos: { traspaso_id: nuevo.traspasoId },
			tablas: ["traspasos", "traspaso_lineas", "existencias"],
			entidad: "traspasos",
			entidadId: nuevo.traspasoId,
			entidadFolio: nuevo.folio,
		});
		hechos.push({ traspaso_id: nuevo.traspasoId, folio: nuevo.folio, folio_rb: folioRb, tienda: tienda.nombre });
	}
	contexto.bitacora({
		descripcion: `Movió a ${hechos.map((hecho) => hecho.tienda).join(", ")}`,
		entidad: "traspasos",
		entidadId: hechos[0]?.traspaso_id ?? "",
		entidadFolio: hechos[0]?.folio ?? "",
		despues: {
			renglones: movidos.map((movido) => ({
				variante_id: movido.varianteId,
				tienda_id: movido.tiendaId,
				piezas: movido.piezas,
			})),
			traspasos: hechos.map((hecho) => ({ folio: hecho.folio, folio_rb: hecho.folio_rb })),
		},
	});
	const [solo] = movidos;
	const piezas = movidos.reduce((suma, movido) => suma + movido.piezas, 0);
	const mensaje =
		movidos.length === 1 && solo !== undefined
			? await (async () => {
					const { prenda, talla } = await nombreDeVariante(transaccion, solo.varianteId);
					return `Traspaso a ${hechos[0]?.tienda ?? ""}: ${solo.piezas} ${prenda} ${talla}, enviado a aduana`;
				})()
			: `${piezas} piezas pasan a aduana para las tiendas`;
	return {
		resultado: {
			mensaje,
			traspasos: hechos.map(({ traspaso_id, folio, folio_rb }) => ({ traspaso_id, folio, folio_rb })),
		},
		avisos,
		entidad: { nombre: "traspasos", id: hechos[0]?.traspaso_id ?? "" },
	};
});

export const accionSugerirFabricar = implementarAccion(sugerirFabricar, async (contexto, datos) => {
	const { transaccion } = contexto;
	const lugares = [...new Set(datos.renglones.map((renglon) => renglon.ubicacion_id))];
	const conMinimo = await transaccion
		.selectDistinct({ ubicacionId: minimos.ubicacionId })
		.from(minimos)
		.where(and(inArray(minimos.ubicacionId, lugares), isNull(minimos.bajaEn)));
	const sinMinimo = lugares.find((lugar) => !conMinimo.some((suyo) => suyo.ubicacionId === lugar));
	if (sinMinimo !== undefined) {
		const [ubicacion] = await transaccion
			.select({ nombre: ubicaciones.nombre })
			.from(ubicaciones)
			.where(eq(ubicaciones.id, sinMinimo));
		throw errorDeRegla("ubicacion_sin_minimo", `${ubicacion?.nombre ?? "Esa ubicación"} no lleva mínimo.`);
	}
	const quien = quienCambia(contexto);
	const nuevas = datos.renglones.map((renglon) => ({
		id: uuidv7(),
		varianteId: renglon.variante_id,
		ubicacionId: renglon.ubicacion_id,
		piezas: renglon.piezas,
		creadoPor: quien,
	}));
	await transaccion.insert(sugerenciasReabasto).values(nuevas);
	for (const nueva of nuevas) {
		contexto.guardarEvento({
			tipo: "sugerencia.creada",
			datos: { sugerencia_id: nueva.id },
			tablas: ["sugerencias_reabasto"],
			entidad: "sugerencias_reabasto",
			entidadId: nueva.id,
		});
	}
	contexto.bitacora({
		descripcion: "Sugirió fabricar",
		entidad: "sugerencias_reabasto",
		entidadId: nuevas[0]?.id ?? "",
		despues: { renglones: datos.renglones },
	});
	const [sola] = datos.renglones;
	const mensaje =
		datos.renglones.length === 1 && sola !== undefined
			? await (async () => {
					const { prenda, talla } = await nombreDeVariante(transaccion, sola.variante_id);
					return `Sugerencia enviada a producción: ${sola.piezas} ${prenda} ${talla}`;
				})()
			: `Sugerencias enviadas a producción: ${datos.renglones.reduce((suma, renglon) => suma + renglon.piezas, 0)} piezas`;
	return {
		resultado: { mensaje, sugerencia_ids: nuevas.map((nueva) => nueva.id) },
		entidad: { nombre: "sugerencias_reabasto", id: nuevas[0]?.id ?? "" },
	};
});
