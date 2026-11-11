/**
 * El cuadre de la noche: vuelve a sacar las existencias del libro y revisa los tramos, las reservas, lo que no se
 * confirma y el total.
 * Fase 9 · docs/modulos/inventario/existencias-y-cuadre.md («El cuadre de la noche», pasos 1, 3, 6, 7 y 8)
 * Fase 11 · el paso 2, con los rollos
 *
 * Corre en tandas, cada una en su propia transacción corta, para no frenar las ventas: el paso 1 una por
 * ubicación, y cada paso que sigue en la suya. Nunca toca el libro: si una existencia no es la del libro, la corrige
 * y deja la excepción con los dos valores. El paso 4 llega con los lotes (12), el 5 con las DF- (14); en el paso 6,
 * cada documento con su fase.
 */

import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import { and, eq, sql } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { ContextoDeAccion, ContextoDeTrabajo } from "../../../nucleo/modulos.ts";
import { cuadres, reservas, ubicaciones } from "../tablas.ts";

/** Lo que va encontrando el cuadre. */
interface Cuenta {
	revisados: number;
	corregidas: number;
	excepciones: number;
}

/** Abre una excepción del cuadre. */
async function abrir(contexto: ContextoDeAccion, cuadreId: string, excepcion: Record<string, unknown>): Promise<void> {
	await contexto.interna("inventario.registrar_excepcion", { ...excepcion, cuadre_id: cuadreId });
}

/** Una fila de existencia contra el libro. */
const filaDePrenda = z.object({
	variante_id: z.uuid(),
	guardada: z.coerce.number().nullable(),
	libro: z.coerce.number(),
});

/** Una fila de material contra el libro. */
const filaDeMaterial = z.object({
	material_id: z.uuid(),
	rollo_id: z.uuid().nullable(),
	guardada: z.string().nullable(),
	libro: z.string(),
});

/**
 * Paso 1, en una ubicación: recalcula cada existencia desde el libro y corrige la que no es igual. Bloquea primero
 * las existencias de la ubicación en el orden fijo: un movimiento a medias termina antes, y el que llega espera.
 * @returns Lo revisado, lo corregido y las excepciones.
 */
async function existenciasContraLibro(
	contexto: ContextoDeAccion,
	cuadreId: string,
	ubicacion: { id: string; nombre: string },
): Promise<Cuenta> {
	const { transaccion } = contexto;
	await transaccion.execute(
		sql`SELECT 1 FROM existencias WHERE ubicacion_id = ${ubicacion.id} ORDER BY variante_id FOR UPDATE`,
	);
	await transaccion.execute(
		sql`SELECT 1 FROM existencias_material WHERE ubicacion_id = ${ubicacion.id} ORDER BY material_id, rollo_id NULLS FIRST FOR UPDATE`,
	);
	const prendas = z.array(filaDePrenda).parse(
		(
			await transaccion.execute(sql`
				WITH libro AS (
					SELECT variante_id, sum(CASE WHEN destino_ubicacion_id = ${ubicacion.id} THEN piezas ELSE -piezas END) AS piezas
					FROM movimiento_lineas
					WHERE variante_id IS NOT NULL AND ${ubicacion.id} IN (origen_ubicacion_id, destino_ubicacion_id)
					GROUP BY variante_id
				), guardada AS (SELECT variante_id, piezas FROM existencias WHERE ubicacion_id = ${ubicacion.id})
				SELECT coalesce(g.variante_id, l.variante_id) AS variante_id, g.piezas AS guardada, coalesce(l.piezas, 0) AS libro
				FROM guardada g FULL JOIN libro l ON l.variante_id = g.variante_id`)
		).rows,
	);
	const materiales = z.array(filaDeMaterial).parse(
		(
			await transaccion.execute(sql`
				WITH libro AS (
					SELECT material_id, rollo_id,
						sum(CASE WHEN destino_ubicacion_id = ${ubicacion.id} THEN cantidad ELSE -cantidad END) AS cantidad
					FROM movimiento_lineas
					WHERE material_id IS NOT NULL AND ${ubicacion.id} IN (origen_ubicacion_id, destino_ubicacion_id)
					GROUP BY material_id, rollo_id
				), guardada AS (SELECT material_id, rollo_id, cantidad FROM existencias_material WHERE ubicacion_id = ${ubicacion.id})
				SELECT coalesce(g.material_id, l.material_id) AS material_id, coalesce(g.rollo_id, l.rollo_id) AS rollo_id,
					g.cantidad::text AS guardada, coalesce(l.cantidad, 0)::numeric(12, 3)::text AS libro
				FROM guardada g FULL JOIN libro l ON l.material_id = g.material_id AND l.rollo_id IS NOT DISTINCT FROM g.rollo_id`)
		).rows,
	);
	const cuenta: Cuenta = { revisados: prendas.length + materiales.length, corregidas: 0, excepciones: 0 };
	for (const fila of prendas) {
		if ((fila.guardada ?? 0) === fila.libro) continue;
		// El libro manda: la existencia toma lo que dice, y nace si no estaba.
		await transaccion.execute(sql`
			INSERT INTO existencias (id, ubicacion_id, variante_id, piezas) VALUES (${uuidv7()}, ${ubicacion.id}, ${fila.variante_id}, ${fila.libro})
			ON CONFLICT (ubicacion_id, variante_id) DO UPDATE SET piezas = excluded.piezas`);
		await abrir(contexto, cuadreId, {
			tipo: "cuadre_proyeccion",
			descripcion: `La existencia en ${ubicacion.nombre} decía ${fila.guardada ?? 0} y el libro ${fila.libro}: se corrigió`,
			ubicacion_id: ubicacion.id,
			variante_id: fila.variante_id,
			datos: { guardada: fila.guardada ?? 0, libro: fila.libro },
		});
		cuenta.corregidas += 1;
		cuenta.excepciones += 1;
	}
	for (const fila of materiales) {
		if (Number(fila.guardada ?? "0") === Number(fila.libro)) continue;
		await transaccion.execute(sql`
			INSERT INTO existencias_material (id, ubicacion_id, material_id, rollo_id, cantidad)
			VALUES (${uuidv7()}, ${ubicacion.id}, ${fila.material_id}, ${fila.rollo_id}, ${fila.libro}::numeric)
			ON CONFLICT ON CONSTRAINT existencias_material_lugar DO UPDATE SET cantidad = excluded.cantidad`);
		await abrir(contexto, cuadreId, {
			tipo: "cuadre_proyeccion",
			descripcion: `El material en ${ubicacion.nombre} decía ${fila.guardada ?? "0"} y el libro ${fila.libro}: se corrigió`,
			ubicacion_id: ubicacion.id,
			datos: {
				material_id: fila.material_id,
				rollo_id: fila.rollo_id,
				guardada: fila.guardada ?? "0",
				libro: fila.libro,
			},
		});
		cuenta.corregidas += 1;
		cuenta.excepciones += 1;
	}
	return cuenta;
}

/**
 * Paso 2: una pieza, un lugar. Ningún rollo tiene metros en dos ubicaciones, y uno entregado o por recibir solo los
 * tiene en el Taller. Corre después del paso 1, con las existencias ya iguales al libro. Abre una excepción
 * `rollo_en_dos_lugares` por rollo, con dónde tiene metros.
 * Fase 11 · docs/modulos/inventario/material-en-bodega.md («El cuadre de la noche»)
 * @returns Las excepciones que abrió.
 */
async function rollosEnUnLugar(contexto: ContextoDeAccion, cuadreId: string): Promise<number> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT r.id, r.folio, r.estado,
			string_agg(u.nombre || ' ' || (e.cantidad::numeric(12, 3))::text, ', ' ORDER BY u.orden) AS donde
		FROM rollos r
		JOIN existencias_material e ON e.rollo_id = r.id AND e.cantidad <> 0
		JOIN ubicaciones u ON u.id = e.ubicacion_id
		GROUP BY r.id, r.folio, r.estado
		HAVING count(*) > 1
			OR (r.estado IN ('entregado', 'por_recibir') AND bool_or(u.tipo <> 'taller'))
		ORDER BY r.folio`);
	const enDosLugares = z
		.array(z.object({ id: z.uuid(), folio: z.string(), estado: z.string(), donde: z.string() }))
		.parse(rows);
	for (const rollo of enDosLugares) {
		await abrir(contexto, cuadreId, {
			tipo: "rollo_en_dos_lugares",
			descripcion: `${rollo.folio} tiene metros en ${rollo.donde}`,
			datos: { rollo_id: rollo.id, folio: rollo.folio, estado: rollo.estado, donde: rollo.donde },
		});
	}
	return enDosLugares.length;
}

/**
 * Paso 3: un traspaso que terminó ese día `recibido`, `salio`, `repartido` o `cancelado` tiene cero en Tránsito y cero
 * en En camino a aduana, por renglón: cada tramo y cada variante (o material y rollo) por separado, para que un
 * residuo no tape a otro. (Uno `con_diferencia` se revisa contra sus DF- abiertas desde la fase 14.) Abre una
 * excepción por traspaso, con lo que quedó en cada tramo.
 * @returns Las excepciones que abrió.
 */
async function tramosDeCamino(contexto: ContextoDeAccion, cuadreId: string, fecha: string): Promise<number> {
	const { rows } = await contexto.transaccion.execute(sql`
		WITH terminados AS (
			SELECT id, folio FROM traspasos
			WHERE estado IN ('recibido', 'salio', 'repartido', 'cancelado')
				AND (terminado_en AT TIME ZONE 'America/Mexico_City')::date = ${fecha}::date
		), efectos AS (
			SELECT l.traspaso_id, l.destino_ubicacion_id AS tramo, l.variante_id, l.material_id, l.rollo_id,
				coalesce(l.piezas, l.cantidad) AS cuanto
			FROM movimiento_lineas l JOIN ubicaciones u ON u.id = l.destino_ubicacion_id
			WHERE l.traspaso_id IN (SELECT id FROM terminados) AND u.tipo IN ('transito', 'en_camino_aduana')
			UNION ALL
			SELECT l.traspaso_id, l.origen_ubicacion_id, l.variante_id, l.material_id, l.rollo_id, -coalesce(l.piezas, l.cantidad)
			FROM movimiento_lineas l JOIN ubicaciones u ON u.id = l.origen_ubicacion_id
			WHERE l.traspaso_id IN (SELECT id FROM terminados) AND u.tipo IN ('transito', 'en_camino_aduana')
		)
		SELECT t.id, t.folio, u.nombre AS tramo, e.variante_id, e.material_id, e.rollo_id, sum(e.cuanto)::text AS en_tramo
		FROM efectos e JOIN terminados t ON t.id = e.traspaso_id JOIN ubicaciones u ON u.id = e.tramo
		GROUP BY t.id, t.folio, u.nombre, e.variante_id, e.material_id, e.rollo_id
		HAVING sum(e.cuanto) <> 0
		ORDER BY t.folio, u.nombre`);
	const residuos = z
		.array(
			z.object({
				id: z.uuid(),
				folio: z.string(),
				tramo: z.string(),
				variante_id: z.uuid().nullable(),
				material_id: z.uuid().nullable(),
				rollo_id: z.uuid().nullable(),
				en_tramo: z.string(),
			}),
		)
		.parse(rows);
	const porTraspaso = new Map<string, typeof residuos>();
	for (const residuo of residuos) porTraspaso.set(residuo.id, [...(porTraspaso.get(residuo.id) ?? []), residuo]);
	for (const [id, suyos] of porTraspaso) {
		const folio = suyos[0]?.folio ?? "";
		await abrir(contexto, cuadreId, {
			tipo: "cuadre_proyeccion",
			descripcion: `${folio} ya terminó y le quedó algo en camino: ${suyos.map((residuo) => `${Number(residuo.en_tramo)} en ${residuo.tramo}`).join(", ")}`,
			documento_tipo: "traspaso",
			documento_id: id,
			documento_folio: folio,
			datos: {
				tramos: suyos.map(({ tramo, variante_id, material_id, rollo_id, en_tramo }) => ({
					tramo,
					variante_id,
					material_id,
					rollo_id,
					en_tramo,
				})),
			},
		});
	}
	return porTraspaso.size;
}

/** De cada motivo de reserva, la lectura que dice qué documentos siguen abiertos y la columna de su documento. */
const documentosDeReservas = [
	{ motivo: "pedido_externo", lectura: "ventas.documentos_abiertos", campo: "pedido_ids", columna: reservas.pedidoId },
	{
		motivo: "nota_entrega",
		lectura: "ventas.documentos_abiertos",
		campo: "nota_entrega_ids",
		columna: reservas.notaEntregaId,
	},
	{
		motivo: "pedido_linea",
		lectura: "linea.pedidos_abiertos",
		campo: "pedido_linea_ids",
		columna: reservas.pedidoLineaId,
	},
] as const;

/**
 * Paso 6: una reserva activa cuyo documento ya se canceló o se cerró abre `reserva_sin_documento`. Lo preguntan
 * las lecturas de Ventas (fase 16) y de Tienda en línea (fase 18): mientras un módulo no esté, sus reservas no se
 * revisan. Una reserva que ya tiene su excepción abierta no abre otra.
 * @returns Las excepciones que abrió.
 */
async function reservasSinDocumento(contexto: ContextoDeAccion, cuadreId: string): Promise<number> {
	let abiertas = 0;
	for (const { motivo, lectura, campo, columna } of documentosDeReservas) {
		if (!contexto.hayLectura(lectura)) continue;
		const activas = await contexto.transaccion
			.select({
				id: reservas.id,
				documento: columna,
				ubicacionId: reservas.ubicacionId,
				varianteId: reservas.varianteId,
			})
			.from(reservas)
			.where(and(eq(reservas.estado, "activa"), eq(reservas.motivo, motivo)));
		const documentos = [...new Set(activas.map((reserva) => reserva.documento).filter((id) => id !== null))];
		if (documentos.length === 0) continue;
		const respuesta = z
			.record(z.string(), z.array(z.uuid()))
			.parse(await contexto.lectura(lectura, { [campo]: documentos }));
		const siguen = new Set(respuesta[campo] ?? []);
		for (const reserva of activas) {
			if (reserva.documento === null || siguen.has(reserva.documento)) continue;
			const { rows } = await contexto.transaccion.execute(sql`
				SELECT 1 FROM excepciones WHERE tipo = 'reserva_sin_documento' AND estado = 'por_revisar' AND datos->>'reserva_id' = ${reserva.id}`);
			if (rows.length > 0) continue;
			await abrir(contexto, cuadreId, {
				tipo: "reserva_sin_documento",
				descripcion: "Una reserva sigue activa y su documento ya se canceló o se cerró",
				ubicacion_id: reserva.ubicacionId,
				variante_id: reserva.varianteId,
				datos: { reserva_id: reserva.id, motivo, documento_id: reserva.documento },
			});
			abiertas += 1;
		}
	}
	return abiertas;
}

/**
 * Paso 7: lo que lleva más de `inventario.dias_sin_confirmar_excepcion` en camino a aduana (desde que salió) o en
 * tránsito (desde su despacho) abre `sin_confirmar`, una vez por traspaso mientras siga abierta.
 * @returns Las excepciones que abrió.
 */
async function sinConfirmar(contexto: ContextoDeAccion, cuadreId: string): Promise<number> {
	const dias = Number(await contexto.lectura("admin.parametro", { clave: "inventario.dias_sin_confirmar_excepcion" }));
	const corte = contexto.ahora.subtract({ hours: dias * 24 }).toString();
	const { rows } = await contexto.transaccion.execute(sql`
		WITH desde AS (
			SELECT t.id, t.folio, t.estado,
				CASE WHEN t.estado = 'en_camino_aduana' THEN t.enviado_en
				ELSE (SELECT max(m.ocurrido_en) FROM movimiento_lineas l JOIN movimientos m ON m.id = l.movimiento_id
					JOIN ubicaciones u ON u.id = l.destino_ubicacion_id AND u.tipo = 'transito' WHERE l.traspaso_id = t.id)
				END AS desde
			FROM traspasos t WHERE t.estado IN ('en_camino_aduana', 'en_transito')
		)
		SELECT d.id, d.folio, d.estado FROM desde d
		WHERE d.desde < ${corte}::timestamptz
			AND NOT EXISTS (SELECT 1 FROM excepciones e WHERE e.tipo = 'sin_confirmar' AND e.estado = 'por_revisar' AND e.documento_id = d.id)`);
	for (const fila of z.array(z.object({ id: z.uuid(), folio: z.string(), estado: z.string() })).parse(rows)) {
		await abrir(contexto, cuadreId, {
			tipo: "sin_confirmar",
			descripcion: `${fila.folio} lleva más de ${dias} días ${fila.estado === "en_transito" ? "en tránsito" : "en camino a aduana"} sin confirmar`,
			documento_tipo: "traspaso",
			documento_id: fila.id,
			documento_folio: fila.folio,
		});
	}
	return rows.length;
}

/**
 * Paso 8: las siete ubicaciones suman el total de cada variante y de cada material en el libro. Con el paso 1 bien,
 * cuadra sin residuo.
 * @returns Las excepciones que abrió.
 */
async function elTotal(contexto: ContextoDeAccion, cuadreId: string): Promise<number> {
	const { rows } = await contexto.transaccion.execute(sql`
		WITH libro AS (
			SELECT coalesce(variante_id, material_id) AS que,
				sum(CASE WHEN destino_ubicacion_id IS NOT NULL THEN coalesce(piezas, cantidad) ELSE 0 END)
				- sum(CASE WHEN origen_ubicacion_id IS NOT NULL THEN coalesce(piezas, cantidad) ELSE 0 END) AS total
			FROM movimiento_lineas GROUP BY 1
		), guardada AS (
			SELECT variante_id AS que, sum(piezas)::numeric AS total FROM existencias GROUP BY 1
			UNION ALL SELECT material_id, sum(cantidad) FROM existencias_material GROUP BY 1
		)
		SELECT coalesce(g.que, l.que) AS que, coalesce(g.total, 0)::text AS guardada, coalesce(l.total, 0)::text AS libro
		FROM guardada g FULL JOIN libro l ON l.que = g.que WHERE coalesce(g.total, 0) <> coalesce(l.total, 0)`);
	for (const fila of z.array(z.object({ que: z.uuid(), guardada: z.string(), libro: z.string() })).parse(rows)) {
		await abrir(contexto, cuadreId, {
			tipo: "cuadre_proyeccion",
			descripcion: `El total de las siete ubicaciones decía ${fila.guardada} y el libro ${fila.libro}`,
			datos: fila,
		});
	}
	return rows.length;
}

/** Lo que regresa el cuadre: el suyo, o el de esa fecha que ya estaba, con su estado. */
export type CuadreCorrido =
	| { cuadreId: string; estado: "cuadro" | "con_residuo" }
	| { yaCorrio: true; cuadreId: string; estado: string };

/**
 * Corre el cuadre de un día de negocio, tanda por tanda. Una sola corrida por fecha.
 * @param contexto El contexto del trabajo, con sus transacciones cortas.
 * @param fecha El día de negocio que terminó (`2026-11-10`).
 * @param entreTandas Lo que corre entre una tanda y la siguiente (las pruebas meten ahí un movimiento).
 * @returns El cuadre y su estado o, si ya había uno de esa fecha, ese.
 * @throws El error de la tanda que falló, después de dejar el cuadre en `fallo` con su error.
 */
export async function correrCuadre(
	contexto: ContextoDeTrabajo,
	fecha: string,
	entreTandas: (tanda: string) => Promise<void> = async () => undefined,
): Promise<CuadreCorrido> {
	const cuadreId = uuidv7();
	const nacio = await contexto.enTransaccion(async (accion) =>
		accion.transaccion
			.insert(cuadres)
			.values({ id: cuadreId, fecha, iniciadoEn: accion.ahora.toString(), estado: "corriendo" })
			.onConflictDoNothing()
			.returning({ id: cuadres.id }),
	);
	if (nacio.length === 0) {
		const [anterior] = await contexto.enTransaccion((accion) =>
			accion.transaccion
				.select({ id: cuadres.id, estado: cuadres.estado })
				.from(cuadres)
				.where(eq(cuadres.fecha, fecha)),
		);
		if (anterior === undefined) throw new Error(`el cuadre del ${fecha} no nació ni estaba`);
		return { yaCorrio: true, cuadreId: anterior.id, estado: anterior.estado };
	}
	const cuenta: Cuenta = { revisados: 0, corregidas: 0, excepciones: 0 };
	try {
		const lugares = await contexto.enTransaccion((accion) =>
			accion.transaccion
				.select({ id: ubicaciones.id, nombre: ubicaciones.nombre, codigo: ubicaciones.codigo })
				.from(ubicaciones)
				.orderBy(ubicaciones.orden),
		);
		for (const ubicacion of lugares) {
			const deEsta = await contexto.enTransaccion((accion) => existenciasContraLibro(accion, cuadreId, ubicacion));
			cuenta.revisados += deEsta.revisados;
			cuenta.corregidas += deEsta.corregidas;
			cuenta.excepciones += deEsta.excepciones;
			await entreTandas(ubicacion.codigo);
		}
		for (const paso of [
			(accion: ContextoDeAccion) => rollosEnUnLugar(accion, cuadreId),
			(accion: ContextoDeAccion) => tramosDeCamino(accion, cuadreId, fecha),
			(accion: ContextoDeAccion) => reservasSinDocumento(accion, cuadreId),
			(accion: ContextoDeAccion) => sinConfirmar(accion, cuadreId),
			(accion: ContextoDeAccion) => elTotal(accion, cuadreId),
		]) {
			cuenta.excepciones += await contexto.enTransaccion(paso);
		}
		const estado = cuenta.corregidas === 0 && cuenta.excepciones === 0 ? "cuadro" : "con_residuo";
		await terminar(contexto, cuadreId, fecha, estado, cuenta);
		return { cuadreId, estado };
	} catch (error) {
		await terminar(contexto, cuadreId, fecha, "fallo", cuenta, error instanceof Error ? error.message : String(error));
		throw error;
	}
}

/**
 * Deja en `fallo` un cuadre que se quedó `corriendo` porque su proceso se cortó (el `catch` no alcanzó a correr).
 * @param contexto El contexto del trabajo.
 * @param cuadreId El cuadre.
 * @param fecha Su día de negocio.
 */
export function marcarCuadreCortado(contexto: ContextoDeTrabajo, cuadreId: string, fecha: string): Promise<void> {
	return terminar(
		contexto,
		cuadreId,
		fecha,
		"fallo",
		{ revisados: 0, corregidas: 0, excepciones: 0 },
		"El cuadre se cortó sin terminar",
	);
}

/** Deja el cuadre en su estado final, con sus contadores, y guarda `cuadre.terminado`. */
async function terminar(
	contexto: ContextoDeTrabajo,
	cuadreId: string,
	fecha: string,
	estado: "cuadro" | "con_residuo" | "fallo",
	cuenta: Cuenta,
	error?: string,
): Promise<void> {
	await contexto.enTransaccion(async (accion) => {
		await accion.transaccion
			.update(cuadres)
			.set({
				estado,
				terminadoEn: accion.ahora.toString(),
				renglonesRevisados: cuenta.revisados,
				proyeccionesCorregidas: cuenta.corregidas,
				excepcionesCreadas: cuenta.excepciones,
				error: error ?? null,
			})
			.where(eq(cuadres.id, cuadreId));
		accion.guardarEvento({
			tipo: "cuadre.terminado",
			datos: { cuadre_id: cuadreId, fecha, estado },
			tablas: ["cuadres", "existencias", "excepciones"],
			entidad: "cuadres",
			entidadId: cuadreId,
		});
	});
}

/**
 * El día de negocio que terminó antes de un momento: el de ayer, en hora de México.
 * @param ahora El momento.
 */
export function diaQueTermino(ahora: Temporal.Instant): string {
	return diaDeNegocio(ahora).subtract({ days: 1 }).toString();
}
