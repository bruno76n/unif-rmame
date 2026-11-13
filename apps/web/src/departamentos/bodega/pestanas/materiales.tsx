/**
 * Materiales de Bodega: «Entregas de material al corte» (un renglón por tela por entregar, con sus rollos sugeridos o
 * «No alcanza», y «Entregar» que abre el cajón), los lotes con todo entregado, «Regresa del corte» (con «Etiqueta» y
 * «Recibir») y «Materiales en bodega»: las telas con sus etiquetas y los avíos, con «Carga inicial · {n}».
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Materiales»)
 *
 * Cuánto pide un corte y qué rollos se sugieren llegan de `inventario.materiales`: la pantalla solo los muestra.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import type { materialesDeBodega } from "@uniformame/compartido/contratos/inventario/bodega";
import { recibirDelCorte } from "@uniformame/compartido/contratos/inventario/corte";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { MuestraDeColor } from "@uniformame/interfaz/estados/muestra-de-color";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Seccion, TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../comun.tsx";
import { useDireccionDeBodega } from "../direccion.ts";
import { VentanaCargaMaterial } from "../ventanas/carga-material.tsx";

/** Lo que regresa la consulta. */
type Materiales = z.infer<typeof materialesDeBodega.resultado>;

/**
 * Abre en otra pestaña el PDF de las etiquetas de unos rollos o retazos.
 * @param ids Los rollos.
 */
function abrirEtiquetas(ids: readonly string[]) {
	window.open(`/v1/etiquetas/rollo/${ids[0] ?? ""}?formato=pdf&ids=${ids.join(",")}`, "_blank", "noopener");
}

/**
 * «Entregas de material al corte»: un renglón por tela por entregar.
 * @param props Las entregas y los lotes con todo entregado.
 */
function Entregas({ entregas, entregados }: Pick<Materiales, "entregas" | "entregados">) {
	const { abrir } = useDireccionDeBodega();
	const filas = entregas.flatMap((entrega) =>
		entrega.telas.map((tela, indice) => ({ entrega, tela, primera: indice === 0 })),
	);
	type Fila = (typeof filas)[number];
	return (
		<Seccion titulo="Entregas de material al corte">
			{filas.length === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Sin entregas pendientes" />
			) : (
				<Tabla
					nombre="Entregas de material al corte"
					filas={filas}
					claveDeFila={(fila: Fila) => `${fila.entrega.lote_id}:${fila.tela.material_id}`}
					columnas={[
						{
							clave: "corte",
							encabezado: "Corte",
							celda: ({ entrega }) => (
								<span className="flex flex-col">
									<span>{textoDeDiaCorto(entrega.fecha_corte)}</span>
									<TextoConTono tono={entrega.tono ?? "normal"}>{entrega.en_dias}</TextoConTono>
								</span>
							),
						},
						{
							clave: "lote",
							encabezado: "Lote",
							celda: ({ entrega }) => (
								<DosRenglones arriba={entrega.prenda} abajo={`${entrega.folio} · ${entrega.piezas} piezas`} />
							),
						},
						{
							clave: "tela",
							encabezado: "Tela",
							celda: ({ entrega, tela, primera }) => (
								<DosRenglones
									arriba={tela.papel === null ? tela.tela : `${tela.tela} · ${tela.papel}`}
									abajo={`${tela.metros} m${primera && entrega.avios !== null ? ` · ${entrega.avios} avíos` : ""}`}
								/>
							),
						},
						{
							clave: "sugeridos",
							encabezado: "Rollos sugeridos",
							celda: ({ tela }) =>
								tela.sugeridos === null ? (
									<TextoConTono tono="rojo">No alcanza</TextoConTono>
								) : (
									<DosRenglones
										arriba={`${tela.sugeridos.rollos} · ${tela.sugeridos.metros} m`}
										abajo={tela.sugeridos.partidas.length === 0 ? "" : `partida ${tela.sugeridos.partidas.join(", ")}`}
									/>
								),
						},
						{
							clave: "entregar",
							encabezado: "",
							alinear: "derecha",
							celda: ({ entrega }) => (
								<Boton chico onClick={() => abrir("entrega", entrega.lote_id)}>
									Entregar
								</Boton>
							),
						},
					]}
				/>
			)}
			{entregados.length === 0 ? null : (
				<div className="flex flex-wrap gap-2">
					{entregados.map((lote) => (
						<Estado key={lote.folio} texto={`${lote.folio}: ${lote.rollos} rollos entregados`} color="verde" />
					))}
				</div>
			)}
		</Seccion>
	);
}

/**
 * «Regresa del corte»: los rollos y retazos que siguen en el Taller, con «Etiqueta» y «Recibir».
 * @param props Lo que regresa.
 */
function Regresa({ regresa }: Pick<Materiales, "regresa">) {
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(recibirDelCorte);
	type Fila = Materiales["regresa"][number];
	return (
		<Seccion titulo="Regresa del corte">
			{regresa.length === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Nada por recibir del corte" />
			) : (
				<Tabla
					nombre="Regresa del corte"
					filas={regresa}
					claveDeFila={(fila: Fila) => fila.rollo_id}
					columnas={[
						{
							clave: "rollo",
							encabezado: "Rollo o retazo",
							celda: (fila) => <DosRenglones arriba={fila.folio} abajo={fila.es_retazo ? "Retazo" : "Rollo"} />,
						},
						{
							clave: "tela",
							encabezado: "Tela",
							celda: (fila) => (
								<DosRenglones arriba={fila.tela} abajo={fila.partida === null ? "" : `partida ${fila.partida}`} />
							),
						},
						{
							clave: "corte",
							encabezado: "Del corte",
							celda: (fila) => (
								<DosRenglones
									arriba={fila.lote ?? "—"}
									abajo={fila.fecha === null ? "" : textoDeDiaCorto(fila.fecha)}
								/>
							),
						},
						{ clave: "metros", encabezado: "Metros", alinear: "derecha", celda: (fila) => `${fila.metros} m` },
						{
							clave: "botones",
							encabezado: "",
							alinear: "derecha",
							celda: (fila) => (
								<span className="flex justify-end gap-2">
									<Boton chico onClick={() => abrirEtiquetas([fila.rollo_id])}>
										Etiqueta
									</Boton>
									<Boton
										chico
										variante="principal"
										disabled={!conConexion || enviando}
										onClick={() => void enviar({ datos: { rollo_id: fila.rollo_id }, version: fila.version })}
									>
										Recibir
									</Boton>
								</span>
							),
						},
					]}
				/>
			)}
		</Seccion>
	);
}

/**
 * «Materiales en bodega»: las telas y los avíos, con «Carga inicial · {n}».
 * @param props Las telas, los avíos y los materiales sin carga inicial.
 */
function EnBodega({ telas, avios, sin_carga }: Pick<Materiales, "telas" | "avios" | "sin_carga">) {
	const [cargando, setCargando] = useState(false);
	type Tela = Materiales["telas"][number];
	type Avio = Materiales["avios"][number];
	return (
		<Seccion
			titulo="Materiales en bodega"
			derecha={
				sin_carga.length === 0 ? null : (
					<Boton chico onClick={() => setCargando(true)}>{`Carga inicial · ${sin_carga.length}`}</Boton>
				)
			}
		>
			<TituloDeBloque titulo="Telas" />
			<Tabla
				nombre="Telas"
				filas={telas}
				claveDeFila={(tela: Tela) => tela.material_id}
				columnas={[
					{
						clave: "material",
						encabezado: "Material",
						celda: (tela) => (
							<span className="flex items-center gap-2">
								{tela.color === null ? null : <MuestraDeColor color={tela.color} />}
								<DosRenglones arriba={tela.nombre} abajo={tela.detalle ?? ""} />
							</span>
						),
					},
					{
						clave: "en_bodega",
						encabezado: "En bodega",
						alinear: "derecha",
						celda: (tela) => (
							<DosRenglones
								arriba={`${tela.en_bodega} m`}
								abajo={[
									Number(tela.en_aduana) === 0 ? null : `${tela.en_aduana} en aduana`,
									Number(tela.en_taller) === 0 ? null : `${tela.en_taller} en el taller`,
								]
									.filter((parte) => parte !== null)
									.join(" · ")}
							/>
						),
					},
					{
						clave: "rollos",
						encabezado: "Rollos",
						celda: (tela) => (
							<DosRenglones
								arriba={`${tela.rollos} rollos y ${tela.retazos} retazos`}
								abajo={tela.rollos_taller === 0 ? "" : `${tela.rollos_taller} en el taller`}
							/>
						),
					},
					{ clave: "partidas", encabezado: "Partidas", celda: (tela) => tela.partidas.join(", ") },
					{
						clave: "etiquetas",
						encabezado: "",
						alinear: "derecha",
						celda: (tela) =>
							tela.rollo_ids.length === 0 ? null : (
								<Boton chico onClick={() => abrirEtiquetas(tela.rollo_ids)}>
									Etiquetas
								</Boton>
							),
					},
				]}
			/>
			<TituloDeBloque titulo="Avíos" />
			<Tabla
				nombre="Avíos"
				filas={avios}
				claveDeFila={(avio: Avio) => avio.material_id}
				columnas={[
					{
						clave: "material",
						encabezado: "Material",
						celda: (avio) => <DosRenglones arriba={avio.nombre} abajo={avio.presentacion ?? ""} />,
					},
					{
						clave: "existencia",
						encabezado: "Existencia",
						alinear: "derecha",
						celda: (avio) => `${avio.existencia} ${avio.unidad}`,
					},
					{ clave: "uso", encabezado: "Uso", celda: (avio) => avio.usos.join(" · ") },
				]}
			/>
			{cargando ? <VentanaCargaMaterial materiales={sin_carga} alCerrar={() => setCargando(false)} /> : null}
		</Seccion>
	);
}

/**
 * Materiales de Bodega.
 * @param props Lo que regresa `inventario.materiales`.
 */
export function MaterialesDeBodega({ datos }: { datos: Materiales }) {
	return (
		<div className="flex flex-col gap-6">
			<Entregas entregas={datos.entregas} entregados={datos.entregados} />
			<Regresa regresa={datos.regresa} />
			<EnBodega telas={datos.telas} avios={datos.avios} sin_carga={datos.sin_carga} />
		</div>
	);
}
