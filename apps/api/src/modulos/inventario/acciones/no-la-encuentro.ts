/**
 * `inventario.no_la_encuentro`: Bodega no encuentra una pieza apartada para un pedido externo o un W-. Nace una DF-
 * `no_la_encontro`, por contar, en Bodega, por esas piezas, y la reserva se libera. La de un pedido externo vuelve a
 * lo que falta mandar del pedido; la de un W- se vuelve a apartar en otra ubicación con libres, en el orden de
 * `inventario.orden_surtido_linea`, o se queda en Bodega con su excepción `pedido_linea_sin_pieza`.
 * Fase 16 · docs/modulos/inventario/entregas-y-devoluciones-de-clientes.md («`inventario.no_la_encuentro`»)
 * Fase 18 · la pieza de un W-
 */

import { noLaEncuentro } from "@uniformame/compartido/contratos/inventario/despachos";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { candadoDeVariantes } from "../dominio/candados.ts";
import { abrirDiferencia } from "../dominio/diferencias.ts";
import { ubicacionDeTipo, ubicacionPorId } from "../dominio/recepciones.ts";
import { nombreDeVariante, terminarReserva } from "../dominio/reservas.ts";
import { existencias, reservas } from "../tablas.ts";

/** Lo que regresan `ventas.folios_de_documentos` y `linea.folios_de_pedidos`. */
const foliosLeidos = z.object({ folios: z.record(z.string(), z.string()) });

/**
 * El documento de una reserva que Bodega puede no encontrar, con la lectura que da su folio: un pedido externo o un
 * W- (fase 18). De otro motivo, ninguno.
 */
function documentoDeLaReserva(
	reserva: typeof reservas.$inferSelect,
): { id: string; lectura: string; campo: string } | null {
	if (reserva.motivo === "pedido_externo" && reserva.pedidoId !== null) {
		return { id: reserva.pedidoId, lectura: "ventas.folios_de_documentos", campo: "pedido_ids" };
	}
	if (reserva.motivo === "pedido_linea" && reserva.pedidoLineaId !== null) {
		return { id: reserva.pedidoLineaId, lectura: "linea.folios_de_pedidos", campo: "pedido_linea_ids" };
	}
	return null;
}

/** Lo que regresa `inventario.reservar` de la pieza de un W-. */
const deLoApartado = z.object({
	renglones: z.array(
		z.object({ reservas: z.array(z.object({ ubicacion_id: z.uuid() })), sin_pieza: z.boolean().optional() }),
	),
	todo_en_aduana: z.boolean(),
});

/**
 * Cómo queda el W- después de volver a apartar su pieza: «{W} se surte de {ubicación}» o «{W} queda sin pieza».
 * @param transaccion La transacción.
 * @param folio El W-.
 * @param apartado Lo que regresó `inventario.reservar`.
 */
async function dondeQuedaElW(
	transaccion: Transaccion,
	folio: string,
	apartado: z.infer<typeof deLoApartado>,
): Promise<string> {
	const [renglon] = apartado.renglones;
	if (renglon === undefined || renglon.sin_pieza === true) return `${folio} queda sin pieza`;
	const nombres: string[] = [];
	for (const id of new Set(renglon.reservas.map((suya) => suya.ubicacion_id))) {
		nombres.push((await ubicacionPorId(transaccion, id))?.nombre ?? "otra ubicación");
	}
	return `${folio} se surte de ${nombres.join(" y ")}`;
}

export const accionNoLaEncuentro = implementarAccion(noLaEncuentro, async (contexto, datos) => {
	const { transaccion } = contexto;
	const bodega = await ubicacionDeTipo(transaccion, "bodega");
	const noActiva = () => errorDeRegla("reserva_no_activa", "Esa pieza ya no está apartada aquí.");
	const [antes] = await transaccion.select().from(reservas).where(eq(reservas.id, datos.reserva_id));
	if (antes === undefined) throw noActiva();
	// Con el candado de su variante se vuelve a leer: otra acción pudo surtirla o liberarla mientras.
	await candadoDeVariantes(transaccion, [antes.varianteId]);
	const [reserva] = await transaccion.select().from(reservas).where(eq(reservas.id, datos.reserva_id));
	const documento = reserva === undefined ? null : documentoDeLaReserva(reserva);
	if (reserva === undefined || reserva.estado !== "activa" || reserva.ubicacionId !== bodega || documento === null) {
		throw noActiva();
	}
	const [hay] = await transaccion
		.select({ piezas: existencias.piezas })
		.from(existencias)
		.where(and(eq(existencias.ubicacionId, bodega), eq(existencias.varianteId, reserva.varianteId)));
	const { prenda, talla } = await nombreDeVariante(transaccion, reserva.varianteId);
	const { folios } = foliosLeidos.parse(
		await contexto.lectura(documento.lectura, { [documento.campo]: [documento.id] }),
	);
	const folio = folios[documento.id] ?? documento.id;
	const diferencia = await abrirDiferencia(contexto, {
		origen: "no_la_encontro",
		ubicacionId: bodega,
		aCargoUbicacionId: bodega,
		hueco: { varianteId: reserva.varianteId, piezas: -reserva.piezas, sistemaDecia: hay?.piezas ?? 0 },
		descripcion: `Bodega no encontró ${reserva.piezas} de ${prenda} talla ${talla} apartadas para ${folio}`,
	});
	await terminarReserva(contexto, reserva.id, {
		estado: "liberada",
		motivoFin: "no_la_encontro",
		...(datos.nota === undefined || datos.nota === "" ? {} : { nota: datos.nota }),
	});
	contexto.guardarEvento({
		tipo: "reserva.liberada",
		datos: { reserva_id: reserva.id, motivo_fin: "no_la_encontro" },
		tablas: ["reservas", "diferencias"],
	});
	// La de un W- se vuelve a apartar: en otra ubicación con libres o, si no hay, en Bodega con su excepción.
	let comoQueda = `Vuelve a lo que falta mandar de ${folio}`;
	if (reserva.motivo === "pedido_linea") {
		const apartado = deLoApartado.parse(
			await contexto.interna("inventario.reservar", {
				motivo: "pedido_linea",
				pedido_linea_id: documento.id,
				renglones: [
					{
						variante_id: reserva.varianteId,
						piezas: reserva.piezas,
						...(reserva.pedidoLineaRenglonId === null ? {} : { pedido_linea_renglon_id: reserva.pedidoLineaRenglonId }),
					},
				],
				// La que no se encontró sigue en la existencia de Bodega hasta contarla: no se vuelve a tomar.
				no_encontradas_en_bodega: reserva.piezas,
			}),
		);
		comoQueda = await dondeQuedaElW(transaccion, folio, apartado);
		// Si todo lo del W- ya está en Aduana, no queda nada que surtir: listo para empacar.
		if (apartado.todo_en_aduana) {
			await contexto.interna("linea.prendas_en_aduana", { pedido_linea_id: documento.id, completo: true });
		}
	}
	const lugar = (await ubicacionPorId(transaccion, bodega))?.nombre ?? "Bodega";
	contexto.bitacora({
		descripcion: `No encontró la pieza de ${folio} en ${lugar}`,
		entidad: "reservas",
		entidadId: reserva.id,
		antes: { estado: "activa", piezas: reserva.piezas },
		despues: { estado: "liberada", motivo_fin: "no_la_encontro", diferencia: diferencia.folio },
	});
	return {
		resultado: {
			mensaje: `${diferencia.folio}: ${prenda} talla ${talla} queda en diferencias. ${comoQueda}`,
			diferencia_id: diferencia.diferenciaId,
			folio: diferencia.folio,
		},
		entidad: { nombre: "diferencias", id: diferencia.diferenciaId },
	};
});
