/**
 * `inventario.no_la_encuentro`: Bodega no encuentra una pieza apartada para un pedido externo. Nace una DF-
 * `no_la_encontro`, por contar, en Bodega, por esas piezas; la reserva se libera y la pieza vuelve a lo que falta
 * mandar del pedido.
 * Fase 16 · docs/modulos/inventario/entregas-y-devoluciones-de-clientes.md («`inventario.no_la_encuentro`»)
 *
 * Con un W- (fase 18), la reserva pasa a otra ubicación con libres: eso llega con Tienda en línea.
 */

import { noLaEncuentro } from "@uniformame/compartido/contratos/inventario/despachos";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { candadoDeVariantes } from "../dominio/candados.ts";
import { abrirDiferencia } from "../dominio/diferencias.ts";
import { ubicacionDeTipo, ubicacionPorId } from "../dominio/recepciones.ts";
import { nombreDeVariante, terminarReserva } from "../dominio/reservas.ts";
import { existencias, reservas } from "../tablas.ts";

/** Lo que regresa `ventas.folios_de_documentos`. */
const foliosLeidos = z.object({ folios: z.record(z.string(), z.string()) });

export const accionNoLaEncuentro = implementarAccion(noLaEncuentro, async (contexto, datos) => {
	const { transaccion } = contexto;
	const bodega = await ubicacionDeTipo(transaccion, "bodega");
	const noActiva = () => errorDeRegla("reserva_no_activa", "Esa pieza ya no está apartada aquí.");
	const [antes] = await transaccion.select().from(reservas).where(eq(reservas.id, datos.reserva_id));
	if (antes === undefined) throw noActiva();
	// Con el candado de su variante se vuelve a leer: otra acción pudo surtirla o liberarla mientras.
	await candadoDeVariantes(transaccion, [antes.varianteId]);
	const [reserva] = await transaccion.select().from(reservas).where(eq(reservas.id, datos.reserva_id));
	if (
		reserva === undefined ||
		reserva.estado !== "activa" ||
		reserva.ubicacionId !== bodega ||
		reserva.motivo !== "pedido_externo" ||
		reserva.pedidoId === null
	) {
		throw noActiva();
	}
	const [hay] = await transaccion
		.select({ piezas: existencias.piezas })
		.from(existencias)
		.where(and(eq(existencias.ubicacionId, bodega), eq(existencias.varianteId, reserva.varianteId)));
	const { prenda, talla } = await nombreDeVariante(transaccion, reserva.varianteId);
	const { folios } = foliosLeidos.parse(
		await contexto.lectura("ventas.folios_de_documentos", { pedido_ids: [reserva.pedidoId] }),
	);
	const folio = folios[reserva.pedidoId] ?? reserva.pedidoId;
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
			mensaje: `${diferencia.folio}: ${prenda} talla ${talla} queda en diferencias. Vuelve a lo que falta mandar de ${folio}`,
			diferencia_id: diferencia.diferenciaId,
			folio: diferencia.folio,
		},
		entidad: { nombre: "diferencias", id: diferencia.diferenciaId },
	};
});
