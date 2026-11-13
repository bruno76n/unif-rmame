/**
 * La pestaña Recetas: arriba el buscador «Prenda o escuela», la sección y «{n} prendas» (los dos en la dirección); y
 * tres grupos plegables («Sin receta», «Capturada sin verificar» y «Verificada contra corte», este plegado salvo al
 * buscar). Tocar un renglón abre su receta, que es una página dentro de Recetas: `?cajon=receta&id={producto}`.
 * Fase 19 · docs/interfaz/fabrica/patronaje.md («Recetas»)
 */

import { listaDeRecetas, type prendaDeLaLista } from "@uniformame/compartido/contratos/patronaje/lista-de-recetas";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccion } from "../direccion.ts";
import { GrupoDePrendas } from "../grupo.tsx";
import { PaginaDePatronaje } from "../pagina.tsx";
import { PaginaDeReceta } from "./receta.tsx";

/** Una prenda de la lista. */
type PrendaDeLaLista = z.infer<typeof prendaDeLaLista>;

/** La pestaña Recetas, o la página de una receta si está abierta. */
export function PestanaRecetas() {
	const { abierto } = useDireccion();
	const productoId = abierto("receta");
	return (
		<PaginaDePatronaje activa="recetas">
			{productoId === undefined ? <ListaDeRecetas /> : <PaginaDeReceta productoId={productoId} />}
		</PaginaDePatronaje>
	);
}

/** La lista de recetas con su buscador y su sección. */
function ListaDeRecetas() {
	const { leer, ir } = useDireccion();
	const buscar = leer("buscar") ?? "";
	const seccion = leer("seccion") ?? "";
	const consulta = useConsulta(listaDeRecetas, {
		...(buscar.trim() === "" ? {} : { buscar }),
		...(seccion === "" ? {} : { seccion_id: seccion }),
	});
	return (
		<>
			<div className="flex flex-wrap items-end gap-3">
				<div className="min-w-60 flex-1">
					<Campo
						etiqueta="Buscar"
						type="search"
						placeholder="Prenda o escuela"
						value={buscar}
						onChange={(evento) => ir({ buscar: evento.target.value })}
					/>
				</div>
				<div className="w-64 max-telefono:w-full">
					<Selector
						etiqueta="Sección"
						vacio="Todas las secciones"
						value={seccion}
						opciones={(consulta.data?.secciones ?? []).map((una) => ({ valor: una.seccion_id, texto: una.nombre }))}
						onChange={(evento) => ir({ seccion: evento.target.value })}
					/>
				</div>
				{consulta.data === undefined ? null : (
					<span className="pb-3 text-tinta2 tabular-nums">
						{consulta.data.total} {consulta.data.total === 1 ? "prenda" : "prendas"}
					</span>
				)}
			</div>
			<SegunConsulta consulta={consulta}>
				{(lista) =>
					lista.total === 0 ? (
						<EstadoDePantalla tipo="vacio" texto="Ninguna prenda cumple esa búsqueda." />
					) : (
						lista.grupos.map((grupo) => (
							<GrupoDePrendas
								key={`${grupo.clave}-${buscar === "" ? "todo" : "buscando"}`}
								titulo={grupo.nombre}
								color={grupo.color}
								prendas={grupo.prendas.length}
								plegadoAlEmpezar={grupo.clave === "verificada" && buscar.trim() === ""}
							>
								<TablaDeRecetas nombre={grupo.nombre} prendas={grupo.prendas} />
							</GrupoDePrendas>
						))
					)
				}
			</SegunConsulta>
		</>
	);
}

/**
 * La tabla de un grupo: Prenda · Tallas · Tela, según el patrón · Materiales · Próximo corte · Desperdicio · Receta.
 * @param props Su nombre y sus prendas.
 */
function TablaDeRecetas({ nombre, prendas }: { nombre: string; prendas: readonly PrendaDeLaLista[] }) {
	const { ir } = useDireccion();
	return (
		<Tabla
			nombre={nombre}
			filas={prendas}
			claveDeFila={(prenda) => prenda.producto_id}
			alTocarFila={(prenda) => ir({ cajon: "receta", id: prenda.producto_id })}
			columnas={[
				{
					clave: "prenda",
					encabezado: "Prenda",
					celda: (prenda) => <DosRenglones arriba={<b>{prenda.prenda}</b>} abajo={prenda.para} />,
				},
				{
					clave: "tallas",
					encabezado: "Tallas",
					celda: (prenda) => (
						<DosRenglones
							arriba={prenda.tallas.rango}
							abajo={`${prenda.tallas.cuantas} ${prenda.tallas.cuantas === 1 ? "talla" : "tallas"}`}
						/>
					),
				},
				{
					clave: "tela",
					encabezado: "Tela, según el patrón",
					celda: (prenda) =>
						prenda.tela === null ? (
							<span className="text-tinta3">—</span>
						) : (
							<DosRenglones arriba={prenda.tela.nombre} abajo={prenda.tela.texto} />
						),
				},
				{
					clave: "materiales",
					encabezado: "Materiales",
					alinear: "derecha",
					celda: (prenda) => prenda.materiales ?? "—",
				},
				{
					clave: "corte",
					encabezado: "Próximo corte",
					celda: (prenda) =>
						prenda.corte === null ? (
							<span className="text-tinta3">Sin corte</span>
						) : (
							<DosRenglones arriba={prenda.corte.texto} abajo={prenda.corte.detalle} rojo={prenda.corte.rojo} />
						),
				},
				{
					clave: "desperdicio",
					encabezado: "Desperdicio",
					celda: (prenda) =>
						prenda.desperdicio === null ? (
							<span className="text-tinta3">Sin medir</span>
						) : (
							<DosRenglones
								arriba={prenda.desperdicio.texto}
								abajo={prenda.desperdicio.detalle}
								rojo={prenda.desperdicio.rojo}
							/>
						),
				},
				{
					clave: "receta",
					encabezado: "Receta",
					celda: (prenda) => <Estado texto={prenda.estado.texto} color={prenda.estado.color} />,
				},
			]}
		/>
	);
}
