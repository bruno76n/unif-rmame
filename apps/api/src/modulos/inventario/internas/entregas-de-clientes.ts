/**
 * Lo que Inventario hace por un pedido externo cuando Ventas se lo pide: pasar a bodega lo listo que el cliente ya no
 * quiere y sacar del inventario lo que el cliente firmó de recibido.
 * Fase 16 · docs/modulos/inventario/entregas-y-devoluciones-de-clientes.md (reglas 1 y 2, «Acciones internas»)
 *
 * No escriben bitácora propia: la lleva la acción de Ventas que las llama.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { confirmarLlegada, contar, loDelDespacho } from "../acciones/despachos.ts";
import { candadoDeVariantes } from "../dominio/candados.ts";
import { ubicacionDeTipo } from "../dominio/recepciones.ts";
import { nombreDeVariante, reservasActivas, terminarReserva, tomarDeReservas } from "../dominio/reservas.ts";
import { repartirTraspaso } from "../dominio/traspasos.ts";
import { despachos, reservas } from "../tablas.ts";
import { renglonesARepartir } from "./reservas.ts";

/** Lo que recibe `inventario.entregar_a_cliente_externo`. */
const pedidoDeEntrega = z
	.object({
		nota_entrega_id: z.uuid(),
		despacho_id: z.uuid(),
		recibio_nombre: z.string().min(1),
		ocurrido_en: z.string(),
	})
	.strict();

/**
 * `inventario.entregar_a_cliente_externo`: lo que el cliente firmó sale del inventario (regla 2). La recepción
 * `entrega_cliente`, en Tránsito, completa; el movimiento `entrega_cliente_externo`, de Tránsito a Fuera, que cumple
 * las reservas de la nota; el despacho y sus traspasos, recibidos, con quién recibió.
 * @param contexto El contexto de `ventas.confirmar_entrega`.
 * @param datos La nota, su despacho, quién recibió y cuándo.
 * @returns La recepción y las piezas que salieron.
 * @throws `422 despacho_no_en_transito` si el despacho ya no está en tránsito.
 */
export async function entregarAClienteExterno(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = pedidoDeEntrega.parse(datos);
	const [despacho] = await contexto.transaccion
		.select()
		.from(despachos)
		.where(eq(despachos.id, pedido.despacho_id))
		.for("update");
	if (despacho === undefined || despacho.notaEntregaId !== pedido.nota_entrega_id) throw noExiste();
	if (despacho.estado !== "en_transito") {
		throw errorDeRegla("despacho_no_en_transito", `${despacho.folio} no está en tránsito.`);
	}
	const lineas = await loDelDespacho(contexto, despacho);
	const llegada = await confirmarLlegada(contexto, despacho, {
		destino: await ubicacionDeTipo(contexto.transaccion, "transito"),
		tipoMovimiento: "entrega_cliente_externo",
		modo: "completo",
		contados: contar(lineas, "completo"),
		noVenia: [],
		recibioNombre: pedido.recibio_nombre,
	});
	return { recepcion_id: llegada.recepcionId, piezas: llegada.llegaron };
}

/** Lo que recibe `inventario.pasar_a_bodega`. */
const pedidoDePasarABodega = z
	.object({
		pedido_id: z.uuid(),
		renglones: z.array(z.object({ variante_id: z.uuid(), piezas: z.number().int().positive() })).min(1),
	})
	.strict();

/**
 * `inventario.pasar_a_bodega`: lo listo en aduana de un pedido que el cliente ya no quiere (regla 1). No mueve nada:
 * sus traspasos se reparten en hijos `quitado_de_pedido` con destino Bodega, uno por padre, y sus reservas se liberan
 * (`quitada_del_pedido`). Aduana lo despacha a Bodega como cualquier otro.
 * @param contexto El contexto de `ventas.pasar_a_bodega`.
 * @param datos El pedido y, por variante, las piezas.
 * @returns Los hijos que nacieron.
 * @throws `422 sin_listo` si una talla pide más de lo listo sin nota.
 */
export async function pasarABodega(contexto: ContextoDeAccion, datos: unknown): Promise<{ traspaso_ids: string[] }> {
	const pedido = pedidoDePasarABodega.parse(datos);
	const { transaccion } = contexto;
	const [aduana, bodega] = [await ubicacionDeTipo(transaccion, "aduana"), await ubicacionDeTipo(transaccion, "bodega")];
	await candadoDeVariantes(
		transaccion,
		pedido.renglones.map((renglon) => renglon.variante_id),
	);
	const listas = await reservasActivas(
		transaccion,
		and(
			eq(reservas.motivo, "pedido_externo"),
			eq(reservas.pedidoId, pedido.pedido_id),
			eq(reservas.ubicacionId, aduana),
		),
	);
	// Por padre, lo que sale de cada renglón suyo: de la reserva tomada, hasta lo que le queda en aduana al renglón.
	const porPadre = new Map<string, { reservaIds: string[]; porVariante: Map<string, number> }>();
	for (const { variante_id, piezas } of pedido.renglones) {
		const suyas = listas.filter((reserva) => reserva.varianteId === variante_id);
		const listo = suyas.reduce((suma, reserva) => suma + reserva.piezas, 0);
		if (piezas > listo) {
			const { prenda, talla } = await nombreDeVariante(transaccion, variante_id);
			throw errorDeRegla("sin_listo", `Solo hay ${listo} listas de ${prenda} talla ${talla}`);
		}
		for (const tomada of await tomarDeReservas(contexto, suyas, piezas, "quitada_del_pedido")) {
			if (tomada.traspasoId === null) throw new Error(`la reserva ${tomada.id} en aduana no tiene traspaso`);
			const suyo = porPadre.get(tomada.traspasoId) ?? { reservaIds: [], porVariante: new Map<string, number>() };
			suyo.reservaIds.push(tomada.id);
			suyo.porVariante.set(variante_id, (suyo.porVariante.get(variante_id) ?? 0) + tomada.piezas);
			porPadre.set(tomada.traspasoId, suyo);
		}
	}
	const hijos: string[] = [];
	// Los padres en orden por id: dos acciones que reparten los mismos los bloquean igual.
	for (const [padreId, { reservaIds, porVariante }] of [...porPadre].sort(([uno], [otro]) => (uno < otro ? -1 : 1))) {
		for (const reservaId of reservaIds) {
			await terminarReserva(contexto, reservaId, { estado: "liberada", motivoFin: "quitada_del_pedido" });
		}
		const hijo = await repartirTraspaso(contexto, {
			padreId,
			renglones: await renglonesARepartir(contexto, padreId, porVariante),
			hijo: { tipo: "quitado_de_pedido", destino: { ubicacionId: bodega } },
		});
		hijos.push(hijo.traspasoId);
	}
	contexto.guardarEvento({
		tipo: "reserva.liberada",
		datos: { pedido_id: pedido.pedido_id, motivo_fin: "quitada_del_pedido" },
		tablas: ["reservas", "traspasos", "traspaso_lineas"],
	});
	return { traspaso_ids: hijos };
}
