/**
 * La pestaña Cuentas por pagar: los pagos programados por semana, los pagos detenidos con sus tres puntas, el
 * calendario (vencidos, próximos días y posteriores) y las facturas de proveedor.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Cuentas por pagar»)
 *
 * «Pagar» abre la ventana Pagar; «Pagar lo recibido» llama a `contaduria.pedir_pago_lo_recibido`; «Cancelar factura»
 * y «Llegó su nota de crédito», sus ventanas; «Capturar factura» abre su ventana por la dirección, como la abre Compras.
 */

import {
	conciliacionFacturasDeContaduria,
	cuentasPorPagarDeContaduria,
} from "@uniformame/compartido/contratos/contaduria/consultas-pagar";
import { pedirPagoLoRecibido } from "@uniformame/compartido/contratos/contaduria/por-pagar";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Tarjeta } from "@uniformame/interfaz/contenedores/tarjeta";
import { puntoDelEstado } from "@uniformame/interfaz/estados/colores";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Grafica } from "@uniformame/interfaz/graficas/grafica";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { usePaginas } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunPaginas } from "../../../comun/segun-paginas.tsx";
import type { CuentaDeLaFabrica } from "../comun.tsx";
import { useDireccionDeContaduria } from "../direccion.ts";
import { useEnvio } from "../envio.ts";
import { type ACancelar, VentanaCancelar } from "../ventanas/cancelar.tsx";
import { VentanaNotaCreditoProveedor } from "../ventanas/nota-credito.tsx";
import { type CuentaAPagar, VentanaPagar } from "../ventanas/pagar.tsx";

/** Lo que da la consulta. */
type PorPagar = z.infer<typeof cuentasPorPagarDeContaduria.resultado>;
/** Un renglón del calendario. */
type RenglonDelCalendario = PorPagar["vencidos"]["renglones"][number];
/** Una tarjeta de Pagos detenidos. */
type Detenido = PorPagar["pagos_detenidos"][number];
/** Un renglón de Facturas de proveedor. */
type Factura = z.infer<typeof conciliacionFacturasDeContaduria.resultado>["renglones"][number];
/** Una punta (orden, recepción o factura). */
type Punta = Factura["puntas"]["orden"];

/** El color de cada punta: verde lo que cuadra, rojo lo que no, gris lo que falta. */
const colorDePunta = { coincide: "verde", no_coincide: "rojo", falta: "gris" } as const;

/**
 * Una punta con su punto de color.
 * @param props La punta.
 */
function PuntoDePunta({ punta }: { punta: Punta }) {
	return (
		<span className="flex items-center gap-2">
			<span
				aria-hidden="true"
				className={`size-2 flex-none rounded-full ${puntoDelEstado[colorDePunta[punta.como]]}`}
			/>
			<span>{punta.texto}</span>
		</span>
	);
}

/**
 * Una tarjeta de Pagos detenidos: el proveedor y el saldo, el documento, las tres puntas por orden, el motivo, quién
 * responde y sus botones.
 * @param props La factura detenida, y qué hacer al cancelarla.
 */
function TarjetaDetenida({ detenida, alCancelar }: { detenida: Detenido; alCancelar: (cancelar: ACancelar) => void }) {
	const { enviar, enviando } = useEnvio(pedirPagoLoRecibido);
	const conConexion = useConConexion();
	return (
		<Tarjeta nombre={detenida.documento} orilla="rojo">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<b className="text-subtitulo">{detenida.proveedor}</b>
				<b className="tabular-nums">{montoEnPantalla(detenida.saldo_centavos)}</b>
			</div>
			<span className="text-tinta3">{detenida.documento}</span>
			{detenida.ordenes.map((orden) => (
				<div key={orden.folio} className="flex flex-wrap items-center gap-2">
					<b>{orden.folio}</b>
					<Estado texto={orden.puntas.orden.texto} color={colorDePunta[orden.puntas.orden.como]} />
					<ArrowRight aria-hidden="true" size={17} />
					<Estado texto={orden.puntas.recepcion.texto} color={colorDePunta[orden.puntas.recepcion.como]} />
					<ArrowRight aria-hidden="true" size={17} />
					<Estado texto={orden.puntas.factura.texto} color={colorDePunta[orden.puntas.factura.como]} />
				</div>
			))}
			<span>{detenida.motivo}</span>
			<span className="text-tinta3">
				Responsable: {detenida.responsable === "contaduria" ? "Contaduría" : "Aduana"}
			</span>
			<div className="flex flex-wrap gap-2">
				{detenida.autorizacion !== null ? (
					<TextoConTono tono="ambar">Esperando autorización de Dirección · {detenida.autorizacion}</TextoConTono>
				) : detenida.responsable === "contaduria" ? (
					<Boton
						chico
						variante="principal"
						disabled={!conConexion || enviando}
						onClick={() =>
							void enviar({
								datos: { factura_proveedor_id: detenida.factura_proveedor_id },
								version: detenida.version,
							})
						}
					>
						Pagar lo recibido
					</Boton>
				) : null}
				{detenida.cancelable ? (
					<Boton
						chico
						variante="peligro"
						disabled={!conConexion}
						onClick={() =>
							alCancelar({
								tipo: "factura",
								id: detenida.factura_proveedor_id,
								version: detenida.version,
								folio: detenida.folio,
							})
						}
					>
						Cancelar factura
					</Boton>
				) : null}
			</div>
		</Tarjeta>
	);
}

/**
 * Un grupo del calendario: su título con «{n} · {suma}» y su tabla.
 * @param props Su título, su grupo, si el vencimiento va en rojo y qué hacer al pagar.
 */
function GrupoDelCalendario({
	titulo,
	grupo,
	renglones,
	rojo,
	alPagar,
}: {
	titulo: string;
	grupo: { cuantos: number; suma_centavos?: number | undefined };
	renglones: readonly RenglonDelCalendario[];
	rojo: boolean;
	alPagar: (renglon: RenglonDelCalendario) => void;
}) {
	const conConexion = useConConexion();
	return (
		<Seccion titulo={titulo} nota={`${grupo.cuantos} · ${montoEnPantalla(grupo.suma_centavos)}`}>
			{renglones.length === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Sin pagos" bien />
			) : (
				<Tabla
					nombre={titulo}
					filas={renglones}
					claveDeFila={(renglon) => renglon.cuenta_por_pagar_id}
					columnas={[
						{
							clave: "beneficiario",
							encabezado: "Beneficiario",
							celda: (renglon) => (
								<DosRenglones
									arriba={<b>{renglon.beneficiario}</b>}
									abajo={renglon.tipo === "proveedor" ? "Proveedor" : "Acreedor"}
								/>
							),
						},
						{
							clave: "documento",
							encabezado: "Documento",
							celda: (renglon) => <DosRenglones arriba={renglon.documento} abajo={renglon.abajo ?? undefined} />,
						},
						{
							clave: "vence",
							encabezado: "Vencimiento",
							celda: (renglon) => <DosRenglones arriba={renglon.vence_texto} rojo={rojo} />,
						},
						{
							clave: "saldo",
							encabezado: "Saldo",
							alinear: "derecha",
							celda: (renglon) => <b>{montoEnPantalla(renglon.saldo_centavos)}</b>,
						},
						{
							clave: "pagar",
							encabezado: "",
							celda: (renglon) => (
								<Boton
									chico
									variante={rojo ? "principal" : "secundario"}
									disabled={!conConexion}
									onClick={() => alPagar(renglon)}
								>
									Pagar
								</Boton>
							),
						},
					]}
				/>
			)}
		</Seccion>
	);
}

/**
 * «Facturas de proveedor», con «Capturar factura», «Cancelar factura» y «Llegó su nota de crédito».
 * @param props Qué hacer al cancelar una factura.
 */
function FacturasDeProveedor({ alCancelar }: { alCancelar: (cancelar: ACancelar) => void }) {
	const { navegar } = useDireccionDeContaduria();
	const conConexion = useConConexion();
	const [notaCredito, setNotaCredito] = useState<Factura | undefined>(undefined);
	const paginas = usePaginas(conciliacionFacturasDeContaduria, {});
	return (
		<Panel
			titulo="Facturas de proveedor"
			derecha={
				<Boton chico icono={Plus} disabled={!conConexion} onClick={() => navegar({ ventana: "capturar_factura" })}>
					Capturar factura
				</Boton>
			}
		>
			<SegunPaginas paginas={paginas} renglones={4}>
				{({ todas, verMas }) => {
					const facturas = todas.flatMap((pagina) => pagina.renglones);
					return facturas.length === 0 ? (
						<EstadoDePantalla tipo="vacio" texto="Sin facturas de proveedor" />
					) : (
						<div className="flex flex-col gap-3">
							<Tabla
								nombre="Facturas de proveedor"
								filas={facturas}
								claveDeFila={(factura) => factura.clave}
								columnas={[
									{
										clave: "factura",
										encabezado: "Factura",
										celda: (factura) => (
											<DosRenglones
												arriba={
													<b>{factura.folio === null ? "—" : `${factura.folio} · ${factura.folio_proveedor ?? ""}`}</b>
												}
												abajo={factura.ordenes}
											/>
										),
									},
									{
										clave: "proveedor",
										encabezado: "Proveedor",
										celda: (factura) => (
											<DosRenglones
												arriba={factura.proveedor}
												abajo={
													factura.motivo === null ? undefined : (
														<TextoConTono tono="rojo">{factura.motivo}</TextoConTono>
													)
												}
											/>
										),
									},
									{
										clave: "orden",
										encabezado: "Orden",
										celda: (factura) => <PuntoDePunta punta={factura.puntas.orden} />,
									},
									{
										clave: "recepcion",
										encabezado: "Recepción",
										celda: (factura) => <PuntoDePunta punta={factura.puntas.recepcion} />,
									},
									{
										clave: "punta_factura",
										encabezado: "Factura",
										celda: (factura) => <PuntoDePunta punta={factura.puntas.factura} />,
									},
									{
										clave: "total",
										encabezado: "Total",
										alinear: "derecha",
										celda: (factura) => montoEnPantalla(factura.total_centavos),
									},
									{
										clave: "estado",
										encabezado: "Estado",
										celda: (factura) => (
											<span className="flex flex-col gap-1">
												<Estado texto={factura.estado.texto} color={factura.estado.color} />
												{factura.autorizada === null ? null : factura.autorizada.aclarada_con !== null ? (
													<span className="text-etiqueta">Aclarada con {factura.autorizada.aclarada_con}</span>
												) : (
													<>
														<span className="text-etiqueta">
															Se paga {montoEnPantalla(factura.autorizada.monto_autorizado_centavos)} ·{" "}
															{montoEnPantalla(factura.autorizada.diferencia_centavos)} por aclarar con el proveedor
														</span>
														<Boton
															chico
															variante="secundario"
															disabled={!conConexion}
															onClick={() => setNotaCredito(factura)}
														>
															Llegó su nota de crédito
														</Boton>
													</>
												)}
											</span>
										),
									},
									{
										clave: "cancelar",
										encabezado: "",
										celda: (factura) =>
											factura.cancelable && factura.factura_proveedor_id !== null ? (
												<Boton
													chico
													variante="peligro"
													disabled={!conConexion}
													onClick={() =>
														alCancelar({
															tipo: "factura",
															id: factura.factura_proveedor_id ?? "",
															version: factura.version ?? 0,
															folio: factura.folio ?? "",
														})
													}
												>
													Cancelar factura
												</Boton>
											) : null,
									},
								]}
							/>
							{verMas}
						</div>
					);
				}}
			</SegunPaginas>
			{notaCredito === undefined ? null : (
				<VentanaNotaCreditoProveedor factura={notaCredito} alCerrar={() => setNotaCredito(undefined)} />
			)}
		</Panel>
	);
}

/**
 * Lo que necesita la ventana Pagar de un renglón del calendario.
 * @param renglon El renglón.
 */
function aPagar(renglon: RenglonDelCalendario): CuentaAPagar {
	return {
		id: renglon.cuenta_por_pagar_id,
		version: renglon.version,
		beneficiario: renglon.beneficiario,
		documento: renglon.documento,
		vence: renglon.vence_texto,
		saldoCentavos: renglon.saldo_centavos,
	};
}

/** La pestaña Cuentas por pagar. */
export function PestanaCuentasPorPagar() {
	const [pagar, setPagar] = useState<CuentaAPagar | undefined>(undefined);
	const [cancelar, setCancelar] = useState<ACancelar | undefined>(undefined);
	const paginas = usePaginas(cuentasPorPagarDeContaduria, {}, { siguiente: (pagina) => pagina.posteriores.cursor });
	const cuentasFabrica: readonly CuentaDeLaFabrica[] = paginas.data?.pages[0]?.cuentas_fabrica ?? [];
	return (
		<>
			<SegunPaginas paginas={paginas} renglones={8}>
				{({ primera: datos, todas, verMas }) => (
					<>
						<Panel
							titulo={`Pagos programados por semana ${montoEnPantalla(datos.total_centavos)}`}
							derecha={
								<span className="text-tinta3">
									sin incluir {datos.detenidas} {datos.detenidas === 1 ? "detenido" : "detenidos"}
								</span>
							}
						>
							<Grafica
								tipo="barras"
								alto={200}
								periodos={datos.por_semana.map((semana) => semana.etiqueta)}
								series={[
									{
										clave: "proveedores",
										nombre: "Proveedores",
										color: "pizarra",
										valores: datos.por_semana.map((semana) => semana.proveedores_centavos ?? 0),
									},
									{
										clave: "acreedores",
										nombre: "Acreedores",
										color: "azul",
										valores: datos.por_semana.map((semana) => semana.acreedores_centavos ?? 0),
									},
								]}
								formato={(valor) => montoEnPantalla(valor)}
							/>
						</Panel>
						{datos.pagos_detenidos.length === 0 ? null : (
							<Seccion titulo="Pagos detenidos" nota="Orden, recepción y factura no coinciden">
								<div className="grid grid-cols-2 gap-4 max-menu:grid-cols-1">
									{datos.pagos_detenidos.map((detenida) => (
										<TarjetaDetenida key={detenida.factura_proveedor_id} detenida={detenida} alCancelar={setCancelar} />
									))}
								</div>
							</Seccion>
						)}
						<Panel titulo="Calendario de pagos">
							<div className="flex flex-col gap-5">
								<GrupoDelCalendario
									titulo="Vencidos"
									grupo={datos.vencidos}
									renglones={datos.vencidos.renglones}
									rojo
									alPagar={(renglon) => setPagar(aPagar(renglon))}
								/>
								<GrupoDelCalendario
									titulo={`Vencen en los próximos ${datos.ventana_dias} días`}
									grupo={datos.proximos}
									renglones={datos.proximos.renglones}
									rojo={false}
									alPagar={(renglon) => setPagar(aPagar(renglon))}
								/>
								<GrupoDelCalendario
									titulo="Posteriores"
									grupo={datos.posteriores}
									renglones={todas.flatMap((pagina) => pagina.posteriores.renglones)}
									rojo={false}
									alPagar={(renglon) => setPagar(aPagar(renglon))}
								/>
								{verMas}
							</div>
						</Panel>
					</>
				)}
			</SegunPaginas>
			<FacturasDeProveedor alCancelar={setCancelar} />
			{pagar === undefined ? null : (
				<VentanaPagar cuenta={pagar} cuentasFabrica={cuentasFabrica} alCerrar={() => setPagar(undefined)} />
			)}
			{cancelar === undefined ? null : <VentanaCancelar cancelar={cancelar} alCerrar={() => setCancelar(undefined)} />}
		</>
	);
}
