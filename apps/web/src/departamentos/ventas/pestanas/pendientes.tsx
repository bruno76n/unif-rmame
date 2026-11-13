/**
 * Pendientes de Ventas a externos: la barra de indicadores y el panel de pendientes por grupo, con el botón que
 * resuelve cada uno.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Pendientes»)
 *
 * Los renglones llegan armados de `ventas.pendientes`: la pantalla solo los pinta y abre el cajón o la ventana de cada
 * botón. El grupo escogido va en la dirección.
 */

import { pendientesVentas } from "@uniformame/compartido/contratos/ventas/consultas-pedidos";
import { BarraIndicadores, type Cifra } from "@uniformame/interfaz/pagina/barra-indicadores";
import type { ColorDeTipo } from "@uniformame/interfaz/pagina/colores-de-tipo";
import { PanelPendientes, type Pendiente } from "@uniformame/interfaz/tablas/panel-pendientes";
import { Box, CreditCard, FileText, type LucideIcon, Receipt, Table, Truck, Users } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { busquedaDeVentas, useDireccionDeVentas } from "../direccion.ts";
import { VentanaConfirmarEntrega } from "../ventanas/confirmar-entrega.tsx";

/** Lo que da la consulta. */
type Pendientes = z.infer<typeof pendientesVentas.resultado>;

/** El ícono y el color de cada cifra. */
const deCifra: Readonly<Record<Pendientes["cifras"][number]["clave"], { icono: LucideIcon; color: ColorDeTipo }>> = {
	pedidos_abiertos: { icono: Table, color: "azul" },
	piezas_por_entregar: { icono: Box, color: "ambar" },
	entregas_proximas: { icono: Truck, color: "verde-azulado" },
	notas_entrega: { icono: Receipt, color: "violeta" },
	clientes: { icono: Users, color: "rosa" },
};

/** El texto, el ícono y el color de cada tipo de pendiente. */
const deTipo: Readonly<
	Record<Pendientes["renglones"][number]["tipo"], { texto: string; icono: LucideIcon; color: ColorDeTipo }>
> = {
	borrador: { texto: "Borrador", icono: FileText, color: "pizarra" },
	entrega: { texto: "Entrega", icono: Truck, color: "verde-azulado" },
	pedido: { texto: "Pedido", icono: Table, color: "azul" },
	nota: { texto: "Nota de entrega", icono: Receipt, color: "violeta" },
	credito: { texto: "Crédito", icono: CreditCard, color: "rojo" },
};

/** Pendientes de Ventas a externos. */
export function PestanaPendientes() {
	const { busqueda, navegar, abrir } = useDireccionDeVentas();
	const grupo = busqueda.grupo ?? "todos";
	const consulta = useConsulta(pendientesVentas, {});
	const [confirmando, setConfirmando] = useState<string | undefined>(undefined);
	return (
		<SegunConsulta consulta={consulta}>
			{(datos) => {
				const cifras: Cifra[] = datos.cifras.map((cifra) => ({
					clave: cifra.clave,
					nombre: cifra.nombre,
					icono: deCifra[cifra.clave].icono,
					color: deCifra[cifra.clave].color,
					numero: cifra.numero.toLocaleString("es-MX"),
					contexto: cifra.contexto,
					...(cifra.reparto === null ? {} : { reparto: cifra.reparto }),
					alTocar: () => navegar({}, cifra.pestana),
				}));
				const pendientes: Pendiente[] = datos.renglones.map((renglon) => ({
					clave: renglon.clave,
					grupo: renglon.grupo,
					tipo: deTipo[renglon.tipo],
					referencia: { titulo: renglon.titulo, detalle: renglon.detalle },
					...(renglon.fecha === null ? {} : { fecha: { texto: renglon.fecha.texto, orden: renglon.fecha.fecha } }),
					...(renglon.importe_centavos !== null
						? { cifra: montoEnPantalla(renglon.importe_centavos) }
						: renglon.piezas !== null
							? { cifra: `${renglon.piezas.toLocaleString("es-MX")} pz` }
							: {}),
					estado: {
						texto: renglon.estado.texto,
						color: renglon.estado.color,
						...(renglon.estado.abajo === null ? {} : { abajo: renglon.estado.abajo }),
					},
					accion: {
						texto: renglon.accion.texto,
						alTocar: () => {
							const { tipo, pedido_id, nota_id, cliente_id } = renglon.accion;
							if (tipo === "confirmar_entrega") setConfirmando(nota_id ?? undefined);
							else if (tipo === "ver_cliente") navegar({ de_cliente: cliente_id ?? undefined }, "pedidos");
							else if (tipo === "armar_nota") abrir("armar", pedido_id ?? undefined);
							else if (tipo === "mandar") abrir("mandar", pedido_id ?? undefined);
							else abrir("pedido", pedido_id ?? undefined);
						},
					},
				}));
				return (
					<>
						<BarraIndicadores cifras={cifras} />
						<PanelPendientes
							pendientes={pendientes}
							filtros={[
								{ clave: "todos", texto: "Todos", conteo: datos.conteos.todos },
								{ clave: "pedidos", texto: "Pedidos", conteo: datos.conteos.pedidos, punto: "bg-azul" },
								{ clave: "entregas", texto: "Entregas", conteo: datos.conteos.entregas, punto: "bg-verde-azulado" },
								{ clave: "clientes", texto: "Clientes", conteo: datos.conteos.clientes, punto: "bg-rojo" },
							]}
							filtro={grupo}
							alEscogerFiltro={(clave) =>
								navegar({ grupo: clave === "todos" ? undefined : busquedaDeVentas.shape.grupo.parse(clave) })
							}
							columnaCifra="Importe"
						/>
						{confirmando === undefined ? null : (
							<VentanaConfirmarEntrega notaId={confirmando} alCerrar={() => setConfirmando(undefined)} />
						)}
					</>
				);
			}}
		</SegunConsulta>
	);
}
