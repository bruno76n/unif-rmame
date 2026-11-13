/**
 * La pestaña Pedidos de Ventas a externos: por cliente (un grupo por cliente con su crédito) o por estado (una columna
 * por etapa), con el buscador, «Mostrar entregados» y los filtros por etapa.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Pedidos»)
 *
 * La etapa, la alerta, el avance y sus colores llegan de `ventas.pedidos`: la pantalla no los calcula. La vista, el
 * buscador, los entregados y la etapa van en la dirección.
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { pedidosVentas } from "@uniformame/compartido/contratos/ventas/consultas-pedidos";
import { BarraAvance } from "@uniformame/interfaz/avance/barra-avance";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Buscador } from "@uniformame/interfaz/captura/buscador";
import { type Filtro, Filtros } from "@uniformame/interfaz/captura/filtros";
import { Interruptor } from "@uniformame/interfaz/captura/interruptor";
import { puntoDelEstado } from "@uniformame/interfaz/estados/colores";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { MuestraDeColor } from "@uniformame/interfaz/estados/muestra-de-color";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Lock, Plus } from "lucide-react";
import { useEffect } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { busquedaDeVentas, useDireccionDeVentas } from "../direccion.ts";

/** Lo que da la consulta. */
type Pedidos = z.infer<typeof pedidosVentas.resultado>;

/** Un pedido de la lista. */
type PedidoEnLista = Pedidos["pedidos"][number];

/**
 * La tabla de los pedidos de un cliente, con su renglón de suma si tiene más de uno.
 * @param props Sus pedidos y qué hacer al tocar uno.
 */
function TablaDePedidos({ pedidos, alAbrir }: { pedidos: readonly PedidoEnLista[]; alAbrir: (id: string) => void }) {
	const conSuma = pedidos.length > 1;
	const suma = (cuenta: (pedido: PedidoEnLista) => number) =>
		pedidos.reduce((total, pedido) => total + cuenta(pedido), 0);
	return (
		<Tabla
			nombre="Pedidos"
			filas={pedidos}
			claveDeFila={(pedido) => pedido.pedido_id}
			alTocarFila={(pedido) => alAbrir(pedido.pedido_id)}
			columnas={[
				{
					clave: "pedido",
					encabezado: "Pedido",
					celda: (pedido) => (
						<span className="flex flex-col">
							<b className="font-bold tabular-nums">{pedido.folio}</b>
							{pedido.version_vigente >= 2 ? (
								<span className="text-etiqueta text-tinta3">versión {pedido.version_vigente}</span>
							) : null}
						</span>
					),
				},
				{
					clave: "prendas",
					encabezado: "Prendas",
					celda: (pedido) => (
						<span className="flex max-w-64 flex-col">
							<b className="truncate font-semibold">{pedido.prendas}</b>
							<span className="text-etiqueta text-tinta3">{pedido.prendas_detalle}</span>
						</span>
					),
				},
				{
					clave: "piezas",
					encabezado: "Piezas",
					alinear: "derecha",
					celda: (pedido) => pedido.piezas.toLocaleString("es-MX"),
					...(conSuma ? { suma: suma((pedido) => pedido.piezas).toLocaleString("es-MX") } : {}),
				},
				{
					clave: "entrega",
					encabezado: "Entrega",
					celda: (pedido) => (
						<span className="flex flex-col">
							<b className="font-semibold">{pedido.entrega.texto}</b>
							<TextoConTono tono={pedido.entrega.tono}>{pedido.entrega.cuando}</TextoConTono>
						</span>
					),
				},
				{
					clave: "avance",
					encabezado: "Avance",
					celda: (pedido) =>
						pedido.avance === null ? (
							<span className="text-tinta3">Sin confirmar</span>
						) : (
							<span className="flex min-w-40 flex-col gap-1.5">
								<BarraAvance segmentos={pedido.avance.tramos} />
								<span className="text-etiqueta text-tinta2">{pedido.avance.texto}</span>
							</span>
						),
				},
				{
					clave: "estado",
					encabezado: "Estado",
					celda: (pedido) => (
						<Estado
							texto={pedido.estado.texto}
							color={pedido.estado.color}
							{...(pedido.estado.abajo === null ? {} : { abajo: pedido.estado.abajo })}
						/>
					),
				},
				{
					clave: "notas",
					encabezado: "Notas",
					celda: (pedido) =>
						pedido.notas.cuantas === 0 ? (
							"—"
						) : (
							<span className="flex flex-col">
								<b className="font-semibold">
									{pedido.notas.cuantas} {pedido.notas.cuantas === 1 ? "nota" : "notas"}
								</b>
								<span className="text-etiqueta text-tinta3">{pedido.notas.ultimas.join(", ")}</span>
							</span>
						),
				},
				{
					clave: "total",
					encabezado: "Total",
					alinear: "derecha",
					celda: (pedido) => montoEnPantalla(pedido.total_centavos),
					...(conSuma ? { suma: enPesos(suma((pedido) => pedido.total_centavos ?? 0)) } : {}),
				},
			]}
		/>
	);
}

/** La pestaña Pedidos. */
export function PestanaPedidos() {
	const { busqueda, navegar, abrir } = useDireccionDeVentas();
	const vista = busqueda.vista ?? "cliente";
	const consulta = useConsulta(pedidosVentas, {
		vista,
		...(busqueda.buscar === undefined ? {} : { buscar: busqueda.buscar }),
		...(busqueda.etapa === undefined ? {} : { etapa: busqueda.etapa }),
		mostrar_entregados: busqueda.entregados === "si" ? "si" : "no",
	});
	const conFiltros = busqueda.buscar !== undefined || busqueda.etapa !== undefined;
	// «Ver cliente» desde Pendientes: el grupo del cliente a la vista.
	useEffect(() => {
		if (busqueda.de_cliente === undefined || consulta.data === undefined) return;
		document.getElementById(`grupo-${busqueda.de_cliente}`)?.scrollIntoView({ block: "start" });
	}, [busqueda.de_cliente, consulta.data]);
	return (
		<>
			<div className="flex flex-wrap items-end gap-4">
				<Filtros
					nombre="Ver pedidos"
					filtros={[
						{ clave: "cliente", texto: "Por cliente" },
						{ clave: "estado", texto: "Por estado" },
					]}
					activo={vista}
					alEscoger={(clave) => navegar({ vista: busquedaDeVentas.shape.vista.parse(clave) })}
				/>
				<div className="min-w-64 flex-1">
					<Buscador
						etiqueta="Buscar pedidos"
						ayuda="Folio, prenda, nota o cliente"
						valor={busqueda.buscar ?? ""}
						alBuscar={(texto) => navegar({ buscar: texto })}
					/>
				</div>
				<Interruptor
					etiqueta="Mostrar entregados"
					prendido={busqueda.entregados === "si"}
					alCambiar={(prendido) => navegar({ entregados: prendido ? "si" : undefined })}
				/>
			</div>
			<SegunConsulta consulta={consulta}>
				{(datos) => {
					const filtros: Filtro[] = [
						{ clave: "todos", texto: "Todos", conteo: datos.etapas.reduce((total, etapa) => total + etapa.conteo, 0) },
						...datos.etapas.map((etapa) => ({
							clave: etapa.clave,
							texto: etapa.texto,
							conteo: etapa.conteo,
							...(puntoDelEstado[etapa.color] === undefined ? {} : { punto: puntoDelEstado[etapa.color] }),
						})),
					];
					return (
						<>
							<Filtros
								nombre="Filtrar por etapa"
								filtros={filtros}
								activo={busqueda.etapa ?? "todos"}
								alEscoger={(clave) =>
									navegar({
										etapa:
											clave === "todos" || clave === busqueda.etapa
												? undefined
												: busquedaDeVentas.shape.etapa.parse(clave),
									})
								}
							/>
							{datos.pedidos.length === 0 && conFiltros ? (
								<EstadoDePantalla
									tipo="vacio"
									texto="No hay pedidos con esos filtros"
									accion={
										<Boton onClick={() => navegar({ buscar: undefined, etapa: undefined })}>Quitar filtros</Boton>
									}
								/>
							) : vista === "estado" ? (
								<PorEstado datos={datos} alAbrir={(id) => abrir("pedido", id)} />
							) : (
								<PorCliente
									datos={datos}
									resaltado={busqueda.de_cliente}
									alAbrir={(id) => abrir("pedido", id)}
									alNuevo={(id) => abrir("nuevo", id)}
								/>
							)}
						</>
					);
				}}
			</SegunConsulta>
		</>
	);
}

/**
 * Por cliente: un grupo por cliente con su crédito, su «Nuevo pedido» y la tabla de sus pedidos.
 * @param props Los datos, el cliente resaltado y qué hacer al abrir un pedido o levantar uno nuevo.
 */
function PorCliente({
	datos,
	resaltado,
	alAbrir,
	alNuevo,
}: {
	datos: Pedidos;
	resaltado: string | undefined;
	alAbrir: (id: string) => void;
	alNuevo: (clienteId: string) => void;
}) {
	if (datos.clientes.length === 0) return <EstadoDePantalla tipo="vacio" texto="Sin pedidos abiertos" />;
	return (
		<div className="flex flex-col gap-6">
			{datos.clientes.map((cliente) => {
				const suyos = datos.pedidos.filter((pedido) => pedido.cliente_id === cliente.cliente_id);
				return (
					<section
						key={cliente.cliente_id}
						id={`grupo-${cliente.cliente_id}`}
						aria-label={cliente.nombre}
						className={resaltado === cliente.cliente_id ? "rounded-grande ring-2 ring-marca" : undefined}
					>
						<header className="flex flex-wrap items-center gap-3 pb-3">
							<MuestraDeColor color={cliente.color} />
							<h2 className="m-0 font-bold text-subtitulo">{cliente.nombre}</h2>
							<span className="text-tinta2">{cliente.descripcion}</span>
							<Estado texto={cliente.credito.texto} color={cliente.credito.color} />
							<span className="ml-auto">
								{cliente.detenido ? null : (
									<Boton chico icono={Plus} onClick={() => alNuevo(cliente.cliente_id)}>
										Nuevo pedido
									</Boton>
								)}
							</span>
						</header>
						{cliente.detenido ? (
							<div className="mb-3 flex items-center gap-2 rounded-mediano bg-estado-rojo px-4 py-3 font-semibold text-white">
								<Lock aria-hidden="true" size={17} strokeWidth={1.9} />
								<b>Detenido por crédito</b>
								<span>No se le pueden levantar pedidos nuevos</span>
							</div>
						) : null}
						<div className="rounded-grande bg-panel shadow-panel">
							{suyos.length === 0 ? (
								<p className="m-0 px-4 py-4 text-tinta2">Sin pedidos abiertos</p>
							) : (
								<TablaDePedidos pedidos={suyos} alAbrir={alAbrir} />
							)}
						</div>
					</section>
				);
			})}
		</div>
	);
}

/**
 * Por estado: una columna por etapa con su conteo, y una tarjeta por pedido.
 * @param props Los datos y qué hacer al abrir un pedido.
 */
function PorEstado({ datos, alAbrir }: { datos: Pedidos; alAbrir: (id: string) => void }) {
	return (
		<div className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-2">
			{datos.etapas.map((etapa) => {
				const suyos = datos.pedidos.filter((pedido) => pedido.etapa.clave === etapa.clave);
				return (
					<section key={etapa.clave} aria-label={etapa.texto} className="flex flex-col gap-3">
						<h2 className="m-0 flex items-center gap-2 font-bold">
							{etapa.texto}
							<span className="rounded-full bg-riel px-2 text-sm tabular-nums">{etapa.conteo}</span>
						</h2>
						{suyos.length === 0 ? (
							<p className="m-0 text-tinta3">Ninguno</p>
						) : (
							suyos.map((pedido) => (
								<button
									key={pedido.pedido_id}
									type="button"
									onClick={() => alAbrir(pedido.pedido_id)}
									className="flex flex-col gap-1.5 rounded-grande bg-panel p-4 text-left shadow-panel hover:bg-suave"
								>
									<b className="font-bold">{pedido.cliente}</b>
									<span className="text-etiqueta text-tinta2">
										{pedido.folio} · {pedido.piezas.toLocaleString("es-MX")} pz ·{" "}
										{montoEnPantalla(pedido.total_centavos)}
									</span>
									{pedido.avance === null ? null : <BarraAvance segmentos={pedido.avance.tramos} />}
									{pedido.estado.abajo === null ? (
										<span className="text-etiqueta text-tinta3">Entrega el {pedido.entrega.texto}</span>
									) : (
										<TextoConTono tono={pedido.entrega.tono}>{pedido.estado.abajo}</TextoConTono>
									)}
								</button>
							))
						)}
					</section>
				);
			})}
		</div>
	);
}
