/**
 * `patronaje.pendientes` y la pastilla de Patronaje: las tres cifras de arriba (Recetas, Rendimiento y Desarrollo de
 * producto) y la cola de trabajo, cada renglón ya escrito con su estado y lo que su botón necesita: las prendas sin
 * receta (en rojo si se cortan en `patronaje.corte_proximo_dias` o menos) y las sin verificar, y las muestras que
 * esperan aprobación. Sin dinero.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Pendientes» y «Quién entra»: la pastilla)
 */

import { diasHasta, textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import {
	pendientesDePatronaje,
	type renglonDePendientesDePatronaje,
} from "@uniformame/compartido/contratos/patronaje/pendientes";
import type { z } from "zod";
import { type ConteoDePastilla, type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	basicoOGeneral,
	type DesarrolloLeido,
	esperaAprobacion,
	leerDesarrollos,
	leerParametros,
	leerPrendas,
	type ParametrosDePatronaje,
	type PrendaLeida,
	sinEscuela,
} from "./comun.ts";

/** Un renglón de Pendientes. */
type Renglon = z.infer<typeof renglonDePendientesDePatronaje>;

/**
 * Si una prenda sin receta tiene su corte en los días que se dan o menos (o ya pasó).
 * @param contexto El contexto de la consulta.
 * @param prenda La prenda.
 * @param dias Los días.
 */
function sinRecetaCortaEn(contexto: ContextoDeConsulta, prenda: PrendaLeida, dias: number): boolean {
	return (
		prenda.estado === "sin_receta" &&
		prenda.corte !== null &&
		diasHasta(contexto.diaDeNegocio, prenda.corte.fecha_corte) <= dias
	);
}

/**
 * El renglón de una prenda sin receta o sin verificar.
 * @param contexto El contexto de la consulta.
 * @param prenda La prenda.
 * @param parametros Los parámetros de Patronaje.
 */
function renglonDeReceta(
	contexto: ContextoDeConsulta,
	prenda: PrendaLeida,
	parametros: ParametrosDePatronaje,
): Renglon {
	const pronto = sinRecetaCortaEn(contexto, prenda, parametros.corteProximo);
	const estado =
		prenda.estado === "sin_verificar"
			? { estado: "Sin verificar", color: "ambar" as const }
			: pronto
				? { estado: "Sin receta · corte próximo", color: "rojo" as const }
				: { estado: "Sin receta", color: "ambar" as const };
	const para = prenda.escuela ?? sinEscuela;
	return {
		tipo: "receta",
		clave: `receta-${prenda.producto_id}`,
		titulo: prenda.nombre,
		detalle: prenda.corte === null ? para : `${para} · corte ${prenda.corte.folio}`,
		fecha: prenda.corte === null ? null : `Corte ${textoDeDiaCorto(prenda.corte.fecha_corte)}`,
		fecha_orden: prenda.corte?.fecha_corte ?? null,
		fecha_roja: sinRecetaCortaEn(contexto, prenda, parametros.corteUrgente),
		...estado,
		producto_id: prenda.producto_id,
		boton: prenda.estado === "sin_receta" ? "capturar" : "verificar",
	};
}

/**
 * El renglón de una muestra que espera aprobación.
 * @param desarrollo El desarrollo.
 */
function renglonDeMuestra(desarrollo: DesarrolloLeido): Renglon {
	return {
		tipo: "muestra",
		clave: `muestra-${desarrollo.id}`,
		titulo: `${desarrollo.folio} · ${desarrollo.prenda}`,
		detalle: desarrollo.escuela ?? basicoOGeneral,
		fecha: textoDeDiaCorto(desarrollo.ultimo),
		fecha_orden: desarrollo.ultimo,
		fecha_roja: false,
		estado: esperaAprobacion(desarrollo),
		color: "azul",
		desarrollo_id: desarrollo.id,
	};
}

/** El lugar de cada color en la cola: rojo, ámbar y azul. */
const ordenDeColor: Readonly<Record<string, number>> = { rojo: 0, ambar: 1, azul: 2 };

/**
 * Ordena la cola: rojo, ámbar y azul; dentro de cada color, por fecha (sin fecha al final) y por nombre.
 * @param renglones Los renglones.
 */
function ordenar(renglones: Renglon[]): Renglon[] {
	return renglones.sort(
		(uno, otro) =>
			(ordenDeColor[uno.color] ?? 9) - (ordenDeColor[otro.color] ?? 9) ||
			(uno.fecha_orden ?? "9999").localeCompare(otro.fecha_orden ?? "9999") ||
			uno.titulo.localeCompare(otro.titulo, "es-MX"),
	);
}

export const consultaPendientes = implementarConsulta(pendientesDePatronaje, async (contexto, parametros) => {
	const ajustes = await leerParametros(contexto);
	const prendas = await leerPrendas(contexto);
	const desarrollos = await leerDesarrollos(contexto);
	const enAprobacion = desarrollos.filter((desarrollo) => desarrollo.etapa === "aprobacion");
	const recetas = prendas
		.filter((prenda) => prenda.estado !== "verificada")
		.map((prenda) => renglonDeReceta(contexto, prenda, ajustes));
	const muestras = enAprobacion.map(renglonDeMuestra);
	const renglones = ordenar([...recetas, ...muestras]);
	const grupo = parametros.grupo ?? "todos";
	const cuantas = (estado: PrendaLeida["estado"]) => prendas.filter((prenda) => prenda.estado === estado).length;
	const medidas = prendas.filter((prenda) => prenda.desperdicio !== null);
	return {
		resultado: {
			indicadores: {
				recetas: {
					prendas: prendas.length,
					sin_receta_pronto: prendas.filter((prenda) => sinRecetaCortaEn(contexto, prenda, ajustes.corteProximo))
						.length,
					verificadas: cuantas("verificada"),
					sin_verificar: cuantas("sin_verificar"),
					sin_receta: cuantas("sin_receta"),
				},
				rendimiento: {
					altos: medidas.filter((prenda) => prenda.desperdicio?.alto === true).length,
					pct_alto: ajustes.desperdicioAlto,
					medidas: medidas.length,
				},
				desarrollo: {
					en_proceso: desarrollos.filter((uno) => uno.etapa !== "en_catalogo" && uno.etapa !== "cancelado").length,
					en_aprobacion: enAprobacion.length,
				},
			},
			conteos: { todos: renglones.length, recetas: recetas.length, muestra: muestras.length },
			hay_rojo: renglones.some((renglon) => renglon.color === "rojo"),
			renglones:
				grupo === "todos"
					? renglones
					: renglones.filter((renglon) => (grupo === "recetas" ? renglon.tipo === "receta" : renglon.tipo === grupo)),
		},
	};
});

/**
 * La pastilla de Patronaje en el menú: las prendas sin receta que se cortan en `patronaje.corte_proximo_dias` o menos,
 * más las sin verificar con corte programado; roja si una sin receta se corta en `patronaje.corte_urgente_dias` o
 * menos.
 * @param contexto El contexto de quien pregunta.
 */
export async function pastillaPatronaje(contexto: ContextoDeConsulta): Promise<ConteoDePastilla> {
	const ajustes = await leerParametros(contexto);
	const prendas = await leerPrendas(contexto);
	return {
		conteo: prendas.filter(
			(prenda) =>
				sinRecetaCortaEn(contexto, prenda, ajustes.corteProximo) ||
				(prenda.estado === "sin_verificar" && prenda.corte !== null),
		).length,
		rojo: prendas.some((prenda) => sinRecetaCortaEn(contexto, prenda, ajustes.corteUrgente)),
	};
}
