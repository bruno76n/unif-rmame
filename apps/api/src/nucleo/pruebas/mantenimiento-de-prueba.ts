/**
 * Lo que comparten las pruebas de Mantenimiento: un área del taller, los motivos de falla y una máquina dada de alta
 * con la acción.
 * Fase 13 · docs/fases/13-calidad-y-mantenimiento.md («Criterios de terminado»)
 */

import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { mandarAccion } from "./llamadas.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Un área de la lista «Áreas del taller». */
export async function areaDePrueba(servidor: ServidorDePrueba, nombre = "Costura"): Promise<string> {
	const { rows } = await servidor.base.dueno.query(
		"SELECT v.id FROM lista_valores v JOIN listas l ON l.id = v.lista_id WHERE l.clave = 'areas_taller' AND v.nombre = $1",
		[nombre],
	);
	return z.uuid().parse(rows[0]?.id);
}

/** Un motivo de falla de la siembra, por su nombre («No prende» detiene la máquina). */
export async function motivoDePrueba(servidor: ServidorDePrueba, nombre: string): Promise<string> {
	const { rows } = await servidor.base.dueno.query("SELECT id FROM motivos_falla WHERE nombre = $1", [nombre]);
	return z.uuid().parse(rows[0]?.id);
}

/**
 * Mantenimiento da de alta una máquina que trae una persona, de un tipo nuevo de prueba (o el que se diga).
 * @returns Su id y su folio.
 */
export async function maquinaDePrueba(
	servidor: ServidorDePrueba,
	personaId: string,
	tipo: { tipo_maquina_id: string } | { tipo_nuevo: string } = { tipo_nuevo: "Recta" },
): Promise<{ id: string; folio: string; nombre: string }> {
	const nombre = `Máquina ${uuidv7().slice(-8)}`;
	const respuesta = await mandarAccion(
		servidor,
		"mantenimiento.alta_maquina",
		{ datos: { nombre, ...tipo, area_id: await areaDePrueba(servidor), persona_id: personaId } },
		"mantenimiento",
	);
	const { maquina_id, folio } = z.object({ maquina_id: z.uuid(), folio: z.string() }).parse(respuesta.cuerpo.resultado);
	return { id: maquina_id, folio, nombre };
}
