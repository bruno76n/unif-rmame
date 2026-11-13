/**
 * La pestaña Indicadores de Dirección: los cuatro paneles. Las ventas de la semana por canal contra lo que se escoge
 * («Semana pasada», «Hace un mes» o «Temporada pasada», que solo cambian este panel), las ventas por semana contra el
 * año pasado, las prendas terminadas por día y la existencia por ubicación.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Indicadores»)
 *
 * Las cifras llegan calculadas de `direccion.indicadores`: la pestaña solo las escribe y las grafica.
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import type { comparaciones, indicadores } from "@uniformame/compartido/contratos/direccion/indicadores";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { Grafica } from "@uniformame/interfaz/graficas/grafica";
import type { ReactNode } from "react";
import type { z } from "zod";

/** Lo que trae `direccion.indicadores`. */
type Datos = z.infer<typeof indicadores.resultado>;

/** Contra qué se compara la semana. */
export type Comparacion = (typeof comparaciones)[number];

/** Los botones de la comparación. */
const botonesDeComparacion: readonly { clave: Comparacion; texto: string }[] = [
	{ clave: "semana_pasada", texto: "Semana pasada" },
	{ clave: "hace_un_mes", texto: "Hace un mes" },
	{ clave: "temporada_pasada", texto: "Temporada pasada" },
];

/** El formato de las piezas. */
const piezas = new Intl.NumberFormat("es-MX");

/**
 * Un panel de Indicadores: su nombre chico, su cifra grande y su contenido.
 * @param props El nombre, la cifra, lo que va junto a la cifra y el contenido.
 */
function Panel({
	nombre,
	cifra,
	junto,
	children,
}: {
	nombre: string;
	cifra: string;
	junto?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section aria-label={nombre} className="flex min-w-0 flex-col gap-3 rounded-grande bg-panel p-5 shadow-panel">
			<header className="flex flex-col gap-1">
				<span className="text-etiqueta text-tinta3">{nombre}</span>
				<span className="flex flex-wrap items-baseline gap-2">
					<b className="font-bold text-titulo-seccion tabular-nums">{cifra}</b>
					{junto}
				</span>
			</header>
			{children}
		</section>
	);
}

/** Lo que recibe la pestaña. */
export interface PropsDeIndicadores {
	datos: Datos;
	comparar: Comparacion;
	alComparar: (comparar: Comparacion) => void;
}

/**
 * La pestaña Indicadores.
 * @param props Los datos, contra qué se compara y qué hacer al cambiarlo.
 */
export function PestanaIndicadores({ datos, comparar, alComparar }: PropsDeIndicadores) {
	const { semana, por_semana, terminadas, existencias } = datos;
	const sinVentas = semana.canales.filter((canal) => canal.vende_desde === null);
	return (
		<>
			<Filtros
				nombre="Comparar contra"
				activo={comparar}
				alEscoger={(clave) => alComparar(botonesDeComparacion.find((uno) => uno.clave === clave)?.clave ?? comparar)}
				filtros={botonesDeComparacion}
			/>
			<Panel
				nombre={`Ventas de la semana del ${textoDeDiaCorto(semana.desde)}`}
				cifra={semana.total_centavos === undefined ? "—" : enPesos(semana.total_centavos)}
				junto={
					// Sin nada contra qué comparar no hay flecha ni porcentaje, y «contra…» solo no dice nada.
					semana.variacion === null ? null : (
						<span className="text-tinta2">
							{semana.variacion} {semana.contra}
						</span>
					)
				}
			>
				<Grafica
					tipo="barras"
					periodos={semana.canales.map((canal) => canal.nombre)}
					formato={enPesos}
					series={[
						{
							clave: "esta",
							nombre: "Esta semana",
							color: "pizarra",
							valores: semana.canales.map((canal) => canal.vendido_centavos ?? 0),
						},
						{
							clave: "comparada",
							nombre: semana.nombre_comparado,
							color: "azul",
							valores: semana.canales.map((canal) => canal.comparado_centavos ?? 0),
						},
					]}
				/>
				{sinVentas.length === 0 ? null : (
					<span className="text-etiqueta text-tinta3">
						{sinVentas.map((canal) => `${canal.nombre}: Sin ventas todavía`).join(" · ")}
					</span>
				)}
			</Panel>
			<div className="grid grid-cols-2 gap-5 max-menu:grid-cols-1">
				<Panel
					nombre="Ventas por semana, las tres vías"
					cifra={`${textoDeDiaCorto(por_semana[0]?.desde ?? semana.desde)} a ${textoDeDiaCorto(semana.desde)}`}
				>
					<Grafica
						tipo="lineas"
						periodos={por_semana.map((una) => textoDeDiaCorto(una.desde))}
						formato={enPesos}
						series={[
							{
								clave: "este",
								nombre: "Este año",
								color: "pizarra",
								valores: por_semana.map((una) => una.este_anio_centavos ?? 0),
							},
							{
								clave: "pasado",
								nombre: "Año pasado",
								color: "azul",
								valores: por_semana.map((una) => una.anio_pasado_centavos ?? 0),
							},
						]}
					/>
				</Panel>
				<Panel nombre="Prendas terminadas por día" cifra={`${piezas.format(terminadas.esta_semana)} esta semana`}>
					<Grafica
						tipo="barras"
						periodos={terminadas.dias.map((dia) => textoDeDiaCorto(dia.fecha))}
						series={[
							{
								clave: "terminadas",
								nombre: "Terminadas",
								color: "verde-azulado",
								valores: terminadas.dias.map((dia) => dia.piezas),
							},
						]}
					/>
					<span className="text-etiqueta text-tinta3">{terminadas.lotes}</span>
				</Panel>
			</div>
			<Panel nombre="Existencia por ubicación" cifra={`${piezas.format(existencias.total)} piezas`}>
				<Grafica
					tipo="barras"
					periodos={existencias.ubicaciones.map((ubicacion) => ubicacion.nombre)}
					formato={(valor) => piezas.format(valor)}
					series={[
						{
							clave: "piezas",
							nombre: "Piezas",
							color: "violeta",
							valores: existencias.ubicaciones.map((ubicacion) => ubicacion.piezas),
						},
					]}
				/>
			</Panel>
		</>
	);
}
