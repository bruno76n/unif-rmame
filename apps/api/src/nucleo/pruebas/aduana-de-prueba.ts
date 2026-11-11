/**
 * Ayudas de prueba de Aduana: una orden enviada con una tela y un avío, recibirla y decidir lo de más.
 * Fase 11 · docs/modulos/inventario/recepciones-en-aduana.md
 */

import { v7 as uuidv7 } from "uuid";
import type { TipoDeTraspaso } from "../../modulos/inventario/tablas.ts";
import { altaDeMaterial, altaDeProveedor, levantarDePrueba, ordenEnEstado } from "./compras-de-prueba.ts";
import { meterPiezas, nuevoTraspaso, ubicacionesPorCodigo, variantesLibres } from "./inventario-de-prueba.ts";
import { conGoogle, mandarAccion } from "./llamadas.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Una orden enviada de prueba, con su tela y su avío, sus líneas y su proveedor. */
export interface OrdenParaRecibir {
	id: string;
	folio: string;
	proveedor: string;
	tela: string;
	avio: string;
	lineaTela: string;
	lineaAvio: string;
}

/**
 * Una orden enviada con 100 m de una tela (a $78) y 500 piezas de un avío (a $0.38), de un proveedor nuevo.
 * @param servidor El servidor de prueba.
 * @param metros Los metros de la tela.
 */
export async function ordenParaRecibir(servidor: ServidorDePrueba, metros = 100): Promise<OrdenParaRecibir> {
	const proveedor = await altaDeProveedor(servidor);
	const sufijo = uuidv7().slice(-6);
	const tela = await altaDeMaterial(servidor, proveedor, {
		nombre: `Gabardina de prueba ${sufijo}`,
		tipo: "tela",
		unidad: "m",
		costo_centavos: 7_800,
	});
	const avio = await altaDeMaterial(servidor, proveedor, { nombre: `Botón de prueba ${sufijo}`, costo_centavos: 38 });
	const orden = await levantarDePrueba(servidor, [
		{ material_id: tela, proveedor_id: proveedor, cantidad: metros, precio_centavos: 7_800 },
		{ material_id: avio, proveedor_id: proveedor, cantidad: 500, precio_centavos: 38 },
	]);
	await ordenEnEstado(servidor, orden.id, "enviada");
	const { rows } = await servidor.base.dueno.query(
		"SELECT id, material_id FROM orden_compra_lineas WHERE orden_compra_id = $1",
		[orden.id],
	);
	const linea = (material: string) => String(rows.find((fila) => fila.material_id === material)?.id);
	return { ...orden, proveedor, tela, avio, lineaTela: linea(tela), lineaAvio: linea(avio) };
}

/**
 * Aduana recibe una orden: la tela en rollos de los metros dados (con su partida) y el avío por cantidad.
 * @param servidor El servidor de prueba.
 * @param orden La orden.
 * @param rollos Los rollos: metros y partida.
 * @param piezas Las piezas del avío, o ninguna para no recibirlo.
 */
export function recibirDePrueba(
	servidor: ServidorDePrueba,
	orden: OrdenParaRecibir,
	rollos: { metros: string; partida: string }[],
	piezas?: number,
) {
	const materiales = [
		...(rollos.length === 0 ? [] : [{ orden_compra_linea_id: orden.lineaTela, rollos }]),
		...(piezas === undefined ? [] : [{ orden_compra_linea_id: orden.lineaAvio, cantidad: String(piezas) }]),
	];
	return mandarAccion(
		servidor,
		"inventario.recibir_de_proveedor",
		{ datos: { orden_compra_id: orden.id, materiales } },
		"aduana",
	);
}

/**
 * Dirección decide una autorización.
 * @param servidor El servidor de prueba.
 * @param autorizacionId La autorización.
 * @param decision Autorizar o rechazar, con su motivo.
 */
export async function decidirDePrueba(
	servidor: ServidorDePrueba,
	autorizacionId: string,
	decision: { decision: "autorizar" | "rechazar"; motivo?: string },
) {
	const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM autorizaciones WHERE id = $1", [
		autorizacionId,
	]);
	return mandarAccion(
		servidor,
		"direccion.decidir_autorizacion",
		{ datos: { autorizacion_id: autorizacionId, desde: "direccion", ...decision }, version: rows[0]?.v },
		"direccion",
		conGoogle(),
	);
}

/**
 * Un traspaso de prendas que ya está en aduana, con sus piezas en Aduana: dos variantes, de 5 y 3 piezas.
 * @param servidor El servidor de prueba.
 * @param destino El código de su destino (`BOD`, `T1`…), o `null` si se decide al despachar.
 * @param tipo Su tipo.
 * @returns Su id, su folio, sus variantes y su versión.
 */
export async function traspasoEnAduana(
	servidor: ServidorDePrueba,
	destino: string | null,
	tipo: TipoDeTraspaso = "solicitud_tienda",
) {
	const ubicacion = await ubicacionesPorCodigo(servidor);
	const variantes = await variantesLibres(servidor, 2);
	const piezas = [5, 3];
	for (const [i, variante] of variantes.entries())
		await meterPiezas(servidor, ubicacion.ADU ?? "", variante, piezas[i] ?? 0);
	const creado = await nuevoTraspaso(servidor, {
		tipo,
		estado: "en_aduana",
		origen: { ubicacionId: ubicacion.T2 ?? "" },
		destino: destino === null ? null : { ubicacionId: ubicacion[destino] ?? "" },
		renglones: variantes.map((varianteId, i) => ({ varianteId, piezas: piezas[i] ?? 0 })),
	});
	return {
		id: creado.traspasoId,
		folio: creado.folio,
		variantes,
		version: await versionDeTraspaso(servidor, creado.traspasoId),
	};
}

/**
 * La versión de un traspaso.
 * @param servidor El servidor de prueba.
 * @param id El traspaso.
 */
export async function versionDeTraspaso(servidor: ServidorDePrueba, id: string): Promise<number> {
	const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM traspasos WHERE id = $1", [id]);
	return Number(rows[0]?.v);
}

/**
 * Aduana despacha unos traspasos con su versión de ahora.
 * @param servidor El servidor de prueba.
 * @param ids Los traspasos.
 * @param destino El destino, si se decide al despachar.
 */
export async function despacharDePrueba(servidor: ServidorDePrueba, ids: string[], destino?: string) {
	const traspasos = [];
	for (const traspaso_id of ids)
		traspasos.push({ traspaso_id, version: await versionDeTraspaso(servidor, traspaso_id) });
	return mandarAccion(
		servidor,
		"inventario.despachar",
		{ datos: { traspasos, ...(destino === undefined ? {} : { destino_ubicacion_id: destino }) } },
		"aduana",
	);
}

/**
 * La versión de un despacho.
 * @param servidor El servidor de prueba.
 * @param id El despacho.
 */
export async function versionDeDespacho(servidor: ServidorDePrueba, id: string): Promise<number> {
	const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM despachos WHERE id = $1", [id]);
	return Number(rows[0]?.v);
}
