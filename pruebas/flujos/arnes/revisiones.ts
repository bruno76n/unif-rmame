/**
 * Las revisiones de lo que tiene que cuadrar al terminar cada flujo: la existencia de cada ubicación es la suma de su
 * libro, cada rollo está en un solo lugar, la bitácora dice quién y desde dónde, la noche cuadra sin residuo y los
 * saldos del dinero cuadran con sus pagos.
 * Fase 21 · docs/fases/21-pruebas-de-punta-a-punta.md (parte 1 y criterio «Al terminar cada flujo cuadra lo que dice su
 * archivo…») y docs/cimientos/PRUEBAS.md («Flujos de punta a punta y temporada simulada»)
 *
 * Solo leen la base, con el rol dueño: ningún flujo escribe por su lado.
 */

import { z } from "zod";
import type { CuadreDeLaNoche, TrabajadorDePrueba } from "../../../apps/api/src/nucleo/pruebas/trabajador-de-prueba.ts";

/** Lo que las revisiones necesitan de la base: una consulta con el rol dueño. */
export type Consultar = (texto: string, valores?: unknown[]) => Promise<Record<string, unknown>[]>;

/** Las revisiones del arnés. */
export interface Revisiones {
	/** Cada existencia (prendas y material) que no es la suma de su libro, en todas las ubicaciones. */
	existencias: () => Promise<string[]>;
	/** Cada rollo con cantidad en más de una ubicación. */
	unLugar: () => Promise<string[]>;
	/** Cada renglón de bitácora de un comando que no dice quién y desde dónde como su comando. */
	bitacora: () => Promise<string[]>;
	/** Los renglones de bitácora de un comando, por la clave con que se mandó. */
	bitacoraDe: (clave: string) => Promise<{ accion: string; origen: string; descripcion: string }[]>;
	/** La noche: el cuadre de ese día y los avisos de saldos que no cuadran que nacieron con ella. */
	noche: () => Promise<{ cuadre: CuadreDeLaNoche; saldosQueNoCuadran: number }>;
	/**
	 * Todo junto, como al final de un flujo: existencias, un lugar, bitácora y la noche sin residuo ni saldos que no
	 * cuadran. Falla con la lista de lo que no cuadró.
	 */
	todo: () => Promise<void>;
}

/** Una diferencia entre lo guardado y el libro. */
const diferencia = z.object({ ubicacion: z.string(), cosa: z.string(), guardada: z.string(), libro: z.string() });

/**
 * Arma las revisiones.
 * @param consultar Una consulta con el rol dueño.
 * @param trabajador El worker de prueba, para la noche.
 */
export function crearRevisiones(consultar: Consultar, trabajador: TrabajadorDePrueba): Revisiones {
	const existencias = async (): Promise<string[]> => {
		const prendas = z.array(diferencia).parse(
			await consultar(`
				WITH libro AS (
					SELECT ubicacion_id, variante_id, sum(piezas) AS piezas FROM (
						SELECT destino_ubicacion_id AS ubicacion_id, variante_id, piezas FROM movimiento_lineas
						WHERE variante_id IS NOT NULL AND destino_ubicacion_id IS NOT NULL
						UNION ALL
						SELECT origen_ubicacion_id, variante_id, -piezas FROM movimiento_lineas
						WHERE variante_id IS NOT NULL AND origen_ubicacion_id IS NOT NULL
					) m GROUP BY ubicacion_id, variante_id
				)
				SELECT u.codigo AS ubicacion, coalesce(e.variante_id, l.variante_id)::text AS cosa,
					coalesce(e.piezas, 0)::text AS guardada, coalesce(l.piezas, 0)::text AS libro
				FROM existencias e FULL JOIN libro l ON l.ubicacion_id = e.ubicacion_id AND l.variante_id = e.variante_id
				JOIN ubicaciones u ON u.id = coalesce(e.ubicacion_id, l.ubicacion_id)
				WHERE coalesce(e.piezas, 0) <> coalesce(l.piezas, 0)`),
		);
		const materiales = z.array(diferencia).parse(
			await consultar(`
				WITH libro AS (
					SELECT ubicacion_id, material_id, rollo_id, sum(cantidad) AS cantidad FROM (
						SELECT destino_ubicacion_id AS ubicacion_id, material_id, rollo_id, cantidad FROM movimiento_lineas
						WHERE material_id IS NOT NULL AND destino_ubicacion_id IS NOT NULL
						UNION ALL
						SELECT origen_ubicacion_id, material_id, rollo_id, -cantidad FROM movimiento_lineas
						WHERE material_id IS NOT NULL AND origen_ubicacion_id IS NOT NULL
					) m GROUP BY ubicacion_id, material_id, rollo_id
				)
				SELECT u.codigo AS ubicacion,
					coalesce(e.material_id, l.material_id)::text || coalesce(' rollo ' || coalesce(e.rollo_id, l.rollo_id)::text, '') AS cosa,
					coalesce(e.cantidad, 0)::text AS guardada, coalesce(l.cantidad, 0)::text AS libro
				FROM existencias_material e
				FULL JOIN libro l ON l.ubicacion_id = e.ubicacion_id AND l.material_id = e.material_id
					AND l.rollo_id IS NOT DISTINCT FROM e.rollo_id
				JOIN ubicaciones u ON u.id = coalesce(e.ubicacion_id, l.ubicacion_id)
				WHERE coalesce(e.cantidad, 0) <> coalesce(l.cantidad, 0)`),
		);
		return [...prendas, ...materiales].map(
			(una) => `${una.ubicacion} · ${una.cosa}: guardada ${una.guardada}, libro ${una.libro}`,
		);
	};
	const unLugar = async (): Promise<string[]> =>
		z
			.array(z.object({ folio: z.string(), lugares: z.string() }))
			.parse(
				await consultar(`
					SELECT r.folio, string_agg(u.codigo, ', ' ORDER BY u.codigo) AS lugares
					FROM existencias_material e JOIN rollos r ON r.id = e.rollo_id JOIN ubicaciones u ON u.id = e.ubicacion_id
					WHERE e.cantidad <> 0 GROUP BY r.folio HAVING count(*) > 1`),
			)
			.map((rollo) => `${rollo.folio} en ${rollo.lugares}`);
	const bitacora = async (): Promise<string[]> =>
		z
			.array(z.object({ accion: z.string(), origen: z.string(), comando: z.string() }))
			.parse(
				await consultar(`
					SELECT b.accion, c.origen, c.id::text AS comando
					FROM bitacora b JOIN comandos_recibidos c ON c.id = b.comando_id
					WHERE (c.origen = 'web' AND (b.usuario_id IS DISTINCT FROM c.usuario_id OR b.sesion_id IS NULL))
						OR (c.origen = 'aparato' AND (b.dispositivo_id IS DISTINCT FROM c.dispositivo_id
							OR (c.persona_id IS NOT NULL AND b.persona_id IS DISTINCT FROM c.persona_id)))`),
			)
			.map((renglon) => `${renglon.accion} (${renglon.origen}, comando ${renglon.comando})`);
	const noche = async (): Promise<{ cuadre: CuadreDeLaNoche; saldosQueNoCuadran: number }> => {
		const contarAvisos = async () =>
			Number((await consultar("SELECT count(*)::int AS n FROM avisos WHERE tipo = 'saldos_no_cuadran'"))[0]?.n ?? 0);
		const antes = await contarAvisos();
		const cuadre = await trabajador.noche();
		return { cuadre, saldosQueNoCuadran: (await contarAvisos()) - antes };
	};
	return {
		existencias,
		unLugar,
		bitacora,
		bitacoraDe: async (clave) =>
			z.array(z.object({ accion: z.string(), origen: z.string(), descripcion: z.string() })).parse(
				await consultar(
					`SELECT b.accion, b.origen, b.descripcion FROM bitacora b
						 JOIN comandos_recibidos c ON c.id = b.comando_id WHERE c.clave_idempotencia = $1 ORDER BY b.ocurrido_en`,
					[clave],
				),
			),
		noche,
		todo: async () => {
			const fallas = [
				...(await existencias()).map((una) => `existencia contra libro: ${una}`),
				...(await unLugar()).map((una) => `rollo en dos lugares: ${una}`),
				...(await bitacora()).map((una) => `bitácora sin quién ni desde dónde: ${una}`),
			];
			const { cuadre, saldosQueNoCuadran } = await noche();
			if (cuadre.estado !== "cuadro") {
				fallas.push(
					`el cuadre del ${cuadre.fecha} quedó ${cuadre.estado}: ${cuadre.proyecciones_corregidas} existencias corregidas, ${cuadre.diferencias_creadas} DF-, ${cuadre.excepciones_creadas} excepciones${cuadre.error === null ? "" : `, error ${cuadre.error}`}`,
				);
			}
			if (saldosQueNoCuadran > 0) fallas.push("los saldos del dinero no cuadran con sus pagos");
			if (fallas.length > 0) throw new Error(`No cuadra:\n- ${fallas.join("\n- ")}`);
		},
	};
}
