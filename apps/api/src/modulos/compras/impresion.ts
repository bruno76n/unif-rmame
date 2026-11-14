/**
 * El tipo de impresión de Compras: la hoja de la orden de compra (`orden_compra`), que sacan Compras y Contaduría. Junta
 * la orden con sus líneas, su total y su proveedor, y la dibuja en `impresos/hojas/orden-compra.ts`. Se arma y se
 * guarda al «Marcar enviada»; «Ver PDF» abre la guardada.
 * Fase 20 · docs/impresos/hojas.md («La orden de compra») y docs/modulos/compras/ordenes-de-compra.md
 * (`compras.marcar_orden_enviada`)
 *
 * La condición es la de la orden y, mientras se envía (antes de copiarla), la del proveedor. Se entrega en Aduana, en
 * el domicilio de la empresa: la fábrica no guarda otro domicilio para Aduana.
 */

import { cantidadConUnidad, condicionDePago, telefonoEnTexto } from "@uniformame/compartido/calculos/compras";
import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { textoDeDiaConAnio } from "@uniformame/compartido/calculos/fechas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { dibujarOrdenDeCompra } from "../../impresos/hojas/orden-compra.ts";
import { nombreDeCuenta } from "../../nucleo/acciones/comunes.ts";
import { marcoDeLaHoja } from "../../nucleo/hojas.ts";
import { noExiste } from "../../nucleo/http/errores.ts";
import type { ContextoDeConsulta, TipoDeEtiqueta } from "../../nucleo/modulos.ts";
import { ordenesResumidas } from "./dominio/ordenes-resumidas.ts";

/** El proveedor como lo lleva la hoja. */
const delProveedor = z.object({
	rfc: z.string().nullable(),
	telefono: z.string(),
	dias_credito: z.coerce.number(),
	dias_orden: z.coerce.number().nullable(),
});

/**
 * El PDF de la hoja de una orden de compra.
 * @param contexto El contexto de quien la pide.
 * @param ordenId La orden.
 * @throws `404` si no existe.
 */
async function hojaDeLaOrden(contexto: ContextoDeConsulta, ordenId: string): Promise<Uint8Array> {
	const { orden, proveedor, levanto, domicilio } = await contexto.comoAccion(async (accion) => {
		const [suya] = await ordenesResumidas(accion, { ids: [ordenId] });
		if (suya === undefined) throw noExiste();
		const { rows } = await accion.transaccion.execute(sql`
			SELECT t.rfc, p.telefono, p.dias_credito, o.dias_credito AS dias_orden FROM ordenes_compra o
			JOIN proveedores p ON p.id = o.proveedor_id JOIN terceros t ON t.id = p.tercero_id
			WHERE o.id = ${ordenId}::uuid`);
		const empresa = z.object({ domicilio: z.string() }).parse(await accion.lectura("admin.empresa", {}));
		return {
			orden: suya,
			proveedor: delProveedor.parse(rows[0]),
			levanto: await nombreDeCuenta(accion, suya.creadoPor),
			domicilio: empresa.domicilio,
		};
	});
	const marco = await marcoDeLaHoja(contexto, {
		nombre: "Orden de compra",
		folio: orden.folio,
		fecha: `Creada el ${textoDeDiaConAnio(orden.fecha)}`,
	});
	return dibujarOrdenDeCompra(marco, {
		proveedor: orden.proveedor,
		rfc: proveedor.rfc === null ? null : `RFC ${proveedor.rfc}`,
		telefono: `Tel. ${telefonoEnTexto(proveedor.telefono)}`,
		promete: orden.fechaPrometida === null ? null : `Promete llegar el ${textoDeDiaConAnio(orden.fechaPrometida)}`,
		condicion: condicionDePago(proveedor.dias_orden ?? proveedor.dias_credito),
		lineas: orden.lineas.map((linea) => ({
			material: linea.material,
			cantidad: cantidadConUnidad(linea.pedido, linea.unidad),
			precio: enPesos(linea.precioCentavos),
			importe: enPesos(linea.importeCentavos),
		})),
		total: enPesos(orden.totalCentavos),
		entregarEn: `Entregar en Aduana: ${domicilio}`,
		levanto: `La levantó ${levanto}`,
	});
}

/** La hoja de la orden de compra: la sacan Compras y Contaduría. */
export const tipoOrdenCompra: TipoDeEtiqueta = {
	tipo: "orden_compra",
	departamentos: ["compras", "contaduria"],
	dibujar: async (contexto, pedido) => {
		const [ordenId] = pedido.ids;
		if (ordenId === undefined) throw noExiste();
		return hojaDeLaOrden(contexto, ordenId);
	},
};
