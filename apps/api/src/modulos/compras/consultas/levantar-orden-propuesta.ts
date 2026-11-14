/**
 * `compras.levantar_orden_propuesta`: lo que propone el cajón Levantar orden. Los materiales escogidos (o, sin
 * escoger, los sin tiempo de entrega y los de esta semana) con su cantidad; todos los activos de lo más urgente a lo
 * menos, con su pedido sugerido y los proveedores que los surten con su último precio; y los proveedores activos con su
 * condición, su plazo y su borrador.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Levantar orden») y docs/modulos/compras/ordenes-de-compra.md (reglas 1
 * y 4)
 */

import { condicionDePago } from "@uniformame/compartido/calculos/compras";
import { levantarOrdenPropuesta } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import { and, eq } from "drizzle-orm";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { plazosReales } from "../dominio/ordenes.ts";
import { ordenesCompra } from "../tablas.ts";
import { cuentas, datosDeMateriales, estadoDeMaterial, surtidores } from "./comun.ts";
import { porUrgencia } from "./por-pedir.ts";
import { proveedoresConNombre } from "./proveedores.ts";

export const consultaLevantarOrdenPropuesta = implementarConsulta(
	levantarOrdenPropuesta,
	async (contexto, parametros) => ({
		resultado: await contexto.comoAccion(async (accion) => {
			const deMateriales = await cuentas(accion);
			const datos = await datosDeMateriales(accion, {});
			const pares = await surtidores(accion);
			const activos = await proveedoresConNombre(accion, false);
			const plazos = await plazosReales(
				accion,
				activos.map((fila) => ({ id: fila.proveedor.id, diasDiceTardar: fila.proveedor.diasDiceTardar })),
			);
			const borradores = await accion.transaccion
				.select({ proveedorId: ordenesCompra.proveedorId, folio: ordenesCompra.folio })
				.from(ordenesCompra)
				.where(and(eq(ordenesCompra.estado, "borrador")));
			const conCuenta = datos.flatMap((material) => {
				const cuenta = deMateriales[material.id];
				return cuenta === undefined ? [] : [{ material, cuenta }];
			});
			conCuenta.sort((uno, otro) => porUrgencia(uno.cuenta, otro.cuenta));
			// Lo escogido en Por pedir, con su cantidad; sin escoger, lo sin tiempo de entrega y lo de esta semana.
			const ids = parametros.material_ids?.split(",");
			const cantidades = parametros.cantidades?.split(",").map(Number);
			const escogidos =
				ids === undefined
					? conCuenta
							.filter(({ cuenta }) => cuenta.estado !== "alcanza")
							.map(({ cuenta }) => ({ material_id: cuenta.material_id, cantidad: Number(cuenta.por_pedir) }))
					: ids.flatMap((id, lugar) => {
							const cuenta = deMateriales[id];
							return cuenta === undefined
								? []
								: [{ material_id: id, cantidad: cantidades?.[lugar] ?? Number(cuenta.por_pedir) }];
						});
			return {
				umbral_cambio_precio_pct: await parametroNumero(accion, "compras.umbral_cambio_precio_pct"),
				cantidad_maxima: await parametroNumero(accion, "compras.cantidad_maxima_linea"),
				escogidos,
				materiales: conCuenta.map(({ material, cuenta }) => ({
					material_id: material.id,
					nombre: material.nombre,
					unidad: material.unidad,
					multiplo: Number(material.multiploCompra),
					sugerido: Number(cuenta.por_pedir),
					estado: cuenta.estado,
					estado_armado: estadoDeMaterial(cuenta),
					linea: cuenta.linea,
					proveedor_habitual_id: material.proveedorId,
					surtidores: pares
						.filter((par) => par.materialId === material.id && par.activo)
						.map((par) => ({
							proveedor_id: par.proveedorId,
							nombre: par.nombre,
							ultimo_precio_centavos: par.ultimoPrecioCentavos,
							habitual: par.proveedorId === material.proveedorId,
						})),
				})),
				proveedores: activos.map(({ proveedor, nombre }) => ({
					proveedor_id: proveedor.id,
					nombre,
					condicion: condicionDePago(proveedor.diasCredito),
					plazo: plazos.get(proveedor.id)?.plazo ?? proveedor.diasDiceTardar,
					borrador: borradores.find((borrador) => borrador.proveedorId === proveedor.id)?.folio ?? null,
				})),
			};
		}),
	}),
);
