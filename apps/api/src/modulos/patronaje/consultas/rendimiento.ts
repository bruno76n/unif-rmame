/**
 * `patronaje.rendimiento` y `patronaje.rendimiento_prenda`: la tela por pieza de cada prenda, patrón contra lo que se
 * gasta en el tendido, en la talla de en medio y por talla. El desperdicio sale de los cortes cerrados
 * (`patronaje.desperdicio_prenda`); el «real» de cada talla es estimado: su patrón con el desperdicio de la prenda
 * (regla 6 de cuenta de material), con la misma cuenta del paquete compartido. Sin dinero.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Rendimiento» y «Cajones»: Rendimiento) y
 * docs/modulos/patronaje/cuenta-de-material.md (reglas 5 y 6)
 */

import { deMilesimos, pideLaReceta } from "@uniformame/compartido/calculos/cuenta-material";
import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import type { renglonPatronContraCorte } from "@uniformame/compartido/contratos/patronaje/receta";
import { rendimientoDePatronaje, rendimientoDeUnaPrenda } from "@uniformame/compartido/contratos/patronaje/rendimiento";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	leerParametros,
	leerPrendas,
	metrosConDos,
	type ParametrosDePatronaje,
	type PrendaLeida,
	sinEscuela,
	tallaDeEnMedio,
	textoDePorciento,
} from "./comun.ts";

/**
 * Los metros por pieza que se gastan en el tendido: el patrón con el desperdicio de la prenda, con la cuenta del
 * paquete compartido.
 * @param patron Los metros del patrón por pieza.
 * @param pct El desperdicio, en por ciento.
 */
function realPorPieza(patron: string, pct: string): string {
	const [real] = Object.values(
		pideLaReceta(
			[
				{
					materialId: "tela",
					esTelaPrincipal: true,
					cantidad: patron,
					porTalla: {},
					recetaPorUnidadInventario: "1",
					seCuentaEntera: false,
				},
			],
			{ pieza: 1 },
			pct,
		),
	);
	return real === null || real === undefined ? patron : deMilesimos(real);
}

/** Lo que regresa `produccion.cortes_de_prenda`, en lo que se usa aquí. */
const deLosCortes = z.object({
	cortes: z.array(z.object({ tallas: z.array(z.object({ talla_id: z.uuid(), piezas: z.number() })) })),
});

/**
 * «Patrón contra corte, por talla» de una prenda medida en corte: el patrón de la versión vigente, el real estimado,
 * el desperdicio de la prenda y cuántos lotes cortaron cada talla.
 * @param contexto El contexto de la consulta.
 * @param prenda La prenda.
 * @param parametros Los parámetros de Patronaje.
 * @returns Su tela y sus tallas; sin cortes medidos, nada.
 */
export async function patronContraCorte(
	contexto: ContextoDeConsulta,
	prenda: PrendaLeida,
	parametros: ParametrosDePatronaje,
): Promise<{ tela: string; tallas: z.infer<typeof renglonPatronContraCorte>[] } | null> {
	const { desperdicio, tela } = prenda;
	if (desperdicio === null || tela === null) return null;
	const { cortes } = deLosCortes.parse(
		await contexto.lectura("produccion.cortes_de_prenda", { producto_id: prenda.producto_id }),
	);
	return {
		tela: tela.nombre,
		tallas: prenda.tallas.map((talla) => {
			const patron = tela.tallas.get(talla.talla_id);
			const lotes = cortes.filter((corte) => corte.tallas.some((suya) => suya.talla_id === talla.talla_id)).length;
			return {
				talla: talla.nombre,
				especial: talla.especial,
				patron: patron === undefined ? null : `${metrosConDos(patron)} m`,
				real:
					patron === undefined || lotes === 0
						? null
						: `${metrosConDos(realPorPieza(patron, desperdicio.desperdicio_pct))} m`,
				desperdicio: lotes === 0 ? null : textoDePorciento(desperdicio.desperdicio_pct),
				alto: desperdicio.alto,
				lotes,
				flojo: lotes < parametros.datoFlojo,
			};
		}),
	};
}

/**
 * El día del último corte cerrado de cada prenda.
 * @param contexto El contexto de la consulta.
 */
async function ultimosCortes(contexto: ContextoDeConsulta): Promise<Map<string, string>> {
	const { rows } = await contexto.base.execute(sql`
		SELECT l.producto_id, (max(c.cerrado_en) AT TIME ZONE 'America/Mexico_City')::date::text AS dia
		FROM cortes c JOIN lotes l ON l.id = c.lote_id WHERE c.cerrado_en IS NOT NULL GROUP BY l.producto_id`);
	return new Map(
		z
			.array(z.object({ producto_id: z.uuid(), dia: z.string() }))
			.parse(rows)
			.map((fila) => [fila.producto_id, fila.dia]),
	);
}

/**
 * El patrón y el real de una prenda medida, en la talla de en medio.
 * @param prenda La prenda (medida, con tela).
 */
function enLaTallaDeEnMedio(prenda: PrendaLeida) {
	const enMedio = tallaDeEnMedio(prenda.tallas);
	const patron = enMedio === undefined ? undefined : prenda.tela?.tallas.get(enMedio.talla_id);
	if (patron === undefined || prenda.desperdicio === null) return undefined;
	return { talla: enMedio?.nombre ?? "", patron, real: realPorPieza(patron, prenda.desperdicio.desperdicio_pct) };
}

export const consultaRendimiento = implementarConsulta(rendimientoDePatronaje, async (contexto) => {
	const ajustes = await leerParametros(contexto);
	const prendas = await leerPrendas(contexto);
	const ultimos = await ultimosCortes(contexto);
	const medidas = prendas
		.flatMap((prenda) => {
			const medida = enLaTallaDeEnMedio(prenda);
			const { desperdicio, tela } = prenda;
			if (medida === undefined || desperdicio === null || tela === null) return [];
			const ultimo = ultimos.get(prenda.producto_id);
			return [
				{
					producto_id: prenda.producto_id,
					prenda: prenda.nombre,
					detalle: `${prenda.escuela ?? sinEscuela} · ${tela.nombre}`,
					patron: metrosConDos(medida.patron),
					real: metrosConDos(medida.real),
					desperdicio: textoDePorciento(desperdicio.desperdicio_pct),
					pct: Number(desperdicio.desperdicio_pct),
					alto: desperdicio.alto,
					lotes: desperdicio.lotes,
					flojo: desperdicio.dato_flojo,
					ultimo_corte: ultimo === undefined ? null : textoDeDiaCorto(ultimo),
				},
			];
		})
		.sort((una, otra) => otra.pct - una.pct);
	const medidos = new Set(medidas.map((medida) => medida.producto_id));
	const sinPct = medidas.map(({ pct: _pct, ...medida }) => medida);
	return {
		resultado: {
			pct_alto: ajustes.desperdicioAlto,
			altos: sinPct.filter((medida) => medida.alto),
			normales: sinPct.filter((medida) => !medida.alto),
			sin_medir: prendas
				.filter((prenda) => !medidos.has(prenda.producto_id))
				.map((prenda) => ({
					producto_id: prenda.producto_id,
					prenda: prenda.nombre,
					detalle: prenda.escuela ?? sinEscuela,
					motivo:
						prenda.estado === "sin_receta"
							? "Sin receta: no hay patrón contra qué medir"
							: "Todavía no se corta con esta receta",
				})),
		},
	};
});

export const consultaRendimientoPrenda = implementarConsulta(rendimientoDeUnaPrenda, async (contexto, parametros) => {
	const [prenda] = await leerPrendas(contexto, parametros.producto_id);
	if (prenda === undefined) throw noExiste();
	const ajustes = await leerParametros(contexto);
	const medida = enLaTallaDeEnMedio(prenda);
	const porTalla = await patronContraCorte(contexto, prenda, ajustes);
	const { desperdicio } = prenda;
	return {
		resultado: {
			producto_id: prenda.producto_id,
			prenda: prenda.nombre,
			tela: prenda.tela?.nombre ?? "",
			medido:
				medida === undefined || desperdicio === null || porTalla === null
					? null
					: {
							patron: `${metrosConDos(medida.patron)} m · dice el patrón, talla ${medida.talla}`,
							real: `${metrosConDos(medida.real)} m · se gasta en el tendido`,
							alto: desperdicio.alto,
							desperdicio: `${textoDePorciento(desperdicio.desperdicio_pct)} · desperdicio, ${plural(desperdicio.lotes, "lote", "lotes")}`,
							flojo: desperdicio.dato_flojo
								? `Con ${plural(desperdicio.lotes, "lote", "lotes")} el dato todavía es flojo.`
								: null,
							tallas: porTalla.tallas,
						},
		},
	};
});
