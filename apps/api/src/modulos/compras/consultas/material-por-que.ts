/**
 * `compras.material_por_que`: el cajón «por qué» de un material. Su resumen armado, «La cuenta» (lo que hay, lo que
 * viene orden por orden, lo comprometido lote por lote y lo libre), cuánto se gasta por día según el mes y de dónde
 * sale, el pedido sugerido, y los insumos de la proyección para que la pantalla corra `proyectarMaterial` mientras se
 * escribe la cantidad.
 * Fase 19 · docs/interfaz/fabrica/compras.md («"Por qué" de un material») y docs/modulos/compras/proyeccion-de-material.md
 * («La proyección en el paquete compartido»)
 */

import { aMilesimos, aMilesimosConSigno, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { materialPorQue } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import { cantidadConUnidad, condicionDePago, cuandoLlega } from "@uniformame/compartido/contratos/compras/textos";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import type { CuentaDeMaterial } from "../lecturas/cuenta-material.ts";
import { comprometidoConLotes, cuentas, datosDeMateriales, enCaminoDe, estadoDeMaterial } from "./comun.ts";

/** Los meses, en el orden de sus factores. */
const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** Lo que regresa `patronaje.recetas_con_material`. */
const deRecetas = z.object({ prendas: z.array(z.object({ nombre: z.string() })) });

/**
 * El nombre de un mes con mayúscula: «Julio».
 * @param dia Un día del mes.
 */
function nombreDelMes(dia: Temporal.PlainDate): string {
	const nombre = dia.toLocaleString("es-MX", { month: "long" });
	return nombre.charAt(0).toLocaleUpperCase("es-MX") + nombre.slice(1);
}

/**
 * El resumen del cajón, en el color de su estado: cuándo se acaba, lo que tarda el proveedor y qué pasa si se pide hoy.
 * @param cuenta La cuenta del material.
 * @param proveedor Su proveedor habitual.
 * @param hoy Hoy.
 */
function resumenDe(cuenta: CuentaDeMaterial, proveedor: string, hoy: Temporal.PlainDate): string {
	if (cuenta.se_acaba === null)
		return `Sin consumo todavía. ${proveedor} tarda ${plural(cuenta.plazo, "día", "días")}.`;
	const seAcaba = `Se acaba el ${textoDeDiaCorto(cuenta.se_acaba)}, ${cuandoLlega(hoy.until(Temporal.PlainDate.from(cuenta.se_acaba)).days)}.`;
	const tarda = `${proveedor} tarda ${plural(cuenta.plazo, "día", "días")}`;
	const llegaria = textoDeDiaCorto(hoy.add({ days: cuenta.plazo }));
	if (cuenta.dias_sin_material > 0) {
		return `${seAcaba} ${tarda}: un pedido de hoy llegaría el ${llegaria} y quedarían ${plural(cuenta.dias_sin_material, "día", "días")} sin material.`;
	}
	return `${seAcaba} ${tarda}: un pedido de hoy llegaría el ${llegaria}. ${cuenta.linea}.`;
}

/**
 * Los factores de los doce meses, de enero a diciembre, como se guardan: en por ciento de un mes normal (90 % es
 * 0.9).
 * @param accion El contexto de la lectura.
 */
async function factoresDeLosMeses(accion: ContextoDeAccion): Promise<{ mes: string; porciento: number }[]> {
	const factores = [];
	for (const mes of meses)
		factores.push({ mes, porciento: await parametroNumero(accion, `compras.factor_consumo_${mes}`) });
	return factores;
}

export const consultaMaterialPorQue = implementarConsulta(materialPorQue, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const hoy = accion.diaDeNegocio;
		const [material] = await datosDeMateriales(accion, { ids: [parametros.material_id] });
		const cuenta = (await cuentas(accion, [parametros.material_id]))[parametros.material_id];
		if (material === undefined || cuenta === undefined) throw noExiste();
		const factores = await factoresDeLosMeses(accion);
		const fuerte = factores.reduce((mayor, uno) => (uno.porciento > mayor.porciento ? uno : mayor));
		const mesFuerte = hoy.with({ month: factores.indexOf(fuerte) + 1, day: 1 });
		const recetas = deRecetas.parse(
			await accion.lectura("patronaje.recetas_con_material", { material_id: material.id }),
		);
		const enCamino = enCaminoDe(cuenta);
		const enCaminoTotal = enCamino.reduce((suma, viene) => suma + aMilesimosConSigno(viene.cantidad), 0n);
		const sugerido = Number(cuenta.por_pedir);
		return {
			material: {
				material_id: material.id,
				nombre: material.nombre,
				tipo: material.tipo,
				unidad: material.unidad,
				proveedor: material.proveedor,
				condicion: condicionDePago(material.diasCredito),
				estado: cuenta.estado,
				estado_armado: estadoDeMaterial(cuenta),
				linea: cuenta.linea,
				en_borrador: cuenta.en_borrador,
			},
			resumen: resumenDe(cuenta, material.proveedor, hoy),
			cuenta: {
				hay_bodega: cuenta.hay_bodega,
				hay_aduana: cuenta.hay_aduana,
				en_camino: enCamino,
				en_camino_total: deMilesimos(enCaminoTotal),
				comprometido: await comprometidoConLotes(accion, cuenta),
				comprometido_total: cuenta.comprometido,
				libre: cuenta.libre_en_la_cuenta,
			},
			consumo: {
				medido: cuenta.consumo_medido,
				normal: cuenta.consumo_normal,
				meses: [0, 1, 2, 3].map((despues) => {
					const dia = hoy.with({ day: 1 }).add({ months: despues });
					const factor = factores[dia.month - 1]?.porciento ?? 100;
					return {
						nombre: nombreDelMes(dia),
						por_dia: cuenta.consumo_por_mes[dia.month - 1] ?? "0.000",
						factor: String(factor / 100),
					};
				}),
				temporada:
					cuenta.consumo_normal === null
						? null
						: `${nombreDelMes(mesFuerte)} es el mes más fuerte: se consume ${fuerte.porciento / 100} veces lo de un mes normal`,
				se_usa_en: recetas.prendas.map((prenda) => prenda.nombre),
			},
			sugerido: {
				cantidad: sugerido,
				texto: `${cantidadConUnidad(cuenta.por_pedir, material.unidad)} cubren ${plural(material.diasCubre, "día", "días")} a partir del ${textoDeDiaCorto(cuenta.para_cuando)} y dejan el mínimo de ${cantidadConUnidad(material.minimo, material.unidad)}.`,
			},
			cantidad_maxima: await parametroNumero(accion, "compras.cantidad_maxima_linea"),
			insumos: {
				hoy: hoy.toString(),
				libre: aMilesimosConSigno(cuenta.libre_para_comprar).toString(),
				llegadas: enCamino.map((viene) => ({
					dia: viene.dia,
					cantidad: aMilesimosConSigno(viene.cantidad).toString(),
				})),
				consumo_normal: cuenta.consumo_normal === null ? null : aMilesimosConSigno(cuenta.consumo_normal).toString(),
				// La proyección usa milésimos del factor: 90 % es 900.
				factores: factores.map((uno) => ((aMilesimos(String(uno.porciento)) + 50n) / 100n).toString()),
				plazo: cuenta.plazo,
				minimo: aMilesimosConSigno(material.minimo).toString(),
				multiplo: aMilesimosConSigno(material.multiploCompra).toString(),
				dias_cubre: material.diasCubre,
				limites: {
					dias_maximos: await parametroNumero(accion, "compras.dias_maximos_proyeccion"),
					dias_pedir_esta_semana: await parametroNumero(accion, "compras.dias_pedir_esta_semana"),
					dias_mas_de_seis_meses: await parametroNumero(accion, "compras.dias_etiqueta_mas_de_6_meses"),
				},
			},
		};
	}),
}));
