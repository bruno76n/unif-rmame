/**
 * `direccion.indicadores`: los cuatro paneles de Indicadores de Dirección. Las ventas de la semana (los últimos siete
 * días, hasta hoy) por canal contra lo que se compara, ocho semanas contra las mismas del año pasado, las prendas
 * terminadas de los últimos 12 días de trabajo con los lotes atorados, en proceso y por cortar, y la existencia por
 * ubicación.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Indicadores») y docs/modulos/direccion/alertas-e-indicadores.md
 * («Los indicadores»)
 *
 * Nunca lleva sueldos ni costos. «Hace un mes» es la semana de hace cuatro y la del año pasado la de hace 52, para que
 * se comparen los mismos días de la semana.
 */

import { plural, variacion } from "@uniformame/compartido/calculos/textos";
import { indicadores } from "@uniformame/compartido/contratos/direccion/indicadores";
import type { Temporal } from "temporal-polyfill";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	existenciaPorUbicacion,
	lotesPorEtapa,
	primerasVentas,
	saludDeLosLotes,
	terminadasPorDia,
	ultimosDiasDeTrabajo,
	vendidoEntre,
	ventasPorDia,
} from "./cifras.ts";

/** Cuántos días atrás está la semana contra la que se compara, y cómo se dice. */
const comparacion = {
	semana_pasada: { dias: 7, contra: "contra semana anterior", nombre: "Semana anterior" },
	hace_un_mes: { dias: 28, contra: "contra hace un mes", nombre: "Hace un mes" },
	temporada_pasada: { dias: 364, contra: "contra misma semana del año pasado", nombre: "Misma semana del año pasado" },
} as const;

/** Los días de una semana del año pasado: 52 semanas atrás. */
const unAnio = 364;

/** Cuántas semanas tiene la gráfica de ventas por semana. */
const semanasDeLaGrafica = 8;

/** Cuántos días de trabajo tiene la gráfica de las prendas terminadas, y cuántos son «esta semana». */
const diasDeLaGrafica = 12;
const diasDeEstaSemana = 6;

/** Los canales de la pantalla, en su orden; las tiendas venden con el POS, que todavía no llega. */
const canales = [
	{ clave: "tienda_1", nombre: "Tienda 1", canal: null },
	{ clave: "tienda_2", nombre: "Tienda 2", canal: null },
	{ clave: "externos", nombre: "Clientes externos", canal: "externos" },
	{ clave: "en_linea", nombre: "En línea", canal: "en_linea" },
] as const;

export const consultaIndicadores = implementarConsulta(indicadores, async (contexto, parametros) => {
	const compara = comparacion[parametros.comparar ?? "semana_pasada"];
	return {
		resultado: await contexto.comoAccion(async (deLectura) => {
			const hoy = deLectura.diaDeNegocio;
			const desde = hoy.subtract({ days: 6 });
			// Una sola lectura de ventas, desde la semana más vieja del año pasado hasta hoy.
			const masVieja = desde.subtract({ days: 7 * (semanasDeLaGrafica - 1) + unAnio });
			const ventas = await ventasPorDia(deLectura, masVieja, hoy);
			const primeras = await primerasVentas(deLectura);
			/** Lo vendido en la semana que termina en `fin`, de un canal o de todos. */
			const semanaQueTermina = (fin: Temporal.PlainDate, canal?: "externos" | "en_linea") =>
				vendidoEntre(ventas, fin.subtract({ days: 6 }), fin, canal);
			const finComparado = hoy.subtract({ days: compara.dias });
			const total = semanaQueTermina(hoy);
			const comparado = semanaQueTermina(finComparado);
			// Las prendas terminadas y los lotes.
			const dias = await ultimosDiasDeTrabajo(deLectura, diasDeLaGrafica);
			const terminadas = await terminadasPorDia(deLectura, dias);
			const { atorados } = await saludDeLosLotes(deLectura);
			const { enProceso, porCortar } = await lotesPorEtapa(deLectura);
			const ubicaciones = await existenciaPorUbicacion(deLectura);
			return {
				semana: {
					desde: desde.toString(),
					total_centavos: total,
					comparado_centavos: comparado,
					variacion: variacion(total, comparado),
					contra: compara.contra,
					nombre_comparado: compara.nombre,
					canales: canales.map(({ clave, nombre, canal }) => ({
						clave,
						nombre,
						vendido_centavos: canal === null ? 0 : semanaQueTermina(hoy, canal),
						comparado_centavos: canal === null ? 0 : semanaQueTermina(finComparado, canal),
						vende_desde: canal === null ? null : primeras[canal],
					})),
				},
				por_semana: Array.from({ length: semanasDeLaGrafica }, (_, i) => {
					const fin = hoy.subtract({ days: 7 * (semanasDeLaGrafica - 1 - i) });
					return {
						desde: fin.subtract({ days: 6 }).toString(),
						este_anio_centavos: semanaQueTermina(fin),
						anio_pasado_centavos: semanaQueTermina(fin.subtract({ days: unAnio })),
					};
				}),
				terminadas: {
					dias: dias.map((dia, i) => ({ fecha: dia.toString(), piezas: terminadas[i] ?? 0 })),
					esta_semana: terminadas.slice(-diasDeEstaSemana).reduce((suma, piezas) => suma + piezas, 0),
					lotes: `${plural(atorados, "lote atorado", "lotes atorados")}, ${enProceso} en proceso, ${porCortar} por cortar`,
				},
				existencias: {
					total: ubicaciones.reduce((suma, ubicacion) => suma + ubicacion.piezas, 0),
					ubicaciones: ubicaciones.map(({ codigo, nombre, piezas }) => ({ codigo, nombre, piezas })),
				},
			};
		}),
	};
});
