/**
 * Ayudas de prueba de Producción: un flujo con su corte y sus operaciones, un lote hecho directo en la base y una
 * prenda que pasa por el taller.
 * Fase 12 · docs/modulos/produccion/operaciones-y-flujos.md
 */

import type pg from "pg";
import { v7 as uuidv7 } from "uuid";
import { nuevoProducto, type SiembraDelCatalogo } from "./catalogo-de-prueba.ts";
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
