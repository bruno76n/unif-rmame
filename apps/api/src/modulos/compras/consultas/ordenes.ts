/**
 * `compras.ordenes`: las órdenes de compra por grupo (atrasadas, llegan esta semana, más adelante, borradores y
 * terminadas), cada una con su proveedor y su condición, su primer material, lo pedido contra lo recibido, cuándo
 * llega o llegó, su estado y su total.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Órdenes de compra») y docs/modulos/compras/ordenes-de-compra.md
 * (reglas 7 a 10, 15)
 */

import { cantidadConUnidad, cifraEnTexto, cuandoLlega } from "@uniformame/compartido/calculos/compras";
import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { ordenesDeCompra } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { Temporal } from "temporal-polyfill";
import type { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { condicionDeOrden, type OrdenResumida, ordenesResumidas } from "../dominio/ordenes-resumidas.ts";
import { cumpleBusqueda, estadoDeOrden } from "./comun.ts";

/** Una orden de la lista. */
type OrdenDeLaLista = z.infer<typeof ordenesDeCompra.resultado>["ordenes"][number];

/** Los días en que una orden «llega esta semana». */
const diasDeLaSemana = 7;

/** Las que ya terminaron. */
const terminadas = ["recibida", "cerrada", "cerrada_con_faltante", "cancelada"];

/**
 * Los días que faltan para la fecha prometida; negativo si ya pasó.
 * @param orden La orden.
 * @param hoy Hoy.
 */
function faltanDias(orden: OrdenResumida, hoy: Temporal.PlainDate): number {
	return orden.fechaPrometida === null ? 0 : hoy.until(Temporal.PlainDate.from(orden.fechaPrometida)).days;
}

/**
 * El grupo de una orden.
 * @param orden La orden.
 * @param hoy Hoy.
 */
function grupoDe(orden: OrdenResumida, hoy: Temporal.PlainDate): OrdenDeLaLista["grupo"] {
	if (orden.estado === "borrador") return "borradores";
	if (terminadas.includes(orden.estado)) return "terminadas";
	if (orden.diasAtraso > 0) return "atrasadas";
	return faltanDias(orden, hoy) <= diasDeLaSemana ? "esta_semana" : "mas_adelante";
}

/**
 * Lo pedido contra lo recibido: «Pedirá {cantidad}» en borrador; «{recibido} de {pedido}» con un material, o
 * «{completos} de {n} materiales»; la barra roja si va atrasada, naranja si va en parte, azul si no.
 * @param orden La orden.
 */
function avanceDe(orden: OrdenResumida): OrdenDeLaLista["avance"] {
	const [unica] = orden.lineas;
	if (orden.estado === "borrador") {
		const texto =
			orden.lineas.length === 1 && unica !== undefined
				? `Pedirá ${cantidadConUnidad(unica.pedido, unica.unidad)}`
				: `${plural(orden.lineas.length, "material", "materiales")} por pedir`;
		return { texto, por_ciento: 0, tono: "gris" };
	}
	const partes = orden.lineas.map((linea) =>
		linea.pedido === 0n ? 1 : Math.min(1, Number(linea.recibido) / Number(linea.pedido)),
	);
	const porCiento = partes.length === 0 ? 0 : (partes.reduce((suma, parte) => suma + parte, 0) / partes.length) * 100;
	const texto =
		orden.lineas.length === 1 && unica !== undefined
			? `${cifraEnTexto(unica.recibido)} de ${cantidadConUnidad(unica.pedido, unica.unidad)}`
			: `${orden.lineas.filter((linea) => linea.falta === 0n).length} de ${plural(orden.lineas.length, "material", "materiales")}`;
	const tono = orden.diasAtraso > 0 ? "rojo" : porCiento > 0 && porCiento < 100 ? "naranja" : "azul";
	return { texto, por_ciento: Math.round(porCiento), tono };
}

/**
 * Cuándo llega: «Sin enviar», «Llegó el {fecha}» con «{n} días tarde» o «A tiempo», o la prometida con «hace {n}
 * días», «mañana» o «en {n} días».
 * @param orden La orden.
 * @param hoy Hoy.
 */
function llegaDe(orden: OrdenResumida, hoy: Temporal.PlainDate): OrdenDeLaLista["llega"] {
	if (orden.estado === "borrador") return { texto: "Sin enviar", detalle: null, rojo: false };
	const ultima = orden.recepciones.at(-1);
	if (terminadas.includes(orden.estado) && ultima !== undefined) {
		const tarde =
			orden.fechaPrometida === null
				? 0
				: Temporal.PlainDate.from(orden.fechaPrometida).until(Temporal.PlainDate.from(ultima)).days;
		return {
			texto: `Llegó el ${textoDeDiaCorto(ultima)}`,
			detalle: tarde > 0 ? `${plural(tarde, "día", "días")} tarde` : "A tiempo",
			rojo: false,
		};
	}
	if (orden.fechaPrometida === null || orden.estado === "cancelada") return { texto: "—", detalle: null, rojo: false };
	return {
		texto: textoDeDiaCorto(orden.fechaPrometida),
		detalle:
			orden.estado === "enviada" || orden.estado === "recibida_en_parte" ? cuandoLlega(faltanDias(orden, hoy)) : null,
		rojo: orden.diasAtraso > 0,
	};
}

/**
 * El orden dentro de cada grupo: la más atrasada primero; las que llegan, la más próxima primero; los borradores y las
 * terminadas, la más nueva primero.
 * @param una Una orden.
 * @param otra Otra.
 * @param hoy Hoy.
 */
function ordenar(una: OrdenResumida, otra: OrdenResumida, hoy: Temporal.PlainDate): number {
	const grupo = grupoDe(una, hoy);
	if (grupo === "atrasadas") return otra.diasAtraso - una.diasAtraso;
	if (grupo === "esta_semana" || grupo === "mas_adelante") return faltanDias(una, hoy) - faltanDias(otra, hoy);
	return otra.folio.localeCompare(una.folio);
}

export const consultaOrdenes = implementarConsulta(ordenesDeCompra, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const hoy = accion.diaDeNegocio;
		const ordenes = (await ordenesResumidas(accion, {}))
			.filter((orden) =>
				cumpleBusqueda(parametros.buscar, [
					orden.folio,
					orden.proveedor,
					...orden.lineas.map((linea) => linea.material),
				]),
			)
			.sort((una, otra) => ordenar(una, otra, hoy));
		return {
			ordenes: ordenes.map((orden) => {
				const [primera] = orden.lineas;
				const mas = orden.lineas.length - 1;
				return {
					orden_compra_id: orden.id,
					folio: orden.folio,
					grupo: grupoDe(orden, hoy),
					creada: orden.fecha,
					proveedor: orden.proveedor,
					condicion: condicionDeOrden(orden),
					material: primera?.material ?? "",
					material_detalle: mas > 0 ? `y ${plural(mas, "material", "materiales")} más` : (primera?.presentacion ?? ""),
					avance: avanceDe(orden),
					llega: llegaDe(orden, hoy),
					estado: estadoDeOrden(orden.estado, orden.diasAtraso),
					total_centavos: orden.totalCentavos,
				};
			}),
		};
	}),
}));
