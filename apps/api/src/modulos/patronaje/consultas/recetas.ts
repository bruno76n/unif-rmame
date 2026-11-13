/**
 * `patronaje.recetas`: las prendas que llevan receta en tres grupos (sin receta, capturada sin verificar y verificada
 * contra corte), con su tela en la talla de en medio, su próximo corte y su desperdicio medido. Las que tienen corte
 * van primero, por fecha de corte; luego por nombre. Sin dinero.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Recetas»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { listaDeRecetas, type prendaDeLaLista } from "@uniformame/compartido/contratos/patronaje/lista-de-recetas";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	cuandoSeCorta,
	estadosDeReceta,
	leerParametros,
	leerPrendas,
	metrosConDos,
	type ParametrosDePatronaje,
	type PrendaLeida,
	piezasDelLote,
	rangoDeTallas,
	sinEscuela,
	tallaDeEnMedio,
	textoDePorciento,
} from "./comun.ts";

/** Una prenda de la lista. */
type PrendaDeLaLista = z.infer<typeof prendaDeLaLista>;

/** Los tres grupos, en su orden, con su nombre y su color. */
const grupos = [
	{ clave: "sin_receta", nombre: "Sin receta", color: "rojo" },
	{ clave: "sin_verificar", nombre: "Capturada sin verificar", color: "ambar" },
	{ clave: "verificada", nombre: "Verificada contra corte", color: "verde" },
] as const;

/**
 * Quita acentos y mayúsculas, para buscar como se escribe.
 * @param texto El texto.
 */
function normalizar(texto: string): string {
	return texto
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();
}

/**
 * Una prenda como la muestra la lista.
 * @param contexto El contexto de la consulta.
 * @param prenda La prenda.
 * @param parametros Los parámetros de Patronaje.
 */
export function prendaEnLaLista(
	contexto: ContextoDeConsulta,
	prenda: PrendaLeida,
	parametros: ParametrosDePatronaje,
): PrendaDeLaLista {
	const enMedio = tallaDeEnMedio(prenda.tallas);
	const metros = enMedio === undefined ? undefined : prenda.tela?.tallas.get(enMedio.talla_id);
	const corte = prenda.corte === null ? null : cuandoSeCorta(contexto, prenda.corte.fecha_corte);
	const desperdicio = prenda.desperdicio;
	return {
		producto_id: prenda.producto_id,
		prenda: prenda.nombre,
		para: prenda.escuela ?? sinEscuela,
		color_escuela: prenda.color,
		tallas: { rango: rangoDeTallas(prenda.tallas), cuantas: prenda.tallas.length },
		tela:
			prenda.tela === null
				? null
				: {
						nombre: prenda.tela.nombre,
						texto:
							metros === undefined || enMedio === undefined
								? ""
								: `${metrosConDos(metros)} m en talla ${enMedio.nombre}`,
					},
		materiales: prenda.materiales,
		corte:
			prenda.corte === null || corte === null
				? null
				: {
						fecha: textoDeDiaCorto(prenda.corte.fecha_corte),
						texto: corte.texto,
						rojo: prenda.estado !== "verificada" && corte.dias <= parametros.corteUrgente,
						detalle: `${prenda.corte.folio} · ${piezasDelLote(prenda.corte)} pzas`,
					},
		desperdicio:
			desperdicio === null
				? null
				: {
						texto: textoDePorciento(desperdicio.desperdicio_pct),
						rojo: desperdicio.alto,
						detalle: `${plural(desperdicio.lotes, "lote", "lotes")}${desperdicio.dato_flojo ? " · dato flojo" : ""}`,
					},
		estado: estadosDeReceta[prenda.estado],
	};
}

/**
 * Ordena las prendas de un grupo: las que tienen corte primero, por fecha de corte; luego por nombre.
 * @param prendas Las prendas.
 */
export function ordenarPorCorte(prendas: PrendaLeida[]): PrendaLeida[] {
	return prendas.sort(
		(una, otra) =>
			(una.corte === null ? 1 : 0) - (otra.corte === null ? 1 : 0) ||
			(una.corte?.fecha_corte ?? "").localeCompare(otra.corte?.fecha_corte ?? "") ||
			una.nombre.localeCompare(otra.nombre, "es-MX"),
	);
}

export const consultaRecetas = implementarConsulta(listaDeRecetas, async (contexto, parametros) => {
	const ajustes = await leerParametros(contexto);
	const buscado = normalizar(parametros.buscar ?? "");
	const prendas = (await leerPrendas(contexto)).filter(
		(prenda) =>
			(parametros.seccion_id === undefined || prenda.seccion_id === parametros.seccion_id) &&
			normalizar(`${prenda.nombre} ${prenda.escuela ?? sinEscuela}`).includes(buscado),
	);
	const { rows } = await contexto.base.execute(sql`
		SELECT s.id AS seccion_id, s.nombre FROM secciones s
		WHERE s.lleva_receta AND s.baja_en IS NULL ORDER BY s.orden, s.nombre`);
	return {
		resultado: {
			secciones: z.array(z.object({ seccion_id: z.uuid(), nombre: z.string() })).parse(rows),
			total: prendas.length,
			grupos: grupos.map((grupo) => ({
				...grupo,
				prendas: ordenarPorCorte(prendas.filter((prenda) => prenda.estado === grupo.clave)).map((prenda) =>
					prendaEnLaLista(contexto, prenda, ajustes),
				),
			})),
		},
	};
});
