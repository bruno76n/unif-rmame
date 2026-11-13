/**
 * `inventario.detalle_recibir_material`: el cajón Recibir material. La orden, su proveedor, si se puede recibir y, por
 * cada línea a la que le falta algo, el material, si es tela, su unidad, si se cuenta entera y lo que faltaba. Sin
 * precios ni costos: los lee `compras.ordenes_por_recibir`, que no los trae.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Cajones»: Recibir material)
 */

import { detalleRecibirMaterial } from "@uniformame/compartido/contratos/inventario/aduana-cajones";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { ordenesPorRecibirDeCompras } from "./aduana-comun.ts";
import { metrosEscritos } from "./bodega-comun.ts";

export const consultaDetalleRecibirMaterial = implementarConsulta(
	detalleRecibirMaterial,
	async (contexto, parametros) => ({
		resultado: await contexto.comoAccion(async (accion) => {
			const [orden] = await ordenesPorRecibirDeCompras(accion, [parametros.orden_compra_id]);
			if (orden === undefined) throw noExiste();
			return {
				orden_compra_id: orden.orden_compra_id,
				folio: orden.folio,
				proveedor: orden.proveedor,
				se_puede_recibir: orden.se_puede_recibir,
				materiales: orden.lineas
					.filter((linea) => Number(linea.falta) > 0)
					.map((linea) => ({
						orden_compra_linea_id: linea.orden_compra_linea_id,
						material: linea.material,
						es_tela: linea.tipo === "tela",
						unidad: linea.unidad,
						entera: linea.se_cuenta_entera,
						faltaban: metrosEscritos(linea.falta),
					})),
			};
		}),
	}),
);
