/**
 * Lo que regresa de un cliente: esperarlo en un A- que todavía no es inventario, repartir lo bueno a Bodega al
 * recibirlo y aplicar lo que Calidad decide de lo que llegó con defecto.
 * Fase 16 · docs/modulos/inventario/entregas-y-devoluciones-de-clientes.md (reglas 3 y 4, «Acciones internas»)
 *
 * Lo que llegó con defecto se queda en el padre, en aduana y sin destino, hasta que Calidad lo revisa: lo que sirve
 * pasa a Bodega en un hijo del mismo tipo y la merma sale en un hijo con destino merma. No escriben bitácora propia: la
 * lleva la acción que las llama.
 */

import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { candadoDeVariantes } from "../dominio/candados.ts";
import { escribirMovimiento } from "../dominio/escribir-movimiento.ts";
import { ubicacionDeTipo } from "../dominio/recepciones.ts";
import { bloquearTraspaso, cambiarEstadoTraspaso, crearTraspaso, repartirTraspaso } from "../dominio/traspasos.ts";
import { type TipoDeTraspaso, tiposDeTraspaso, traspasoLineas, traspasos } from "../tablas.ts";

/** Los tipos de traspaso de lo que regresa de un cliente, que espera a Calidad si llegó con defecto. */
export const tiposDeDevolucionDeCliente: readonly TipoDeTraspaso[] = ["devolucion_cliente_externo", "devolucion_linea"];

/** Lo que recibe `inventario.esperar_devolucion`. */
const pedidoDeEspera = z
	.object({
		tipo: z.enum(["devolucion_cliente_externo", "devolucion_linea"]),
		nota_credito_id: z.uuid().optional(),
		pedido_id: z.uuid().optional(),
		devolucion_linea_id: z.uuid().optional(),
		pedido_linea_id: z.uuid().optional(),
		renglones: z
			.array(z.object({ variante_id: z.uuid(), piezas: z.number().int().positive(), lote_id: z.uuid().optional() }))
			.min(1),
	})
	.strict();

/**
 * `inventario.esperar_devolucion`: lo que el documento dice que regresa espera en un A- `esperado`, de cliente
 * externo o en línea, sin destino, con su documento. Ningún movimiento: todavía no es inventario (regla 3).
 * @param contexto El contexto de quien lo pide (la decisión de una nota de crédito).
 * @param datos El tipo, su documento y lo que regresa.
 * @returns El A- y su folio.
 */
export async function esperarDevolucion(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = pedidoDeEspera.parse(datos);
	const nuevo = await crearTraspaso(contexto, {
		tipo: pedido.tipo,
		estado: "esperado",
		origen: { externo: pedido.tipo === "devolucion_cliente_externo" ? "cliente_externo" : "cliente_linea" },
		destino: null,
		renglones: pedido.renglones.map((renglon) => ({
			varianteId: renglon.variante_id,
			piezas: renglon.piezas,
			...(renglon.lote_id === undefined ? {} : { loteId: renglon.lote_id }),
		})),
		referencias: {
			...(pedido.nota_credito_id === undefined ? {} : { notaCreditoId: pedido.nota_credito_id }),
			...(pedido.pedido_id === undefined ? {} : { pedidoId: pedido.pedido_id }),
			...(pedido.devolucion_linea_id === undefined ? {} : { devolucionLineaId: pedido.devolucion_linea_id }),
		},
	});
	contexto.guardarEvento({
		tipo: "traspaso.esperado",
		datos: { traspaso_id: nuevo.traspasoId },
		tablas: ["traspasos", "traspaso_lineas"],
		entidad: "traspasos",
		entidadId: nuevo.traspasoId,
		entidadFolio: nuevo.folio,
	});
	return { traspaso_id: nuevo.traspasoId, folio: nuevo.folio };
}

/**
 * Al recibir una devolución de un cliente, lo que llegó bueno pasa a Bodega en un hijo del mismo tipo; lo que llegó
 * con defecto se queda en el padre para Calidad (regla 3).
 * @param contexto El contexto de `inventario.recibir_en_aduana`.
 * @param padre El A- de la devolución, ya en aduana.
 * @param buenos Por renglón del padre, las piezas que llegaron sin defecto.
 * @returns El hijo para Bodega, si hubo algo bueno.
 */
export async function repartirLoBueno(
	contexto: ContextoDeAccion,
	padre: { id: string; tipo: TipoDeTraspaso },
	buenos: readonly { lineaId: string; piezas: number }[],
) {
	const renglones = buenos.filter((bueno) => bueno.piezas > 0);
	if (renglones.length === 0) return undefined;
	const bodega = await ubicacionDeTipo(contexto.transaccion, "bodega");
	return repartirTraspaso(contexto, {
		padreId: padre.id,
		renglones,
		hijo: { tipo: padre.tipo, destino: { ubicacionId: bodega } },
	});
}

/** Lo que recibe `inventario.aplicar_revision_devolucion`. */
const pedidoDeRevision = z
	.object({
		traspaso_id: z.uuid(),
		/** La versión del traspaso que leyó Calidad. */
		version: z.number().int().optional(),
		renglones: z
			.array(
				z.object({
					traspaso_linea_id: z.uuid(),
					piezas: z.number().int().positive(),
					decision: z.enum(["sirve", "merma"]),
					motivo: z.string().optional(),
				}),
			)
			.min(1),
	})
	.strict();

/**
 * `inventario.aplicar_revision_devolucion`: lo que decide Calidad, por renglón (regla 4). Lo que sirve se reparte en
 * un hijo del mismo tipo con destino Bodega; la merma, en un hijo con destino merma que sale con `merma_calidad`, de
 * Aduana a Fuera. Nada por encima de lo que queda sin decidir; el padre queda repartido cuando ya no le queda nada.
 * @param contexto El contexto de `calidad.revisar_devolucion`.
 * @param datos La devolución, la versión que leyó Calidad y, por renglón, las piezas y lo que se decidió.
 * @returns Los hijos y cuántas piezas fueron a Bodega y a merma.
 * @throws `422 no_espera_calidad` si no está en aduana esperando a Calidad; `422 piezas_mas_que_pendientes`.
 */
export async function aplicarRevisionDevolucion(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = pedidoDeRevision.parse(datos);
	const { transaccion } = contexto;
	const lineas = await transaccion
		.select()
		.from(traspasoLineas)
		.where(eq(traspasoLineas.traspasoId, pedido.traspaso_id))
		.orderBy(asc(traspasoLineas.renglon));
	await candadoDeVariantes(
		transaccion,
		lineas.flatMap((linea) => (linea.varianteId === null ? [] : [linea.varianteId])),
	);
	const padre = await bloquearTraspaso(contexto, pedido.traspaso_id);
	await tomarVersion(contexto, traspasos, padre.id, pedido.version, async () => ({
		traspaso_id: padre.id,
		estado: padre.estado,
	}));
	const tipo = z.enum(tiposDeTraspaso).parse(padre.tipo);
	if (
		padre.estado !== "en_aduana" ||
		padre.traspasoPadreId !== null ||
		!(tiposDeDevolucionDeCliente.includes(tipo) || tipo === "devolucion_defecto")
	) {
		throw errorDeRegla("no_espera_calidad", `${padre.folio} no está esperando a Calidad.`);
	}
	// Por decisión, lo de cada renglón; nada por encima de lo que le queda en aduana.
	const porDecision = { sirve: new Map<string, number>(), merma: new Map<string, number>() };
	for (const renglon of pedido.renglones) {
		const linea = lineas.find((suya) => suya.id === renglon.traspaso_linea_id);
		if (linea === undefined || linea.varianteId === null) throw noExiste();
		const suyo = porDecision[renglon.decision];
		suyo.set(linea.id, (suyo.get(linea.id) ?? 0) + renglon.piezas);
	}
	for (const linea of lineas) {
		const pendientes = (linea.piezasRecibidasAduana ?? 0) - linea.piezasRepartidas;
		const pide = (porDecision.sirve.get(linea.id) ?? 0) + (porDecision.merma.get(linea.id) ?? 0);
		if (pide > pendientes) {
			throw errorDeRegla("piezas_mas_que_pendientes", `En ese renglón quedan ${pendientes} piezas por revisar.`);
		}
	}
	const renglonesDe = (mapa: Map<string, number>) =>
		[...mapa].map(([lineaId, piezas]) => ({ lineaId, piezas })).filter((renglon) => renglon.piezas > 0);
	const bodega = await ubicacionDeTipo(transaccion, "bodega");
	const sirve = renglonesDe(porDecision.sirve);
	const aBodega =
		sirve.length === 0
			? undefined
			: await repartirTraspaso(contexto, {
					padreId: padre.id,
					renglones: sirve,
					hijo: { tipo, destino: { ubicacionId: bodega } },
				});
	const merma = renglonesDe(porDecision.merma);
	const aMerma =
		merma.length === 0
			? undefined
			: await repartirTraspaso(contexto, {
					padreId: padre.id,
					renglones: merma,
					hijo: { tipo, destino: { externo: "merma" } },
				});
	// La merma sale de Aduana a Fuera con su hijo, y el hijo sale.
	if (aMerma !== undefined) {
		const aduana = await ubicacionDeTipo(transaccion, "aduana");
		await escribirMovimiento(contexto, {
			tipo: "merma_calidad",
			documento: { tipo: "traspaso", id: aMerma.traspasoId, folio: aMerma.folio },
			renglones: merma.map((renglon) => {
				const linea = lineas.find((suya) => suya.id === renglon.lineaId);
				return {
					origen: aduana,
					destino: null,
					varianteId: linea?.varianteId ?? "",
					piezas: renglon.piezas,
					loteId: linea?.loteId ?? null,
					traspasoId: aMerma.traspasoId,
				};
			}),
		});
		await cambiarEstadoTraspaso(contexto, aMerma.traspasoId, "salio");
	}
	const suma = (renglones: readonly { piezas: number }[]) => renglones.reduce((total, uno) => total + uno.piezas, 0);
	contexto.guardarEvento({
		tipo: "traspaso.repartido",
		datos: { traspaso_id: padre.id },
		tablas: ["traspasos", "traspaso_lineas", "existencias"],
		entidad: "traspasos",
		entidadId: padre.id,
		entidadFolio: padre.folio,
	});
	return {
		folio: padre.folio,
		a_bodega: suma(sirve),
		merma: suma(merma),
		traspaso_ids: [aBodega?.traspasoId, aMerma?.traspasoId].filter((id): id is string => id !== undefined),
	};
}
