/**
 * Las ayudas de las pruebas del inventario: las ubicaciones por código, variantes que nadie más usa, piezas que
 * entran con un ajuste, un traspaso nuevo, llamar una interna y cuántas trabas deshizo Postgres.
 * Fase 9 · docs/fases/09-inventario-libro-existencias-reservas-y-traspasos.md («Cómo se construye»)
 */

import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { escribirMovimiento } from "../../modulos/inventario/dominio/escribir-movimiento.ts";
import { crearTraspaso, type PedidoDeTraspaso } from "../../modulos/inventario/dominio/traspasos.ts";
import { crearBase } from "../base/conexion.ts";
import { enAccionDePrueba } from "./accion-de-prueba.ts";
import { nuevoProducto, siembraDelCatalogo } from "./catalogo-de-prueba.ts";
import type { ServidorDePrueba } from "./servidor-de-prueba.ts";

/**
 * Las ubicaciones, por su código (`ADU`, `BOD`, `T1`…).
 * @param servidor El servidor de prueba.
 */
export async function ubicacionesPorCodigo(servidor: ServidorDePrueba): Promise<Record<string, string>> {
	const { rows } = await servidor.base.dueno.query("SELECT codigo, id FROM ubicaciones");
	return Object.fromEntries(rows.map((fila) => [fila.codigo, fila.id]));
}

/**
 * Crea un traspaso con `crearTraspaso`, en su propia transacción.
 * @param servidor El servidor de prueba.
 * @param pedido El traspaso.
 * @returns Su id y su folio.
 */
export function nuevoTraspaso(servidor: ServidorDePrueba, pedido: PedidoDeTraspaso) {
	return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
		crearTraspaso(contexto, pedido),
	);
}

/**
 * Variantes para una prueba, sin existencia, reservas ni traspasos: cada llamada da otras, para que las pruebas de un
 * archivo no se pisen. Primero las de la muestra que siguen libres; si ya no alcanzan (la muestra trae existencia en
 * Bodega desde la fase 14), da de alta una playera nueva con sus tallas 4, 6 y 8 como Catálogo, las veces que haga falta.
 * @param servidor El servidor de prueba.
 * @param cuantas Cuántas.
 */
export async function variantesLibres(servidor: ServidorDePrueba, cuantas: number): Promise<string[]> {
	const { rows } = await servidor.base.dueno.query(
		`SELECT v.id FROM variantes v WHERE v.baja_en IS NULL AND NOT v.es_pedido_especial
			AND NOT EXISTS (SELECT 1 FROM existencias e WHERE e.variante_id = v.id)
			AND NOT EXISTS (SELECT 1 FROM reservas r WHERE r.variante_id = v.id)
			AND NOT EXISTS (SELECT 1 FROM traspaso_lineas l WHERE l.variante_id = v.id)
			AND NOT EXISTS (SELECT 1 FROM conteo_lineas c WHERE c.variante_id = v.id)
		 ORDER BY random() LIMIT $1`,
		[cuantas],
	);
	const libres: string[] = rows.map((fila) => fila.id);
	while (libres.length < cuantas) {
		const nueva = await nuevoProducto(servidor, await siembraDelCatalogo(servidor));
		libres.push(...nueva.variantes.map((variante) => variante.variante_id).slice(0, cuantas - libres.length));
	}
	return libres;
}

/**
 * Mete piezas a una ubicación con un ajuste de entrada.
 * @param servidor El servidor de prueba.
 * @param ubicacionId La ubicación.
 * @param varianteId La variante.
 * @param piezas Cuántas.
 */
export function meterPiezas(servidor: ServidorDePrueba, ubicacionId: string, varianteId: string, piezas: number) {
	return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
		escribirMovimiento(contexto, {
			tipo: "ajuste",
			documento: { tipo: "ajuste", id: uuidv7() },
			renglones: [{ origen: null, destino: ubicacionId, varianteId, piezas }],
			clave: uuidv7(),
		}),
	);
}

/**
 * Llama una interna en su propia transacción, guardando sus eventos como el corredor.
 * @param servidor El servidor de prueba.
 * @param nombre La interna (`inventario.reservar`).
 * @param datos Lo que recibe.
 */
export function llamarInterna(servidor: ServidorDePrueba, nombre: string, datos: unknown) {
	return enAccionDePrueba(
		crearBase(servidor.base.app),
		servidor.modulos,
		(contexto) => contexto.interna(nombre, datos),
		{ guardarEventos: true },
	);
}

/**
 * Un pedido externo con un lote listo en aduana: el traspaso `lote_cliente`, las piezas en Aduana y su reserva
 * `pedido_externo` ligada al traspaso.
 * @param servidor El servidor de prueba.
 * @param piezas Las piezas del lote.
 * @returns La variante, el pedido y el traspaso del lote.
 */
export async function pedidoListoEnAduana(servidor: ServidorDePrueba, piezas: number) {
	const ubicacion = await ubicacionesPorCodigo(servidor);
	const [variante = ""] = await variantesLibres(servidor, 1);
	const pedido = uuidv7();
	const lote = await nuevoTraspaso(servidor, {
		tipo: "lote_cliente",
		estado: "en_aduana",
		origen: { ubicacionId: ubicacion.TAL ?? "" },
		destino: { externo: "cliente_externo" },
		renglones: [{ varianteId: variante, piezas }],
		referencias: { pedidoId: pedido },
	});
	await meterPiezas(servidor, ubicacion.ADU ?? "", variante, piezas);
	await servidor.base.dueno.query(
		`INSERT INTO reservas (id, ubicacion_id, variante_id, piezas, motivo, pedido_id, traspaso_id, estado)
		 VALUES ($1, $2, $3, $4, 'pedido_externo', $5, $6, 'activa')`,
		[uuidv7(), ubicacion.ADU, variante, piezas, pedido, lote.traspasoId],
	);
	return { variante, pedido, lote };
}

/**
 * Las reservas activas de un pedido, por motivo, con el folio y el tipo de su traspaso.
 * @param servidor El servidor de prueba.
 * @param pedido El pedido.
 */
export async function reservasActivasDelPedido(servidor: ServidorDePrueba, pedido: string) {
	const { rows } = await servidor.base.dueno.query(
		`SELECT r.motivo, r.piezas, t.folio, t.tipo FROM reservas r JOIN traspasos t ON t.id = r.traspaso_id
		 WHERE r.pedido_id = $1 AND r.estado = 'activa' ORDER BY r.motivo, r.piezas`,
		[pedido],
	);
	return rows;
}

/**
 * Cuántas veces Postgres ha deshecho una traba (deadlock) en la base de la prueba. Espera a que los procesos de la base
 * publiquen su cuenta (lo hacen a lo más cada segundo) y la lee sin la foto anterior. Una prueba de candados la lee
 * antes y después: el núcleo reintenta una acción trabada sin que se vea en la respuesta.
 * @param servidor El servidor de prueba.
 */
export async function trabasDeLaBase(servidor: ServidorDePrueba): Promise<number> {
	await new Promise((listo) => setTimeout(listo, 1500));
	await servidor.base.dueno.query("SELECT pg_stat_clear_snapshot()");
	const { rows } = await servidor.base.dueno.query(
		"SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()",
	);
	return z.object({ n: z.number() }).parse(rows[0]).n;
}
