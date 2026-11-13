/**
 * Lo que comparten las pruebas de las consultas de Calidad: un lote revisado con un rechazo y su reproceso, el lote en
 * aduana, un reclamo de un cliente externo sobre ese lote y una devolución con defecto que espera a Calidad. Todo con
 * las acciones del sistema, como lo harían Calidad, Ventas, Dirección y Aduana.
 * Fase 19 · docs/interfaz/fabrica/calidad.md
 */

import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { decidirDePrueba, despacharDePrueba } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { loteRevisado } from "../../../nucleo/pruebas/calidad-de-prueba.ts";
import type { SiembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { listoEnAduanaDePrueba } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import type { ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import {
	darDeAltaClienteDePrueba,
	pedidoConfirmadoDePrueba,
	prendaParaVender,
	renglonDeClienteDePrueba,
	versionDelPedido,
} from "../../../nucleo/pruebas/ventas-de-prueba.ts";

/** Un lote revisado con un rechazo en la talla 4, su reproceso y su defecto. */
export async function revisadoConReproceso(servidor: ServidorDePrueba, siembra: SiembraDelCatalogo) {
	const lote = await loteRevisado(servidor, siembra, [5, 3, 0], 1);
	const { rows } = await servidor.base.dueno.query(
		`SELECT d.id AS defecto_id, d.nombre AS defecto, p.folio AS reproceso_folio
		 FROM reprocesos p JOIN rechazos r ON r.id = p.rechazo_id JOIN defectos d ON d.id = r.defecto_id
		 WHERE p.lote_id = $1`,
		[lote.loteId],
	);
	const fila = z.object({ defecto_id: z.uuid(), defecto: z.string(), reproceso_folio: z.string() }).parse(rows[0]);
	return {
		...lote,
		reprocesoId: z.uuid().parse(lote.reprocesoId),
		defectoId: fila.defecto_id,
		defecto: fila.defecto,
		reprocesoFolio: fila.reproceso_folio,
	};
}

/**
 * Pone un lote en aduana, como si Aduana ya lo hubiera recibido.
 * @param servidor El servidor de prueba.
 * @param loteId El lote revisado.
 */
export async function loteEnAduana(servidor: ServidorDePrueba, loteId: string): Promise<void> {
	await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
		contexto.interna("produccion.marcar_lote_en_aduana", { lote_id: loteId }),
	);
}

/**
 * Calidad registra un reclamo de un cliente externo sobre la talla 4 de un lote revisado.
 * @param servidor El servidor de prueba.
 * @param lote El lote revisado, con su defecto.
 * @returns El reclamo, su folio, su cliente y el código de la prenda.
 */
export async function reclamoDePrueba(
	servidor: ServidorDePrueba,
	lote: Awaited<ReturnType<typeof revisadoConReproceso>>,
) {
	const cliente = await renglonDeClienteDePrueba(servidor);
	const { rows } = await servidor.base.dueno.query("SELECT codigo FROM variantes WHERE id = $1", [
		lote.prenda.variantes["4"],
	]);
	const codigo = String(rows[0]?.codigo);
	const respuesta = await mandarAccion(
		servidor,
		"calidad.registrar_reclamo",
		{
			datos: {
				origen: "cliente_externo",
				cliente_id: cliente.clienteId,
				codigo,
				lote_id: lote.loteId,
				defecto_id: lote.defectoId,
				flujo_operacion_id: lote.prenda.flujo.operaciones[1]?.flujoOperacionId,
				piezas: 4,
				que_dice_cliente: "La costura del costado se abrió a la semana",
			},
		},
		"calidad",
	);
	const { reclamo_id: reclamoId, folio } = z
		.object({ reclamo_id: z.uuid(), folio: z.string() })
		.parse(respuesta.cuerpo.resultado);
	return { reclamoId, folio, cliente: cliente.nombre, codigo };
}

/**
 * Una devolución de un cliente externo que llegó a aduana con defecto y espera a Calidad: se vendieron 4 piezas de la
 * talla 4, se entregaron, Ventas pidió una nota de crédito por 3, Dirección la autorizó y Aduana las recibió con
 * defecto. Igual que en `acciones/revisar-devolucion.prueba.ts`.
 * @param servidor El servidor de prueba.
 * @param defectoId El defecto con que llegan.
 * @returns La devolución, su folio, su renglón, el cliente y la prenda.
 */
export async function devolucionEnAduana(servidor: ServidorDePrueba, defectoId: string) {
	const consultar = async (texto: string, valores: unknown[]) => (await servidor.base.dueno.query(texto, valores)).rows;
	const version = async (tabla: "notas_entrega" | "traspasos", id: string) =>
		z.number().parse((await consultar(`SELECT version::int AS v FROM ${tabla} WHERE id = $1`, [id]))[0]?.v);
	const prenda = await prendaParaVender(servidor);
	const cliente = await darDeAltaClienteDePrueba(servidor);
	const pedido = await pedidoConfirmadoDePrueba(servidor, {
		cliente_id: cliente.cliente_id,
		fecha_entrega: Temporal.Now.plainDateISO("America/Mexico_City").add({ days: 30 }).toString(),
		renglones: [{ variante_id: prenda.variantes["4"], cantidad: 4 }],
	});
	await listoEnAduanaDePrueba(servidor, pedido.pedido_id, prenda.variantes["4"] ?? "", 4);
	const armada = await mandarAccion(
		servidor,
		"ventas.armar_nota_entrega",
		{
			datos: { pedido_id: pedido.pedido_id, renglones: [{ variante_id: prenda.variantes["4"], cantidad: 4 }] },
			version: await versionDelPedido(servidor, pedido.pedido_id),
		},
		"ventas",
	);
	const { nota_id: notaId } = z.object({ nota_id: z.uuid() }).parse(armada.cuerpo.resultado);
	const traspasos = await consultar("SELECT id FROM traspasos WHERE nota_entrega_id = $1", [notaId]);
	await despacharDePrueba(
		servidor,
		traspasos.map((fila) => String(fila.id)),
	);
	await mandarAccion(
		servidor,
		"ventas.confirmar_entrega",
		{ datos: { nota_id: notaId, recibio_nombre: "Laura Méndez" }, version: await version("notas_entrega", notaId) },
		"ventas",
	);
	const [linea] = await consultar("SELECT id FROM nota_entrega_lineas WHERE nota_entrega_id = $1", [notaId]);
	const pedida = await mandarAccion(
		servidor,
		"ventas.pedir_nota_credito",
		{
			datos: {
				nota_id: notaId,
				que_paso: "Regresan con la costura abierta",
				monto_centavos: 30_000,
				piezas: [{ nota_entrega_linea_id: linea?.id, cantidad: 3 }],
			},
		},
		"ventas",
	);
	const { nota_credito_id: ncId } = z.object({ nota_credito_id: z.uuid() }).parse(pedida.cuerpo.resultado);
	const [nc] = await consultar("SELECT autorizacion_id FROM notas_credito WHERE id = $1", [ncId]);
	await decidirDePrueba(servidor, z.uuid().parse(nc?.autorizacion_id), { decision: "autorizar" });
	const [esperada] = await consultar(
		`SELECT t.id, t.folio, l.id AS linea FROM traspasos t JOIN traspaso_lineas l ON l.traspaso_id = t.id
		 WHERE t.nota_credito_id = $1`,
		[ncId],
	);
	const traspasoId = z.uuid().parse(esperada?.id);
	const recibida = await mandarAccion(
		servidor,
		"inventario.recibir_en_aduana",
		{
			datos: {
				traspaso_id: traspasoId,
				modo: "con_diferencias",
				renglones: [{ traspaso_linea_id: esperada?.linea, piezas: 3, con_defecto: true, defecto_id: defectoId }],
			},
			version: await version("traspasos", traspasoId),
		},
		"aduana",
	);
	if (recibida.estado !== 200) throw new Error(`no se recibió: ${JSON.stringify(recibida.cuerpo)}`);
	const [tercero] = await consultar(
		"SELECT t.nombre FROM clientes c JOIN terceros t ON t.id = c.tercero_id WHERE c.id = $1",
		[cliente.cliente_id],
	);
	return {
		traspasoId,
		folio: String(esperada?.folio),
		lineaId: z.uuid().parse(esperada?.linea),
		cliente: String(tercero?.nombre),
		prenda: prenda.nombre,
	};
}
