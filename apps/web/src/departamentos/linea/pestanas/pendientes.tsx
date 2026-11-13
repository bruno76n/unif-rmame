/**
 * Pendientes de Tienda en línea: la barra con sus tres cifras (Pedidos, Ventas en línea y Disponibilidad) y el panel
 * de los W- por surtir, esperando prendas y listos para empacar, con «Ver pedido».
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Pendientes»)
 *
 * Todo llega armado de `linea.pendientes`: la pantalla no calcula la urgencia ni dónde está cada prenda; solo pinta y
 * abre el cajón por la dirección.
 */

import { pendientesLinea } from "@uniformame/compartido/contratos/linea/consultas";
import { BarraIndicadores, type Cifra } from "@uniformame/interfaz/pagina/barra-indicadores";
import { PanelPendientes, type Pendiente } from "@uniformame/interfaz/tablas/panel-pendientes";
import { Box, Globe, ShoppingCart } from "lucide-react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeLinea } from "../direccion.ts";

/** Lo que da la consulta. */
type Pendientes = z.infer<typeof pendientesLinea.resultado>;

/**
 * Las tres cifras de la barra.
 * @param cifras Las de la consulta.
 * @param ir Lleva a una pestaña.
 */
function cifrasDe(cifras: Pendientes["cifras"], ir: (pestana: "pedidos" | "disponibilidad") => void): Cifra[] {
	return [
		{
			clave: "pedidos",
			nombre: "Pedidos",
			icono: ShoppingCart,
			color: "azul",
			numero: cifras.pedidos.abiertos.toLocaleString("es-MX"),
			unidad: "abiertos",
			...(cifras.pedidos.tono === null ? {} : { tono: cifras.pedidos.tono }),
			contexto: cifras.pedidos.contexto,
			reparto: cifras.pedidos.reparto,
			alTocar: () => ir("pedidos"),
		},
		{
			clave: "ventas",
			nombre: "Ventas en línea",
			icono: Globe,
			color: "verde-azulado",
			numero: montoEnPantalla(cifras.ventas.semana_centavos),
			unidad: "esta semana",
			contexto: cifras.ventas.contexto,
			...(cifras.ventas.serie_centavos === undefined ? {} : { serie: cifras.ventas.serie_centavos }),
			alTocar: () => ir("pedidos"),
		},
		{
			clave: "disponibilidad",
			nombre: "Disponibilidad",
			icono: Box,
			color: "violeta",
			numero: cifras.disponibilidad.salen_hoy.toLocaleString("es-MX"),
			unidad: "tallas salen hoy",
			contexto: cifras.disponibilidad.contexto,
			alTocar: () => ir("disponibilidad"),
		},
	];
}

/** Pendientes de Tienda en línea. */
export function PestanaPendientes() {
	const { navegar, abrir } = useDireccionDeLinea();
	const consulta = useConsulta(pendientesLinea, {});
	return (
		<SegunConsulta consulta={consulta}>
			{(datos) => {
				const pendientes: Pendiente[] = datos.renglones.map((renglon) => ({
					clave: renglon.pedido_linea_id,
					grupo: "pedidos",
					tipo: { texto: "Pedido en línea", icono: Globe, color: "rosa" },
					referencia: { titulo: renglon.titulo, detalle: renglon.detalle },
					fecha: { texto: renglon.fecha.texto, orden: renglon.fecha.fecha },
					cifra: montoEnPantalla(renglon.total_centavos),
					estado: renglon.estado,
					accion: { texto: "Ver pedido", alTocar: () => abrir(renglon.pedido_linea_id) },
				}));
				return (
					<>
						<BarraIndicadores cifras={cifrasDe(datos.cifras, (pestana) => navegar({}, pestana))} />
						<PanelPendientes
							pendientes={pendientes}
							filtros={[{ clave: "todos", texto: "Todos", conteo: pendientes.length }]}
							filtro="todos"
							alEscogerFiltro={() => undefined}
							columnaCifra="Importe"
						/>
					</>
				);
			}}
		</SegunConsulta>
	);
}
