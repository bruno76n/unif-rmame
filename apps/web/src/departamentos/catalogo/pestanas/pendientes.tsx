/**
 * Pendientes de Catálogo: la barra de cifras (Productos, Listas de precios, Etiquetas y Bitácora) y el panel con los
 * modelos sin precio, las etiquetas nuevas y, con el precio en la etiqueta, las que se reimprimen. Primero lo rojo,
 * luego lo ámbar; la fecha siempre «—». Sin pendientes: «Sin pendientes».
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Pendientes»)
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import { pendientesDeCatalogo } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { BarraIndicadores } from "@uniformame/interfaz/pagina/barra-indicadores";
import { PanelPendientes, type Pendiente } from "@uniformame/interfaz/tablas/panel-pendientes";
import { Barcode, Clock, Table, Tag } from "lucide-react";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { conFicha, useBusqueda, useIr } from "../direccion.ts";
import { enumerar } from "../textos.ts";

/** Pendientes de Catálogo. */
export function PestanaPendientes() {
	const busqueda = useBusqueda();
	const ir = useIr();
	const grupo = busqueda.grupo ?? "todos";
	const consulta = useConsulta(pendientesDeCatalogo, grupo === "todos" ? {} : { grupo });
	return (
		<SegunConsulta consulta={consulta}>
			{({ cifras, renglones, conteos }) => {
				const pendientes: Pendiente[] = renglones.map((renglon) =>
					renglon.tipo === "modelo_sin_precio"
						? {
								clave: `${renglon.producto_id}-${renglon.lista}`,
								grupo: renglon.grupo,
								tipo: { texto: "Modelo sin precio", icono: Tag, color: "rojo" },
								referencia: {
									titulo: renglon.escuela === null ? renglon.producto : `${renglon.producto} · ${renglon.escuela}`,
									detalle: `Modelo de cliente · ${renglon.lista ?? ""} · no se puede cotizar`,
								},
								estado: { texto: "Sin precio", color: "rojo" },
								accion: { texto: "Abrir ficha", alTocar: () => ir(conFicha(renglon.producto_id)) },
							}
						: {
								clave: `${renglon.tipo}-${renglon.producto_id}`,
								grupo: renglon.grupo,
								tipo: {
									texto: renglon.tipo === "etiquetas" ? "Etiquetas" : "Reimprimir",
									icono: Barcode,
									color: "ambar",
								},
								referencia: {
									titulo: renglon.escuela === null ? renglon.producto : `${renglon.producto} · ${renglon.escuela}`,
									detalle: `Tallas ${enumerar(renglon.tallas)}`,
								},
								cifra: plural(renglon.tallas.length, "variante", "variantes"),
								estado: { texto: "Por imprimir", color: "ambar" },
								accion: {
									texto: "Imprimir",
									alTocar: () => ir({ etiquetas_de: renglon.producto_id }, "etiquetas"),
								},
							},
				);
				return (
					<>
						<BarraIndicadores
							cifras={[
								{
									clave: "productos",
									nombre: "Productos",
									icono: Tag,
									color: "rosa",
									numero: cifras.productos_activos.toLocaleString("es-MX"),
									unidad: cifras.productos_activos === 1 ? "activo" : "activos",
									...(cifras.modelos_sin_precio === 0
										? {}
										: {
												contexto: [
													{
														texto: plural(cifras.modelos_sin_precio, "modelo sin precio", "modelos sin precio"),
														tono: "rojo" as const,
													},
												],
											}),
									alTocar: () => ir({}, "productos"),
								},
								{
									clave: "listas",
									nombre: "Listas de precios",
									icono: Table,
									color: "azul",
									numero: cifras.listas,
									unidad: cifras.listas === 1 ? "lista" : "listas",
									contexto: [{ texto: `Siguiente código: ${cifras.siguiente_codigo ?? "—"}` }],
									serie: cifras.cambios_por_semana,
									alTocar: () => ir({}, "listas-de-precios"),
								},
								{
									clave: "etiquetas",
									nombre: "Etiquetas",
									icono: Barcode,
									color: "ambar",
									numero: cifras.variantes_sin_etiqueta,
									unidad: cifras.variantes_sin_etiqueta === 1 ? "variante sin etiqueta" : "variantes sin etiqueta",
									contexto:
										cifras.variantes_sin_etiqueta === 0
											? [{ texto: "Todas impresas" }]
											: [
													{
														texto: `De ${plural(cifras.productos_con_etiquetas_nuevas, "producto nuevo", "productos nuevos")}`,
														tono: "ambar",
													},
												],
									alTocar: () => ir({}, "etiquetas"),
								},
								{
									clave: "bitacora",
									nombre: "Bitácora",
									icono: Clock,
									color: "pizarra",
									numero: cifras.cambios_esta_semana,
									unidad: cifras.cambios_esta_semana === 1 ? "cambio esta semana" : "cambios esta semana",
									contexto: [{ texto: "Cambios de precio por semana" }],
									serie: cifras.cambios_por_semana,
									alTocar: () => ir({}, "bitacora"),
								},
							]}
						/>
						<PanelPendientes
							pendientes={pendientes}
							filtros={[
								{ clave: "todos", texto: "Todos", conteo: conteos.todos },
								{ clave: "productos", texto: "Productos", conteo: conteos.productos, punto: "bg-rojo" },
								{ clave: "etiquetas", texto: "Etiquetas", conteo: conteos.etiquetas, punto: "bg-ambar" },
							]}
							filtro={grupo}
							alEscogerFiltro={(clave) =>
								ir({ grupo: clave === "todos" ? undefined : clave === "productos" ? "productos" : "etiquetas" })
							}
							columnaCifra="Cantidad"
						/>
					</>
				);
			}}
		</SegunConsulta>
	);
}
