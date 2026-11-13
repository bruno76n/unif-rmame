/**
 * `contaduria.capturar_factura_opciones`: lo que necesita la ventana «Capturar nota o factura», también cuando Compras
 * la abre con su orden.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Capturar nota o factura») y
 * docs/modulos/contaduria/facturas-de-proveedor.md (reglas 2 a 4)
 *
 * Las órdenes de un proveedor que no están en borrador ni canceladas, con su total, el valor de lo recibido al precio
 * vigente (`valorDeMilesimos`, la misma cuenta de las tres puntas) y sus líneas; se propone la recibida que espera
 * factura.
 */

import { cantidadConUnidad } from "@uniformame/compartido/contratos/compras/textos";
import { capturarFacturaOpciones } from "@uniformame/compartido/contratos/contaduria/consultas-pagar";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { ordenesResumidas } from "../../compras/dominio/ordenes-resumidas.ts";
import { valorDeMilesimos } from "../dominio/facturas.ts";

/** Los estados de una orden que ya llegó (en parte o completa). */
const recibidas = ["recibida_en_parte", "recibida", "cerrada_con_faltante"];

/** Cómo se lee el estado de una orden. */
const estadosDeOrden: Readonly<Record<string, string>> = {
	enviada: "Enviada",
	recibida_en_parte: "Recibida en parte",
	recibida: "Recibida",
	cerrada_con_faltante: "Cerrada con faltante",
	cerrada: "Cerrada",
};

/** Lo que regresa `contaduria.facturacion_de_orden`. */
const facturacion = z.object({ ordenes: z.record(z.string(), z.array(z.unknown())) });

/**
 * Los proveedores activos, por nombre.
 * @param contexto El contexto de la consulta.
 */
async function proveedoresActivos(contexto: ContextoDeConsulta) {
	const { rows } = await contexto.base.execute(sql`SELECT p.id, t.nombre FROM proveedores p
		JOIN terceros t ON t.id = p.tercero_id WHERE p.baja_en IS NULL ORDER BY t.nombre`);
	return z.array(z.object({ id: z.uuid(), nombre: z.string() })).parse(rows);
}

/**
 * El proveedor de una orden.
 * @param contexto El contexto de la consulta.
 * @param ordenId La orden.
 */
async function proveedorDeLaOrden(contexto: ContextoDeConsulta, ordenId: string | undefined) {
	if (ordenId === undefined) return undefined;
	const { rows } = await contexto.base.execute(
		sql`SELECT proveedor_id FROM ordenes_compra WHERE id = ${ordenId}::uuid`,
	);
	return z.array(z.object({ proveedor_id: z.uuid() })).parse(rows)[0]?.proveedor_id;
}

export const consultaCapturarFacturaOpciones = implementarConsulta(
	capturarFacturaOpciones,
	async (contexto, parametros) => {
		const proveedores = await proveedoresActivos(contexto);
		const proveedorId = parametros.proveedor_id ?? (await proveedorDeLaOrden(contexto, parametros.orden_compra_id));
		const ordenes =
			proveedorId === undefined
				? []
				: await contexto.comoAccion(async (accion) => {
						const suyas = (await ordenesResumidas(accion, { proveedorId })).filter(
							(orden) => orden.estado !== "borrador" && orden.estado !== "cancelada",
						);
						const conFactura = facturacion.parse(
							await accion.lectura("contaduria.facturacion_de_orden", {
								orden_compra_ids: suyas.map((orden) => orden.id),
							}),
						).ordenes;
						return suyas.map((orden) => ({
							orden_compra_id: orden.id,
							folio: orden.folio,
							estado: estadosDeOrden[orden.estado] ?? orden.estado,
							propuesta:
								orden.id === parametros.orden_compra_id ||
								(parametros.orden_compra_id === undefined &&
									recibidas.includes(orden.estado) &&
									(conFactura[orden.id] ?? []).length === 0),
							total_centavos: orden.totalCentavos,
							recibido_centavos: orden.lineas.reduce(
								(suma, linea) => suma + Number(valorDeMilesimos(linea.recibido, linea.precioCentavos)),
								0,
							),
							lineas: orden.lineas
								.filter((linea) => linea.recibido > 0n)
								.map((linea) => ({
									orden_compra_linea_id: linea.id,
									material: linea.material,
									recibido: cantidadConUnidad(linea.recibido, linea.unidad),
									precio_centavos: linea.precioCentavos,
								})),
						}));
					});
		return {
			resultado: {
				proveedores,
				proveedor_id: proveedorId ?? null,
				umbral_cambio_precio_pct: await parametroNumero(contexto, "compras.umbral_cambio_precio_pct"),
				ordenes,
			},
		};
	},
);
