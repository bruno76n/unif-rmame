/**
 * `inventario.detalle_variante`: el cajón Variante de Bodega. Las piezas de cada ubicación con su mínimo y su etiqueta
 * («{n} en diferencia», «En cero», «Bajo mínimo»), el total, lo comprometido y lo libre, lo apartado con su documento,
 * lo que se está moviendo con su folio, cuántos renglones tiene en Reabasto y cuántas diferencias abiertas, y las
 * tiendas sin caja a las que se manda con «Mandar a {tienda}».
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Cajones»: Variante) y docs/modulos/inventario/minimos-y-reabasto.md
 * (reglas 8 y 12)
 */

import { detalleDeVariante } from "@uniformame/compartido/contratos/inventario/bodega-cajones";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { columnasDeVariante, de, deLaVariante, leerReabasto, unionesDeVariante } from "./bodega-comun.ts";

/**
 * Lo apartado de la variante, por documento y ubicación.
 * @param contexto El contexto de la lectura.
 * @param varianteId La variante.
 */
async function apartadas(contexto: ContextoDeAccion, varianteId: string) {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT coalesce(pe.folio, w.folio, ne.folio, 'Apartado') AS documento, u.nombre AS ubicacion, sum(r.piezas) AS piezas
		FROM reservas r JOIN ubicaciones u ON u.id = r.ubicacion_id
		LEFT JOIN pedidos pe ON pe.id = r.pedido_id LEFT JOIN pedidos_linea w ON w.id = r.pedido_linea_id
		LEFT JOIN notas_entrega ne ON ne.id = r.nota_entrega_id
		WHERE r.estado = 'activa' AND r.variante_id = ${varianteId}::uuid
		GROUP BY documento, u.nombre, u.orden ORDER BY u.orden, documento`);
	return z.array(z.object({ documento: z.string(), ubicacion: z.string(), piezas: z.coerce.number() })).parse(rows);
}

/**
 * Lo que se está moviendo de la variante: su folio, dónde va y sus piezas.
 * @param contexto El contexto de la lectura.
 * @param varianteId La variante.
 */
async function moviendose(contexto: ContextoDeAccion, varianteId: string) {
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT t.folio, t.estado, coalesce(d.nombre, 'cliente') AS destino, coalesce(o.nombre, 'fuera') AS origen,
			sum(coalesce(l.piezas_recibidas_aduana, l.piezas_enviadas, 0) - coalesce(l.piezas_recibidas_destino, 0)) AS piezas
		FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id
		LEFT JOIN ubicaciones d ON d.id = t.destino_ubicacion_id LEFT JOIN ubicaciones o ON o.id = t.origen_ubicacion_id
		WHERE t.estado IN ('en_camino_aduana', 'en_aduana', 'en_transito') AND l.variante_id = ${varianteId}::uuid
		GROUP BY t.folio, t.estado, destino, origen ORDER BY t.folio`);
	return z
		.array(
			z.object({
				folio: z.string(),
				estado: z.string(),
				destino: z.string(),
				origen: z.string(),
				piezas: z.coerce.number(),
			}),
		)
		.parse(rows)
		.map((traspaso) => ({
			folio: traspaso.folio,
			texto:
				traspaso.estado === "en_aduana"
					? `En aduana para ${traspaso.destino}`
					: traspaso.estado === "en_camino_aduana"
						? `En camino a aduana desde ${traspaso.origen}`
						: `En camino a ${traspaso.destino}`,
			piezas: traspaso.piezas,
		}));
}

export const consultaDetalleDeVariante = implementarConsulta(detalleDeVariante, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const { variante_id: varianteId } = parametros;
		const { rows } = await accion.transaccion.execute(
			sql`SELECT ${columnasDeVariante} FROM variantes v ${unionesDeVariante} WHERE v.id = ${varianteId}::uuid`,
		);
		const variante = z.array(deLaVariante).parse(rows)[0];
		if (variante === undefined) throw noExiste();
		const leido = await leerReabasto(accion, varianteId);
		const { rows: filasDeDiferencias } = await accion.transaccion.execute(sql`
			SELECT ubicacion_id, count(*) AS registros, sum(abs(piezas)) AS piezas FROM diferencias
			WHERE estado <> 'resuelta' AND variante_id = ${varianteId}::uuid GROUP BY ubicacion_id`);
		const diferencias = z
			.array(z.object({ ubicacion_id: z.uuid(), registros: z.coerce.number(), piezas: z.coerce.number() }))
			.parse(filasDeDiferencias);
		const ubicaciones = leido.ubicaciones.map((ubicacion) => {
			const renglon = leido.cuenta.find((suyo) => suyo.ubicacionId === ubicacion.id);
			const enDiferencia = diferencias.find((suya) => suya.ubicacion_id === ubicacion.id)?.piezas ?? 0;
			const etiqueta =
				enDiferencia > 0
					? { texto: `${enDiferencia} en diferencia`, tono: "ambar" as const }
					: renglon?.enCero
						? { texto: "En cero", tono: "rojo" as const }
						: renglon?.bajoMinimo
							? { texto: "Bajo mínimo", tono: "ambar" as const }
							: null;
			return {
				codigo: ubicacion.codigo,
				nombre: ubicacion.nombre,
				piezas: de(leido.existencia, ubicacion.id, varianteId),
				minimo: renglon?.minimo ?? null,
				etiqueta,
			};
		});
		const total = ubicaciones.reduce((suma, ubicacion) => suma + ubicacion.piezas, 0);
		const comprometidas = leido.ubicaciones.reduce(
			(suma, ubicacion) => suma + de(leido.reservado, ubicacion.id, varianteId),
			0,
		);
		const bodega = leido.ubicaciones.find((ubicacion) => ubicacion.tipo === "bodega");
		const libresEnBodega =
			bodega === undefined
				? 0
				: Math.max(0, de(leido.existencia, bodega.id, varianteId) - de(leido.reservado, bodega.id, varianteId));
		return {
			...variante,
			total,
			comprometidas,
			libres: total - comprometidas,
			en_reabasto: leido.cuenta.filter((renglon) => renglon.mover + renglon.fabricar > 0).length,
			por_aclarar: diferencias.reduce((suma, diferencia) => suma + diferencia.registros, 0),
			bajo_minimo: leido.cuenta.some((renglon) => renglon.enCero || renglon.bajoMinimo),
			ubicaciones,
			apartadas: await apartadas(accion, varianteId),
			moviendose: await moviendose(accion, varianteId),
			tiendas_sin_caja: leido.ubicaciones
				.filter((ubicacion) => ubicacion.sin_caja)
				.map((ubicacion) => ({ ubicacion_id: ubicacion.id, nombre: ubicacion.nombre })),
			libres_en_bodega: libresEnBodega,
		};
	}),
}));
