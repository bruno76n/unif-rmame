/**
 * `compras.materiales`: los materiales con su proveedor habitual y su último precio, lo que hay, lo libre y lo
 * comprometido, su mínimo, lo que viene y su estado; con «Dados de baja», los que se dieron de baja. Trae también lo
 * que pide la ventana «Nuevo material»: las unidades de Configuración, los proveedores activos y los días que propone.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Materiales», «Ventanas») y docs/modulos/compras/materiales.md
 */

import { aMilesimosConSigno, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { materialesDeCompras } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { and, asc, eq, isNull } from "drizzle-orm";
import { type ContextoDeAccion, implementarConsulta } from "../../../nucleo/modulos.ts";
import { listas, listaValores } from "../../admin/tablas.ts";
import { terceros } from "../../contaduria/tablas.ts";
import { listaDeUnidades } from "../siembra.ts";
import { proveedores } from "../tablas.ts";
import {
	cuentas,
	cumpleBusqueda,
	datosDeMateriales,
	estadoDeMaterial,
	numeroDe,
	surtidores,
	tonoDeExistencia,
} from "./comun.ts";

/**
 * Lo que pide «Nuevo material»: las unidades seleccionables de su lista, los proveedores activos y los días que
 * propone «Cada pedido cubre».
 * @param accion El contexto de la lectura.
 */
async function paraNuevo(accion: ContextoDeAccion) {
	const unidades = await accion.transaccion
		.select({ clave: listaValores.clave, nombre: listaValores.nombre })
		.from(listaValores)
		.innerJoin(listas, eq(listas.id, listaValores.listaId))
		.where(and(eq(listas.clave, listaDeUnidades), eq(listaValores.seleccionable, true)))
		.orderBy(asc(listaValores.orden));
	const activos = await accion.transaccion
		.select({ proveedor_id: proveedores.id, nombre: terceros.nombre, surte: proveedores.surte })
		.from(proveedores)
		.innerJoin(terceros, eq(terceros.id, proveedores.terceroId))
		.where(isNull(proveedores.bajaEn))
		.orderBy(asc(terceros.nombre));
	return {
		unidades: unidades.flatMap((unidad) =>
			unidad.clave === null ? [] : [{ clave: unidad.clave, nombre: unidad.nombre }],
		),
		proveedores: activos,
		dias_cubre_inicial: await numeroDe(accion, "compras.dias_cubre_inicial"),
	};
}

export const consultaMateriales = implementarConsulta(materialesDeCompras, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const conBajas = parametros.incluir_bajas === "si";
		const datos = (await datosDeMateriales(accion, { conBajas })).filter(
			(material) =>
				(conBajas ? material.bajaEn !== null : true) &&
				cumpleBusqueda(parametros.buscar, [material.nombre, material.proveedor, material.presentacion]),
		);
		const deCadaUno =
			datos.length === 0
				? {}
				: await cuentas(
						accion,
						datos.map((material) => material.id),
					);
		const pares = await surtidores(
			accion,
			datos.map((material) => material.id),
		);
		return {
			materiales: datos.flatMap((material) => {
				const cuenta = deCadaUno[material.id];
				if (cuenta === undefined) return [];
				const suyos = pares.filter((par) => par.materialId === material.id);
				const habitual = suyos.find((par) => par.proveedorId === material.proveedorId);
				const enCamino = cuenta.en_camino.reduce((suma, viene) => suma + aMilesimosConSigno(viene.cantidad), 0n);
				const [primera] = cuenta.en_camino;
				return [
					{
						material_id: material.id,
						version: material.version,
						nombre: material.nombre,
						tipo: material.tipo,
						color: material.color,
						presentacion: material.presentacion,
						unidad: material.unidad,
						proveedor: material.proveedor,
						proveedores_mas: Math.max(0, suyos.length - 1),
						ultimo_precio_centavos: habitual?.ultimoPrecioCentavos ?? null,
						plazo: cuenta.plazo,
						hay: deMilesimos(aMilesimosConSigno(cuenta.hay_bodega) + aMilesimosConSigno(cuenta.hay_aduana)),
						libre: cuenta.libre_para_comprar,
						comprometido: cuenta.comprometido,
						minimo: material.minimo,
						tono_existencia: tonoDeExistencia(cuenta, material.minimo),
						en_camino:
							primera === undefined
								? null
								: {
										cantidad: deMilesimos(enCamino),
										dia: primera.llegada_esperada,
										varias: cuenta.en_camino.length > 1,
									},
						estado: estadoDeMaterial(cuenta),
						dado_de_baja: material.bajaEn !== null,
					},
				];
			}),
			para_nuevo: await paraNuevo(accion),
		};
	}),
}));
