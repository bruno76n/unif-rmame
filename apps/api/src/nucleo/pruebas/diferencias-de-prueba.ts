/**
 * Las ayudas de las pruebas de las diferencias y los ajustes: un motivo de ajuste, lo que viene en camino o en tránsito
 * recibido con diferencias, «Aclarar» y la decisión de Dirección sobre un AJ-.
 * Fase 14 · docs/fases/14-inventario-recepcion-del-taller-conteos-ajustes-y-reabasto.md («Cómo se construye»)
 */

import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { escribirMovimiento } from "../../modulos/inventario/dominio/escribir-movimiento.ts";
import { crearBase } from "../base/conexion.ts";
import { enAccionDePrueba } from "./accion-de-prueba.ts";
import {
	decidirDePrueba,
	despacharDePrueba,
	traspasoEnAduana,
	versionDeDespacho,
	versionDeTraspaso,
} from "./aduana-de-prueba.ts";
import { meterPiezas, nuevoTraspaso, ubicacionesPorCodigo, variantesLibres } from "./inventario-de-prueba.ts";
import { mandarAccion } from "./llamadas.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/**
 * Un motivo vigente de «Motivos de ajuste».
 * @param servidor El servidor de prueba.
 */
export async function motivoDeAjuste(servidor: ServidorDePrueba): Promise<string> {
	const { rows } = await servidor.base.dueno.query(
		`SELECT v.id FROM lista_valores v JOIN listas l ON l.id = v.lista_id
		 WHERE l.clave = 'motivos_ajuste' AND v.baja_en IS NULL ORDER BY v.orden LIMIT 1`,
	);
	return String(rows[0]?.id);
}

/**
 * Lo que Bodega surtió a aduana: una variante libre con sus piezas en En camino a aduana, en un A- `solicitud_tienda`
 * de Bodega a Tienda 1.
 * @param servidor El servidor de prueba.
 * @param piezas Las que salieron de Bodega.
 * @param suya La variante, si no es una libre (dos traspasos de la misma prenda).
 * @returns La variante, el traspaso, su folio y su renglón.
 */
export async function enCaminoDeBodega(servidor: ServidorDePrueba, piezas: number, suya?: string) {
	const ubicacion = await ubicacionesPorCodigo(servidor);
	const variante = suya ?? (await variantesLibres(servidor, 1))[0] ?? "";
	await meterPiezas(servidor, ubicacion.BOD ?? "", variante, piezas);
	const traspaso = await nuevoTraspaso(servidor, {
		tipo: "solicitud_tienda",
		estado: "en_camino_aduana",
		origen: { ubicacionId: ubicacion.BOD ?? "" },
		destino: { ubicacionId: ubicacion.T1 ?? "" },
		renglones: [{ varianteId: variante, piezas }],
	});
	await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
		escribirMovimiento(contexto, {
			tipo: "surtido_bodega",
			documento: { tipo: "traspaso", id: traspaso.traspasoId, folio: traspaso.folio },
			renglones: [
				{
					origen: ubicacion.BOD ?? "",
					destino: ubicacion.ECA ?? "",
					varianteId: variante,
					piezas,
					traspasoId: traspaso.traspasoId,
				},
			],
			clave: uuidv7(),
		}),
	);
	const { rows } = await servidor.base.dueno.query("SELECT id FROM traspaso_lineas WHERE traspaso_id = $1", [
		traspaso.traspasoId,
	]);
	return { variante, traspasoId: traspaso.traspasoId, folio: traspaso.folio, linea: String(rows[0]?.id) };
}

/**
 * Una DF- de recepción en En camino a aduana: Bodega surte `enviadas` y Aduana recibe `llegaron`.
 * @param servidor El servidor de prueba.
 * @param enviadas Lo que salió de Bodega.
 * @param llegaron Lo que contó Aduana.
 * @param variante La variante, si no es una libre.
 * @returns La DF-, la variante y el traspaso.
 */
export async function diferenciaEnCamino(
	servidor: ServidorDePrueba,
	enviadas: number,
	llegaron: number,
	variante?: string,
) {
	const camino = await enCaminoDeBodega(servidor, enviadas, variante);
	const respuesta = await mandarAccion(
		servidor,
		"inventario.recibir_en_aduana",
		{
			datos: {
				traspaso_id: camino.traspasoId,
				modo: "con_diferencias",
				renglones: [{ traspaso_linea_id: camino.linea, piezas: llegaron }],
			},
			version: await versionDeTraspaso(servidor, camino.traspasoId),
		},
		"aduana",
	);
	if (respuesta.estado !== 200) throw new Error(`no se recibió en aduana: ${JSON.stringify(respuesta.cuerpo)}`);
	return { ...camino, diferencia: await laDiferenciaDe(servidor, camino.traspasoId) };
}

/**
 * Una DF- de recepción en Tránsito: Aduana despacha a Bodega un traspaso con una variante de 5 piezas (y otra de 3,
 * que llega completa) y Bodega cuenta `llegaron` de la primera.
 * @param servidor El servidor de prueba.
 * @param llegaron Lo que contó Bodega de la primera.
 * @returns La DF-, la variante y el traspaso.
 */
export async function diferenciaEnTransito(servidor: ServidorDePrueba, llegaron: number) {
	const traspaso = await traspasoEnAduana(servidor, "BOD");
	const despacho = z
		.object({ despacho_id: z.uuid() })
		.parse((await despacharDePrueba(servidor, [traspaso.id])).cuerpo.resultado).despacho_id;
	const { rows: lineas } = await servidor.base.dueno.query(
		"SELECT id FROM traspaso_lineas WHERE traspaso_id = $1 ORDER BY renglon",
		[traspaso.id],
	);
	const respuesta = await mandarAccion(
		servidor,
		"inventario.recibir_despacho",
		{
			datos: {
				despacho_id: despacho,
				modo: "con_diferencias",
				renglones: lineas.map((linea, i) => ({ traspaso_linea_id: linea.id, piezas: i === 0 ? llegaron : 3 })),
			},
			version: await versionDeDespacho(servidor, despacho),
		},
		"bodega",
	);
	if (respuesta.estado !== 200) throw new Error(`no se recibió el despacho: ${JSON.stringify(respuesta.cuerpo)}`);
	return {
		variante: traspaso.variantes[0] ?? "",
		traspasoId: traspaso.id,
		folio: traspaso.folio,
		diferencia: await laDiferenciaDe(servidor, traspaso.id),
	};
}

/** La única DF- de un traspaso. */
async function laDiferenciaDe(servidor: ServidorDePrueba, traspasoId: string): Promise<string> {
	const { rows } = await servidor.base.dueno.query("SELECT id FROM diferencias WHERE traspaso_id = $1", [traspasoId]);
	if (rows.length !== 1) throw new Error(`el traspaso tiene ${rows.length} diferencias`);
	return String(rows[0]?.id);
}

/**
 * La versión de una DF-.
 * @param servidor El servidor de prueba.
 * @param id La DF-.
 */
export async function versionDeDiferencia(servidor: ServidorDePrueba, id: string): Promise<number> {
	const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM diferencias WHERE id = $1", [id]);
	return Number(rows[0]?.v);
}

/**
 * Bodega aclara una DF- con su versión de ahora.
 * @param servidor El servidor de prueba.
 * @param diferenciaId La DF-.
 * @param datos La aclaración y lo demás que pide.
 */
export async function aclararDePrueba(
	servidor: ServidorDePrueba,
	diferenciaId: string,
	datos: Record<string, unknown>,
) {
	return mandarAccion(
		servidor,
		"inventario.aclarar_diferencia",
		{
			datos: { diferencia_id: diferenciaId, motivo: "Se aclaró al revisar", ...datos },
			version: await versionDeDiferencia(servidor, diferenciaId),
		},
		"bodega",
	);
}

/**
 * Dirección decide el AJ-: busca su AU- y la decide.
 * @param servidor El servidor de prueba.
 * @param ajusteId El AJ-.
 * @param decision Autorizar, o rechazar con su motivo.
 */
export async function decidirAjusteDePrueba(
	servidor: ServidorDePrueba,
	ajusteId: string,
	decision: { decision: "autorizar" | "rechazar"; motivo?: string },
) {
	const { rows } = await servidor.base.dueno.query("SELECT autorizacion_id FROM ajustes WHERE id = $1", [ajusteId]);
	return decidirDePrueba(servidor, String(rows[0]?.autorizacion_id), decision);
}

/**
 * Lo que dice el libro de una variante (o de unas) por ubicación, sin las que quedan en cero.
 * @param servidor El servidor de prueba.
 * @param varianteIds Las variantes.
 */
export async function libroPorUbicacion(servidor: ServidorDePrueba, varianteIds: string[]) {
	const { rows } = await servidor.base.dueno.query(
		`WITH libro AS (
			SELECT destino_ubicacion_id AS u, piezas AS p FROM movimiento_lineas
			WHERE variante_id = ANY($1::uuid[]) AND destino_ubicacion_id IS NOT NULL
			UNION ALL SELECT origen_ubicacion_id, -piezas FROM movimiento_lineas
			WHERE variante_id = ANY($1::uuid[]) AND origen_ubicacion_id IS NOT NULL
		)
		SELECT u.codigo, sum(p)::int AS piezas FROM libro JOIN ubicaciones u ON u.id = libro.u
		GROUP BY u.codigo HAVING sum(p) <> 0 ORDER BY u.codigo`,
		[varianteIds],
	);
	return rows;
}

/**
 * La sección de una variante: la de su prenda.
 * @param servidor El servidor de prueba.
 * @param varianteId La variante.
 */
export async function seccionDe(servidor: ServidorDePrueba, varianteId: string): Promise<string> {
	const { rows } = await servidor.base.dueno.query(
		"SELECT p.seccion_id FROM variantes v JOIN productos p ON p.id = v.producto_id WHERE v.id = $1",
		[varianteId],
	);
	return String(rows[0]?.seccion_id);
}

/**
 * Guarda un conteo.
 * @param servidor El servidor de prueba.
 * @param datos Lo que se contó.
 * @param quien Quien cuenta (Bodega, si no se dice).
 */
export function contarDePrueba(servidor: ServidorDePrueba, datos: Record<string, unknown>, quien = "bodega") {
	return mandarAccion(servidor, "inventario.guardar_conteo", { datos }, quien);
}

/**
 * Lo que regresó una acción de diferencias o conteos, con lo que nació.
 * @param respuesta La respuesta.
 */
export function salidaDe(respuesta: { cuerpo: { resultado?: unknown } }) {
	return z
		.object({
			mensaje: z.string(),
			traspaso_id: z.uuid().optional(),
			ajuste_id: z.uuid().optional(),
			conteo_id: z.uuid().optional(),
			folio: z.string().optional(),
		})
		.passthrough()
		.parse(respuesta.cuerpo.resultado);
}

/**
 * Saca piezas de una ubicación con un ajuste de salida (puede dejarla en negativo).
 * @param servidor El servidor de prueba.
 * @param ubicacionId La ubicación.
 * @param varianteId La variante.
 * @param piezas Cuántas.
 */
export function sacarPiezas(servidor: ServidorDePrueba, ubicacionId: string, varianteId: string, piezas: number) {
	return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
		escribirMovimiento(contexto, {
			tipo: "ajuste",
			documento: { tipo: "ajuste", id: uuidv7() },
			renglones: [{ origen: ubicacionId, destino: null, varianteId, piezas }],
			clave: uuidv7(),
		}),
	);
}
