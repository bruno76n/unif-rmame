/**
 * El cajón Registrar pago: el cliente (los que tienen algo por pagar), su nota o pedido, el monto, dónde se recibió
 * (Efectivo, una cuenta de la fábrica o la cuenta de un tercero), la referencia y, con un tercero, si se aplica ahora a
 * lo que le debemos. «Registrar pago» llama a `contaduria.registrar_pago_recibido`; los errores salen en su campo y el
 * primero en el aviso ámbar. Con algo capturado, cerrarlo pregunta antes.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Registrar pago») y docs/modulos/contaduria/pagos-y-saldo-a-favor.md
 */

import { centavosACampo, pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { registrarPagoOpciones } from "@uniformame/compartido/contratos/contaduria/consultas-cobrar";
import { registrarPagoRecibido } from "@uniformame/compartido/contratos/contaduria/pagos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { useState } from "react";
import { useConsulta } from "../../../comun/api.tsx";
import { usePreguntarAntesDeSalir } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { efectivo } from "../comun.tsx";
import { useEnvio } from "../envio.ts";

/** El valor de «Cuenta de un tercero» en «Dónde se recibió». */
const deUnTercero = "tercero";

/** Lo capturado. */
interface Captura {
	documento?: string | undefined;
	monto?: string | undefined;
	donde?: string | undefined;
	tercero?: string | undefined;
	aplicar?: "ahora" | "despues" | undefined;
	deuda?: string | undefined;
	referencia?: string | undefined;
}

/**
 * El cajón Registrar pago.
 * @param props El cliente con que se abre (si se abre desde su cajón) y qué hacer al cerrar.
 */
export function CajonRegistrarPago({ clienteId, alCerrar }: { clienteId: string | undefined; alCerrar: () => void }) {
	const [cliente, setCliente] = useState(clienteId);
	const [captura, setCaptura] = useState<Captura>({});
	const [errores, setErrores] = useState<Record<string, string>>({});
	const opciones = useConsulta(registrarPagoOpciones, {
		...(cliente === undefined ? {} : { cliente_id: cliente }),
		...(captura.tercero === undefined ? {} : { tercero_deposito_id: captura.tercero }),
	});
	const { enviar, enviando } = useEnvio(registrarPagoRecibido);
	const conConexion = useConConexion();
	const conCambios = captura.monto !== undefined || (captura.referencia ?? "") !== "";
	const pregunta = usePreguntarAntesDeSalir(conCambios);
	const datos = opciones.data;
	const documento = datos?.documentos.find((uno) => uno.id === captura.documento) ?? datos?.documentos[0];
	const monto = captura.monto ?? centavosACampo(documento?.saldo_centavos);
	const donde = captura.donde ?? datos?.cuentas_fabrica[0]?.id ?? efectivo;
	const aTercero = donde === deUnTercero;
	const aplicar = captura.aplicar ?? "ahora";
	const deuda = captura.deuda ?? datos?.deudas[0]?.cuenta_por_pagar_id;
	const nombreDelCliente = datos?.clientes.find((uno) => uno.id === datos.cliente_id)?.nombre ?? "";
	const nombreDelTercero = datos?.terceros.find((uno) => uno.id === captura.tercero)?.nombre ?? "";
	const cambiar = (cambios: Captura) => setCaptura((antes) => ({ ...antes, ...cambios }));
	const registrar = async () => {
		const centavos = pesosACentavos(monto);
		const referencia = registrarPagoRecibido.entrada.shape.referencia.safeParse(captura.referencia ?? "");
		const locales: Record<string, string> = {};
		if (centavos === undefined) locales.monto_centavos = "Escribe el monto en pesos";
		if (donde !== efectivo && !referencia.success) locales.referencia = "Escribe la referencia del depósito";
		if (aTercero && captura.tercero === undefined) locales.tercero_deposito_id = "¿A quién le depositó?";
		setErrores(locales);
		if (Object.keys(locales).length > 0 || datos?.cliente_id == null || documento === undefined) return;
		const salio = await enviar(
			{
				datos: {
					cliente_id: datos.cliente_id,
					...(documento.tipo === "nota" ? { nota_entrega_id: documento.id } : { pedido_id: documento.id }),
					monto_centavos: centavos ?? 0,
					...(donde === efectivo
						? { medio: "efectivo" as const }
						: aTercero
							? {
									medio: "cuenta_tercero" as const,
									tercero_deposito_id: captura.tercero,
									aplicar,
									...(aplicar === "ahora" && deuda !== undefined ? { cuenta_por_pagar_id: deuda } : {}),
								}
							: { medio: "cuenta_fabrica" as const, cuenta_fabrica_id: donde }),
					...(donde === efectivo ? {} : { referencia: captura.referencia ?? "" }),
				},
			},
			setErrores,
		);
		if (salio !== undefined) {
			setCaptura({});
			alCerrar();
		}
	};
	const primerError = Object.values(errores)[0];
	return (
		<>
			<Cajon
				abierto
				alCerrar={alCerrar}
				titulo="Registrar pago"
				conCambios={conCambios}
				accion={
					<Boton
						variante="principal"
						disabled={!conConexion || enviando || documento === undefined}
						onClick={() => void registrar()}
					>
						Registrar pago
					</Boton>
				}
			>
				<SegunConsulta consulta={opciones} renglones={6}>
					{(leido) => (
						<div className="flex flex-col gap-4">
							{primerError === undefined ? null : <Recuadro color="ambar">{primerError}</Recuadro>}
							<Selector
								etiqueta="Cliente"
								opciones={leido.clientes.map((uno) => ({ valor: uno.id, texto: uno.nombre }))}
								value={leido.cliente_id ?? ""}
								error={errores.cliente_id}
								onChange={(evento) => {
									setCliente(evento.target.value);
									setCaptura({});
								}}
							/>
							<Selector
								etiqueta="Nota o pedido"
								opciones={leido.documentos.map((uno) => ({
									valor: uno.id,
									texto: `${uno.folio} · ${montoEnPantalla(uno.saldo_centavos)} · ${uno.detalle}`,
								}))}
								value={documento?.id ?? ""}
								error={errores.nota_entrega_id ?? errores.pedido_id}
								onChange={(evento) => cambiar({ documento: evento.target.value, monto: undefined })}
							/>
							<Campo
								etiqueta="Monto"
								inputMode="decimal"
								value={monto}
								error={errores.monto_centavos}
								onChange={(evento) => cambiar({ monto: evento.target.value })}
							/>
							<Selector
								etiqueta="Dónde se recibió"
								opciones={[
									{ valor: efectivo, texto: "Efectivo" },
									...leido.cuentas_fabrica.map((cuenta) => ({ valor: cuenta.id, texto: cuenta.nombre })),
									{ valor: deUnTercero, texto: "Cuenta de un tercero" },
								]}
								value={donde}
								error={errores.cuenta_fabrica_id}
								onChange={(evento) => cambiar({ donde: evento.target.value })}
							/>
							{aTercero ? (
								<Selector
									etiqueta="Cuenta de quién"
									vacio="Escoge a quién le depositó"
									opciones={leido.terceros.map((uno) => ({ valor: uno.id, texto: uno.nombre }))}
									value={captura.tercero ?? ""}
									error={errores.tercero_deposito_id}
									onChange={(evento) => cambiar({ tercero: evento.target.value || undefined, deuda: undefined })}
								/>
							) : null}
							{donde === efectivo ? null : (
								<Campo
									etiqueta="Referencia del depósito"
									placeholder="SPEI, folio o ficha"
									autoComplete="off"
									value={captura.referencia ?? ""}
									error={errores.referencia}
									onChange={(evento) => cambiar({ referencia: evento.target.value })}
								/>
							)}
							{aTercero && captura.tercero !== undefined ? (
								<>
									<Selector
										etiqueta="Aplicarlo a lo que le debemos"
										opciones={[
											{ valor: "ahora", texto: "Ahora" },
											{ valor: "despues", texto: "Después" },
										]}
										value={aplicar}
										onChange={(evento) => cambiar({ aplicar: evento.target.value === "despues" ? "despues" : "ahora" })}
									/>
									{aplicar === "ahora" ? (
										<>
											<Selector
												etiqueta="Deuda"
												opciones={leido.deudas.map((una) => ({
													valor: una.cuenta_por_pagar_id,
													texto: `${una.documento} · ${montoEnPantalla(una.saldo_centavos)}`,
												}))}
												value={deuda ?? ""}
												error={errores.cuenta_por_pagar_id}
												onChange={(evento) => cambiar({ deuda: evento.target.value })}
											/>
											<Recuadro color="azul">
												Un solo movimiento: baja lo que nos debe {nombreDelCliente} y lo que le debemos a{" "}
												{nombreDelTercero}.
											</Recuadro>
										</>
									) : (
										<Recuadro color="azul">Queda en «sin aplicar» hasta que se ligue a una deuda.</Recuadro>
									)}
								</>
							) : null}
						</div>
					)}
				</SegunConsulta>
			</Cajon>
			{pregunta}
		</>
	);
}
