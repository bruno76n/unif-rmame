/**
 * La pestaña Clientes de Ventas a externos: una ficha por cliente activo, con su color, su contacto, su crédito, sus
 * pedidos y su lista; y abajo los dados de baja, con «Reactivar».
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Clientes»)
 */

import { reactivarCliente } from "@uniformame/compartido/contratos/ventas/clientes";
import { clientesVentas } from "@uniformame/compartido/contratos/ventas/consultas-clientes";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Enlace } from "@uniformame/interfaz/botones/enlace";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus } from "lucide-react";
import { useAccion, useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeVentas } from "../direccion.ts";

/** Las consultas que cambian al reactivar un cliente. */
const alReactivar = ["ventas.clientes", "ventas.pedidos", "ventas.pendientes", "ventas.editor_pedido"] as const;

/**
 * Una cifra de la ficha: el número grande y su nombre abajo.
 * @param props El número, su nombre y su línea de más.
 */
function CifraDeFicha({ numero, nombre, extra }: { numero: string; nombre: string; extra?: string }) {
	return (
		<div className="flex flex-col">
			<b className="font-bold text-subtitulo tabular-nums">{numero}</b>
			<span className="text-etiqueta text-tinta3">{nombre}</span>
			{extra === undefined ? null : <span className="font-semibold text-etiqueta text-tinta2">{extra}</span>}
		</div>
	);
}

/** La pestaña Clientes. */
export function PestanaClientes() {
	const { navegar, abrir } = useDireccionDeVentas();
	const consulta = useConsulta(clientesVentas, {});
	const reactivar = useAccion(reactivarCliente, alReactivar);
	const conConexion = useConConexion();
	return (
		<SegunConsulta consulta={consulta}>
			{(datos) => (
				<>
					<div className="flex items-center justify-between gap-3">
						<h2 className="m-0 font-bold text-subtitulo">
							{datos.fichas.length} {datos.fichas.length === 1 ? "cliente" : "clientes"}
						</h2>
						<Boton chico icono={Plus} disabled={!conConexion} onClick={() => abrir("cliente")}>
							Nuevo cliente
						</Boton>
					</div>
					<div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
						{datos.fichas.map((ficha) => (
							<article
								key={ficha.cliente_id}
								aria-label={ficha.nombre}
								className="flex flex-col overflow-hidden rounded-grande bg-panel shadow-panel"
							>
								<div
									aria-hidden="true"
									className={`h-14 ${ficha.color === null ? "bg-pizarra" : ""}`}
									style={ficha.color === null ? undefined : { backgroundColor: ficha.color }}
								/>
								<div className="flex flex-1 flex-col gap-3 p-5">
									<div>
										<h3 className="m-0 font-bold text-titulo-seccion">{ficha.nombre}</h3>
										<p className="m-0 text-tinta2">{ficha.descripcion}</p>
										<p className="m-0 text-tinta2">
											{ficha.contacto} ·{" "}
											<Enlace onClick={() => abrir("cliente", ficha.cliente_id)}>Editar datos</Enlace>
										</p>
									</div>
									<span>
										<Estado texto={ficha.credito.texto} color={ficha.credito.color} />
									</span>
									<div className="grid grid-cols-3 gap-3 rounded-mediano bg-suave p-4">
										<CifraDeFicha
											numero={String(ficha.pedidos_abiertos)}
											nombre={ficha.pedidos_abiertos === 1 ? "pedido abierto" : "pedidos abiertos"}
											{...(ficha.borradores > 0 ? { extra: `+${ficha.borradores} en borrador` } : {})}
										/>
										<CifraDeFicha
											numero={ficha.piezas_por_entregar.toLocaleString("es-MX")}
											nombre="piezas por entregar"
										/>
										<CifraDeFicha numero={ficha.proxima_entrega} nombre="próxima entrega" />
									</div>
									<div>
										<p className="m-0 font-semibold">
											{ficha.modelos_propios === 0
												? "Sin modelos propios"
												: `${ficha.modelos_propios} ${ficha.modelos_propios === 1 ? "modelo propio" : "modelos propios"}`}{" "}
											· {ficha.productos_lista} {ficha.productos_lista === 1 ? "producto" : "productos"} en su lista
										</p>
										<p className="m-0 text-tinta2">{ficha.lista}</p>
									</div>
									<div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
										<Boton chico onClick={() => navegar({ de_cliente: ficha.cliente_id }, "pedidos")}>
											Ver sus pedidos
										</Boton>
										{ficha.detenido ? (
											<Estado texto="Sin pedidos nuevos" color="rojo" />
										) : (
											<Boton
												chico
												variante="fantasma"
												icono={Plus}
												disabled={!conConexion}
												onClick={() => abrir("nuevo", ficha.cliente_id)}
											>
												Nuevo pedido
											</Boton>
										)}
									</div>
								</div>
							</article>
						))}
					</div>
					{datos.de_baja.length === 0 ? null : (
						<section aria-labelledby="dados-de-baja" className="flex flex-col gap-3">
							<h2 id="dados-de-baja" className="m-0 font-bold text-subtitulo">
								Dados de baja
							</h2>
							<div className="rounded-grande bg-panel shadow-panel">
								<Tabla
									nombre="Clientes dados de baja"
									filas={datos.de_baja}
									claveDeFila={(cliente) => cliente.cliente_id}
									columnas={[
										{ clave: "cliente", encabezado: "Cliente", celda: (cliente) => <b>{cliente.nombre}</b> },
										{ clave: "desde", encabezado: "Desde", celda: (cliente) => cliente.desde },
										{ clave: "motivo", encabezado: "Motivo", celda: (cliente) => cliente.motivo },
										{
											clave: "reactivar",
											encabezado: "",
											alinear: "derecha",
											celda: (cliente) => (
												<Boton
													chico
													disabled={!conConexion || reactivar.isPending}
													onClick={() =>
														reactivar.mutate({ datos: { cliente_id: cliente.cliente_id }, version: cliente.version })
													}
												>
													Reactivar
												</Boton>
											),
										},
									]}
								/>
							</div>
						</section>
					)}
				</>
			)}
		</SegunConsulta>
	);
}
