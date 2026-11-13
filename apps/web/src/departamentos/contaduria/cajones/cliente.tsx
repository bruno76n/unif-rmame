/**
 * El cajón del cliente (ancho): los botones con cifra (sus pedidos abiertos en Ventas, sus notas con saldo, sus pagos y
 * lo que le debemos, que abre su ficha de tercero), lo que nos debe con su crédito y su semáforo, sus notas con saldo,
 * sus pagos con «Cancelar pago» y su saldo a favor con «Aplicar» y «Devolver». El pie lleva «Cambiar límite» y
 * «Registrar pago». Abrirlo queda en la bitácora.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («El cliente (ancho)»)
 */

import { useRouter } from "@tanstack/react-router";
import { armazon } from "@uniformame/compartido/contratos/admin/armazon";
import { clienteDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-cobrar";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { BotonConCifra } from "@uniformame/interfaz/botones/boton-con-cifra";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { CreditCard, Receipt, Table, Wallet } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { RenglonDeLista } from "../comun.tsx";
import { useDireccionDeContaduria } from "../direccion.ts";
import { VentanaAplicarSaldoAFavor } from "../ventanas/aplicar-saldo-favor.tsx";
import { type ACancelar, VentanaCancelar } from "../ventanas/cancelar.tsx";
import { VentanaDevolverSaldoAFavor } from "../ventanas/devolver-saldo-favor.tsx";
import { VentanaLimiteCredito } from "../ventanas/limite-credito.tsx";

/** Lo que da la consulta. */
type Cliente = z.infer<typeof clienteDeContaduria.resultado>;

/** El color de cada semáforo. */
const colorDeSemaforo = { al_corriente: "verde", cerca_del_limite: "ambar", detenido: "rojo" } as const;

/** La ventana abierta desde el cajón. */
type VentanaAbierta = "limite" | "aplicar" | "devolver" | ACancelar;

/**
 * El cuerpo del cajón del cliente.
 * @param props El cliente y cómo abrir una ventana.
 */
function CuerpoDeCliente({ cliente, alAbrir }: { cliente: Cliente; alAbrir: (ventana: VentanaAbierta) => void }) {
	const conConexion = useConConexion();
	const conSaldoAFavor = (cliente.saldo_favor_centavos ?? 0) > 0 || cliente.movimientos_a_favor.length > 0;
	return (
		<div className="flex flex-col gap-5">
			<section className="grid grid-cols-4 gap-4 max-telefono:grid-cols-2">
				<Dato etiqueta="Por cobrar">
					<b>{montoEnPantalla(cliente.nos_debe_centavos)}</b>
				</Dato>
				<Dato etiqueta="Límite de crédito">
					{cliente.limite_centavos === 0
						? "Sin crédito"
						: `${montoEnPantalla(cliente.limite_centavos)} · ${cliente.dias_credito} días`}
				</Dato>
				<Dato etiqueta="Semáforo">
					<span className="flex flex-col gap-1">
						<Estado texto={cliente.semaforo.texto} color={colorDeSemaforo[cliente.semaforo.clave]} />
						{cliente.sugerido === null ? null : (
							<span className="text-etiqueta text-tinta3">Sugerido: {cliente.sugerido.texto}</span>
						)}
					</span>
				</Dato>
				<Dato etiqueta="Saldo a favor">{montoEnPantalla(cliente.saldo_favor_centavos)}</Dato>
			</section>
			<section className="flex flex-col gap-3">
				<TituloDeBloque titulo="Notas con saldo" />
				{cliente.notas.length === 0 ? (
					<EstadoDePantalla tipo="vacio" texto="Sin saldo" bien />
				) : (
					<Tabla
						nombre="Notas con saldo"
						filas={cliente.notas}
						claveDeFila={(nota) => nota.nota_entrega_id}
						columnas={[
							{ clave: "nota", encabezado: "Nota", celda: (nota) => <b>{nota.folio}</b> },
							{ clave: "entregada", encabezado: "Entregada", celda: (nota) => nota.entregada },
							{
								clave: "vence",
								encabezado: "Vence",
								celda: (nota) => (
									<TextoConTono tono={nota.vence.tono === "rojo" ? "rojo" : "normal"}>
										{nota.vence.cuando === "hoy" ? "hoy" : `${nota.vence.texto} · ${nota.vence.cuando}`}
									</TextoConTono>
								),
							},
							{
								clave: "saldo",
								encabezado: "Saldo",
								alinear: "derecha",
								celda: (nota) => <b>{montoEnPantalla(nota.saldo_centavos)}</b>,
							},
						]}
					/>
				)}
			</section>
			<section className="flex flex-col gap-2">
				<TituloDeBloque titulo="Pagos" />
				{cliente.pagos.length === 0 ? (
					<EstadoDePantalla tipo="vacio" texto="Sin pagos registrados" />
				) : (
					<ul className="m-0 list-none p-0">
						{cliente.pagos.map((pago) => (
							<RenglonDeLista
								key={pago.pago_id}
								tachado={pago.cancelado}
								texto={`${pago.fecha} · ${pago.folio}`}
								detalle={pago.detalle}
								monto={pago.monto_centavos}
								derecha={
									pago.cancelado ? null : (
										<Boton
											chico
											variante="peligro"
											disabled={!conConexion}
											onClick={() =>
												alAbrir({ tipo: "pago", id: pago.pago_id, version: pago.version, folio: pago.folio })
											}
										>
											Cancelar pago
										</Boton>
									)
								}
							/>
						))}
					</ul>
				)}
			</section>
			{conSaldoAFavor ? (
				<section className="flex flex-col gap-2">
					<TituloDeBloque titulo="Saldo a favor" detalle={montoEnPantalla(cliente.saldo_favor_centavos)} />
					<ul className="m-0 list-none p-0">
						{cliente.movimientos_a_favor.map((movimiento) => (
							<RenglonDeLista
								key={`${movimiento.fecha}-${movimiento.texto}-${movimiento.monto_centavos ?? ""}`}
								texto={movimiento.texto}
								detalle={movimiento.fecha}
								monto={movimiento.monto_centavos}
							/>
						))}
					</ul>
					{(cliente.saldo_favor_centavos ?? 0) > 0 ? (
						<span className="flex gap-2">
							<Boton chico disabled={!conConexion} onClick={() => alAbrir("aplicar")}>
								Aplicar
							</Boton>
							<Boton chico variante="secundario" disabled={!conConexion} onClick={() => alAbrir("devolver")}>
								Devolver
							</Boton>
						</span>
					) : null}
				</section>
			) : null}
			<span className="text-etiqueta text-tinta3">Consultas de este saldo quedan en la bitácora</span>
		</div>
	);
}

/**
 * El cajón del cliente.
 * @param props El cliente y qué hacer al cerrar.
 */
export function CajonCliente({ clienteId, alCerrar }: { clienteId: string; alCerrar: () => void }) {
	const consulta = useConsulta(clienteDeContaduria, { cliente_id: clienteId });
	const delArmazon = useConsulta(armazon, {});
	const { abrir } = useDireccionDeContaduria();
	const router = useRouter();
	const conConexion = useConConexion();
	const [ventana, setVentana] = useState<VentanaAbierta | undefined>(undefined);
	const cliente = consulta.data;
	const tieneVentas =
		delArmazon.data !== undefined &&
		(delArmazon.data.cuenta.es_duena || delArmazon.data.departamentos.some((uno) => uno.clave === "ventas"));
	const leDebemos = cliente?.le_debemos_centavos ?? 0;
	return (
		<>
			<Cajon
				abierto
				ancho
				alCerrar={alCerrar}
				titulo={cliente?.nombre ?? ""}
				{...(cliente === undefined ? {} : { contexto: cliente.contexto })}
				relacionados={
					cliente === undefined ? undefined : (
						<>
							<BotonConCifra
								cifra={cliente.pedidos_abiertos}
								texto={cliente.pedidos_abiertos === 1 ? "pedido abierto" : "pedidos abiertos"}
								icono={Table}
								alTocar={tieneVentas ? () => router.history.push(`/ventas/pedidos?de_cliente=${clienteId}`) : undefined}
							/>
							<BotonConCifra
								cifra={cliente.notas_con_saldo}
								texto={cliente.notas_con_saldo === 1 ? "nota con saldo" : "notas con saldo"}
								icono={Receipt}
							/>
							<BotonConCifra
								cifra={cliente.pagos_registrados}
								texto={cliente.pagos_registrados === 1 ? "pago registrado" : "pagos registrados"}
								icono={CreditCard}
							/>
							<BotonConCifra
								texto={leDebemos > 0 ? `${montoEnPantalla(leDebemos)} por pagar` : "—"}
								icono={Wallet}
								alTocar={leDebemos > 0 ? () => abrir("tercero", cliente.tercero_id) : undefined}
							/>
						</>
					)
				}
				pieIzquierda={
					<span className="flex gap-2">
						<Boton variante="fantasma" onClick={alCerrar}>
							Cerrar
						</Boton>
						<Boton
							variante="secundario"
							disabled={!conConexion || cliente === undefined}
							onClick={() => setVentana("limite")}
						>
							Cambiar límite
						</Boton>
					</span>
				}
				accion={
					<Boton variante="principal" disabled={!conConexion} onClick={() => abrir("registrar_pago", clienteId)}>
						Registrar pago
					</Boton>
				}
			>
				<SegunConsulta consulta={consulta} renglones={8}>
					{(datos) => <CuerpoDeCliente cliente={datos} alAbrir={setVentana} />}
				</SegunConsulta>
			</Cajon>
			{cliente === undefined || ventana === undefined ? null : ventana === "limite" ? (
				<VentanaLimiteCredito cliente={cliente} alCerrar={() => setVentana(undefined)} />
			) : ventana === "aplicar" ? (
				<VentanaAplicarSaldoAFavor cliente={cliente} alCerrar={() => setVentana(undefined)} />
			) : ventana === "devolver" ? (
				<VentanaDevolverSaldoAFavor cliente={cliente} alCerrar={() => setVentana(undefined)} />
			) : (
				<VentanaCancelar cancelar={ventana} alCerrar={() => setVentana(undefined)} />
			)}
		</>
	);
}
