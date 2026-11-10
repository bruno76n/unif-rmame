/**
 * `direccion.pedir_autorizacion`: un módulo pide a Dirección lo que no puede resolver solo.
 * Fase 7 · docs/modulos/direccion/autorizaciones.md («`direccion.pedir_autorizacion`»)
 *
 * Corre en la transacción de quien la pide. Cada tipo lleva su liga y las demás vacías; un documento no
 * puede tener dos autorizaciones esperando (un candado por documento, y el único parcial de la tabla).
 * Toma el folio AU- y guarda `autorizacion.pedida`, que avisa a Dirección (el alta de usuario, a la dueña).
 */

import { tiposDeAutorizacion } from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { and, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { departamentos } from "../../admin/tablas.ts";
import { columnaDeLiga, ligas, ligasDelTipo } from "../dominio/autorizaciones.ts";
import { autorizaciones } from "../tablas.ts";

/** Lo que recibe. */
const pedido = z
	.object({
		tipo: z.enum(tiposDeAutorizacion),
		/** La clave del departamento que la pide (`ventas`). */
		departamento_origen: z.string().min(1),
		/** «Qué se pide», ya armado. */
		resumen: z.string().min(1),
		detalle: z.string().min(1).optional(),
		/** Cómo se nombra su documento en el mensaje de `ya_pedida` (`NV-0142`). */
		documento: z.string().min(1),
		importe_centavos: z.number().int().optional(),
		importe_facturado_centavos: z.number().int().optional(),
		cantidad: z.string().optional(),
		unidad: z.string().optional(),
	})
	.extend(ligas.shape);

/**
 * Pide la autorización.
 * @param contexto El contexto de quien la pide.
 * @param datos El tipo, el departamento, lo que se pide, su documento y su liga.
 * @returns `autorizacion_id` y su folio.
 * @throws `422 ya_pedida` si su documento ya tiene una esperando.
 */
export async function pedirAutorizacion(contexto: ContextoDeAccion, datos: unknown) {
	const pedida = pedido.parse(datos);
	const { transaccion, quien } = contexto;
	const suyas = ligasDelTipo[pedida.tipo];
	const llenas = Object.values(ligasDelTipo)
		.flat()
		.filter((liga) => pedida[liga] !== undefined);
	if (suyas.some((liga) => pedida[liga] === undefined) || llenas.some((liga) => !suyas.includes(liga))) {
		throw new Error(`${pedida.tipo} lleva las ligas ${suyas.join(", ")} y ninguna más`);
	}
	// Una pendiente por documento: dos que se piden a la vez esperan una a la otra y la segunda la ve.
	const documento = suyas.map((liga) => pedida[liga]).join(":");
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`autorizacion:${documento}`}, 0))`);
	const [esperando] = await transaccion
		.select({ folio: autorizaciones.folio })
		.from(autorizaciones)
		.where(
			and(
				eq(autorizaciones.estado, "por_autorizar"),
				...suyas.map((liga) => eq(columnaDeLiga(liga), String(pedida[liga]))),
			),
		);
	if (esperando !== undefined) {
		throw errorDeRegla(
			"ya_pedida",
			pedida.tipo === "nota_credito"
				? `${pedida.documento} ya tiene una nota de crédito esperando autorización`
				: `${pedida.documento} ya tiene una autorización esperando: ${esperando.folio}.`,
		);
	}
	const [origen] = await transaccion
		.select({ id: departamentos.id })
		.from(departamentos)
		.where(eq(departamentos.clave, pedida.departamento_origen));
	if (origen === undefined) throw new Error(`no existe el departamento ${pedida.departamento_origen}`);
	const tomado = z
		.object({ folio: z.string() })
		.parse(await contexto.interna("admin.tomar_folio", { tipo: "autorizacion" }));
	const id = uuidv7();
	await transaccion.insert(autorizaciones).values({
		id,
		folio: tomado.folio,
		tipo: pedida.tipo,
		departamentoOrigenId: origen.id,
		resumen: pedida.resumen,
		detalle: pedida.detalle ?? null,
		importeCentavos: pedida.importe_centavos ?? null,
		importeFacturadoCentavos: pedida.importe_facturado_centavos ?? null,
		cantidad: pedida.cantidad ?? null,
		unidad: pedida.unidad ?? null,
		ajusteId: pedida.ajuste_id ?? null,
		recepcionId: pedida.recepcion_id ?? null,
		ordenCompraLineaId: pedida.orden_compra_linea_id ?? null,
		notaEntregaId: pedida.nota_entrega_id ?? null,
		notaCreditoId: pedida.nota_credito_id ?? null,
		facturaProveedorId: pedida.factura_proveedor_id ?? null,
		desarrolloId: pedida.desarrollo_id ?? null,
		usuarioSolicitadoId: pedida.usuario_solicitado_id ?? null,
		creadoPor: quien.tipo === "cuenta" ? quien.usuarioId : quien.tipo === "sistema" ? (quien.aNombreDe ?? null) : null,
		personaId: quien.tipo === "aparato" ? (quien.personaId ?? null) : null,
		dispositivoId: quien.tipo === "aparato" ? quien.dispositivoId : null,
	});
	contexto.guardarEvento({
		tipo: "autorizacion.pedida",
		datos: { autorizacion_id: id, tipo: pedida.tipo },
		tablas: ["autorizaciones"],
		entidad: "autorizaciones",
		entidadId: id,
		entidadFolio: tomado.folio,
	});
	return { autorizacion_id: id, folio: tomado.folio };
}
