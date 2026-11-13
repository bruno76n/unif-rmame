/**
 * `direccion.pendientes`: la primera pestaña de Dirección. La barra de indicadores del periodo de
 * `direccion.primer_vistazo` (Ventas, Producción, Existencias y Cuentas por cobrar y pagar) y el panel con las
 * autorizaciones por autorizar y las alertas cruzadas, ya armados.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Pendientes»)
 *
 * Las autorizaciones salen de la misma consulta de la pestaña Autorizaciones y las alertas de la misma función que el
 * trabajo de alertas. Lo que se debe no lleva la nómina (`contaduria.resumen_direccion` solo suma proveedores y
 * acreedores) y nunca sale un sueldo.
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { plural } from "@uniformame/compartido/calculos/textos";
import { autorizaciones, nombreDelTipoDeAutorizacion } from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { pendientes } from "@uniformame/compartido/contratos/direccion/pendientes";
import { z } from "zod";
import { camposQueNoVe } from "../../../nucleo/acceso/recorte.ts";
import type { ContextoDeAccion, ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { alertasConDetalle } from "./alertas.ts";
import { consultaAutorizaciones } from "./autorizaciones.ts";
import {
	existenciaPorUbicacion,
	formatoDeCantidad,
	formatoDePiezas,
	saludDeLosLotes,
	terminadasPorDia,
	ultimosDiasDeTrabajo,
	variacion,
	vendidoEntre,
	ventasPorDia,
} from "./cifras.ts";
import { rutaSiLaTiene } from "./departamentos-de-la-cuenta.ts";

/** Lo que regresa la consulta. */
type Resultado = z.infer<typeof pendientes.resultado>;
type Cifra = Resultado["cifras"][number];
type Pendiente = Resultado["pendientes"][number];

/** Cuántos periodos lleva la gráfica chica de las ventas, y cuántos días de trabajo la de producción. */
const periodosDeVentas = 8;
const diasDeProduccion = 12;
const diasDeEstaSemana = 6;

/** El color de cada ubicación en la barra de existencias, en el orden de las ubicaciones. */
const coloresDeUbicacion = ["morado", "azul", "verde-azulado", "naranja", "ambar", "gris", "rojo"] as const;

/** Lo que trae `contaduria.resumen_direccion` que usa la barra. */
const deResumen = z.object({ por_cobrar_centavos: z.number(), por_pagar_centavos: z.number() });

/**
 * La cifra de Ventas: lo vendido en el periodo por todas las vías, contra el periodo anterior, con ocho periodos.
 * @param contexto El contexto de la lectura.
 * @param periodo La semana (los últimos siete días) o el día.
 * @param veMontos Si quien consulta recibe montos: si no, la cifra va sin ellos.
 */
async function cifraDeVentas(contexto: ContextoDeAccion, periodo: "semana" | "dia", veMontos: boolean): Promise<Cifra> {
	const largo = periodo === "semana" ? 7 : 1;
	const hoy = contexto.diaDeNegocio;
	const ventas = await ventasPorDia(contexto, hoy.subtract({ days: largo * periodosDeVentas - 1 }), hoy);
	const serie = Array.from({ length: periodosDeVentas }, (_, i) => {
		const fin = hoy.subtract({ days: largo * (periodosDeVentas - 1 - i) });
		return vendidoEntre(ventas, fin.subtract({ days: largo - 1 }), fin);
	});
	const actual = serie.at(-1) ?? 0;
	const cambio = variacion(actual, serie.at(-2) ?? 0);
	return {
		clave: "ventas",
		numero: veMontos ? enPesos(actual) : "—",
		unidad: periodo === "semana" ? "última semana" : "hoy",
		rojo: false,
		contexto: cambio === null ? [] : [{ texto: `${cambio} contra la anterior`, tono: "normal" }],
		serie: veMontos ? serie : [],
		reparto: [],
		lleva_a: "direccion/indicadores",
	};
}

/**
 * La cifra de Producción: las prendas terminadas en los últimos 6 días de trabajo contra los 6 anteriores, con los
 * lotes atorados y en riesgo en rojo y primero.
 * @param contexto El contexto de la lectura.
 */
async function cifraDeProduccion(contexto: ContextoDeAccion): Promise<Cifra> {
	const serie = await terminadasPorDia(contexto, await ultimosDiasDeTrabajo(contexto, diasDeProduccion));
	const suma = (piezas: number[]) => piezas.reduce((total, unas) => total + unas, 0);
	const estas = suma(serie.slice(-diasDeEstaSemana));
	const cambio = variacion(estas, suma(serie.slice(0, -diasDeEstaSemana)));
	const { atorados, enRiesgo } = await saludDeLosLotes(contexto);
	return {
		clave: "produccion",
		numero: formatoDePiezas.format(estas),
		unidad: "prendas terminadas",
		rojo: atorados > 0,
		contexto: [
			...(atorados > 0
				? [
						{
							texto: `${plural(atorados, "lote atorado", "lotes atorados")} · ${formatoDePiezas.format(enRiesgo)} en riesgo`,
							tono: "rojo" as const,
						},
					]
				: []),
			...(cambio === null ? [] : [{ texto: `${cambio} contra la anterior`, tono: "normal" as const }]),
		],
		serie,
		reparto: [],
		lleva_a: "direccion/indicadores",
	};
}

/**
 * La cifra de Existencias: las piezas en total, cuántas en bodega y la barra repartida por ubicación.
 * @param contexto El contexto de la lectura.
 */
async function cifraDeExistencias(contexto: ContextoDeAccion): Promise<Cifra> {
	const ubicaciones = await existenciaPorUbicacion(contexto);
	const total = ubicaciones.reduce((suma, ubicacion) => suma + ubicacion.piezas, 0);
	const enBodega = ubicaciones
		.filter((ubicacion) => ubicacion.tipo === "bodega")
		.reduce((suma, ubicacion) => suma + ubicacion.piezas, 0);
	return {
		clave: "existencias",
		numero: formatoDePiezas.format(total),
		unidad: "piezas en total",
		rojo: false,
		contexto: [{ texto: `${formatoDePiezas.format(enBodega)} en bodega`, tono: "normal" }],
		serie: [],
		reparto: ubicaciones.map((ubicacion, i) => ({
			etiqueta: ubicacion.nombre,
			valor: ubicacion.piezas,
			color: coloresDeUbicacion[i % coloresDeUbicacion.length] ?? "gris",
		})),
		lleva_a: "direccion/indicadores",
	};
}

/**
 * La cifra de Cuentas por cobrar y pagar, de Contaduría: lo por cobrar contra lo por pagar.
 * @param contexto El contexto de la lectura.
 * @param consulta El contexto de la consulta (quién la ve: lleva a Contaduría solo si la tiene).
 * @param veMontos Si quien consulta recibe montos: si no, la cifra va sin ellos.
 */
async function cifraDeCuentas(
	contexto: ContextoDeAccion,
	consulta: ContextoDeConsulta,
	veMontos: boolean,
): Promise<Cifra> {
	const dias = await leerParametro(contexto.transaccion, { clave: "direccion.alerta_concentracion_vencido_dias" });
	const resumen = deResumen.parse(
		await contexto.lectura("contaduria.resumen_direccion", { dias_vencido: Number(dias) }),
	);
	return {
		clave: "cuentas",
		numero: veMontos ? enPesos(resumen.por_cobrar_centavos) : "—",
		unidad: "por cobrar",
		rojo: false,
		contexto: veMontos ? [{ texto: `Por pagar ${enPesos(resumen.por_pagar_centavos)}`, tono: "normal" }] : [],
		serie: [],
		reparto: veMontos
			? [
					{ etiqueta: "Por cobrar", valor: resumen.por_cobrar_centavos, color: "verde" },
					{ etiqueta: "Por pagar", valor: resumen.por_pagar_centavos, color: "ambar" },
				]
			: [],
		lleva_a: rutaSiLaTiene(consulta.quien, "contaduria"),
	};
}

/**
 * Las autorizaciones por autorizar como pendientes: rojas desde `direccion.autorizacion_dias_rojo` días esperando,
 * cuando la consulta de Autorizaciones ya dice «{n} días esperando».
 * @param contexto El contexto de la consulta.
 * @param veMontos Si quien consulta recibe montos.
 */
async function autorizacionesPendientes(contexto: ContextoDeConsulta, veMontos: boolean): Promise<Pendiente[]> {
	const { resultado } = await consultaAutorizaciones.leer(contexto, {});
	const { por_autorizar } = autorizaciones.resultado.parse(resultado);
	return por_autorizar.map((autorizacion) => {
		const rojo = autorizacion.esperando !== null;
		const cantidad =
			autorizacion.cantidad === null
				? null
				: `${formatoDeCantidad.format(Number(autorizacion.cantidad))} ${autorizacion.unidad ?? ""}`.trim();
		return {
			clave: `autorizacion:${autorizacion.id}`,
			grupo: "autorizaciones",
			titulo: nombreDelTipoDeAutorizacion[autorizacion.tipo],
			detalle: `${autorizacion.resumen} · ${autorizacion.departamento}${autorizacion.pedida_por === null ? "" : `, ${autorizacion.pedida_por}`}`,
			fecha: autorizacion.pedida_el,
			cifra:
				autorizacion.importe_centavos === null || autorizacion.importe_centavos === undefined
					? cantidad
					: veMontos
						? enPesos(autorizacion.importe_centavos)
						: null,
			estado: rojo ? `Por autorizar · ${plural(autorizacion.dias_esperando, "día", "días")}` : "Por autorizar",
			color: rojo ? "rojo" : "ambar",
			lleva_a: "direccion/autorizaciones",
		};
	});
}

/**
 * Ordena los pendientes: rojo, luego ámbar; dentro de cada color, por fecha, y las alertas, sin fecha, al final.
 * @param lista Los pendientes.
 */
function ordenar(lista: Pendiente[]): Pendiente[] {
	const lugar = (pendiente: Pendiente) => (pendiente.color === "rojo" ? 0 : 1);
	return [...lista].sort(
		(uno, otro) => lugar(uno) - lugar(otro) || (uno.fecha ?? "9999").localeCompare(otro.fecha ?? "9999"),
	);
}

export const consultaPendientes = implementarConsulta(pendientes, async (contexto, parametros) => {
	const periodo = z
		.enum(["semana", "dia"])
		.parse(await leerParametro(contexto.base, { clave: "direccion.primer_vistazo" }));
	// Los montos van escritos: quien no los ve (la cuenta de soporte, con la regla del recorte común) no los recibe.
	const veMontos = !camposQueNoVe(contexto.quien, contexto.registro.camposDeSueldo)("monto_centavos");
	const porAutorizar = await autorizacionesPendientes(contexto, veMontos);
	const { cifras, alertas } = await contexto.comoAccion(async (deLectura) => ({
		cifras: [
			await cifraDeVentas(deLectura, periodo, veMontos),
			await cifraDeProduccion(deLectura),
			await cifraDeExistencias(deLectura),
			await cifraDeCuentas(deLectura, contexto, veMontos),
		],
		alertas: await alertasConDetalle(deLectura, contexto.quien),
	}));
	const deAlertas: Pendiente[] = alertas.map((alerta) => ({
		clave: alerta.clave,
		grupo: "alertas",
		titulo: alerta.titulo,
		detalle: alerta.detalle,
		fecha: null,
		cifra: null,
		estado: "Por revisar",
		color: alerta.color,
		lleva_a: alerta.ver,
	}));
	const todos = ordenar([...porAutorizar, ...deAlertas]);
	return {
		resultado: {
			periodo,
			cifras,
			pendientes: parametros.grupo === undefined ? todos : todos.filter((uno) => uno.grupo === parametros.grupo),
			conteos: { autorizaciones: porAutorizar.length, alertas: deAlertas.length },
		},
	};
});
