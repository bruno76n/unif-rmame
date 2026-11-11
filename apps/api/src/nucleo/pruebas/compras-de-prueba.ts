/**
 * Las ayudas de las pruebas que necesitan proveedores y materiales: escritos directo con el rol dueño, para las
 * pruebas que no prueban su alta (el libro, los traspasos, el cuadre); o con las acciones de Compras, para las de
 * Compras.
 * Fase 10 · docs/fases/10-patronaje-y-compras.md («Cómo se construye»)
 */

import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { mandarAccion } from "./llamadas.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/**
 * Da de alta un proveedor con su tercero, directo en la base.
 * @param servidor El servidor de prueba.
 * @param nombre Su nombre; si no viene, uno que no choca.
 * @returns Su id y el de su tercero.
 */
export async function proveedorDePrueba(servidor: ServidorDePrueba, nombre = `Proveedor ${uuidv7()}`) {
	const terceroId = uuidv7();
	const proveedorId = uuidv7();
	await servidor.base.dueno.query(
		`INSERT INTO terceros (id, nombre, nombre_busqueda, es_proveedor)
		 VALUES ($1, $2, regexp_replace(sin_acentos(btrim($2)), '\\s+', ' ', 'g'), true)`,
		[terceroId, nombre],
	);
	await servidor.base.dueno.query(
		`INSERT INTO proveedores (id, tercero_id, ciudad, telefono, dias_credito, dias_dice_tardar)
		 VALUES ($1, $2, 'León', '4775550100', 30, 12)`,
		[proveedorId, terceroId],
	);
	return { proveedorId, terceroId };
}

/**
 * Da de alta materiales de un tipo, cada uno con su proveedor habitual y el precio del alta, directo en la base.
 * @param servidor El servidor de prueba.
 * @param cuantos Cuántos.
 * @param tipo Su tipo: la tela va en metros; lo demás, en piezas.
 * @returns Sus ids.
 */
export async function materialesDePrueba(
	servidor: ServidorDePrueba,
	cuantos: number,
	tipo: "tela" | "avio" | "consumible" = "avio",
): Promise<string[]> {
	const { proveedorId } = await proveedorDePrueba(servidor);
	const ids: string[] = [];
	for (let i = 0; i < cuantos; i++) {
		const id = uuidv7();
		const nombre = `Material ${id}`;
		await servidor.base.dueno.query(
			`INSERT INTO materiales (id, nombre, nombre_normalizado, tipo, unidad, dias_cubre, proveedor_habitual_id)
			 VALUES ($1, $2, sin_acentos($2), $3, $4, 60, $5)`,
			[id, nombre, tipo, tipo === "tela" ? "m" : "pza", proveedorId],
		);
		await servidor.base.dueno.query(
			`INSERT INTO material_proveedores (id, material_id, proveedor_id, ultimo_precio_centavos) VALUES ($1, $2, $3, 100)`,
			[uuidv7(), id, proveedorId],
		);
		ids.push(id);
	}
	return ids;
}

/**
 * Compras da de alta un proveedor con su acción.
 * @param servidor El servidor de prueba.
 * @param datos Lo que cambia de la ficha de ejemplo (Textiles Aurora, de León).
 * @returns Su id.
 */
export async function altaDeProveedor(
	servidor: ServidorDePrueba,
	datos: Record<string, unknown> = {},
): Promise<string> {
	const respuesta = await mandarAccion(
		servidor,
		"compras.crear_proveedor",
		{
			datos: {
				nombre: `Proveedor ${uuidv7()}`,
				ciudad: "León",
				telefono: "477 555 0100",
				dias_credito: 30,
				dias_dice_tardar: 12,
				...datos,
			},
		},
		"compras",
	);
	if (respuesta.estado !== 200) throw new Error(`el alta del proveedor respondió ${JSON.stringify(respuesta.cuerpo)}`);
	return z.object({ proveedor_id: z.uuid() }).parse(respuesta.cuerpo.resultado).proveedor_id;
}

/**
 * Compras da de alta un material con su acción.
 * @param servidor El servidor de prueba.
 * @param proveedorId Su proveedor habitual.
 * @param datos Lo que cambia del material de ejemplo (un avío en piezas, a $0.38).
 * @returns Su id.
 */
export async function altaDeMaterial(
	servidor: ServidorDePrueba,
	proveedorId: string,
	datos: Record<string, unknown> = {},
): Promise<string> {
	const respuesta = await mandarAccion(
		servidor,
		"compras.crear_material",
		{
			datos: {
				nombre: `Material ${uuidv7()}`,
				tipo: "avio",
				unidad: "pza",
				proveedor_id: proveedorId,
				costo_centavos: 38,
				minimo: 0,
				multiplo_compra: 1,
				dias_cubre: 60,
				...datos,
			},
		},
		"compras",
	);
	if (respuesta.estado !== 200) throw new Error(`el alta del material respondió ${JSON.stringify(respuesta.cuerpo)}`);
	return z.object({ material_id: z.uuid() }).parse(respuesta.cuerpo.resultado).material_id;
}

/**
 * La versión de un renglón, como la leería la pantalla.
 * @param servidor El servidor de prueba.
 * @param tabla La tabla (de las de Compras).
 * @param id El renglón.
 */
export async function versionDe(
	servidor: ServidorDePrueba,
	tabla: "proveedores" | "materiales",
	id: string,
): Promise<number> {
	const { rows } = await servidor.base.dueno.query(`SELECT version FROM ${tabla} WHERE id = $1`, [id]);
	return Number(rows[0]?.version);
}

/**
 * Compras levanta una orden: regresa la primera orden que tocó.
 * @param servidor El servidor de prueba.
 * @param renglones Lo que se pide.
 * @param quien Quién la levanta.
 */
export async function levantarDePrueba(
	servidor: ServidorDePrueba,
	renglones: { material_id: string; proveedor_id: string; cantidad: number; precio_centavos: number }[],
	quien = "compras",
): Promise<{ id: string; folio: string }> {
	const respuesta = await mandarAccion(servidor, "compras.levantar_orden", { datos: { renglones } }, quien);
	if (respuesta.estado !== 200) throw new Error(`no se levantó la orden: ${JSON.stringify(respuesta.cuerpo)}`);
	const [orden] = z
		.object({ ordenes: z.array(z.object({ orden_id: z.uuid(), folio: z.string() })) })
		.parse(respuesta.cuerpo.resultado).ordenes;
	if (orden === undefined) throw new Error("la orden no regresó");
	return { id: orden.orden_id, folio: orden.folio };
}

/**
 * Lo que se ve en el cajón de un borrador: sus líneas con su cantidad y su precio, su fecha prometida y su versión.
 * @param servidor El servidor de prueba.
 * @param ordenId La orden.
 */
export async function cajonDeLaOrden(servidor: ServidorDePrueba, ordenId: string) {
	const { rows: lineas } = await servidor.base.dueno.query(
		`SELECT l.id AS orden_compra_linea_id, l.cantidad::int AS cantidad, l.precio_orden_centavos::int AS precio_centavos
		 FROM orden_compra_lineas l JOIN materiales m ON m.id = l.material_id WHERE l.orden_compra_id = $1 ORDER BY m.nombre`,
		[ordenId],
	);
	const { rows } = await servidor.base.dueno.query(
		"SELECT fecha_prometida::text AS fecha_prometida, version::int AS version FROM ordenes_compra WHERE id = $1",
		[ordenId],
	);
	return {
		datos: { orden_compra_id: ordenId, renglones: lineas, fecha_prometida: String(rows[0]?.fecha_prometida) },
		version: Number(rows[0]?.version),
	};
}

/**
 * Compras marca enviada una orden con lo que se ve en su cajón (y lo que cambie).
 * @param servidor El servidor de prueba.
 * @param ordenId La orden.
 * @param cambios Lo que cambia de lo que se ve.
 */
export async function enviarDePrueba(
	servidor: ServidorDePrueba,
	ordenId: string,
	cambios: Record<string, unknown> = {},
) {
	const cajon = await cajonDeLaOrden(servidor, ordenId);
	return mandarAccion(
		servidor,
		"compras.marcar_orden_enviada",
		{ datos: { ...cajon.datos, ...cambios }, version: cajon.version },
		"compras",
	);
}

/**
 * Pone una orden en un estado como si ya hubiera pasado por él (enviada, recibida…), directo en la base: para las
 * pruebas que no prueban el envío ni la recepción (que llega con Aduana en la fase 11).
 * @param servidor El servidor de prueba.
 * @param ordenId La orden.
 * @param estado El estado.
 * @param enviadaHace Hace cuántos minutos se envió.
 */
export async function ordenEnEstado(servidor: ServidorDePrueba, ordenId: string, estado: string, enviadaHace = 0) {
	await servidor.base.dueno.query(
		`UPDATE ordenes_compra SET estado = $2, enviada_en = now() - make_interval(mins => $3::int),
			dias_credito = coalesce(dias_credito, 30), fecha_prometida = coalesce(fecha_prometida, current_date),
			cancelado_en = CASE WHEN $2 = 'cancelada' THEN now() END,
			motivo_cancelacion = CASE WHEN $2 = 'cancelada' THEN 'Prueba' END,
			cerrada_en = CASE WHEN $2 IN ('cerrada', 'cerrada_con_faltante') THEN now() END,
			motivo_cierre = CASE WHEN $2 = 'cerrada_con_faltante' THEN 'Prueba' END
		 WHERE id = $1`,
		[ordenId, estado, enviadaHace],
	);
}

/**
 * Una orden en borrador de un material nuevo de un proveedor nuevo, por 100 piezas a 38 centavos.
 * @param servidor El servidor de prueba.
 * @returns La orden, su material y su proveedor.
 */
export async function ordenDePrueba(servidor: ServidorDePrueba) {
	const proveedor = await altaDeProveedor(servidor);
	const material = await altaDeMaterial(servidor, proveedor, { nombre: `Botón ${uuidv7().slice(-6)}` });
	const orden = await levantarDePrueba(servidor, [
		{ material_id: material, proveedor_id: proveedor, cantidad: 100, precio_centavos: 38 },
	]);
	return { ...orden, material, proveedor };
}

/**
 * Compras manda una acción con motivo sobre una orden (cancelar o cerrar con faltante), con su versión de ahora.
 * @param servidor El servidor de prueba.
 * @param accion La acción, sin el módulo.
 * @param ordenId La orden.
 * @param motivo El motivo.
 */
export async function conMotivoSobreOrden(servidor: ServidorDePrueba, accion: string, ordenId: string, motivo: string) {
	const { rows } = await servidor.base.dueno.query("SELECT version::int AS v FROM ordenes_compra WHERE id = $1", [
		ordenId,
	]);
	return mandarAccion(
		servidor,
		`compras.${accion}`,
		{ datos: { orden_compra_id: ordenId, motivo }, version: rows[0]?.v },
		"compras",
	);
}

/**
 * Si la orden cuenta como en camino: enviada o recibida en parte.
 * @param servidor El servidor de prueba.
 * @param ordenId La orden.
 */
export async function ordenEnCamino(servidor: ServidorDePrueba, ordenId: string): Promise<boolean> {
	const { rows } = await servidor.base.dueno.query("SELECT estado FROM ordenes_compra WHERE id = $1", [ordenId]);
	return ["enviada", "recibida_en_parte"].includes(String(rows[0]?.estado));
}
