/**
 * Pendientes de Compras: la barra de indicadores (Por pedir, Órdenes de compra, Materiales, Proveedores y Conciliación
 * de facturas, cada cifra lleva a su pestaña) y el panel de pendientes con sus filtros por grupo en la dirección.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Pendientes»)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { pendientesDeCompras } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { BarraIndicadores } from "@uniformame/interfaz/pagina/barra-indicadores";
import { PanelPendientes } from "@uniformame/interfaz/tablas/panel-pendientes";
import { Package, ReceiptText, ShoppingCart, Truck, Users } from "lucide-react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { rutaDePestana } from "../../../comun/pagina-de-departamento.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeCompras } from "../direccion.ts";

/** Lo que regresa la consulta. */
type Pendientes = z.infer<typeof pendientesDeCompras.resultado>;

/** El tipo de cada pendiente: su texto, su ícono y su color. */
const tipos = {
	material: { texto: "Material", icono: Package, color: "ambar" },
	orden: { texto: "Orden de compra", icono: Truck, color: "azul" },
	factura: { texto: "Factura", icono: ReceiptText, color: "rojo" },
} as const;

/**
 * La barra de indicadores de Compras.
 * @param props Los indicadores y a dónde lleva cada cifra.
 */
function Indicadores({
	indicadores,
	alTocar,
}: {
	indicadores: Pendientes["indicadores"];
	alTocar: (pestana: string) => void;
}) {
	const { por_pedir, ordenes, materiales, proveedores, facturas } = indicadores;
	return (
		<BarraIndicadores
			cifras={[
				{
					clave: "por-pedir",
					nombre: "Por pedir",
					icono: ShoppingCart,
					color: "azul",
					numero: por_pedir.sin_tiempo,
					...(por_pedir.tono === null ? {} : { tono: por_pedir.tono }),
					unidad: "sin tiempo de entrega",
					contexto: por_pedir.contexto,
					reparto: [
						{ color: "rojo", valor: por_pedir.sin_tiempo, etiqueta: "Sin tiempo" },
						{ color: "ambar", valor: por_pedir.esta_semana, etiqueta: "Esta semana" },
						{ color: "verde", valor: por_pedir.suficiente, etiqueta: "Suficiente" },
					],
					alTocar: () => alTocar("por-pedir"),
				},
				{
					clave: "ordenes",
					nombre: "Órdenes de compra",
					icono: Truck,
					color: "verde",
					numero: ordenes.en_camino,
					unidad: "en camino",
					contexto: ordenes.contexto,
					serie: ordenes.por_semana,
					alTocar: () => alTocar("ordenes"),
				},
				{
					clave: "materiales",
					nombre: "Materiales",
					icono: Package,
					color: "ambar",
					numero: materiales.activos,
					unidad: materiales.activos === 1 ? "material" : "materiales",
					contexto: materiales.contexto,
					alTocar: () => alTocar("materiales"),
				},
				{
					clave: "proveedores",
					nombre: "Proveedores",
					icono: Users,
					color: "violeta",
					numero: proveedores.activos,
					unidad: proveedores.activos === 1 ? "proveedor" : "proveedores",
					contexto: proveedores.contexto,
					alTocar: () => alTocar("proveedores"),
				},
				{
					clave: "conciliacion",
					nombre: "Conciliación de facturas",
					icono: ReceiptText,
					color: "verde-azulado",
					numero: facturas.sin_conciliar,
					...(facturas.tono === null ? {} : { tono: facturas.tono }),
					unidad: "sin conciliar",
					contexto: facturas.contexto,
					alTocar: () => alTocar("conciliacion"),
				},
			]}
		/>
	);
}

/** La pestaña Pendientes: lee `compras.pendientes` y pinta sus estados. */
export function PendientesDeCompras() {
	const consulta = useConsulta(pendientesDeCompras, {});
	return <SegunConsulta consulta={consulta}>{(datos) => <Contenido datos={datos} />}</SegunConsulta>;
}

/**
 * Lo que pinta la pestaña con los datos.
 * @param props Lo que regresa `compras.pendientes`.
 */
function Contenido({ datos }: { datos: Pendientes }) {
	const { busqueda, ir } = useDireccionDeCompras();
	const irAPestana = (pestana: string) => ir({}, rutaDePestana("compras", pestana));
	const { indicadores, renglones, conteos } = datos;
	return (
		<div className="flex flex-col gap-5">
			<Indicadores indicadores={indicadores} alTocar={irAPestana} />
			<PanelPendientes
				columnaCifra="Cantidad"
				filtro={busqueda.grupo ?? "todos"}
				alEscogerFiltro={(grupo) => ir({ grupo: grupo === "todos" ? undefined : grupo })}
				filtros={[
					{ clave: "todos", texto: "Todos", conteo: conteos.todos },
					{ clave: "materiales", texto: "Materiales", conteo: conteos.materiales, punto: "bg-ambar" },
					{ clave: "ordenes", texto: "Órdenes", conteo: conteos.ordenes, punto: "bg-azul" },
					{ clave: "facturas", texto: "Facturas", conteo: conteos.facturas, punto: "bg-rojo" },
				]}
				pendientes={renglones.map((renglon) => ({
					clave: renglon.clave,
					grupo: renglon.grupo,
					tipo: tipos[renglon.tipo],
					referencia: { titulo: renglon.referencia, detalle: renglon.detalle },
					...(renglon.fecha === null ? {} : { fecha: { texto: textoDeDiaCorto(renglon.fecha), orden: renglon.fecha } }),
					...(renglon.cifra === null ? {} : { cifra: renglon.cifra }),
					estado: {
						texto: renglon.estado.texto,
						color: renglon.estado.color,
						...(renglon.estado.abajo === null ? {} : { abajo: renglon.estado.abajo }),
					},
					accion:
						renglon.abre.cajon === "conciliacion"
							? { texto: "Revisar", alTocar: () => irAPestana("conciliacion") }
							: {
									texto: renglon.abre.cajon === "orden" ? "Ver orden" : "Ver material",
									alTocar: () => ir({ cajon: renglon.abre.cajon, id: renglon.abre.id ?? undefined }),
								},
				}))}
			/>
		</div>
	);
}
