/**
 * La pestaña Cuentas por cobrar: las dos tarjetas (el saldo por tramo con la cobranza por forma de recepción, y lo
 * cobrado por semana), la antigüedad de saldos por cliente con su crédito y su semáforo, los depósitos a terceros por
 * aplicar, los saldos a favor, los pagos recibidos y los anticipos de pedidos.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Cuentas por cobrar»)
 *
 * El selector del semáforo llama a `contaduria.cambiar_semaforo_credito` y no abre el cajón; «Aplicar» llama a
 * `contaduria.aplicar_deposito_a_tercero`. El renglón de un cliente abre su cajón por la dirección.
 */

import { useRouter } from "@tanstack/react-router";
import { antiguedadSaldos, pagosRecibidos } from "@uniformame/compartido/contratos/contaduria/consultas-cobrar";
import { cambiarSemaforoCredito, semaforoDeCredito } from "@uniformame/compartido/contratos/contaduria/credito";
import { aplicarDepositoATercero } from "@uniformame/compartido/contratos/contaduria/por-pagar";
import { BarraAvance } from "@uniformame/interfaz/avance/barra-avance";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Interruptor } from "@uniformame/interfaz/captura/interruptor";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Grafica } from "@uniformame/interfaz/graficas/grafica";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta, usePaginas } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeContaduria } from "../direccion.ts";
import { useEnvio } from "../envio.ts";
import { type ACancelar, VentanaCancelar } from "../ventanas/cancelar.tsx";

/** Lo que da la consulta. */
type Antiguedad = z.infer<typeof antiguedadSaldos.resultado>;
/** Un cliente de la antigüedad. */
type Cliente = Antiguedad["clientes"][number];
/** Un depósito a un tercero por aplicar. */
type Deposito = Antiguedad["depositos"][number];

/** Las opciones del selector del semáforo. */
const opcionesDeSemaforo = [
	{ valor: "al_corriente", texto: "Al corriente" },
	{ valor: "cerca_del_limite", texto: "Cerca del límite" },
	{ valor: "detenido", texto: "Detenido" },
];

/**
 * Los tramos de un saldo como segmentos de una barra.
 * @param tramos Los tramos con su etiqueta y su color.
 * @param montos Lo de cada tramo.
 */
function segmentosDe(tramos: Antiguedad["tramos"], montos: readonly { monto_centavos?: number | undefined }[]) {
	return tramos.map((tramo, i) => ({
		etiqueta: `${tramo.etiqueta}: ${montoEnPantalla(montos[i]?.monto_centavos)}`,
		valor: montos[i]?.monto_centavos ?? 0,
		color: tramo.color,
	}));
}

/**
 * Las dos tarjetas de arriba: el saldo por cobrar y lo cobrado por semana.
 * @param props Los datos de la antigüedad.
 */
function Tarjetas({ datos }: { datos: Antiguedad }) {
	const actual = datos.cobrado_por_semana.at(-1);
	const { por_forma } = datos.por_cobrar;
	return (
		<div className="grid grid-cols-2 gap-4 max-menu:grid-cols-1">
			<Panel titulo={`Saldo por cobrar ${montoEnPantalla(datos.por_cobrar.total_centavos)}`}>
				<div className="flex flex-col gap-3">
					<BarraAvance segmentos={segmentosDe(datos.tramos, datos.por_cobrar.por_tramo)} />
					<ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-etiqueta">
						{datos.tramos.map((tramo, i) => (
							<li key={tramo.etiqueta}>
								{tramo.etiqueta}: <b>{montoEnPantalla(datos.por_cobrar.por_tramo[i]?.monto_centavos)}</b>
							</li>
						))}
					</ul>
					<b>Cobranza por forma de recepción</b>
					<ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
						<li>
							Cuenta de la fábrica: <b>{montoEnPantalla(por_forma.fabrica_centavos)}</b>
						</li>
						<li>
							Efectivo: <b>{montoEnPantalla(por_forma.efectivo_centavos)}</b>
						</li>
						<li>
							Cuenta de un tercero: <b>{montoEnPantalla(por_forma.tercero_centavos)}</b>
						</li>
					</ul>
				</div>
			</Panel>
			<Panel
				titulo={`Cobrado por semana ${montoEnPantalla(actual?.monto_centavos)}`}
				derecha={<span className="text-etiqueta text-tinta3">la semana del {actual?.texto ?? ""}</span>}
			>
				<Grafica
					tipo="barras"
					alto={180}
					periodos={datos.cobrado_por_semana.map((semana) =>
						semana.actual ? `${semana.texto} (actual)` : semana.texto,
					)}
					series={[
						{
							clave: "cobrado",
							nombre: "Cobrado",
							color: "verde",
							valores: datos.cobrado_por_semana.map((semana) => semana.monto_centavos ?? 0),
						},
					]}
					formato={(valor) => montoEnPantalla(valor)}
				/>
			</Panel>
		</div>
	);
}

/**
 * El selector del semáforo de un cliente, con el sugerido abajo; tocarlo no abre el cajón.
 * @param props El cliente.
 */
function SelectorDeSemaforo({ cliente }: { cliente: Cliente }) {
	const { enviar, enviando } = useEnvio(cambiarSemaforoCredito);
	const conConexion = useConConexion();
	return (
		<span className="flex flex-col gap-1">
			<Selector
				etiqueta="Semáforo"
				opciones={opcionesDeSemaforo}
				value={cliente.semaforo.clave}
				disabled={!conConexion || enviando}
				onClick={(evento) => evento.stopPropagation()}
				onKeyDown={(evento) => evento.stopPropagation()}
				onChange={(evento) =>
					void enviar({
						datos: { cliente_id: cliente.cliente_id, semaforo: semaforoDeCredito.parse(evento.target.value) },
						version: cliente.version_credito,
					})
				}
			/>
			{cliente.sugerido === null ? null : (
				<span className="text-etiqueta text-tinta3">Sugerido: {cliente.sugerido.texto}</span>
			)}
		</span>
	);
}

/**
 * «Antigüedad de saldos por cliente».
 * @param props Los datos y cómo abrir el cajón de un cliente.
 */
function AntiguedadPorCliente({ datos, alAbrir }: { datos: Antiguedad; alAbrir: (clienteId: string) => void }) {
	const mayor = Math.max(1, ...datos.clientes.map((cliente) => cliente.saldo_centavos ?? 0));
	return (
		<Panel
			titulo="Antigüedad de saldos por cliente"
			derecha={
				<span className="flex flex-wrap gap-3 text-etiqueta text-tinta3">
					{datos.tramos.map((tramo) => (
						<span key={tramo.etiqueta}>{tramo.etiqueta}</span>
					))}
				</span>
			}
		>
			<Tabla
				nombre="Antigüedad de saldos por cliente"
				filas={datos.clientes}
				claveDeFila={(cliente) => cliente.cliente_id}
				alTocarFila={(cliente) => alAbrir(cliente.cliente_id)}
				columnas={[
					{
						clave: "cliente",
						encabezado: "Cliente",
						celda: (cliente) => <DosRenglones arriba={<b>{cliente.nombre}</b>} abajo={cliente.detalle} />,
					},
					{
						clave: "antiguedad",
						encabezado: "Antigüedad",
						celda: (cliente) => (
							<span className="flex min-w-48 flex-col gap-1">
								<span style={{ width: `${Math.round(((cliente.saldo_centavos ?? 0) * 100) / mayor)}%` }}>
									<BarraAvance segmentos={segmentosDe(datos.tramos, cliente.por_tramo)} />
								</span>
								{(cliente.vencido_mas_centavos ?? 0) > 0 ? (
									<TextoConTono tono="rojo">
										{montoEnPantalla(cliente.vencido_mas_centavos)} con más de{" "}
										{datos.tramos.at(-1)?.etiqueta.replace("Más de ", "")} días
									</TextoConTono>
								) : (cliente.vencido_centavos ?? 0) > 0 ? (
									<TextoConTono tono="ambar">{montoEnPantalla(cliente.vencido_centavos)} vencido</TextoConTono>
								) : null}
							</span>
						),
					},
					{
						clave: "saldo",
						encabezado: "Saldo",
						alinear: "derecha",
						celda: (cliente) => <b>{montoEnPantalla(cliente.saldo_centavos)}</b>,
					},
					{
						clave: "limite",
						encabezado: "Límite de crédito",
						celda: (cliente) =>
							cliente.uso_porcentaje === null ? (
								"Sin crédito"
							) : (
								<span className="flex min-w-32 flex-col gap-1">
									<BarraAvance
										segmentos={[
											{
												etiqueta: "Usado",
												valor: Math.min(cliente.uso_porcentaje, 100),
												color: cliente.uso_tono === "verde" ? "verde" : cliente.uso_tono === "ambar" ? "ambar" : "rojo",
											},
											{ etiqueta: "Libre", valor: Math.max(0, 100 - cliente.uso_porcentaje), color: "gris" },
										]}
									/>
									<span className="text-etiqueta">
										{cliente.uso_porcentaje}% de {montoEnPantalla(cliente.limite_centavos)}
									</span>
								</span>
							),
					},
					{ clave: "semaforo", encabezado: "Semáforo", celda: (cliente) => <SelectorDeSemaforo cliente={cliente} /> },
				]}
			/>
		</Panel>
	);
}

/**
 * Un depósito a un tercero por aplicar: su deuda y «Aplicar».
 * @param props El depósito.
 */
function AplicarDeposito({ deposito }: { deposito: Deposito }) {
	const { enviar, enviando } = useEnvio(aplicarDepositoATercero);
	const conConexion = useConConexion();
	const [deuda, setDeuda] = useState(deposito.deudas[0]?.cuenta_por_pagar_id ?? "");
	if (deposito.deudas.length === 0) return <span className="text-tinta3">Sin deuda abierta</span>;
	return (
		<span className="flex flex-wrap items-end gap-2">
			<Selector
				etiqueta="Deuda"
				opciones={deposito.deudas.map((una) => ({
					valor: una.cuenta_por_pagar_id,
					texto: `${una.documento} · ${montoEnPantalla(una.saldo_centavos)}`,
				}))}
				value={deuda}
				onChange={(evento) => setDeuda(evento.target.value)}
			/>
			<Boton
				chico
				variante="principal"
				disabled={!conConexion || enviando || deuda === ""}
				onClick={() =>
					void enviar({ datos: { pago_id: deposito.pago_id, cuenta_por_pagar_id: deuda }, version: deposito.version })
				}
			>
				Aplicar
			</Boton>
		</span>
	);
}

/**
 * «Depósitos a terceros por aplicar».
 * @param props Los depósitos.
 */
function DepositosPorAplicar({ depositos }: { depositos: readonly Deposito[] }) {
	const suma = depositos.reduce((total, deposito) => total + (deposito.queda_centavos ?? 0), 0);
	return (
		<Panel
			titulo="Depósitos a terceros por aplicar"
			derecha={<span className="text-tinta3">{`${depositos.length} · ${montoEnPantalla(suma)}`}</span>}
		>
			<Tabla
				nombre="Depósitos a terceros por aplicar"
				filas={depositos}
				claveDeFila={(deposito) => deposito.pago_id}
				columnas={[
					{
						clave: "pago",
						encabezado: "Pago",
						celda: (deposito) => <DosRenglones arriba={<b>{deposito.folio}</b>} abajo={deposito.detalle_fecha} />,
					},
					{
						clave: "cliente",
						encabezado: "Cliente",
						celda: (deposito) => <DosRenglones arriba={deposito.cliente} abajo={deposito.documento} />,
					},
					{
						clave: "destino",
						encabezado: "Cuenta destino",
						celda: (deposito) => <DosRenglones arriba={deposito.tercero} abajo={deposito.referencia ?? ""} />,
					},
					{
						clave: "monto",
						encabezado: "Monto",
						alinear: "derecha",
						celda: (deposito) => (
							<DosRenglones
								arriba={montoEnPantalla(deposito.monto_centavos)}
								abajo={`quedan ${montoEnPantalla(deposito.queda_centavos)}`}
							/>
						),
					},
					{ clave: "aplicar", encabezado: "Deuda", celda: (deposito) => <AplicarDeposito deposito={deposito} /> },
				]}
			/>
		</Panel>
	);
}

/** «Pagos recibidos», con «Registrar pago», «Mostrar cancelados», «Cancelar pago» y «Ver más». */
function PagosRecibidos() {
	const { busqueda, navegar, abrir } = useDireccionDeContaduria();
	const conConexion = useConConexion();
	const [cancelar, setCancelar] = useState<ACancelar | undefined>(undefined);
	const parametros = busqueda.cancelados === "si" ? { incluir_cancelados: "si" as const } : {};
	const paginas = usePaginas(pagosRecibidos, parametros);
	const pagos = paginas.data?.pages.flatMap((pagina) => pagina.renglones) ?? [];
	return (
		<Panel
			titulo="Pagos recibidos"
			derecha={
				<>
					<Interruptor
						etiqueta="Mostrar cancelados"
						prendido={busqueda.cancelados === "si"}
						alCambiar={(prendido) => navegar({ cancelados: prendido ? "si" : undefined })}
					/>
					<Boton chico icono={Plus} disabled={!conConexion} onClick={() => abrir("registrar_pago")}>
						Registrar pago
					</Boton>
				</>
			}
		>
			{paginas.isPending ? (
				<EstadoDePantalla tipo="cargando" renglones={4} />
			) : paginas.isError ? (
				<EstadoDePantalla tipo="error" alReintentar={() => void paginas.refetch()} />
			) : pagos.length === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Sin pagos registrados" />
			) : (
				<div className="flex flex-col gap-3">
					<Tabla
						nombre="Pagos recibidos"
						filas={pagos}
						claveDeFila={(pago) => pago.pago_id}
						columnas={[
							{
								clave: "pago",
								encabezado: "Pago",
								celda: (pago) => <b className={pago.cancelado ? "line-through" : ""}>{pago.folio}</b>,
							},
							{ clave: "fecha", encabezado: "Fecha", celda: (pago) => pago.fecha_texto },
							{ clave: "cliente", encabezado: "Cliente", celda: (pago) => pago.cliente },
							{ clave: "documento", encabezado: "Documento", celda: (pago) => pago.documento },
							{
								clave: "donde",
								encabezado: "Dónde se recibió",
								celda: (pago) => (
									<DosRenglones
										arriba={pago.donde}
										abajo={
											<>
												{pago.referencia ?? ""}
												{pago.aplicado === null ? null : (
													<TextoConTono tono={pago.aplicado.ambar ? "ambar" : "normal"}>
														{" "}
														· {pago.aplicado.texto}
													</TextoConTono>
												)}
											</>
										}
									/>
								),
							},
							{
								clave: "monto",
								encabezado: "Monto",
								alinear: "derecha",
								celda: (pago) => (
									<b className={pago.cancelado ? "line-through" : ""}>{montoEnPantalla(pago.monto_centavos)}</b>
								),
							},
							{ clave: "registro", encabezado: "Registró", celda: (pago) => pago.registro },
							{
								clave: "cancelar",
								encabezado: "",
								celda: (pago) =>
									pago.cancelado ? (
										<Estado texto="Cancelado" />
									) : (
										<Boton
											chico
											variante="peligro"
											disabled={!conConexion}
											onClick={() =>
												setCancelar({ tipo: "pago", id: pago.pago_id, version: pago.version, folio: pago.folio })
											}
										>
											Cancelar pago
										</Boton>
									),
							},
						]}
					/>
					{paginas.hasNextPage ? (
						<Boton chico variante="secundario" onClick={() => void paginas.fetchNextPage()}>
							Ver más
						</Boton>
					) : null}
				</div>
			)}
			{cancelar === undefined ? null : <VentanaCancelar cancelar={cancelar} alCerrar={() => setCancelar(undefined)} />}
		</Panel>
	);
}

/** La pestaña Cuentas por cobrar. */
export function PestanaCuentasPorCobrar() {
	const { abrir } = useDireccionDeContaduria();
	const router = useRouter();
	const consulta = useConsulta(antiguedadSaldos, {});
	return (
		<>
			<SegunConsulta consulta={consulta} renglones={8}>
				{(datos) => (
					<>
						<Tarjetas datos={datos} />
						<AntiguedadPorCliente datos={datos} alAbrir={(clienteId) => abrir("cliente", clienteId)} />
						{datos.depositos.length === 0 ? null : <DepositosPorAplicar depositos={datos.depositos} />}
						{datos.saldos_a_favor.length === 0 ? null : (
							<Panel titulo="Saldos a favor">
								<Tabla
									nombre="Saldos a favor"
									filas={datos.saldos_a_favor}
									claveDeFila={(saldo) => saldo.cliente_id}
									alTocarFila={(saldo) => abrir("cliente", saldo.cliente_id)}
									columnas={[
										{ clave: "cliente", encabezado: "Cliente", celda: (saldo) => saldo.nombre },
										{
											clave: "monto",
											encabezado: "A favor",
											alinear: "derecha",
											celda: (saldo) => montoEnPantalla(saldo.monto_centavos),
										},
									]}
								/>
							</Panel>
						)}
					</>
				)}
			</SegunConsulta>
			<PagosRecibidos />
			{consulta.data === undefined || consulta.data.anticipos.length === 0 ? null : (
				<Panel titulo="Anticipos de pedidos">
					<Tabla
						nombre="Anticipos de pedidos"
						filas={consulta.data.anticipos}
						claveDeFila={(anticipo) => anticipo.pedido_id}
						alTocarFila={(anticipo) => router.history.push(`/ventas/pedidos?cajon=pedido&id=${anticipo.pedido_id}`)}
						columnas={[
							{ clave: "pedido", encabezado: "Pedido", celda: (anticipo) => <b>{anticipo.folio}</b> },
							{ clave: "cliente", encabezado: "Cliente", celda: (anticipo) => anticipo.cliente },
							{
								clave: "estado",
								encabezado: "Estado del pedido",
								celda: (anticipo) => <Estado texto={anticipo.estado.texto} color={anticipo.estado.color} />,
							},
							{
								clave: "anticipo",
								encabezado: "Anticipo",
								alinear: "derecha",
								celda: (anticipo) => montoEnPantalla(anticipo.anticipo_centavos),
							},
							{
								clave: "aplicado",
								encabezado: "Aplicado a notas",
								alinear: "derecha",
								celda: (anticipo) => montoEnPantalla(anticipo.aplicado_centavos),
							},
							{
								clave: "total",
								encabezado: "Total del pedido",
								alinear: "derecha",
								celda: (anticipo) => montoEnPantalla(anticipo.total_centavos),
							},
						]}
					/>
				</Panel>
			)}
		</>
	);
}
