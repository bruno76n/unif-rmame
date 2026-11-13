/**
 * La pestaña Notas de entrega de Ventas a externos: el buscador, el filtro del pedido si se llegó desde uno, los
 * filtros por estado con sus conteos y la tabla de notas, con su pago.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Notas de entrega»)
 *
 * El pago de cada nota entregada lo da `contaduria.estado_pago_notas` (sin el saldo, que es de Contaduría); las que no
 * se han entregado dicen «Se cobra al entregar».
 */

import { estadoPagoNotas } from "@uniformame/compartido/contratos/contaduria/estado-pago-notas";
import { notasEntregaVentas } from "@uniformame/compartido/contratos/ventas/consultas-notas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Buscador } from "@uniformame/interfaz/captura/buscador";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { X } from "lucide-react";
import { useConsulta } from "../../../comun/api.tsx";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { busquedaDeVentas, useDireccionDeVentas } from "../direccion.ts";

/** La pestaña Notas de entrega. */
export function PestanaNotas() {
	const { busqueda, navegar, abrir } = useDireccionDeVentas();
	const consulta = useConsulta(notasEntregaVentas, {
		...(busqueda.buscar === undefined ? {} : { buscar: busqueda.buscar }),
		...(busqueda.estado === undefined ? {} : { estado: busqueda.estado }),
		...(busqueda.del_pedido === undefined ? {} : { pedido_id: busqueda.del_pedido }),
	});
	const entregadas = (consulta.data?.notas ?? [])
		.filter((nota) => nota.estado === "entregada")
		.map((nota) => nota.nota_id)
		.slice(0, 100);
	const pagos = useConsulta(estadoPagoNotas, { nota_ids: entregadas.join(",") }, entregadas.length > 0);
	const pagoDe = (notaId: string) =>
		pagos.data?.notas.find((pago) => pago.nota_entrega_id === notaId)?.texto ?? (pagos.isError ? "—" : "");
	return (
		<>
			<div className="flex flex-wrap items-end gap-4">
				<div className="min-w-64 max-w-120 flex-1">
					<Buscador
						etiqueta="Buscar notas"
						ayuda="Nota, pedido, prenda o cliente"
						valor={busqueda.buscar ?? ""}
						alBuscar={(texto) => navegar({ buscar: texto })}
					/>
				</div>
				{consulta.data?.pedido == null ? null : (
					<Boton chico icono={X} onClick={() => navegar({ del_pedido: undefined })}>
						Pedido {consulta.data.pedido.folio}
					</Boton>
				)}
			</div>
			<SegunConsulta consulta={consulta}>
				{(datos) => (
					<>
						<Filtros
							nombre="Filtrar notas por estado"
							filtros={[
								{ clave: "todas", texto: "Todas", conteo: datos.conteos.todas },
								{
									clave: "por_despachar",
									texto: "Por despachar",
									conteo: datos.conteos.por_despachar,
									punto: "bg-violeta",
								},
								{ clave: "en_camino", texto: "En camino", conteo: datos.conteos.en_camino, punto: "bg-ambar" },
								{ clave: "entregada", texto: "Entregada", conteo: datos.conteos.entregada, punto: "bg-verde" },
							]}
							activo={busqueda.estado ?? "todas"}
							alEscoger={(clave) =>
								navegar({ estado: clave === "todas" ? undefined : busquedaDeVentas.shape.estado.parse(clave) })
							}
						/>
						{datos.notas.length === 0 ? (
							<EstadoDePantalla tipo="vacio" texto="Sin notas con esos filtros" />
						) : (
							<div className="rounded-grande bg-panel shadow-panel">
								<Tabla
									nombre="Notas de entrega"
									filas={datos.notas}
									claveDeFila={(nota) => nota.nota_id}
									alTocarFila={(nota) => abrir("nota", nota.nota_id)}
									columnas={[
										{
											clave: "nota",
											encabezado: "Nota",
											celda: (nota) => (
												<span className="flex flex-col">
													<b className="font-bold tabular-nums">{nota.folio}</b>
													<span className="text-etiqueta text-tinta3">{nota.fecha}</span>
												</span>
											),
										},
										{
											clave: "pedido",
											encabezado: "Pedido",
											celda: (nota) => (
												<span className="flex flex-col items-start">
													<button
														type="button"
														className="font-bold text-marca underline"
														onClick={(evento) => {
															evento.stopPropagation();
															abrir("pedido", nota.pedido_id);
														}}
													>
														{nota.pedido_folio}
													</button>
													<span className="text-etiqueta text-tinta3">{nota.nota_de}</span>
												</span>
											),
										},
										{ clave: "cliente", encabezado: "Cliente", celda: (nota) => nota.cliente },
										{
											clave: "prendas",
											encabezado: "Prendas",
											celda: (nota) => (
												<span className="flex max-w-64 flex-col">
													<b className="truncate font-semibold">{nota.prendas}</b>
													<span className="text-etiqueta text-tinta3">{nota.tallas}</span>
												</span>
											),
										},
										{
											clave: "piezas",
											encabezado: "Piezas",
											alinear: "derecha",
											celda: (nota) => nota.piezas.toLocaleString("es-MX"),
										},
										{
											clave: "estado",
											encabezado: "Estado",
											celda: (nota) => <Estado texto={nota.estado_armado.texto} color={nota.estado_armado.color} />,
										},
										{
											clave: "pago",
											encabezado: "Pago",
											celda: (nota) => (
												<span className="flex flex-col">
													<b className="font-semibold">
														{nota.estado === "entregada" ? pagoDe(nota.nota_id) : "Se cobra al entregar"}
													</b>
													<span className="text-etiqueta text-tinta3">{nota.forma_pago}</span>
												</span>
											),
										},
										{
											clave: "total",
											encabezado: "Total",
											alinear: "derecha",
											celda: (nota) => montoEnPantalla(nota.total_centavos),
										},
									]}
								/>
							</div>
						)}
					</>
				)}
			</SegunConsulta>
		</>
	);
}
