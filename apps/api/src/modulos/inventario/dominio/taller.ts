/**
 * El reparto de lo que llega del taller: a dónde va un lote (o uno de sus reprocesos) y en qué tipo de A-.
 * Fase 14 · docs/modulos/inventario/recepcion-del-taller.md (reglas 4 y 5)
 *
 * Lo usan la recepción del taller y la aclaración `llego` de una DF- del taller, que entra con el mismo reparto. Un
 * lote de pedido se reparte con lo que le falta al pedido, que da Ventas (fase 16).
 */

import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { type TipoDeTraspaso, traspasoLineas, traspasos } from "../tablas.ts";
import { ubicacionDeTipo, ubicacionPorId } from "./recepciones.ts";
import { crearReserva } from "./reservas.ts";
import { crearTraspaso, type LadoDeTraspaso, type TraspasoCreado } from "./traspasos.ts";

/** Lo que regresa `produccion.lote_para_aduana`. */
const loteParaAduana = z
	.object({
		lote_id: z.uuid(),
		folio: z.string(),
		prenda: z.string(),
		estado: z.string(),
		destino: z.enum(["pedido", "tienda", "temporada"]),
		pedido_id: z.uuid().nullable(),
		ubicacion_destino_id: z.uuid().nullable(),
		fecha_entrega: z.string(),
		tallas: z.array(z.object({ variante_id: z.uuid(), piezas_a_bodega: z.number() })),
	})
	.nullable();

/** Un lote como lo lee Aduana. */
export type LoteParaAduana = NonNullable<z.infer<typeof loteParaAduana>>;

/**
 * Lee un lote para recibirlo.
 * @param contexto El contexto de la acción.
 * @param loteId El lote.
 * @throws `404` si no existe.
 */
export async function leerLoteParaAduana(contexto: ContextoDeAccion, loteId: string): Promise<LoteParaAduana> {
	const lote = loteParaAduana.parse(await contexto.lectura("produccion.lote_para_aduana", { lote_id: loteId }));
	if (lote === null) throw noExiste();
	return lote;
}

/** Lo que el reparto de un lote de pedido lee de `ventas.avance_pedido`: su folio y, por talla, lo que le falta. */
const avanceParaReparto = z.object({
	folio: z.string(),
	tallas: z.array(z.object({ variante_id: z.uuid(), falta: z.number().int().min(0) })),
});

/** Piezas de una talla. */
export interface PiezasDeTalla {
	varianteId: string;
	piezas: number;
}

/** Una parte del reparto: el tipo de su A-, su destino, cómo se llama, el pedido que aparta y sus piezas por talla. */
export interface ParteDelReparto {
	tipo: TipoDeTraspaso;
	destino: LadoDeTraspaso;
	destinoNombre: string;
	/** El pedido para el que se apartan en Aduana (reserva `pedido_externo`): solo en lo que va al cliente. */
	pedidoId: string | null;
	tallas: PiezasDeTalla[];
}

/**
 * El reparto de lo que llega de un lote o de un reproceso (regla 4), en partes, una por A-: el de una tienda, todo a
 * su tienda (`lote_reabasto`); el de temporada, todo a Bodega (`lote_temporada`); el de un pedido, por talla, primero
 * lo que le falta al pedido, al cliente (`lote_cliente`), y lo demás a Bodega: hasta `piezas_a_bodega` como
 * `quitado_de_pedido` y el resto como `excedente_pedido`. Un reproceso lleva el mismo reparto en A- `reproceso`: lo
 * del cliente en uno y lo de Bodega en otro. Solo van las tallas y las partes con piezas.
 * @param contexto El contexto de la acción, con el candado de las variantes ya puesto: dos recepciones del mismo
 * pedido no reparten lo mismo que le falta.
 * @param lote El lote.
 * @param esReproceso Si lo que llega es un reproceso.
 * @param llegaron Lo que llegó de cada talla.
 */
export async function repartoDelTaller(
	contexto: ContextoDeAccion,
	lote: LoteParaAduana,
	esReproceso: boolean,
	llegaron: readonly PiezasDeTalla[],
): Promise<ParteDelReparto[]> {
	const conPiezas = llegaron.filter((talla) => talla.piezas > 0);
	if (conPiezas.length === 0) return [];
	if (lote.destino === "pedido") return repartoDePedido(contexto, lote, esReproceso, conPiezas);
	const destinoId =
		lote.destino === "tienda"
			? (lote.ubicacion_destino_id ?? "")
			: await ubicacionDeTipo(contexto.transaccion, "bodega");
	const destino = await ubicacionPorId(contexto.transaccion, destinoId);
	if (destino === undefined) throw new Error(`${lote.folio} sin destino`);
	const tipo: TipoDeTraspaso = esReproceso
		? "reproceso"
		: lote.destino === "tienda"
			? "lote_reabasto"
			: "lote_temporada";
	return [
		{ tipo, destino: { ubicacionId: destinoId }, destinoNombre: destino.nombre, pedidoId: null, tallas: conPiezas },
	];
}

/** El reparto de un lote de pedido: lo que le falta al pedido, al cliente; lo demás, a Bodega. */
async function repartoDePedido(
	contexto: ContextoDeAccion,
	lote: LoteParaAduana,
	esReproceso: boolean,
	llegaron: readonly PiezasDeTalla[],
): Promise<ParteDelReparto[]> {
	if (lote.pedido_id === null) throw new Error(`${lote.folio} de pedido sin pedido`);
	const avance = avanceParaReparto.parse(await contexto.lectura("ventas.avance_pedido", { pedido_id: lote.pedido_id }));
	const yaQuitadas = esReproceso ? new Map<string, number>() : await quitadasDelLote(contexto, lote.lote_id);
	const bodegaId = await ubicacionDeTipo(contexto.transaccion, "bodega");
	const bodega = { destino: { ubicacionId: bodegaId }, destinoNombre: "Bodega", pedidoId: null };
	const alCliente: PiezasDeTalla[] = [];
	const quitadas: PiezasDeTalla[] = [];
	const deMas: PiezasDeTalla[] = [];
	for (const { varianteId, piezas } of llegaron) {
		const falta = avance.tallas.find((talla) => talla.variante_id === varianteId)?.falta ?? 0;
		const aBodega = lote.tallas.find((talla) => talla.variante_id === varianteId)?.piezas_a_bodega ?? 0;
		const cliente = Math.min(piezas, falta);
		const quitado = Math.min(piezas - cliente, Math.max(0, aBodega - (yaQuitadas.get(varianteId) ?? 0)));
		alCliente.push({ varianteId, piezas: cliente });
		quitadas.push({ varianteId, piezas: quitado });
		deMas.push({ varianteId, piezas: piezas - cliente - quitado });
	}
	const conPiezas = (tallas: PiezasDeTalla[]) => tallas.filter((talla) => talla.piezas > 0);
	const partes: ParteDelReparto[] = [
		{
			tipo: esReproceso ? "reproceso" : "lote_cliente",
			destino: { externo: "cliente_externo" },
			destinoNombre: avance.folio,
			pedidoId: lote.pedido_id,
			tallas: conPiezas(alCliente),
		},
		...(esReproceso
			? [
					{
						tipo: "reproceso" as const,
						...bodega,
						tallas: conPiezas(
							llegaron.map((talla, i) => ({ ...talla, piezas: talla.piezas - (alCliente[i]?.piezas ?? 0) })),
						),
					},
				]
			: [
					{ tipo: "quitado_de_pedido" as const, ...bodega, tallas: conPiezas(quitadas) },
					{ tipo: "excedente_pedido" as const, ...bodega, tallas: conPiezas(deMas) },
				]),
	];
	return partes.filter((parte) => parte.tallas.length > 0);
}

/**
 * Lo que ya salió de un lote como `quitado_de_pedido`, por talla: lo que entra después (una DF- aclarada como `llego`)
 * no pasa de `piezas_a_bodega`.
 */
async function quitadasDelLote(contexto: ContextoDeAccion, loteId: string): Promise<Map<string, number>> {
	const filas = await contexto.transaccion
		.select({
			varianteId: traspasoLineas.varianteId,
			piezas: sql<number>`coalesce(sum(${traspasoLineas.piezasEnviadas}), 0)`.mapWith(Number),
		})
		.from(traspasoLineas)
		.innerJoin(traspasos, eq(traspasos.id, traspasoLineas.traspasoId))
		.where(
			and(
				eq(traspasos.loteId, loteId),
				eq(traspasos.tipo, "quitado_de_pedido"),
				ne(traspasos.estado, "cancelado"),
				sql`${traspasos.traspasoPadreId} is null`,
			),
		)
		.groupBy(traspasoLineas.varianteId);
	return new Map(filas.flatMap((fila) => (fila.varianteId === null ? [] : [[fila.varianteId, fila.piezas]])));
}

/** Un A- que nació del reparto, con su parte. */
export interface ParteCreada extends TraspasoCreado {
	parte: ParteDelReparto;
}

/**
 * Crea un A- `en_aduana` por parte del reparto, del Taller (o del hueco de la DF-) a su destino, con su lote, su
 * reproceso y su recepción, la entrega del lote como salida esperada y sus etiquetas por imprimir (regla 5). Guarda
 * su evento `traspaso.en_aduana`.
 * @param contexto El contexto de la acción.
 * @param partes El reparto.
 * @param datos De dónde sale, el lote, el reproceso y la recepción.
 */
export async function crearPartesDelReparto(
	contexto: ContextoDeAccion,
	partes: readonly ParteDelReparto[],
	datos: { origenId: string; lote: LoteParaAduana; reprocesoId: string | null; recepcionId?: string },
): Promise<ParteCreada[]> {
	const creadas: ParteCreada[] = [];
	for (const parte of partes) {
		const nuevo = await crearTraspaso(contexto, {
			tipo: parte.tipo,
			estado: "en_aduana",
			origen: { ubicacionId: datos.origenId },
			destino: parte.destino,
			renglones: parte.tallas.map((talla) => ({ ...talla, loteId: datos.lote.lote_id })),
			referencias: {
				loteId: datos.lote.lote_id,
				...(parte.pedidoId === null ? {} : { pedidoId: parte.pedidoId }),
				...(datos.reprocesoId === null ? {} : { reprocesoId: datos.reprocesoId }),
				...(datos.recepcionId === undefined ? {} : { recepcionAduanaId: datos.recepcionId }),
			},
			fechaSalidaEsperada: datos.lote.fecha_entrega,
		});
		contexto.guardarEvento({
			tipo: "traspaso.en_aduana",
			datos: { traspaso_id: nuevo.traspasoId },
			tablas: ["traspasos", "traspaso_lineas", "existencias", "reservas"],
			entidad: "traspasos",
			entidadId: nuevo.traspasoId,
			entidadFolio: nuevo.folio,
		});
		creadas.push({ ...nuevo, parte });
	}
	return creadas;
}

/**
 * Aparta en Aduana lo que va al cliente: una reserva `pedido_externo` por talla, ligada a su A-. Se llama después del
 * movimiento que dejó las piezas en Aduana.
 * @param contexto El contexto de la acción.
 * @param creadas Los A- del reparto.
 */
export async function apartarLoDelCliente(contexto: ContextoDeAccion, creadas: readonly ParteCreada[]) {
	const aduana = await ubicacionDeTipo(contexto.transaccion, "aduana");
	for (const { traspasoId, parte } of creadas) {
		if (parte.pedidoId === null) continue;
		for (const talla of parte.tallas) {
			await crearReserva(contexto, {
				ubicacionId: aduana,
				varianteId: talla.varianteId,
				piezas: talla.piezas,
				motivo: "pedido_externo",
				pedidoId: parte.pedidoId,
				traspasoId,
			});
		}
	}
}

/** Los destinos de un reparto, para el mensaje: «PE-0042 y Bodega». */
export function nombresDelReparto(partes: readonly ParteDelReparto[]): string {
	return new Intl.ListFormat("es", { type: "conjunction" }).format([
		...new Set(partes.map((parte) => parte.destinoNombre)),
	]);
}
