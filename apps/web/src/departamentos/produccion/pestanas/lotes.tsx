/**
 * La pestaña Lotes: la leyenda y cuatro grupos plegables (Atorados, En proceso, Por cortar y Terminados), cada uno con
 * «{n} lotes · {m} piezas»; el que no tiene lotes no sale. Los lotes en proceso van en tarjetas con su tira de
 * operaciones; los por cortar y los terminados, en tablas. Cada tarjeta o renglón abre el cajón del lote, y el lote
 * recién cortado (`?marcado=`) sale marcado un momento.
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Lotes»)
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import { lotesDeProduccion } from "@uniformame/compartido/contratos/produccion/lotes";
import { BarraAvance } from "@uniformame/interfaz/avance/barra-avance";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { ChevronDown, ChevronRight, Scissors } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { rutasDeProduccion, useDireccion } from "../direccion.ts";
import { PaginaDeProduccion } from "../pagina.tsx";
import { ParaQuien } from "../piezas.tsx";

/** Lo que regresa `produccion.lotes`. */
type Lotes = z.infer<typeof lotesDeProduccion.resultado>;
/** Una tarjeta de lote en proceso. */
type Tarjeta = Lotes["atorados"][number];

/** Cuánto dura marcado el lote recién cortado. */
const marcadoPorMs = 4000;

/** El color de cada receta en las tablas. */
const recetas = {
	verificada: { texto: "Verificada", color: "verde" },
	sin_verificar: { texto: "Sin verificar", color: "ambar" },
	sin_receta: { texto: "Sin receta", color: "rojo" },
} as const;

/** La pestaña Lotes. */
export function PestanaLotes() {
	const consulta = useConsulta(lotesDeProduccion, {});
	return (
		<PaginaDeProduccion activa="lotes">
			<SegunConsulta consulta={consulta}>{(lotes) => <TableroDeLotes lotes={lotes} />}</SegunConsulta>
		</PaginaDeProduccion>
	);
}

/**
 * La leyenda y los cuatro grupos.
 * @param props Los lotes.
 */
function TableroDeLotes({ lotes }: { lotes: Lotes }) {
	const { leer, ir } = useDireccion();
	const marcado = leer("marcado");
	// El lote recién cortado se marca un momento y luego se quita de la dirección.
	useEffect(() => {
		if (marcado === undefined) return;
		document.querySelector(`[data-lote="${marcado}"]`)?.scrollIntoView({ block: "center" });
		const quitar = window.setTimeout(() => ir({ marcado: undefined }), marcadoPorMs);
		return () => window.clearTimeout(quitar);
	}, [marcado, ir]);
	const vacio =
		lotes.atorados.length + lotes.en_proceso.length + lotes.por_cortar.length + lotes.terminados.length === 0;
	if (vacio) return <EstadoDePantalla tipo="vacio" texto="Sin lotes en el taller" />;
	const abrir = (loteId: string) => ir({ cajon: "lote", id: loteId });
	return (
		<>
			<ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-etiqueta text-tinta2">
				<li>Piezas que lleva cada operación</li>
				<li className="font-semibold text-texto-advertencia">Se junta trabajo</li>
				<li className="font-semibold text-texto-error">Atorado</li>
				<li>Ninguna operación reporta más piezas que la anterior</li>
			</ul>
			<Grupo
				titulo="Atorados"
				color="rojo"
				lotes={lotes.atorados.length}
				piezas={suma(lotes.atorados.map((lote) => lote.piezas))}
			>
				<Tarjetas tarjetas={lotes.atorados} marcado={marcado} alAbrir={abrir} />
			</Grupo>
			<Grupo
				titulo="En proceso"
				color="azul"
				lotes={lotes.en_proceso.length}
				piezas={suma(lotes.en_proceso.map((lote) => lote.piezas))}
			>
				<Tarjetas tarjetas={lotes.en_proceso} marcado={marcado} alAbrir={abrir} />
			</Grupo>
			<Grupo
				titulo="Por cortar"
				color="gris"
				lotes={lotes.por_cortar.length}
				piezas={suma(lotes.por_cortar.map((lote) => lote.piezas))}
			>
				<Tabla
					nombre="Lotes por cortar"
					filas={lotes.por_cortar}
					claveDeFila={(lote) => lote.lote_id}
					alTocarFila={(lote) => abrir(lote.lote_id)}
					columnas={[
						{ clave: "lote", encabezado: "Lote", celda: (lote) => <b>{lote.folio}</b> },
						{
							clave: "prenda",
							encabezado: "Prenda",
							celda: (lote) => (
								<span className="flex flex-col">
									{lote.prenda}
									<span className="text-etiqueta text-tinta2">{lote.modelo}</span>
								</span>
							),
						},
						{ clave: "piezas", encabezado: "Piezas", alinear: "derecha", celda: (lote) => lote.piezas },
						{
							clave: "corte",
							encabezado: "Corte",
							celda: (lote) => (
								<span className="flex flex-col">
									<span className={lote.corte_pronto ? "font-semibold text-texto-advertencia" : undefined}>
										{lote.fecha_corte}
									</span>
									<span className="text-etiqueta text-tinta2">{lote.en_dias}</span>
								</span>
							),
						},
						{ clave: "para", encabezado: "Para", celda: (lote) => <ParaQuien para={lote.para} /> },
						{ clave: "receta", encabezado: "Receta", celda: (lote) => <Estado {...recetas[lote.receta]} /> },
						{
							clave: "capturar",
							encabezado: "",
							alinear: "derecha",
							celda: (lote) =>
								lote.receta === "sin_receta" ? null : (
									<Boton
										chico
										icono={Scissors}
										onClick={(evento) => {
											evento.stopPropagation();
											ir({ cortar: lote.lote_id }, rutasDeProduccion.corte);
										}}
									>
										Capturar
									</Boton>
								),
						},
					]}
				/>
			</Grupo>
			<Grupo
				titulo="Terminados"
				color="verde"
				lotes={lotes.terminados.length}
				piezas={suma(lotes.terminados.map((lote) => lote.listas))}
			>
				<Tabla
					nombre="Lotes terminados"
					filas={lotes.terminados}
					claveDeFila={(lote) => lote.lote_id}
					alTocarFila={(lote) => abrir(lote.lote_id)}
					columnas={[
						{ clave: "lote", encabezado: "Lote", celda: (lote) => <b>{lote.folio}</b> },
						{
							clave: "prenda",
							encabezado: "Prenda",
							celda: (lote) => (
								<span className="flex flex-col">
									{lote.prenda}
									<span className="text-etiqueta text-tinta2">{lote.modelo}</span>
								</span>
							),
						},
						{
							clave: "listas",
							encabezado: "Listas",
							alinear: "derecha",
							celda: (lote) => `${lote.listas} de ${lote.cortadas}`,
						},
						{ clave: "merma", encabezado: "Merma", alinear: "derecha", celda: (lote) => lote.merma },
						{ clave: "para", encabezado: "Para", celda: (lote) => <ParaQuien para={lote.para} /> },
						{ clave: "sigue", encabezado: "", celda: () => <Estado texto="Esperando a Calidad" /> },
					]}
				/>
			</Grupo>
		</>
	);
}

/**
 * Suma unos números.
 * @param numeros Los números.
 */
function suma(numeros: readonly number[]): number {
	return numeros.reduce((total, numero) => total + numero, 0);
}

/**
 * Un grupo plegable: su nombre en su color, «{n} lotes · {m} piezas» y su contenido. Sin lotes, no sale.
 * @param props El título, el color, cuántos lotes y piezas lleva, y su contenido.
 */
function Grupo({
	titulo,
	color,
	lotes,
	piezas,
	children,
}: {
	titulo: string;
	color: "rojo" | "azul" | "gris" | "verde";
	lotes: number;
	piezas: number;
	children: ReactNode;
}) {
	const [plegado, setPlegado] = useState(false);
	if (lotes === 0) return null;
	const borde = {
		rojo: "border-estado-rojo",
		azul: "border-estado-azul",
		gris: "border-estado-gris",
		verde: "border-estado-verde",
	}[color];
	return (
		<section className={`flex flex-col gap-3 border-l-4 pl-3 ${borde}`}>
			<header className="flex items-center gap-3">
				<button
					type="button"
					aria-expanded={!plegado}
					aria-label={`${plegado ? "Desplegar" : "Plegar"} ${titulo}`}
					onClick={() => setPlegado(!plegado)}
					className="grid size-8 place-items-center rounded-mediano text-tinta2 hover:bg-riel"
				>
					{plegado ? <ChevronRight aria-hidden="true" size={18} /> : <ChevronDown aria-hidden="true" size={18} />}
				</button>
				<h2 className="m-0 font-bold text-subtitulo">{titulo}</h2>
				<span className="text-tinta2 tabular-nums">
					{plural(lotes, "lote", "lotes")} · {plural(piezas, "pieza", "piezas")}
				</span>
			</header>
			{plegado ? null : <div className="rounded-grande bg-panel p-4 shadow-panel">{children}</div>}
		</section>
	);
}

/**
 * Las tarjetas de los lotes en proceso.
 * @param props Las tarjetas, el lote marcado y qué hacer al abrir uno.
 */
function Tarjetas({
	tarjetas,
	marcado,
	alAbrir,
}: {
	tarjetas: readonly Tarjeta[];
	marcado: string | undefined;
	alAbrir: (loteId: string) => void;
}) {
	return (
		<div className="flex flex-col divide-y divide-linea">
			{tarjetas.map((tarjeta) => (
				<button
					key={tarjeta.lote_id}
					type="button"
					data-lote={tarjeta.lote_id}
					onClick={() => alAbrir(tarjeta.lote_id)}
					className={`grid grid-cols-[minmax(220px,1fr)_minmax(0,2.4fr)_auto] items-center gap-4 rounded-mediano p-3 text-left hover:bg-suave max-menu:grid-cols-1 ${
						marcado === tarjeta.lote_id ? "bg-marca-fondo ring-2 ring-marca" : ""
					}`}
				>
					<span className="flex min-w-0 flex-col gap-1.5">
						<b className="truncate">{tarjeta.prenda}</b>
						<span className="text-etiqueta text-tinta2 tabular-nums">
							{tarjeta.folio} · {tarjeta.piezas} piezas
						</span>
						<ParaQuien para={tarjeta.para} />
					</span>
					<TiraDeOperaciones tira={tarjeta.tira} />
					<Estado
						texto={tarjeta.estado.texto}
						color={tarjeta.estado.color}
						{...(tarjeta.estado.linea === "" ? {} : { abajo: tarjeta.estado.linea })}
					/>
				</button>
			))}
		</div>
	);
}

/**
 * La tira de operaciones: una casilla por operación con su nombre, sus piezas y su barra; al pasar el puntero,
 * «{operación}: {hechas} de {cortadas} · puede reportar hasta {n}». La del cuello de botella dice «Se junta»; la
 * atorada, «Atorado».
 * @param props Las casillas.
 */
export function TiraDeOperaciones({ tira }: { tira: Tarjeta["tira"] }) {
	return (
		<span className="grid min-w-0 auto-cols-[minmax(64px,1fr)] grid-flow-col gap-1.5 overflow-x-auto">
			{tira.map((casilla) => (
				<span
					key={casilla.operacion}
					title={`${casilla.operacion}: ${casilla.hechas} de ${casilla.cortadas} · puede reportar hasta ${casilla.puede_hasta}`}
					className={`flex min-w-0 flex-col gap-1 rounded-chico border p-1.5 ${
						casilla.marca === "atorado"
							? "border-estado-rojo"
							: casilla.marca === "se_junta"
								? "border-estado-ambar"
								: "border-linea"
					}`}
				>
					<span className="truncate text-etiqueta text-tinta2">{casilla.operacion}</span>
					<b className="tabular-nums">{casilla.hechas}</b>
					<BarraAvance
						segmentos={[
							{ etiqueta: "Hechas", valor: casilla.hechas, color: casilla.marca === "atorado" ? "rojo" : "azul" },
							{ etiqueta: "Faltan", valor: Math.max(0, casilla.cortadas - casilla.hechas), color: "gris" },
						]}
					/>
					{casilla.marca === null ? null : (
						<span
							className={`text-etiqueta font-bold ${
								casilla.marca === "atorado" ? "text-texto-error" : "text-texto-advertencia"
							}`}
						>
							{casilla.marca === "atorado" ? "Atorado" : "Se junta"}
						</span>
					)}
				</span>
			))}
		</span>
	);
}
