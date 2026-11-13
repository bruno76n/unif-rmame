/**
 * `compras.proveedor`: el cajón de un proveedor. Lo que dice que tarda contra lo que tarda, sus últimas entregas con los
 * días de cada una, su ficha para editar, los materiales que surte con su último precio y su estado, y sus últimas
 * órdenes.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Proveedor») y docs/modulos/compras/proveedores-y-precios.md (reglas 3 a
 * 6)
 */

import { proveedorDeCompras } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import { eq } from "drizzle-orm";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { terceros } from "../../contaduria/tablas.ts";
import { plazosReales } from "../dominio/ordenes.ts";
import { ordenesResumidas } from "../dominio/ordenes-resumidas.ts";
import { proveedores } from "../tablas.ts";
import { cuentas, datosDeMateriales, estadoDeMaterial, estadoDeOrden, surtidores } from "./comun.ts";
import { tonoDelPlazo } from "./proveedores.ts";

/** Cuántas órdenes muestra «Órdenes · Las últimas {n}». */
const ordenesQueSeMuestran = 6;

/** Cuántas entregas muestra «Últimas entregas». */
const entregasQueSeMuestran = 10;

export const consultaProveedor = implementarConsulta(proveedorDeCompras, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const [fila] = await accion.transaccion
			.select({ proveedor: proveedores, nombre: terceros.nombre, rfc: terceros.rfc })
			.from(proveedores)
			.innerJoin(terceros, eq(terceros.id, proveedores.terceroId))
			.where(eq(proveedores.id, parametros.proveedor_id));
		if (fila === undefined) throw noExiste();
		const { proveedor } = fila;
		const plazo = (await plazosReales(accion, [{ id: proveedor.id, diasDiceTardar: proveedor.diasDiceTardar }])).get(
			proveedor.id,
		);
		const entregas = plazo?.entregas ?? [];
		const tarda = entregas.length === 0 ? null : (plazo?.plazo ?? null);
		const aTiempo = entregas.filter((entrega) => entrega.aTiempo).length;
		const ordenes = await ordenesResumidas(accion, { proveedorId: proveedor.id });
		const folios = new Map(ordenes.map((orden) => [orden.id, orden.folio]));
		const pares = (await surtidores(accion)).filter((par) => par.proveedorId === proveedor.id);
		const ids = pares.map((par) => par.materialId);
		const datos = ids.length === 0 ? [] : await datosDeMateriales(accion, { ids });
		const deCadaUno = ids.length === 0 ? {} : await cuentas(accion, ids);
		return {
			proveedor: {
				proveedor_id: proveedor.id,
				version: proveedor.version,
				nombre: fila.nombre,
				rfc: fila.rfc,
				ciudad: proveedor.ciudad,
				telefono: proveedor.telefono,
				dias_credito: proveedor.diasCredito,
				dias_dice_tardar: proveedor.diasDiceTardar,
				surte: proveedor.surte,
				dado_de_baja: proveedor.bajaEn !== null,
			},
			plazo: {
				tarda,
				tono: tonoDelPlazo(proveedor.diasDiceTardar, tarda),
				a_tiempo: aTiempo,
				entregas: entregas.length,
			},
			entregas: entregas.slice(-entregasQueSeMuestran).map((entrega) => ({
				recepcion_id: entrega.recepcionId,
				folio: folios.get(entrega.ordenCompraId) ?? "",
				dias: entrega.dias,
				a_tiempo: entrega.aTiempo,
			})),
			materiales: datos.flatMap((material) => {
				const cuenta = deCadaUno[material.id];
				const par = pares.find((uno) => uno.materialId === material.id);
				if (cuenta === undefined || par === undefined) return [];
				return [
					{
						material_id: material.id,
						nombre: material.nombre,
						ultimo_precio_centavos: par.ultimoPrecioCentavos,
						habitual: material.proveedorId === proveedor.id,
						estado: estadoDeMaterial(cuenta),
					},
				];
			}),
			ordenes: ordenes.slice(0, ordenesQueSeMuestran).map((orden) => ({
				orden_compra_id: orden.id,
				folio: orden.folio,
				creada: orden.fecha,
				estado: estadoDeOrden(orden.estado, orden.diasAtraso),
				total_centavos: orden.totalCentavos,
			})),
			dias_dice_tardar_maximo: await parametroNumero(accion, "compras.dias_dice_tardar_maximo"),
		};
	}),
}));
