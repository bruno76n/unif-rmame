/**
 * Lo que comparten las pruebas de Calidad: un lote terminado en el taller y un defecto del catálogo.
 * Fase 13 · docs/fases/13-calidad-y-mantenimiento.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { SiembraDelCatalogo } from "./catalogo-de-prueba.ts";
import { mandarAccion } from "./llamadas.ts";
import { type LoteCortado, loteCortado, subirDeLaTablet } from "./produccion-de-prueba.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/**
 * La tablet registra buenas en un bulto, en una operación del flujo del lote.
 * @param personaId Quién; por omisión, la persona del lote.
 */
export function registrarEnBulto(
	servidor: ServidorDePrueba,
	lote: LoteCortado,
	bulto: number,
	operacion: number,
	buenas: number,
	personaId = lote.personaId,
) {
	return subirDeLaTablet(
		servidor,
		"produccion.registrar_operacion",
		{
			id: uuidv7(),
			bulto_id: lote.bultos[bulto]?.id,
			flujo_operacion_id: lote.prenda.flujo.operaciones[operacion]?.flujoOperacionId,
			piezas_buenas: buenas,
			piezas_danadas: 0,
			sin_internet: false,
		},
		personaId,
	);
}

/**
 * Un lote cortado y terminado en sus dos operaciones después del corte.
 * @param piezas Las de las tallas 4, 6 y 8 (por omisión, 3 y 2).
 */
export async function loteTerminado(
	servidor: ServidorDePrueba,
	siembra: SiembraDelCatalogo,
	piezas: [number, number, number] = [3, 2, 0],
): Promise<LoteCortado> {
	const lote = await loteCortado(servidor, siembra, piezas);
	for (const [i, bulto] of lote.bultos.entries()) {
		await registrarEnBulto(servidor, lote, i, 1, bulto.piezas);
		await registrarEnBulto(servidor, lote, i, 2, bulto.piezas);
	}
	return lote;
}

/**
 * Calidad agrega un defecto que suele causar la primera operación después del corte del lote.
 * @returns El id del defecto.
 */
export async function defectoDePrueba(
	servidor: ServidorDePrueba,
	lote: LoteCortado,
	nombre = `Costura abierta ${uuidv7().slice(-6)}`,
): Promise<string> {
	const respuesta = await mandarAccion(
		servidor,
		"calidad.agregar_defecto",
		{ datos: { nombre, operacion_ids: [lote.prenda.flujo.operaciones[1]?.operacionId] } },
		"calidad",
	);
	return z.object({ defecto_id: z.uuid() }).parse(respuesta.cuerpo.resultado).defecto_id;
}

/**
 * Un lote revisado por Calidad: terminado y revisado, con un rechazo de la talla 4 si se pide (su reproceso).
 * @param servidor El servidor de prueba.
 * @param siembra Los ids de la siembra del catálogo.
 * @param piezas Las piezas de las tallas 4, 6 y 8.
 * @param rechazadas Las piezas de la talla 4 que rechaza Calidad.
 * @returns El lote y su reproceso, si hubo.
 */
export async function loteRevisado(
	servidor: ServidorDePrueba,
	siembra: SiembraDelCatalogo,
	piezas: [number, number, number] = [5, 3, 0],
	rechazadas = 0,
): Promise<LoteCortado & { reprocesoId: string | undefined }> {
	const lote = await loteTerminado(servidor, siembra, piezas);
	const rechazos =
		rechazadas === 0
			? []
			: [
					{
						defecto_id: await defectoDePrueba(servidor, lote),
						flujo_operacion_id: lote.prenda.flujo.operaciones[1]?.flujoOperacionId,
						persona_id: lote.personaId,
						variante_id: lote.prenda.variantes["4"],
						piezas: rechazadas,
					},
				];
	const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM lotes WHERE id = $1", [lote.loteId]);
	const revision = await mandarAccion(
		servidor,
		"calidad.revisar_lote",
		{ datos: { lote_id: lote.loteId, rechazos }, version: rows[0]?.v },
		"calidad",
	);
	if (revision.estado !== 200) throw new Error(`no se revisó: ${JSON.stringify(revision.cuerpo)}`);
	const { rows: suyos } = await servidor.base.dueno.query("SELECT id FROM reprocesos WHERE lote_id = $1", [
		lote.loteId,
	]);
	return { ...lote, reprocesoId: suyos[0]?.id };
}

/**
 * Calidad aprueba un reproceso con su versión de ahora.
 * @param servidor El servidor de prueba.
 * @param reprocesoId El reproceso.
 */
export async function aprobarReprocesoDePrueba(servidor: ServidorDePrueba, reprocesoId: string) {
	const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM reprocesos WHERE id = $1", [
		reprocesoId,
	]);
	return mandarAccion(
		servidor,
		"calidad.aprobar_reproceso",
		{ datos: { reproceso_id: reprocesoId }, version: rows[0]?.v },
		"calidad",
	);
}
