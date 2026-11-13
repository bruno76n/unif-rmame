/**
 * Materiales: el buscador (material, proveedor o medida), cuántos son, «Nuevo material» y «Dados de baja», y por grupo
 * (Telas, Avíos y Consumibles del taller) la tabla Material · Proveedor · En bodega · Mínimo · En camino · Estado.
 * «Dados de baja» muestra los dados de baja con «Reactivar». Tocar un renglón abre el cajón del material.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Materiales»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import type { materialesDeCompras } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { reactivarMaterial } from "@uniformame/compartido/contratos/compras/materiales";
import { cantidadConUnidad, cifraEnTexto, pesos } from "@uniformame/compartido/contratos/compras/textos";
import { BarraAvance } from "@uniformame/interfaz/avance/barra-avance";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import type { ColorDeGrupo } from "@uniformame/interfaz/contenedores/grupo-plegable";
import { GrupoPlegable } from "@uniformame/interfaz/contenedores/grupo-plegable";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { MuestraDeColor } from "@uniformame/interfaz/estados/muestra-de-color";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useAccion } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { Buscador } from "../comun.tsx";
import { useDireccionDeCompras } from "../direccion.ts";
import { VentanaNuevoMaterial } from "../ventanas/nuevo-material.tsx";

/** Lo que regresa la consulta. */
type Materiales = z.infer<typeof materialesDeCompras.resultado>;
/** Un material de la lista. */
type MaterialDeLaLista = Materiales["materiales"][number];

/** Los grupos, por tipo de material. */
const grupos = [
	{ tipo: "tela", titulo: "Telas", color: "azul" },
	{ tipo: "avio", titulo: "Avíos", color: "violeta" },
	{ tipo: "consumible", titulo: "Consumibles del taller", color: "ambar" },
] as const satisfies readonly { tipo: MaterialDeLaLista["tipo"]; titulo: string; color: ColorDeGrupo }[];

/**
 * Lo que hay en bodega: lo libre, su barra (libre en su tono, lo comprometido en gris) y lo comprometido de lo que hay.
 * @param props El material.
 */
function EnBodega({ material }: { material: MaterialDeLaLista }) {
	const comprometido = Number(material.comprometido);
	return (
		<span className="flex w-56 flex-col gap-1">
			<span>
				<b className="font-bold tabular-nums">{cantidadConUnidad(material.libre, material.unidad)}</b> libres
			</span>
			<BarraAvance
				segmentos={[
					{ etiqueta: "Libre", valor: Math.max(0, Number(material.libre)), color: material.tono_existencia },
					{ etiqueta: "Comprometido", valor: comprometido, color: "gris" },
				]}
			/>
			<span className="text-etiqueta text-tinta2">
				{comprometido > 0
					? `${cifraEnTexto(material.comprometido)} comprometidos de ${cantidadConUnidad(material.hay, material.unidad)}`
					: `${cantidadConUnidad(material.hay, material.unidad)} en bodega`}
			</span>
		</span>
	);
}

/**
 * La tabla de un grupo de materiales.
 * @param props Los materiales, si son los dados de baja, y qué hacer.
 */
function TablaDeMateriales({
	materiales,
	dadosDeBaja,
	alAbrir,
	alReactivar,
	conConexion,
}: {
	materiales: MaterialDeLaLista[];
	dadosDeBaja: boolean;
	alAbrir: (id: string) => void;
	alReactivar: (material: MaterialDeLaLista) => void;
	conConexion: boolean;
}) {
	return (
		<div className="rounded-grande bg-panel px-2 shadow-panel">
			<Tabla
				nombre="Materiales"
				filas={materiales}
				claveDeFila={(material) => material.material_id}
				alTocarFila={(material) => alAbrir(material.material_id)}
				columnas={[
					{
						clave: "material",
						encabezado: "Material",
						celda: (material) => (
							<span className="flex items-center gap-3">
								<MuestraDeColor color={material.color} />
								<span className="flex max-w-52 flex-col">
									<b className="truncate font-bold">{material.nombre}</b>
									<span className="truncate text-etiqueta text-tinta2">{material.presentacion ?? material.unidad}</span>
								</span>
							</span>
						),
					},
					{
						clave: "proveedor",
						encabezado: "Proveedor",
						celda: (material) => (
							<span className="flex max-w-52 flex-col">
								<span className="truncate">
									<b className="font-semibold">{material.proveedor}</b>
									{material.proveedores_mas > 0 ? (
										<span className="text-etiqueta text-tinta2"> y {material.proveedores_mas} más</span>
									) : null}
								</span>
								<span className="text-etiqueta text-tinta2">
									{material.ultimo_precio_centavos === null ? "" : `${pesos(material.ultimo_precio_centavos)} · `}
									tarda {plural(material.plazo, "día", "días")}
								</span>
							</span>
						),
					},
					{ clave: "en_bodega", encabezado: "En bodega", celda: (material) => <EnBodega material={material} /> },
					{
						clave: "minimo",
						encabezado: "Mínimo",
						alinear: "derecha",
						celda: (material) => cantidadConUnidad(material.minimo, material.unidad),
					},
					{
						clave: "en_camino",
						encabezado: "En camino",
						celda: ({ en_camino: enCamino, unidad }) =>
							enCamino === null ? (
								<span className="text-tinta3">—</span>
							) : (
								<span className="flex flex-col">
									<b className="font-bold">+{cantidadConUnidad(enCamino.cantidad, unidad)}</b>
									<span className="text-etiqueta text-tinta2">
										{enCamino.varias ? "la primera el " : "el "}
										{textoDeDiaCorto(enCamino.dia)}
									</span>
								</span>
							),
					},
					{
						clave: "estado",
						encabezado: dadosDeBaja ? "" : "Estado",
						alinear: dadosDeBaja ? "derecha" : "izquierda",
						celda: (material) =>
							dadosDeBaja ? (
								<Boton
									chico
									disabled={!conConexion}
									onClick={(evento) => {
										evento.stopPropagation();
										alReactivar(material);
									}}
								>
									Reactivar
								</Boton>
							) : (
								<Estado
									texto={material.estado.texto}
									color={material.estado.color}
									{...(material.estado.abajo === null ? {} : { abajo: material.estado.abajo })}
								/>
							),
					},
				]}
			/>
		</div>
	);
}

/**
 * La pestaña Materiales.
 * @param props Lo de `compras.materiales`.
 */
export function MaterialesDeCompras({ datos }: { datos: Materiales }) {
	const { busqueda, ir } = useDireccionDeCompras();
	const conConexion = useConConexion();
	const [nuevo, setNuevo] = useState(false);
	const [plegados, setPlegados] = useState<readonly string[]>([]);
	const reactivar = useAccion(reactivarMaterial, ["compras.materiales", "compras.pendientes", "compras.por_pedir"]);
	const dadosDeBaja = busqueda.bajas === "si";
	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-end gap-3">
				<Buscador etiqueta="Buscar" ejemplo="Material, proveedor o medida" />
				<Filtros
					nombre="Cuáles materiales"
					activo={dadosDeBaja ? "bajas" : "activos"}
					alEscoger={(clave) => ir({ bajas: clave === "bajas" ? "si" : undefined })}
					filtros={[
						{ clave: "activos", texto: "Activos" },
						{ clave: "bajas", texto: "Dados de baja" },
					]}
				/>
				<span className="ml-auto rounded-mediano bg-riel px-3 py-1.5 font-semibold text-sm">
					{plural(datos.materiales.length, "material", "materiales")}
				</span>
				<Boton icono={Plus} disabled={!conConexion} onClick={() => setNuevo(true)}>
					Nuevo material
				</Boton>
			</div>
			{datos.materiales.length === 0 ? (
				<EstadoDePantalla
					tipo="vacio"
					texto={
						busqueda.buscar !== undefined
							? "Ningún material cumple esa búsqueda."
							: dadosDeBaja
								? "Sin materiales dados de baja"
								: "Sin materiales"
					}
				/>
			) : (
				grupos.map((grupo) => {
					const suyos = datos.materiales.filter((material) => material.tipo === grupo.tipo);
					return suyos.length === 0 ? null : (
						<GrupoPlegable
							key={grupo.tipo}
							titulo={grupo.titulo}
							color={grupo.color}
							cuantos={plural(suyos.length, "material", "materiales")}
							abierto={!plegados.includes(grupo.tipo)}
							alCambiar={(abrir) =>
								setPlegados(abrir ? plegados.filter((uno) => uno !== grupo.tipo) : [...plegados, grupo.tipo])
							}
						>
							<TablaDeMateriales
								materiales={suyos}
								dadosDeBaja={dadosDeBaja}
								conConexion={conConexion}
								alAbrir={(id) => ir({ cajon: "material", id })}
								alReactivar={(material) =>
									reactivar.mutate({ datos: { material_id: material.material_id }, version: material.version })
								}
							/>
						</GrupoPlegable>
					);
				})
			)}
			<VentanaNuevoMaterial abierta={nuevo} alCerrar={() => setNuevo(false)} paraNuevo={datos.para_nuevo} />
		</div>
	);
}
