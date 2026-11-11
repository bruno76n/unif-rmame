/**
 * Las acciones de lotes y bultos del módulo de prueba: lo que hará Producción con la tablet.
 * Fase 6 · docs/fases/06-dispositivos-y-sincronizacion.md («Cómo se construye»)
 *
 * Un bulto de un lote que no ha llegado se aparta con `falta_documento` hasta que el lote llegue; uno con
 * más de 100 piezas se aplica y abre la excepción `pasa_tope_bulto`; cancelar uno ya atendido se aplica y abre
 * `cancelacion_tardia`. Las excepciones se abren de verdad, con `inventario.registrar_excepcion`. Cerrar un lote toca sus bultos, para que bajen como `quitar`.
 */

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { errorDeRegla, FaltaDocumento, noExiste } from "../../../http/errores.ts";
import { type AccionImplementada, type ContextoDeAccion, implementarAccion } from "../../../modulos.ts";
import { abrirLote, atenderBulto, cancelarBulto, cerrarLote, registrarBulto } from "./contratos.ts";
import { bultos, lotes } from "./tablas.ts";

/** El máximo de piezas que cuadra en un bulto de prueba. */
const piezasQueCuadran = 100;

/** La ubicación de quien abre el lote: la de su aparato, o la del Taller desde la web. */
async function ubicacionDeQuienLlama(contexto: ContextoDeAccion): Promise<string> {
	const { rows } = await contexto.transaccion.execute(
		contexto.quien.tipo === "aparato"
			? sql`SELECT ubicacion_id AS id FROM dispositivos WHERE id = ${contexto.quien.dispositivoId}`
			: sql`SELECT id FROM ubicaciones WHERE codigo = 'TAL'`,
	);
	const id = rows[0]?.id;
	if (typeof id !== "string") throw new Error("sin ubicación para el lote");
	return id;
}

/**
 * Abre una excepción con la interna de inventario y la regresa como la contesta la subida.
 * @param contexto El contexto de la acción.
 * @param tipo El tipo de la excepción.
 * @param descripcion Qué pasó.
 */
async function abrirExcepcion(contexto: ContextoDeAccion, tipo: string, descripcion: string) {
	const { excepcion_id } = z
		.object({ excepcion_id: z.uuid() })
		.parse(await contexto.interna("inventario.registrar_excepcion", { tipo, descripcion }));
	return { id: excepcion_id, codigo: tipo };
}

/** Las acciones de lotes y bultos. */
export const accionesDeLotes: AccionImplementada[] = [
	implementarAccion(abrirLote, async (contexto, datos) => {
		await contexto.transaccion
			.insert(lotes)
			.values({ id: datos.id, nombre: datos.nombre, ubicacionId: await ubicacionDeQuienLlama(contexto) });
		contexto.bitacora({ descripcion: `Abrió el lote ${datos.nombre}`, entidad: "prueba_lotes", entidadId: datos.id });
		contexto.guardarEvento({ tipo: "lote.abierto", datos: { lote_id: datos.id }, tablas: ["prueba_lotes"] });
		return { resultado: { mensaje: "Lote abierto" }, entidad: { nombre: "prueba_lotes", id: datos.id } };
	}),
	implementarAccion(registrarBulto, async (contexto, datos) => {
		const [lote] = await contexto.transaccion.select().from(lotes).where(eq(lotes.id, datos.lote_id));
		if (lote === undefined) throw new FaltaDocumento(datos.lote_id);
		if (lote.cerrado) throw errorDeRegla("lote_cerrado", "Ese lote ya se cerró.");
		await contexto.transaccion.insert(bultos).values({ id: datos.id, loteId: lote.id, piezas: datos.piezas });
		contexto.bitacora({
			descripcion: `Registró un bulto de ${datos.piezas} piezas`,
			entidad: "prueba_bultos",
			entidadId: datos.id,
		});
		contexto.guardarEvento({ tipo: "bulto.registrado", datos: { bulto_id: datos.id }, tablas: ["prueba_bultos"] });
		return {
			resultado: { mensaje: "Bulto registrado" },
			entidad: { nombre: "prueba_bultos", id: datos.id },
			...(datos.piezas > piezasQueCuadran
				? { excepcion: await abrirExcepcion(contexto, "pasa_tope_bulto", `El bulto trae ${datos.piezas} piezas`) }
				: {}),
		};
	}),
	implementarAccion(cancelarBulto, async (contexto, datos) => {
		const [bulto] = await contexto.transaccion.select().from(bultos).where(eq(bultos.id, datos.bulto_id));
		if (bulto === undefined) throw new FaltaDocumento(datos.bulto_id);
		await contexto.transaccion.update(bultos).set({ cancelado: true }).where(eq(bultos.id, bulto.id));
		contexto.bitacora({ descripcion: "Canceló un bulto", entidad: "prueba_bultos", entidadId: bulto.id });
		return {
			resultado: { mensaje: "Bulto cancelado" },
			entidad: { nombre: "prueba_bultos", id: bulto.id },
			...(bulto.atendido
				? { excepcion: await abrirExcepcion(contexto, "cancelacion_tardia", "Se canceló un bulto ya atendido") }
				: {}),
		};
	}),
	implementarAccion(atenderBulto, async (contexto, datos) => {
		const atendidos = await contexto.transaccion
			.update(bultos)
			.set({ atendido: true })
			.where(eq(bultos.id, datos.bulto_id))
			.returning({ id: bultos.id });
		if (atendidos.length === 0) throw noExiste();
		contexto.bitacora({ descripcion: "Atendió un bulto", entidad: "prueba_bultos", entidadId: datos.bulto_id });
		return { resultado: { mensaje: "Bulto atendido" } };
	}),
	implementarAccion(cerrarLote, async (contexto, datos) => {
		const cerrados = await contexto.transaccion
			.update(lotes)
			.set({ cerrado: true })
			.where(eq(lotes.id, datos.lote_id))
			.returning({ id: lotes.id });
		if (cerrados.length === 0) throw noExiste();
		// Sus bultos dejan de bajar por algo que vive en el lote: se tocan, para que bajen como `quitar`.
		await contexto.transaccion
			.update(bultos)
			.set({ actualizadoEn: sql`now()` })
			.where(eq(bultos.loteId, datos.lote_id));
		contexto.bitacora({ descripcion: "Cerró un lote", entidad: "prueba_lotes", entidadId: datos.lote_id });
		contexto.guardarEvento({
			tipo: "lote.cerrado",
			datos: { lote_id: datos.lote_id },
			tablas: ["prueba_lotes", "prueba_bultos"],
		});
		return { resultado: { mensaje: "Lote cerrado" } };
	}),
];
