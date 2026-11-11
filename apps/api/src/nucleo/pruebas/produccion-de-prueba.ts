/**
 * Ayudas de prueba de Producción: un flujo con su corte y sus operaciones, un lote hecho directo en la base y una
 * prenda que pasa por el taller.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md
 */

import type pg from "pg";
import { v7 as uuidv7 } from "uuid";
import { escribirMovimiento } from "../../modulos/inventario/dominio/escribir-movimiento.ts";
import { crearBase } from "../base/conexion.ts";
import { enAccionDePrueba } from "./accion-de-prueba.ts";
import { nuevoProducto, type SiembraDelCatalogo } from "./catalogo-de-prueba.ts";
import {
	guardarRecetaDePrueba,
	type MaterialesDeReceta,
	materialesDeReceta,
	recetaDeEjemplo,
} from "./patronaje-de-prueba.ts";
import { nuevaPersona } from "./personas-de-prueba.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/** Un flujo de prueba: su id, su nombre, quien hace sus operaciones y sus operaciones en orden (la primera, el corte). */
export interface FlujoDePrueba {
	flujoId: string;
	nombre: string;
	personaId: string;
	operaciones: { flujoOperacionId: string; operacionId: string; nombre: string }[];
}

/**
 * Da de alta, con el rol dueño, un flujo con el corte y otras operaciones nuevas, todas de una persona del Taller.
 * @param dueno La conexión con el rol dueño.
 * @param demas Cuántas operaciones lleva después del corte.
 */
export async function flujoDePrueba(dueno: pg.Pool, demas = 2): Promise<FlujoDePrueba> {
	const sufijo = uuidv7().slice(-8);
	const personaId = await nuevaPersona(dueno, "taller");
	const flujoId = uuidv7();
	const nombre = `Flujo de prueba ${sufijo}`;
	await dueno.query("INSERT INTO flujos (id, nombre) VALUES ($1, $2)", [flujoId, nombre]);
	const { rows } = await dueno.query("SELECT id, nombre FROM operaciones WHERE es_corte");
	const corte = { id: String(rows[0]?.id), nombre: String(rows[0]?.nombre) };
	const otras = Array.from({ length: demas }, (_, i) => ({ id: uuidv7(), nombre: `Operación ${i + 1} ${sufijo}` }));
	for (const otra of otras)
		await dueno.query("INSERT INTO operaciones (id, nombre) VALUES ($1, $2)", [otra.id, otra.nombre]);
	const operaciones = [];
	for (const [i, operacion] of [corte, ...otras].entries()) {
		const flujoOperacionId = uuidv7();
		await dueno.query(
			"INSERT INTO flujo_operaciones (id, flujo_id, operacion_id, orden, persona_base_id) VALUES ($1, $2, $3, $4, $5)",
			[flujoOperacionId, flujoId, operacion.id, i + 1, personaId],
		);
		operaciones.push({ flujoOperacionId, operacionId: operacion.id, nombre: operacion.nombre });
	}
	return { flujoId, nombre, personaId, operaciones };
}

/**
 * Una operación de un flujo de prueba que no es el corte: la que recibe una tarifa.
 * @param dueno La conexión con el rol dueño.
 * @returns Su id en el flujo, su nombre y el del flujo.
 */
export async function operacionDePrueba(dueno: pg.Pool) {
	const flujo = await flujoDePrueba(dueno, 1);
	const [, operacion] = flujo.operaciones;
	if (operacion === undefined) throw new Error("el flujo de prueba no tiene operaciones");
	return { id: operacion.flujoOperacionId, nombre: operacion.nombre, flujo: flujo.nombre };
}

/**
 * Da de alta, con el rol dueño, una orden de temporada con un lote por cortar de una prenda: lo que necesita lo que
 * apunta a un lote (un movimiento, una receta verificada) cuando la prueba no pasa por la orden.
 * @param dueno La conexión con el rol dueño.
 * @param productoId La prenda del lote.
 * @returns El id del lote.
 */
export async function loteDePrueba(dueno: pg.Pool, productoId: string): Promise<string> {
	const sufijo = uuidv7().slice(-8);
	const ordenId = uuidv7();
	const loteId = uuidv7();
	await dueno.query(
		`INSERT INTO ordenes_produccion (id, folio, motivo, ubicacion_destino_id, fecha, fecha_entrega, creado_por)
		 SELECT $1, $2, 'temporada', u.id, current_date, current_date + 21, (SELECT id FROM usuarios ORDER BY id LIMIT 1)
		 FROM ubicaciones u WHERE u.codigo = 'BOD'`,
		[ordenId, `OP-P${sufijo}`],
	);
	await dueno.query(
		`INSERT INTO lotes (id, folio, orden_produccion_id, producto_id, destino, ubicacion_destino_id, fecha_corte, fecha_entrega)
		 SELECT $1, $2, $3, $4, 'temporada', ubicacion_destino_id, fecha, fecha_entrega FROM ordenes_produccion WHERE id = $3`,
		[loteId, `L-P${sufijo}`, ordenId, productoId],
	);
	return loteId;
}

/** Una prenda que pasa por el taller: con su flujo de prueba y sus tallas por nombre. */
export interface PrendaDelTaller {
	productoId: string;
	nombre: string;
	flujo: FlujoDePrueba;
	/** Por nombre de talla («4», «6», «8»), su variante. */
	variantes: Record<string, string>;
}

/**
 * Da de alta, como Catálogo, una playera infantil (tallas 4, 6 y 8) con un flujo de prueba.
 * @param servidor El servidor de prueba.
 * @param siembra Los ids de la siembra del catálogo.
 * @param cambios Lo que cambia del alta.
 */
export async function prendaDelTaller(
	servidor: ServidorDePrueba,
	siembra: SiembraDelCatalogo,
	cambios: Record<string, unknown> = {},
): Promise<PrendaDelTaller> {
	const flujo = await flujoDePrueba(servidor.base.dueno);
	const producto = await nuevoProducto(servidor, siembra, { flujo_id: flujo.flujoId, ...cambios });
	const { rows } = await servidor.base.dueno.query("SELECT nombre FROM productos WHERE id = $1", [
		producto.producto_id,
	]);
	return {
		productoId: producto.producto_id,
		nombre: String(rows[0]?.nombre),
		flujo,
		variantes: Object.fromEntries(producto.variantes.map((variante) => [variante.talla, variante.variante_id])),
	};
}

/** Una prenda del taller con su receta de ejemplo: la gabardina por talla (1, 1.05 y 1.1 m), un cierre y el hilo. */
export interface PrendaParaCortar extends PrendaDelTaller {
	recetaVersionId: string;
	materiales: MaterialesDeReceta;
	/** Por nombre de talla, su talla del catálogo. */
	tallas: Record<string, string>;
}

/**
 * Da de alta una prenda del taller y le guarda la receta de ejemplo.
 * @param servidor El servidor de prueba.
 * @param siembra Los ids de la siembra del catálogo.
 */
export async function prendaParaCortar(
	servidor: ServidorDePrueba,
	siembra: SiembraDelCatalogo,
): Promise<PrendaParaCortar> {
	const prenda = await prendaDelTaller(servidor, siembra);
	const { rows } = await servidor.base.dueno.query(
		"SELECT r.id AS receta, t.nombre, v.talla_id FROM recetas r JOIN variantes v ON v.producto_id = r.producto_id JOIN tallas t ON t.id = v.talla_id WHERE r.producto_id = $1",
		[prenda.productoId],
	);
	const tallas = Object.fromEntries(rows.map((fila) => [String(fila.nombre), String(fila.talla_id)]));
	const conReceta = { productoId: prenda.productoId, recetaId: String(rows[0]?.receta), tallas };
	const materiales = await materialesDeReceta(servidor);
	const guardada = await guardarRecetaDePrueba(servidor, conReceta, recetaDeEjemplo(conReceta, materiales));
	if (guardada.estado !== 200) throw new Error(`no se guardó la receta: ${JSON.stringify(guardada.cuerpo)}`);
	const { rows: version } = await servidor.base.dueno.query(
		"SELECT version_vigente_id FROM recetas WHERE producto_id = $1",
		[prenda.productoId],
	);
	return { ...prenda, recetaVersionId: String(version[0]?.version_vigente_id), materiales, tallas };
}

/**
 * Un rollo de carga inicial con sus metros en Bodega, de una partida de prueba.
 * @param servidor El servidor de prueba.
 * @param materialId La tela.
 * @param metros Sus metros.
 * @param partida El folio de su partida, si se quiere una.
 * @returns Su id y su folio.
 */
export async function rolloEnBodega(
	servidor: ServidorDePrueba,
	materialId: string,
	metros: string,
	partida?: string,
): Promise<{ id: string; folio: string }> {
	const id = uuidv7();
	const folio = `R-P${id.slice(-8)}`;
	let partidaId: string | null = null;
	if (partida !== undefined) {
		const { rows } = await servidor.base.dueno.query(
			`INSERT INTO partidas_tela (id, folio, proveedor_id, material_id, codigo_proveedor)
			 SELECT $1, $2, proveedor_habitual_id, $3, $2 FROM materiales WHERE id = $3
			 ON CONFLICT DO NOTHING RETURNING id`,
			[uuidv7(), partida, materialId],
		);
		partidaId =
			rows[0]?.id ??
			(await servidor.base.dueno.query("SELECT id FROM partidas_tela WHERE folio = $1", [partida])).rows[0]?.id;
	}
	await servidor.base.dueno.query(
		`INSERT INTO rollos (id, folio, material_id, partida_tela_id, metros_iniciales, estado, es_carga_inicial)
		 VALUES ($1, $2, $3, $4, $5, 'disponible', true)`,
		[id, folio, materialId, partidaId, metros],
	);
	const { rows } = await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = 'BOD'");
	await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
		escribirMovimiento(contexto, {
			tipo: "carga_inicial",
			documento: { tipo: "carga_inicial", id: uuidv7() },
			renglones: [{ origen: null, destino: String(rows[0]?.id), materialId, rolloId: id, cantidad: metros }],
			clave: uuidv7(),
		}),
	);
	return { id, folio };
}
