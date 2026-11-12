/**
 * `contaduria.registrar_gasto_mantenimiento`: el gasto de un servicio de Mantenimiento con costo, con la categoría y
 * la ubicación de sus parámetros.
 * Fase 17 · docs/modulos/contaduria/gastos.md (regla 2, «Acciones internas»)
 *
 * No escribe bitácora: la escribe el servicio, con la misma clave.
 */

import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { folioDeGasto, valorDeLista } from "../dominio/gastos.ts";
import { listaDeCategoriasGasto } from "../siembra.ts";
import { gastos } from "../tablas.ts";

/** Lo que recibe. */
const pedidoDeGasto = z
	.object({
		servicio_id: z.uuid(),
		maquina_id: z.uuid(),
		fecha: z.iso.date(),
		costo_centavos: z.number().int(),
	})
	.strict();

/**
 * Registra el gasto de un servicio (regla 2): `mantenimiento`, con la categoría de
 * `mantenimiento.servicio_categoria_gasto` y la ubicación de `mantenimiento.servicio_ubicacion_gasto`, sin decir de
 * dónde salió el dinero.
 * @param contexto El contexto de `mantenimiento.registrar_servicio`.
 * @param datos El servicio, su máquina, su fecha y su costo.
 * @returns El gasto, su folio y el nombre de su categoría, para el renglón de bitácora del servicio.
 * @throws Error del programa si el costo es 0 o los parámetros no apuntan a una categoría o una ubicación.
 */
export async function registrarGastoMantenimiento(contexto: ContextoDeAccion, datos: unknown) {
	const pedido = pedidoDeGasto.parse(datos);
	if (pedido.costo_centavos <= 0) throw new Error("un servicio sin costo no lleva gasto");
	const { transaccion } = contexto;
	const parametro = async (clave: string) => String(await contexto.lectura("admin.parametro", { clave }));
	const categoria = await valorDeLista(transaccion, listaDeCategoriasGasto, {
		clave: await parametro("mantenimiento.servicio_categoria_gasto"),
	});
	if (categoria === undefined) throw new Error("la categoría del gasto de un servicio no está en la lista");
	const codigo = await parametro("mantenimiento.servicio_ubicacion_gasto");
	const [ubicacion] = await transaccion
		.select({ id: ubicaciones.id })
		.from(ubicaciones)
		.where(eq(ubicaciones.codigo, codigo));
	if (ubicacion === undefined) throw new Error(`la ubicación ${codigo} del gasto de un servicio no existe`);
	const folio = await folioDeGasto(contexto);
	const id = uuidv7();
	await transaccion.insert(gastos).values({
		id,
		folio,
		fecha: pedido.fecha,
		categoriaId: categoria.id,
		montoCentavos: pedido.costo_centavos,
		area: "ubicacion",
		ubicacionId: ubicacion.id,
		origen: "mantenimiento",
		servicioId: pedido.servicio_id,
		maquinaId: pedido.maquina_id,
		creadoPor: quienCambia(contexto),
	});
	contexto.guardarEvento({
		tipo: "gasto.registrado",
		datos: { gasto_id: id, servicio_id: pedido.servicio_id },
		tablas: ["gastos"],
		entidad: "gastos",
		entidadId: id,
		entidadFolio: folio,
	});
	return { gasto_id: id, folio, categoria: categoria.nombre };
}
