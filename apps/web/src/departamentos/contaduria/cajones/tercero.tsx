/**
 * El cajón del tercero (ancho): su relación y su nombre; lo que nos debe, lo que le debemos y el saldo neto; sus notas,
 * lo que le debemos, sus deudas con «Cancelar deuda», los pagos a su cuenta y sus compensaciones con «Cancelar». El pie
 * lleva «Compensar» (si nos debe y le debemos) y «Registrar pago» (si nos debe). Abrirlo queda en la bitácora.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («El tercero (ancho)»)
 */

import { terceroDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-terceros";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { RenglonDeLista } from "../comun.tsx";
import { useDireccionDeContaduria } from "../direccion.ts";
import { Compensaciones, SaldoNeto } from "../pestanas/terceros.tsx";
import { type ACancelar, VentanaCancelar } from "../ventanas/cancelar.tsx";
import { VentanaCompensar } from "../ventanas/compensar.tsx";

/** Lo que da la consulta. */
type Tercero = z.infer<typeof terceroDeContaduria.resultado>;

/**
 * El cuerpo del cajón del tercero.
 * @param props El tercero y qué hacer al cancelar algo.
 */
function CuerpoDeTercero({ tercero, alCancelar }: { tercero: Tercero; alCancelar: (cancelar: ACancelar) => void }) {
	const conConexion = useConConexion();
	return (
		<div className="flex flex-col gap-5">
			<section className="grid grid-cols-3 gap-4 max-telefono:grid-cols-1">
				<Dato etiqueta="Nos debe">
					<b>{montoEnPantalla(tercero.nos_debe_centavos)}</b>
				</Dato>
				<Dato etiqueta="Le debemos">
					<b>{montoEnPantalla(tercero.le_debemos_centavos)}</b>
				</Dato>
				<Dato etiqueta="Saldo neto">
					<SaldoNeto neto={tercero.neto} />
				</Dato>
			</section>
			{tercero.nos_debe.length === 0 ? null : (
				<section className="flex flex-col gap-2">
					<TituloDeBloque titulo="Nos debe" />
					<ul className="m-0 list-none p-0">
						{tercero.nos_debe.map((nota) => (
							<RenglonDeLista
								key={nota.folio}
								texto={nota.folio}
								detalle={<TextoConTono tono={nota.vencida ? "rojo" : "normal"}>vence {nota.vence}</TextoConTono>}
								monto={nota.saldo_centavos}
							/>
						))}
					</ul>
				</section>
			)}
			{tercero.le_debemos.length === 0 ? null : (
				<section className="flex flex-col gap-2">
					<TituloDeBloque titulo="Le debemos" />
					<ul className="m-0 list-none p-0">
						{tercero.le_debemos.map((cuenta) => (
							<RenglonDeLista
								key={cuenta.documento}
								texto={
									cuenta.prestamo_total_centavos === undefined
										? cuenta.documento
										: `${cuenta.documento} · saldo total del préstamo ${montoEnPantalla(cuenta.prestamo_total_centavos)}`
								}
								detalle={<TextoConTono tono={cuenta.vencida ? "rojo" : "normal"}>vence {cuenta.vence}</TextoConTono>}
								monto={cuenta.saldo_centavos}
								derecha={cuenta.detenida ? <Estado texto="Detenida" color="rojo" /> : null}
							/>
						))}
					</ul>
				</section>
			)}
			{tercero.deudas.length === 0 ? null : (
				<section className="flex flex-col gap-2">
					<TituloDeBloque titulo="Deudas" />
					<ul className="m-0 list-none p-0">
						{tercero.deudas.map((deuda) => (
							<RenglonDeLista
								key={deuda.deuda_id}
								texto={`${deuda.folio} · ${deuda.descripcion}`}
								detalle={deuda.mensualidades}
								derecha={
									<span className="flex items-center gap-2">
										<Estado texto={deuda.estado.texto} color={deuda.estado.color} />
										{deuda.cancelable ? (
											<Boton
												chico
												variante="peligro"
												disabled={!conConexion}
												onClick={() =>
													alCancelar({ tipo: "deuda", id: deuda.deuda_id, version: deuda.version, folio: deuda.folio })
												}
											>
												Cancelar deuda
											</Boton>
										) : null}
									</span>
								}
							/>
						))}
					</ul>
				</section>
			)}
			{tercero.pagos_a_su_cuenta.length === 0 ? null : (
				<section className="flex flex-col gap-2">
					<TituloDeBloque titulo="Pagos a su cuenta" />
					<ul className="m-0 list-none p-0">
						{tercero.pagos_a_su_cuenta.map((pago) => (
							<RenglonDeLista
								key={pago.pago_id}
								texto={pago.texto}
								detalle={
									(pago.a_favor_centavos ?? 0) > 0 && pago.aplicado !== "sin aplicar"
										? `${pago.aplicado} · ${montoEnPantalla(pago.a_favor_centavos)} a favor`
										: pago.aplicado
								}
								monto={pago.monto_centavos}
							/>
						))}
					</ul>
				</section>
			)}
			{tercero.compensaciones.length === 0 ? null : (
				<section className="flex flex-col gap-2">
					<TituloDeBloque titulo="Compensaciones" />
					<Compensaciones compensaciones={tercero.compensaciones} alCancelar={alCancelar} />
				</section>
			)}
			{tercero.nos_debe.length + tercero.le_debemos.length + tercero.deudas.length === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Saldado" bien />
			) : null}
			<span className="text-etiqueta text-tinta3">Consultas de esta ficha quedan en la bitácora</span>
		</div>
	);
}

/**
 * El cajón del tercero.
 * @param props El tercero y qué hacer al cerrar.
 */
export function CajonTercero({ terceroId, alCerrar }: { terceroId: string; alCerrar: () => void }) {
	const consulta = useConsulta(terceroDeContaduria, { tercero_id: terceroId });
	const { abrir } = useDireccionDeContaduria();
	const conConexion = useConConexion();
	const [compensar, setCompensar] = useState(false);
	const [cancelar, setCancelar] = useState<ACancelar | undefined>(undefined);
	const tercero = consulta.data;
	const nosDebe = (tercero?.nos_debe_centavos ?? 0) > 0;
	const sePuedeCompensar = nosDebe && (tercero?.maximo_compensar_centavos ?? 0) > 0;
	return (
		<>
			<Cajon
				abierto
				ancho
				alCerrar={alCerrar}
				titulo={tercero?.nombre ?? ""}
				{...(tercero === undefined ? {} : { contexto: tercero.relacion })}
				pieIzquierda={
					<span className="flex gap-2">
						<Boton variante="fantasma" onClick={alCerrar}>
							Cerrar
						</Boton>
						{sePuedeCompensar ? (
							<Boton variante="secundario" disabled={!conConexion} onClick={() => setCompensar(true)}>
								Compensar
							</Boton>
						) : null}
					</span>
				}
				accion={
					nosDebe && tercero?.cliente_id != null ? (
						<Boton
							variante="principal"
							disabled={!conConexion}
							onClick={() => abrir("registrar_pago", tercero.cliente_id ?? undefined)}
						>
							Registrar pago
						</Boton>
					) : undefined
				}
			>
				<SegunConsulta consulta={consulta} renglones={8}>
					{(datos) => <CuerpoDeTercero tercero={datos} alCancelar={setCancelar} />}
				</SegunConsulta>
			</Cajon>
			{compensar && tercero !== undefined ? (
				<VentanaCompensar tercero={tercero} alCerrar={() => setCompensar(false)} />
			) : null}
			{cancelar === undefined ? null : <VentanaCancelar cancelar={cancelar} alCerrar={() => setCancelar(undefined)} />}
		</>
	);
}
