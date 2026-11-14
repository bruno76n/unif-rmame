/**
 * Por pedir: el buscador, el proveedor y el horizonte (en la dirección), la leyenda, el eje y, por grupos plegables
 * (Sin tiempo de entrega, Pedir esta semana y Alcanza), cada material con su línea de tiempo, su estado, su pedido
 * sugerido y si ya está en un borrador. Tocar uno abre su «por qué»; marcar varios prende la barra de selección con
 * «Levantar orden».
 * Fase 19 · docs/interfaz/fabrica/compras.md («Por pedir»)
 *
 * La línea de tiempo solo dibuja lo que da `compras.por_pedir`: el día en que se acaba, cuándo llegaría un pedido de
 * hoy y lo que ya viene. Ninguna cuenta corre aquí.
 */

import { cantidadConUnidad } from "@uniformame/compartido/calculos/compras";
import { diasHasta, sumarDias, textoDeDia, textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { porPedir } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { Selector } from "@uniformame/interfaz/captura/selector";
import type { ColorDeGrupo } from "@uniformame/interfaz/contenedores/grupo-plegable";
import { GrupoPlegable } from "@uniformame/interfaz/contenedores/grupo-plegable";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { MuestraDeColor } from "@uniformame/interfaz/estados/muestra-de-color";
import { Flag, Plus, Triangle, X } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { Buscador } from "../comun.tsx";
import { useDireccionDeCompras } from "../direccion.ts";

/** Lo que regresa la consulta. */
type PorPedir = z.infer<typeof porPedir.resultado>;
/** Un material de Por pedir. */
type MaterialPorPedir = PorPedir["materiales"][number];

/**
 * Las columnas de cada renglón y del eje: casilla, color, nombre, línea de tiempo, estado y pedido sugerido. En el
 * teléfono se apilan: la casilla, el color y el nombre arriba, y abajo, a todo lo ancho, la línea de tiempo, el estado
 * y el pedido sugerido (`aTodoLoAncho`).
 */
const columnas =
	"grid min-w-[860px] grid-cols-[1.5rem_2rem_13rem_minmax(14rem,1fr)_12rem_7rem] items-center gap-4 px-4 max-telefono:min-w-0 max-telefono:grid-cols-[1.5rem_2rem_minmax(0,1fr)] max-telefono:gap-x-3 max-telefono:gap-y-2";

/** Lo que en el teléfono va abajo, a todo lo ancho del renglón. */
const aTodoLoAncho = "max-telefono:col-span-3";

/** Lo del eje que en el teléfono no sale: ahí el eje solo lleva sus fechas, sobre la línea de tiempo apilada. */
const soloEnEscritorio = "max-telefono:hidden";

/** Los grupos, de lo más urgente a lo menos, con el color de su grupo y del estado de cada material. */
const grupos = [
	{ estado: "sin_tiempo_de_entrega", titulo: "Sin tiempo de entrega", color: "rojo" },
	{ estado: "pedir_esta_semana", titulo: "Pedir esta semana", color: "ambar" },
	{ estado: "alcanza", titulo: "Alcanza", color: "verde" },
] as const satisfies readonly { estado: MaterialPorPedir["estado"]; titulo: string; color: ColorDeGrupo }[];

/**
 * El color del estado de un material, en su cuadro: el de su grupo.
 * @param estado El estado que manda la consulta.
 */
function colorDelGrupo(estado: MaterialPorPedir["estado"]): (typeof grupos)[number]["color"] {
	const suyo = grupos.find((grupo) => grupo.estado === estado);
	// Cada estado tiene su grupo (`satisfies` de arriba); sin él, el más urgente, para que no pase sin verse.
	return suyo === undefined ? "rojo" : suyo.color;
}

/**
 * Dónde cae un día en la línea de tiempo, en por ciento, sin salirse.
 * @param dia El día.
 * @param horizonte Hoy y el último día.
 */
function lugar(dia: string, horizonte: { hoy: string; hasta: string }): number {
	const total = Math.max(1, diasHasta(horizonte.hoy, horizonte.hasta));
	return Math.min(100, Math.max(0, (diasHasta(horizonte.hoy, dia) / total) * 100));
}

/**
 * Las marcas del eje: «Hoy» y una fecha cada 14 días; en el horizonte largo, cada mes con su nombre.
 * @param datos Lo de Por pedir.
 */
function marcasDelEje(datos: PorPedir): { dia: string; texto: string }[] {
	if (datos.horizonte.tipo === "regreso_clases") {
		return datos.meses.map((mes, numero) => ({ dia: mes.inicio, texto: numero === 0 ? "Hoy" : mes.nombre }));
	}
	const marcas = [];
	for (let dias = 0; dias < diasHasta(datos.hoy, datos.horizonte.hasta); dias += 14) {
		const dia = sumarDias(datos.hoy, dias);
		marcas.push({ dia, texto: dias === 0 ? "Hoy" : textoDeDiaCorto(dia) });
	}
	return marcas;
}

/**
 * La línea de tiempo de un material: lo libre que alcanza (azul), lo que faltaría (rojo), cuándo llegaría un pedido
 * de hoy (círculo) y lo que ya viene (triángulos), con su texto al pasar el puntero.
 * @param props El material y el horizonte.
 */
function LineaDeTiempo({ material, datos }: { material: MaterialPorPedir; datos: PorPedir }) {
	const horizonte = { hoy: datos.hoy, hasta: datos.horizonte.hasta };
	const acaba = material.se_acaba === null ? 100 : lugar(material.se_acaba, horizonte);
	const llega = lugar(material.llegaria_hoy, horizonte);
	const diasQueAlcanza = material.se_acaba === null ? null : diasHasta(datos.hoy, material.se_acaba);
	return (
		<div className="relative h-8">
			{marcasDelEje(datos).map((marca) => (
				<span
					key={marca.dia}
					aria-hidden="true"
					className="absolute top-0 bottom-0 w-px bg-linea"
					style={{ left: `${lugar(marca.dia, horizonte)}%` }}
				/>
			))}
			{acaba > 0 ? (
				<span
					title={
						diasQueAlcanza === null || material.se_acaba === null
							? material.alcanza
							: `Alcanza ${plural(diasQueAlcanza, "día", "días")}, hasta el ${textoDeDia(material.se_acaba)}`
					}
					className="absolute top-2.5 h-3 rounded-full bg-estado-azul"
					style={{ left: 0, width: `${acaba}%`, opacity: material.se_acaba === null ? 0.45 : 1 }}
				/>
			) : null}
			{material.dias_sin_material > 0 && material.se_acaba !== null ? (
				<span
					title={`Sin material ${plural(material.dias_sin_material, "día", "días")}, del ${textoDeDia(material.se_acaba)} al ${textoDeDia(material.llegaria_hoy)}`}
					className="absolute top-2.5 h-3 rounded-chico bg-estado-rojo/70"
					style={{ left: `${acaba}%`, width: `${Math.max(0, llega - acaba)}%` }}
				/>
			) : null}
			<span
				title={`Un pedido de hoy llegaría el ${textoDeDia(material.llegaria_hoy)}`}
				className="-translate-x-1/2 absolute top-2 size-4 rounded-full border-3 border-tinta bg-panel"
				style={{ left: `${llega}%` }}
			/>
			{material.llegadas.map((llegada) => (
				<span
					key={`${llegada.folio}-${llegada.dia}`}
					title={`Llegan ${cantidadConUnidad(llegada.cantidad, material.unidad)} el ${textoDeDia(llegada.dia)} (${llegada.folio}${llegada.atrasada ? ", atrasada" : ""})`}
					className="-translate-x-1/2 absolute bottom-0 text-verde-azulado"
					style={{ left: `${lugar(llegada.dia, horizonte)}%` }}
				>
					<Triangle aria-hidden="true" size={10} fill="currentColor" strokeWidth={0} />
				</span>
			))}
			<span
				className="-translate-y-1/2 absolute top-1/2 ml-4 whitespace-nowrap font-semibold text-etiqueta text-tinta2"
				style={{ left: `${Math.min(85, Math.max(acaba, llega))}%` }}
			>
				{material.alcanza}
			</span>
		</div>
	);
}

/**
 * El eje de la línea de tiempo: «Hoy» y sus fechas (o sus meses) sobre la columna de la línea, con «Estado» y «Pedido
 * sugerido»; en el largo, la bandera del regreso a clases.
 * @param props Lo de Por pedir.
 */
function Eje({ datos }: { datos: PorPedir }) {
	const horizonte = { hoy: datos.hoy, hasta: datos.horizonte.hasta };
	return (
		<div className="overflow-x-auto rounded-grande bg-panel shadow-panel">
			<div className={`${columnas} h-encabezado-tabla font-semibold text-etiqueta text-tinta3`}>
				<span className={soloEnEscritorio} />
				<span className={soloEnEscritorio} />
				<span className={soloEnEscritorio}>Material</span>
				<span className={`relative h-5 ${aTodoLoAncho}`}>
					{marcasDelEje(datos).map((marca) => (
						<span
							key={marca.dia}
							className="-translate-x-1/2 absolute whitespace-nowrap"
							style={{ left: `${lugar(marca.dia, horizonte)}%` }}
						>
							{marca.texto}
						</span>
					))}
					{datos.horizonte.tipo === "regreso_clases" ? (
						<span
							className="-translate-x-1/2 absolute top-5 text-ambar"
							style={{ left: `${lugar(datos.horizonte.regreso_clases, horizonte)}%` }}
							title={`Regreso a clases · ${textoDeDiaCorto(datos.horizonte.regreso_clases)}`}
						>
							<Flag aria-hidden="true" size={12} />
						</span>
					) : null}
				</span>
				<span className={soloEnEscritorio}>Estado</span>
				<span className={`text-right ${soloEnEscritorio}`}>Pedido sugerido</span>
			</div>
		</div>
	);
}

/**
 * Un renglón de Por pedir.
 * @param props El material, lo de Por pedir, si está escogido y qué hacer.
 */
function Renglon({
	material,
	datos,
	escogido,
	alEscoger,
	alAbrir,
}: {
	material: MaterialPorPedir;
	datos: PorPedir;
	escogido: boolean;
	alEscoger: (escogido: boolean) => void;
	alAbrir: () => void;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: el renglón lleva una casilla adentro; un botón no puede llevarla
		<div
			role="button"
			tabIndex={0}
			onClick={alAbrir}
			onKeyDown={(evento) => (evento.key === "Enter" ? alAbrir() : undefined)}
			className={`${columnas} min-h-renglon cursor-pointer border-linea border-b py-3 last:border-b-0 hover:bg-suave`}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: solo evita que la casilla abra el «por qué» */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: la casilla ya se usa con teclado */}
			<span onClick={(evento) => evento.stopPropagation()}>
				<Casilla etiqueta={`Escoger ${material.nombre}`} sinTexto marcada={escogido} alCambiar={alEscoger} />
			</span>
			<MuestraDeColor color={material.color} />
			<div className="flex min-w-0 flex-col">
				<b className="truncate font-bold">{material.nombre}</b>
				<span className="truncate text-etiqueta text-tinta2">
					{material.proveedor} · tarda {plural(material.plazo, "día", "días")}
				</span>
			</div>
			<div className={aTodoLoAncho}>
				<LineaDeTiempo material={material} datos={datos} />
			</div>
			<div className={`flex flex-col items-start gap-1 ${aTodoLoAncho}`}>
				<Estado texto={material.linea} color={colorDelGrupo(material.estado)} />
				{material.en_borrador === null ? null : (
					<span title={`Ya está en el borrador ${material.en_borrador.folio}`} className="text-etiqueta text-tinta3">
						En borrador
					</span>
				)}
			</div>
			<b
				className={`text-right tabular-nums max-telefono:text-left ${aTodoLoAncho} ${material.estado === "alcanza" ? "text-tinta3" : ""}`}
			>
				{material.por_pedir_texto}
			</b>
		</div>
	);
}

/** Lo escogido en Por pedir y cómo cambiarlo: vive en la ruta, porque «Levantar orden» de la página lo lleva. */
interface Escogidos {
	escogidos: readonly string[];
	alEscoger: (escogidos: string[]) => void;
}

/**
 * La pestaña Por pedir: lee `compras.por_pedir` con la búsqueda, el proveedor y el horizonte de la dirección y pinta sus
 * estados.
 * @param props Lo escogido y cómo cambiarlo.
 */
export function PorPedirDeCompras({ escogidos, alEscoger }: Escogidos) {
	const { busqueda } = useDireccionDeCompras();
	const consulta = useConsulta(porPedir, {
		buscar: busqueda.buscar,
		proveedor_id: busqueda.proveedor,
		horizonte: busqueda.horizonte,
	});
	return (
		<SegunConsulta consulta={consulta}>
			{(datos) => <Contenido datos={datos} escogidos={escogidos} alEscoger={alEscoger} />}
		</SegunConsulta>
	);
}

/**
 * Lo que pinta la pestaña con los datos.
 * @param props Lo de `compras.por_pedir`, lo escogido y cómo cambiarlo.
 */
function Contenido({ datos, escogidos, alEscoger }: Escogidos & { datos: PorPedir }) {
	const { busqueda, ir } = useDireccionDeCompras();
	// «Alcanza» empieza plegado.
	const [plegados, setPlegados] = useState<readonly string[]>(["alcanza"]);
	const conFiltros = busqueda.buscar !== undefined || busqueda.proveedor !== undefined;
	const proveedoresEscogidos = new Set(
		datos.materiales.filter((material) => escogidos.includes(material.material_id)).map((uno) => uno.proveedor),
	);
	const marcar = (ids: readonly string[], marcados: boolean) =>
		alEscoger(marcados ? [...new Set([...escogidos, ...ids])] : escogidos.filter((id) => !ids.includes(id)));
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end gap-3">
				<Buscador etiqueta="Buscar" ejemplo="Material o proveedor" />
				<div className="w-64 max-telefono:w-full">
					<Selector
						etiqueta="Proveedor"
						vacio="Todos los proveedores"
						opciones={datos.proveedores.map((proveedor) => ({
							valor: proveedor.proveedor_id,
							texto: proveedor.nombre,
						}))}
						value={busqueda.proveedor ?? ""}
						onChange={(evento) => ir({ proveedor: evento.target.value === "" ? undefined : evento.target.value })}
					/>
				</div>
				<Filtros
					nombre="Qué tanto ver"
					activo={datos.horizonte.tipo}
					alEscoger={(horizonte) => ir({ horizonte: horizonte === "corto" ? undefined : horizonte })}
					filtros={[
						{ clave: "corto", texto: `${datos.horizonte.semanas} semanas` },
						{ clave: "regreso_clases", texto: `Hasta ${datos.horizonte.mes_regreso}` },
					]}
				/>
				<span className="ml-auto rounded-mediano bg-riel px-3 py-1.5 font-semibold text-sm">
					{plural(datos.materiales.length, "material", "materiales")}
				</span>
			</div>
			<div className="flex flex-wrap items-center gap-5 text-etiqueta text-tinta2">
				<span className="inline-flex items-center gap-2">
					<span className="h-2.5 w-6 rounded-full bg-estado-azul" />
					Lo libre alcanza
				</span>
				<span className="inline-flex items-center gap-2">
					<span className="h-2.5 w-6 rounded-chico bg-estado-rojo/70" />
					Sin material
				</span>
				<span className="inline-flex items-center gap-2">
					<span className="size-3 rounded-full border-3 border-tinta bg-panel" />
					Llegaría si se pide hoy
				</span>
				<span className="inline-flex items-center gap-2 text-verde-azulado">
					<Triangle aria-hidden="true" size={10} fill="currentColor" strokeWidth={0} />
					<span className="text-tinta2">Llega una orden ya enviada</span>
				</span>
				{datos.horizonte.tipo === "regreso_clases" ? (
					<span className="inline-flex items-center gap-2">
						<Flag aria-hidden="true" size={13} className="text-ambar" />
						Regreso a clases · {textoDeDiaCorto(datos.horizonte.regreso_clases)}
					</span>
				) : null}
			</div>
			{datos.horizonte.tipo === "regreso_clases" ? (
				<div className="flex flex-wrap gap-2 text-etiqueta text-tinta3">
					{datos.meses
						.filter((mes) => Number(mes.factor) > 1)
						.map((mes) => (
							<span key={mes.inicio}>
								{mes.nombre}: se consume {mes.factor} veces lo de un mes normal
							</span>
						))}
				</div>
			) : null}
			{datos.materiales.length === 0 ? null : <Eje datos={datos} />}
			{datos.materiales.length === 0 ? (
				<EstadoDePantalla
					tipo="vacio"
					texto={conFiltros ? "Ningún material cumple esa búsqueda." : "Sin materiales"}
					accion={
						conFiltros ? (
							<Boton onClick={() => ir({ buscar: undefined, proveedor: undefined })}>Quitar filtros</Boton>
						) : undefined
					}
				/>
			) : (
				grupos.map((grupo) => {
					const suyos = datos.materiales.filter((material) => material.estado === grupo.estado);
					if (suyos.length === 0) return null;
					const ids = suyos.map((material) => material.material_id);
					// Al buscar, todos abiertos.
					const abierto = conFiltros || !plegados.includes(grupo.estado);
					return (
						<GrupoPlegable
							key={grupo.estado}
							titulo={grupo.titulo}
							color={grupo.color}
							cuantos={plural(suyos.length, "material", "materiales")}
							abierto={abierto}
							alCambiar={(abrir) =>
								setPlegados(abrir ? plegados.filter((uno) => uno !== grupo.estado) : [...plegados, grupo.estado])
							}
							casilla={{
								marcada: ids.every((id) => escogidos.includes(id)),
								alCambiar: (marcada) => marcar(ids, marcada),
							}}
						>
							<div className="overflow-x-auto rounded-grande bg-panel shadow-panel">
								{suyos.map((material) => (
									<Renglon
										key={material.material_id}
										material={material}
										datos={datos}
										escogido={escogidos.includes(material.material_id)}
										alEscoger={(marcado) => marcar([material.material_id], marcado)}
										alAbrir={() => ir({ cajon: "por_que", id: material.material_id })}
									/>
								))}
							</div>
						</GrupoPlegable>
					);
				})
			)}
			{escogidos.length === 0 ? null : (
				<div
					role="toolbar"
					aria-label="Selección"
					className="-translate-x-1/2 fixed bottom-6 left-1/2 z-20 flex items-center gap-4 rounded-grande bg-tinta px-5 py-3 text-white shadow-flotante"
				>
					<span className="font-semibold">
						{plural(escogidos.length, "material seleccionado", "materiales seleccionados")} de{" "}
						{plural(proveedoresEscogidos.size, "proveedor", "proveedores")}
					</span>
					<Boton
						variante="secundario"
						chico
						icono={Plus}
						onClick={() => ir({ cajon: "levantar", id: undefined, materiales: escogidos.join(",") })}
					>
						Levantar orden
					</Boton>
					<button
						type="button"
						aria-label="Quitar la selección"
						onClick={() => alEscoger([])}
						className="grid size-8 place-items-center rounded-mediano hover:bg-tinta2"
					>
						<X aria-hidden="true" size={17} strokeWidth={1.9} />
					</button>
				</div>
			)}
		</div>
	);
}
