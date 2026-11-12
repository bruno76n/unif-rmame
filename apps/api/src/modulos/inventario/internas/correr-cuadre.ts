/**
 * El cuadre de la noche: vuelve a sacar las existencias del libro y revisa los tramos, las reservas, lo que no se
 * confirma y el total.
 * Fase 9 · docs/modulos/inventario/existencias-y-cuadre.md («El cuadre de la noche», pasos 1, 3, 6, 7 y 8)
 * Fase 11 · el paso 2, con los rollos
 * Fase 14 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md («El cuadre»): el paso 3 con las DF- abiertas, el 4
 * con los lotes recibidos y el 5
 *
 * Corre en tandas, cada una en su propia transacción corta, para no frenar las ventas: el paso 1 una por
 * ubicación, y cada paso que sigue en la suya. Nunca toca el libro: si una existencia no es la del libro, la corrige
 * y deja la excepción con los dos valores. Antes de los pasos corre, por tramos, el recálculo de las proyecciones de
 * Producción (fase 12); el paso 4 compara el Taller por lote (12) y el 5 abre las DF- del cuadre (14); en el paso 6,
 * cada documento con su fase.
 */

import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import { and, eq, sql } from "drizzle-orm";
import type { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { ContextoDeAccion, ContextoDeTrabajo } from "../../../nucleo/modulos.ts";
import { candadoDeVariantes } from "../dominio/candados.ts";
import { abrirDiferencia } from "../dominio/diferencias.ts";
import { cuadres, estadosFinalesDeTraspaso, reservas, ubicaciones } from "../tablas.ts";

/** Lo que va encontrando el cuadre. */
interface Cuenta {
	revisados: number;
	corregidas: number;
	excepciones: number;
	diferencias: number;
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
	const cuenta: Cuenta = {
		revisados: prendas.length + materiales.length,
		corregidas: 0,
		excepciones: 0,
		diferencias: 0,
	};
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

/** Cuántos lotes recalcula cada tramo de las proyecciones de Producción. */
const lotesPorTramo = 50;

/**
 * Paso 4: las piezas de cada lote en el Taller (las que entraron con su lote menos las que salieron) contra lo que
 * debe quedar ahí. De un lote cortado que no ha llegado a aduana, lo que lleva Producción en `lote_tallas` (cortadas −
 * merma). De uno ya recibido en aduana, solo las piezas de sus reprocesos que Aduana no ha recibido y lo que dicen sus
 * DF- de la recepción del taller abiertas (una de −2 deja 2 en el Taller). Abre `cuadre_proyeccion` por talla que no
 * cuadra, con los dos valores.
 * Fase 14 · docs/modulos/inventario/recepcion-del-taller.md (regla 8)
 * @returns Las excepciones que abrió.
 */
async function tallerPorLote(contexto: ContextoDeAccion, cuadreId: string): Promise<number> {
	const { rows } = await contexto.transaccion.execute(sql`
		WITH en_taller AS (
			SELECT l.lote_id, l.variante_id,
				sum(CASE WHEN l.destino_ubicacion_id = u.id THEN l.piezas ELSE 0 END)
				- sum(CASE WHEN l.origen_ubicacion_id = u.id THEN l.piezas ELSE 0 END) AS piezas
			FROM movimiento_lineas l CROSS JOIN ubicaciones u
			WHERE u.tipo = 'taller' AND l.lote_id IS NOT NULL AND l.variante_id IS NOT NULL
				AND (l.destino_ubicacion_id = u.id OR l.origen_ubicacion_id = u.id)
			GROUP BY l.lote_id, l.variante_id
		), sin_recibir AS (
			SELECT rp.lote_id, rc.variante_id, sum(rc.piezas) AS piezas
			FROM reprocesos rp JOIN rechazos rc ON rc.id = rp.rechazo_id
			WHERE NOT EXISTS (
				SELECT 1 FROM recepciones r WHERE r.tipo = 'aduana_del_taller' AND r.reproceso_id = rp.id)
			GROUP BY rp.lote_id, rc.variante_id
		), abiertas AS (
			SELECT lote_id, variante_id, sum(piezas) AS piezas FROM diferencias
			WHERE origen = 'recepcion_taller' AND estado <> 'resuelta'
			GROUP BY lote_id, variante_id
		), esperado AS (
			SELECT lt.lote_id, lt.variante_id, lo.folio,
				CASE WHEN lo.estado = 'en_aduana' THEN coalesce(s.piezas, 0) - coalesce(a.piezas, 0)
					ELSE coalesce(lt.piezas_cortadas, 0) - lt.piezas_merma END AS piezas
			FROM lote_tallas lt
			JOIN lotes lo ON lo.id = lt.lote_id AND lo.estado IN ('en_proceso', 'terminado', 'revisado', 'en_aduana')
			LEFT JOIN sin_recibir s ON s.lote_id = lt.lote_id AND s.variante_id = lt.variante_id
			LEFT JOIN abiertas a ON a.lote_id = lt.lote_id AND a.variante_id = lt.variante_id
		)
		SELECT e.lote_id, e.variante_id, e.folio, e.piezas::int AS produccion, coalesce(t.piezas, 0)::int AS taller
		FROM esperado e LEFT JOIN en_taller t ON t.lote_id = e.lote_id AND t.variante_id = e.variante_id
		WHERE e.piezas <> coalesce(t.piezas, 0)`);
	const diferencias = z
		.array(
			z.object({
				lote_id: z.uuid(),
				variante_id: z.uuid(),
				folio: z.string(),
				produccion: z.number(),
				taller: z.number(),
			}),
		)
		.parse(rows);
	for (const diferencia of diferencias) {
		await abrir(contexto, cuadreId, {
			tipo: "cuadre_proyeccion",
			descripcion: `${diferencia.folio}: en el Taller deberían quedar ${diferencia.produccion} piezas de la talla y el inventario dice ${diferencia.taller}`,
			variante_id: diferencia.variante_id,
			datos: diferencia,
		});
	}
	return diferencias.length;
}

/**
 * Paso 3: los tramos de camino de cada traspaso terminado (los que terminaron ese día y los que tienen alguna DF-) tienen
 * en el libro justo lo que dicen sus DF- abiertas: cero si no tiene ninguna (`recibido`, `salio`, `repartido`,
 * `cancelado`), y lo pendiente de cada una si es `con_diferencia` (una DF- de −2 deja +2 en su tramo). Por renglón:
 * cada tramo y cada variante (o material y rollo) por separado, para que un residuo no tape a otro. Abre una
 * excepción por traspaso, con lo que quedó en cada tramo sin explicar.
 * Fase 14 · docs/modulos/inventario/traspasos.md («Lo que queda en cada tramo y quién responde»)
 * @returns Las excepciones que abrió.
 */
async function tramosDeCamino(contexto: ContextoDeAccion, cuadreId: string, fecha: string): Promise<number> {
	const { rows } = await contexto.transaccion.execute(sql`
		WITH terminados AS (
			SELECT id, folio FROM traspasos t
			WHERE estado IN (${sql.join(
				estadosFinalesDeTraspaso.map((estado) => sql`${estado}`),
				sql`, `,
			)})
				AND ((terminado_en AT TIME ZONE 'America/Mexico_City')::date = ${fecha}::date
					OR EXISTS (SELECT 1 FROM diferencias d WHERE d.traspaso_id = t.id))
		), efectos AS (
			SELECT l.traspaso_id, l.destino_ubicacion_id AS tramo, l.variante_id, l.material_id, l.rollo_id,
				coalesce(l.piezas, l.cantidad) AS cuanto
			FROM movimiento_lineas l JOIN ubicaciones u ON u.id = l.destino_ubicacion_id
			WHERE l.traspaso_id IN (SELECT id FROM terminados) AND u.tipo IN ('transito', 'en_camino_aduana')
			UNION ALL
			SELECT l.traspaso_id, l.origen_ubicacion_id, l.variante_id, l.material_id, l.rollo_id, -coalesce(l.piezas, l.cantidad)
			FROM movimiento_lineas l JOIN ubicaciones u ON u.id = l.origen_ubicacion_id
			WHERE l.traspaso_id IN (SELECT id FROM terminados) AND u.tipo IN ('transito', 'en_camino_aduana')
			UNION ALL
			-- Lo que explican sus DF- abiertas, con su signo al revés: lo que faltó se quedó en el tramo.
			SELECT d.traspaso_id, d.ubicacion_id, d.variante_id, d.material_id, d.rollo_id, coalesce(d.piezas, d.cantidad)
			FROM diferencias d JOIN ubicaciones u ON u.id = d.ubicacion_id
			WHERE d.traspaso_id IN (SELECT id FROM terminados) AND d.estado <> 'resuelta'
				AND u.tipo IN ('transito', 'en_camino_aduana')
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
			descripcion: `${folio} ya terminó y le quedó algo en camino que ninguna diferencia explica: ${suyos.map((residuo) => `${Number(residuo.en_tramo)} en ${residuo.tramo}`).join(", ")}`,
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

/** Un negativo sin explicar: su ubicación, qué y cuánto. */
const negativo = z.object({
	ubicacion_id: z.uuid(),
	ubicacion: z.string(),
	tipo: z.string(),
	variante_id: z.uuid().nullable(),
	material_id: z.uuid().nullable(),
	rollo_id: z.uuid().nullable(),
	cuanto: z.string(),
});

/**
 * Paso 5: una existencia negativa sin DF- abierta de esa ubicación y esa variante (o ese material y rollo). En
 * prenda, en Bodega, en Aduana o en una tienda nace una DF- `cuadre` por contar; en el Taller o en un tramo no se
 * cuenta: abre `cuadre_proyeccion` (una vez, mientras siga abierta). En material nace una DF- `cuadre` por aclarar,
 * donde esté. Corre después del paso 1, con las existencias ya iguales al libro.
 * Fase 14 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md («El cuadre»)
 * @returns Las DF- y las excepciones que abrió.
 */
async function negativosSinExplicar(
	contexto: ContextoDeAccion,
	cuadreId: string,
	fecha: string,
): Promise<{ diferencias: number; excepciones: number }> {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT e.ubicacion_id, u.nombre AS ubicacion, u.tipo, e.variante_id, NULL::uuid AS material_id,
			NULL::uuid AS rollo_id, e.piezas::text AS cuanto
		FROM existencias e JOIN ubicaciones u ON u.id = e.ubicacion_id
		WHERE e.piezas < 0 AND NOT EXISTS (
			SELECT 1 FROM diferencias d WHERE d.estado <> 'resuelta' AND d.ubicacion_id = e.ubicacion_id
				AND d.variante_id = e.variante_id)
		UNION ALL
		SELECT e.ubicacion_id, u.nombre, u.tipo, NULL, e.material_id, e.rollo_id, e.cantidad::text
		FROM existencias_material e JOIN ubicaciones u ON u.id = e.ubicacion_id
		WHERE e.cantidad < 0 AND NOT EXISTS (
			SELECT 1 FROM diferencias d WHERE d.estado <> 'resuelta' AND d.ubicacion_id = e.ubicacion_id
				AND d.material_id = e.material_id AND d.rollo_id IS NOT DISTINCT FROM e.rollo_id)
		ORDER BY 4 NULLS LAST, 1, 5`);
	const cuenta = { diferencias: 0, excepciones: 0 };
	const dia = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" })
		.format(new Date(`${fecha}T12:00:00Z`))
		.replace(".", "");
	const filas = z.array(negativo).parse(rows);
	// Los candados de todas las variantes de prenda, de una vez y en orden, antes de abrir ninguna DF- (abrirla toma
	// su folio): así el paso no los toma al revés que las acciones que tienen una variante y abren una DF-.
	await candadoDeVariantes(
		contexto.transaccion,
		filas.flatMap((fila) => (fila.variante_id === null ? [] : [fila.variante_id])),
	);
	for (const fila of filas) {
		const descripcion = `El cuadre del ${dia} halló ${Number(fila.cuanto)} en ${fila.ubicacion}`;
		if (
			fila.variante_id !== null &&
			(fila.tipo === "taller" || fila.tipo === "transito" || fila.tipo === "en_camino_aduana")
		) {
			const { rows: abiertas } = await contexto.transaccion.execute(sql`
				SELECT 1 FROM excepciones WHERE tipo = 'cuadre_proyeccion' AND estado = 'por_revisar'
					AND ubicacion_id = ${fila.ubicacion_id} AND variante_id = ${fila.variante_id} AND datos->>'paso' = 'negativo'`);
			if (abiertas.length > 0) continue;
			await abrir(contexto, cuadreId, {
				tipo: "cuadre_proyeccion",
				descripcion: `${descripcion}: no se cuenta ahí`,
				ubicacion_id: fila.ubicacion_id,
				variante_id: fila.variante_id,
				datos: { paso: "negativo", piezas: Number(fila.cuanto) },
			});
			cuenta.excepciones += 1;
			continue;
		}
		// Ya con el candado de la variante se vuelve a ver: un conteo o un movimiento de este momento ya pudo explicarlo.
		if (fila.variante_id !== null) {
			const { rows: sigue } = await contexto.transaccion.execute(sql`
				SELECT 1 FROM existencias e WHERE e.ubicacion_id = ${fila.ubicacion_id} AND e.variante_id = ${fila.variante_id}
					AND e.piezas < 0 AND NOT EXISTS (
						SELECT 1 FROM diferencias d WHERE d.estado <> 'resuelta' AND d.ubicacion_id = e.ubicacion_id
							AND d.variante_id = e.variante_id)`);
			if (sigue.length === 0) continue;
		}
		await abrirDiferencia(contexto, {
			origen: "cuadre",
			ubicacionId: fila.ubicacion_id,
			aCargoUbicacionId: fila.ubicacion_id,
			hueco:
				fila.variante_id !== null
					? { varianteId: fila.variante_id, piezas: Number(fila.cuanto), sistemaDecia: Number(fila.cuanto) }
					: { materialId: fila.material_id ?? "", rolloId: fila.rollo_id, cantidad: fila.cuanto },
			descripcion,
			cuadreId,
		});
		cuenta.diferencias += 1;
	}
	return cuenta;
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
	const cuenta: Cuenta = { revisados: 0, corregidas: 0, excepciones: 0, diferencias: 0 };
	try {
		// Primero, las proyecciones de Producción: un tramo de lotes por transacción.
		for (let despuesDe: string | null | undefined; despuesDe !== null; ) {
			const desde = despuesDe;
			const tramo = z.object({ siguiente: z.uuid().nullable() }).parse(
				await contexto.enTransaccion((accion) =>
					accion.interna("produccion.recalcular_proyecciones", {
						...(desde === undefined ? {} : { despues_de: desde }),
						limite: lotesPorTramo,
					}),
				),
			);
			despuesDe = tramo.siguiente;
		}
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
			(accion: ContextoDeAccion) => tallerPorLote(accion, cuadreId),
			async (accion: ContextoDeAccion) => {
				const negativos = await negativosSinExplicar(accion, cuadreId, fecha);
				cuenta.diferencias += negativos.diferencias;
				return negativos.excepciones;
			},
			(accion: ContextoDeAccion) => reservasSinDocumento(accion, cuadreId),
			(accion: ContextoDeAccion) => sinConfirmar(accion, cuadreId),
			(accion: ContextoDeAccion) => elTotal(accion, cuadreId),
		]) {
			cuenta.excepciones += await contexto.enTransaccion(paso);
		}
		const estado =
			cuenta.corregidas === 0 && cuenta.excepciones === 0 && cuenta.diferencias === 0 ? "cuadro" : "con_residuo";
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
		{ revisados: 0, corregidas: 0, excepciones: 0, diferencias: 0 },
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
				diferenciasCreadas: cuenta.diferencias,
				error: error ?? null,
			})
			.where(eq(cuadres.id, cuadreId));
		accion.guardarEvento({
			tipo: "cuadre.terminado",
			datos: { cuadre_id: cuadreId, fecha, estado },
			tablas: ["cuadres", "existencias", "excepciones", "diferencias"],
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
