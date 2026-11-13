/**
 * Órdenes de compra: el buscador (folio, proveedor o material) y los grupos plegables Atrasadas, Llegan esta semana,
 * Llegan más adelante, Borradores y Terminadas (plegado), cada uno con su tabla. Al buscar, todos abiertos. Tocar un
 * renglón abre su cajón.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Órdenes de compra»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import type { gruposDeOrdenes, ordenesDeCompra } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { pesos } from "@uniformame/compartido/contratos/compras/textos";
import { BarraAvance } from "@uniformame/interfaz/avance/barra-avance";
import type { ColorDeGrupo } from "@uniformame/interfaz/contenedores/grupo-plegable";
import { GrupoPlegable } from "@uniformame/interfaz/contenedores/grupo-plegable";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useState } from "react";
import type { z } from "zod";
import { Buscador } from "../comun.tsx";
import { useDireccionDeCompras } from "../direccion.ts";

/** Una orden de la lista. */
type OrdenDeLaLista = z.infer<typeof ordenesDeCompra.resultado>["ordenes"][number];

/** Los grupos, en su orden, con su nombre y su color. */
const grupos = [
	{ clave: "atrasadas", titulo: "Atrasadas", color: "rojo" },
	{ clave: "esta_semana", titulo: "Llegan esta semana", color: "azul" },
	{ clave: "mas_adelante", titulo: "Llegan más adelante", color: "violeta" },
	{ clave: "borradores", titulo: "Borradores", color: "pizarra" },
	{ clave: "terminadas", titulo: "Terminadas", color: "verde" },
] as const satisfies readonly { clave: (typeof gruposDeOrdenes)[number]; titulo: string; color: ColorDeGrupo }[];

/** El color de la barra de avance según cómo va. */
const colorDelAvance = { rojo: "rojo", naranja: "naranja", azul: "azul", gris: "gris" } as const;

/**
 * La tabla de un grupo de órdenes.
 * @param props Las órdenes y qué hacer al tocar una.
 */
function TablaDeOrdenes({ ordenes, alAbrir }: { ordenes: OrdenDeLaLista[]; alAbrir: (id: string) => void }) {
	return (
		<div className="rounded-grande bg-panel px-2 shadow-panel">
			<Tabla
				nombre="Órdenes de compra"
				filas={ordenes}
				claveDeFila={(orden) => orden.orden_compra_id}
				alTocarFila={(orden) => alAbrir(orden.orden_compra_id)}
				columnas={[
					{
						clave: "orden",
						encabezado: "Orden",
						celda: (orden) => (
							<span className="flex flex-col">
								<b className="font-bold tabular-nums">{orden.folio}</b>
								<span className="text-etiqueta text-tinta2">Creada el {textoDeDiaCorto(orden.creada)}</span>
							</span>
						),
					},
					{
						clave: "proveedor",
						encabezado: "Proveedor",
						celda: (orden) => (
							<span className="flex flex-col">
								<b className="font-semibold">{orden.proveedor}</b>
								<span className="text-etiqueta text-tinta2">{orden.condicion}</span>
							</span>
						),
					},
					{
						clave: "material",
						encabezado: "Material",
						celda: (orden) => (
							<span className="flex max-w-56 flex-col">
								<span className="truncate font-semibold">{orden.material}</span>
								<span className="truncate text-etiqueta text-tinta2">{orden.material_detalle}</span>
							</span>
						),
					},
					{
						clave: "avance",
						encabezado: "Pedido contra recibido",
						celda: ({ avance }) => (
							<span className="flex w-44 flex-col gap-1.5">
								<span className="font-semibold">{avance.texto}</span>
								{avance.tono === "gris" ? null : (
									<BarraAvance
										segmentos={[
											{ etiqueta: "Recibido", valor: avance.por_ciento, color: colorDelAvance[avance.tono] },
											{ etiqueta: "Falta", valor: 100 - avance.por_ciento, color: "gris" },
										]}
									/>
								)}
							</span>
						),
					},
					{
						clave: "llega",
						encabezado: "Llega",
						celda: ({ llega }) => (
							<span className="flex flex-col">
								<span className={llega.texto === "Sin enviar" ? "text-tinta3" : "font-semibold"}>{llega.texto}</span>
								{llega.detalle === null ? null : (
									<span className={`text-etiqueta ${llega.rojo ? "font-semibold text-estado-rojo" : "text-tinta2"}`}>
										{llega.detalle}
									</span>
								)}
							</span>
						),
					},
					{
						clave: "estado",
						encabezado: "Estado",
						celda: ({ estado }) => (
							<Estado
								texto={estado.texto}
								color={estado.color}
								{...(estado.abajo === null ? {} : { abajo: estado.abajo })}
							/>
						),
					},
					{
						clave: "total",
						encabezado: "Total",
						alinear: "derecha",
						celda: (orden) => <b className="font-bold">{pesos(orden.total_centavos)}</b>,
					},
				]}
			/>
		</div>
	);
}

/**
 * La pestaña Órdenes de compra.
 * @param props Lo de `compras.ordenes`.
 */
export function OrdenesDeCompras({ ordenes }: { ordenes: OrdenDeLaLista[] }) {
	const { busqueda, ir } = useDireccionDeCompras();
	// Terminadas empieza plegado; al volver de levantar una orden, Borradores va abierto.
	const [plegados, setPlegados] = useState<readonly string[]>(["terminadas"]);
	const buscando = busqueda.buscar !== undefined;
	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-end gap-3">
				<Buscador etiqueta="Buscar" ejemplo="Orden, proveedor o material" />
				<span className="ml-auto rounded-mediano bg-riel px-3 py-1.5 font-semibold text-sm">
					{plural(ordenes.length, "orden", "órdenes")}
				</span>
			</div>
			{ordenes.length === 0 ? (
				<EstadoDePantalla
					tipo="vacio"
					texto={buscando ? "Ninguna orden cumple esa búsqueda." : "Sin órdenes de compra"}
				/>
			) : (
				grupos.map((grupo) => {
					const suyas = ordenes.filter((orden) => orden.grupo === grupo.clave);
					if (suyas.length === 0) return null;
					const abierto = buscando || busqueda.abiertos === grupo.clave || !plegados.includes(grupo.clave);
					return (
						<GrupoPlegable
							key={grupo.clave}
							titulo={grupo.titulo}
							color={grupo.color}
							cuantos={plural(suyas.length, "orden", "órdenes")}
							abierto={abierto}
							alCambiar={(abrir) =>
								setPlegados(abrir ? plegados.filter((uno) => uno !== grupo.clave) : [...plegados, grupo.clave])
							}
						>
							<TablaDeOrdenes ordenes={suyas} alAbrir={(id) => ir({ cajon: "orden", id })} />
						</GrupoPlegable>
					);
				})
			)}
		</div>
	);
}
