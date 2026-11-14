/**
 * El cajón de la nota de entrega (ancho): los botones con cifra (el pedido, el despacho y el pago), la cabecera, sus
 * datos, sus prendas por talla, sus totales y lo que se puede hacer según su estado: cancelarla, confirmar su entrega,
 * pedir su nota de crédito y su PDF.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Nota de entrega (ancho)», «Ventanas»)
 *
 * Lo que la cuenta no ve no llega: sin precios para Aduana y sin el saldo para quien no tiene Contaduría; en su lugar,
 * el pago.
 */

import { useRouter } from "@tanstack/react-router";
import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { notaEntregaVentas } from "@uniformame/compartido/contratos/ventas/consultas-notas";
import { cancelarNotaEntrega } from "@uniformame/compartido/contratos/ventas/notas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { BotonConCifra } from "@uniformame/interfaz/botones/boton-con-cifra";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { CheckCheck, CreditCard, Printer, Table, Truck } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { abrirHoja } from "../../../comun/hojas.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useTieneDepartamento } from "../../../comun/tiene-departamento.ts";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { useDireccionDeVentas } from "../direccion.ts";
import { useEnvio } from "../envio.ts";
import { VentanaConfirmarEntrega } from "../ventanas/confirmar-entrega.tsx";
import { VentanaNotaCredito } from "../ventanas/nota-credito.tsx";

/** Lo que da la consulta. */
type Nota = z.infer<typeof notaEntregaVentas.resultado>;

/**
 * Un renglón de los totales.
 * @param props Su nombre, su valor y si es el último (más grande).
 */
function Total({ nombre, valor, final = false }: { nombre: string; valor: string; final?: boolean }) {
	return (
		<div className={`flex justify-between ${final ? "border-linea border-t pt-2 font-bold text-subtitulo" : ""}`}>
			<span>{nombre}</span>
			<span className="tabular-nums">{valor}</span>
		</div>
	);
}

/**
 * El cuerpo de la nota.
 * @param props La nota.
 */
function CuerpoDeNota({ nota }: { nota: Nota }) {
	const conPrecios = nota.subtotal_centavos !== undefined;
	return (
		<div className="flex flex-col gap-5">
			<section className="flex items-center justify-between gap-3 rounded-grande bg-suave p-4">
				<div>
					<span className="text-etiqueta text-tinta3">{nota.cabecera}</span>
					<b className="block font-bold text-subtitulo">
						{nota.piezas.toLocaleString("es-MX")} piezas
						{nota.total_centavos === undefined ? "" : ` · ${enPesos(nota.total_centavos)}`}
					</b>
				</div>
				<Estado texto={nota.estado_armado.texto} color={nota.estado_armado.color} />
			</section>
			<section className="grid grid-cols-2 gap-4 max-telefono:grid-cols-1">
				<Dato etiqueta="Pedido">
					{nota.pedido.folio} · nota {nota.numero} de {nota.de}
				</Dato>
				<Dato etiqueta="Forma de pago">{nota.forma_pago}</Dato>
				<Dato etiqueta="Armó">{nota.armo}</Dato>
				{nota.salio === null ? null : <Dato etiqueta="Salió">{nota.salio}</Dato>}
				{nota.recibio === null ? null : <Dato etiqueta="Recibió">{nota.recibio}</Dato>}
				{nota.vence === null ? null : (
					<Dato etiqueta="Vence">
						{nota.vence.texto} <TextoConTono tono={nota.vence.tono}>{nota.vence.cuando}</TextoConTono>
					</Dato>
				)}
			</section>
			<section className="flex flex-col gap-3">
				<TituloDeBloque
					titulo="Prendas"
					detalle={`${nota.prendas.length} ${nota.prendas.length === 1 ? "producto" : "productos"}`}
				/>
				<Tabla
					nombre="Prendas de la nota"
					filas={nota.prendas}
					claveDeFila={(prenda) => prenda.nombre}
					columnas={[
						{
							clave: "prenda",
							encabezado: "Prenda",
							celda: (prenda) => (
								<span className="flex flex-col">
									<b className="font-semibold">{prenda.nombre}</b>
									<span className="text-etiqueta text-tinta3">{prenda.escuela}</span>
								</span>
							),
						},
						{
							clave: "tallas",
							encabezado: "Tallas",
							celda: (prenda) => prenda.tallas.map((talla) => `${talla.talla}: ${talla.piezas}`).join(" · "),
						},
						{
							clave: "piezas",
							encabezado: "Piezas",
							alinear: "derecha",
							celda: (prenda) => prenda.piezas.toLocaleString("es-MX"),
						},
						...(conPrecios
							? [
									{
										clave: "precio",
										encabezado: "Precio",
										alinear: "derecha" as const,
										celda: (prenda: Nota["prendas"][number]) =>
											prenda.precio_unitario_centavos === undefined ? "" : enPesos(prenda.precio_unitario_centavos),
									},
									{
										clave: "importe",
										encabezado: "Importe",
										alinear: "derecha" as const,
										celda: (prenda: Nota["prendas"][number]) =>
											prenda.importe_centavos === undefined ? "" : enPesos(prenda.importe_centavos),
									},
								]
							: []),
					]}
				/>
			</section>
			{conPrecios ? (
				<section className="ml-auto flex w-72 flex-col gap-2 max-telefono:w-full">
					<Total nombre="Subtotal" valor={enPesos(nota.subtotal_centavos ?? 0)} />
					{(nota.anticipo_aplicado_centavos ?? 0) === 0 ? null : (
						<Total nombre="Anticipo aplicado" valor={`−${enPesos(nota.anticipo_aplicado_centavos ?? 0)}`} />
					)}
					{nota.notas_credito.map((credito) => (
						<Total
							key={credito.folio}
							nombre={`Nota de crédito ${credito.folio}`}
							valor={credito.monto_centavos === undefined ? "" : `−${enPesos(credito.monto_centavos)}`}
						/>
					))}
					{nota.por_cobrar_centavos !== undefined ? (
						<Total final nombre="Por cobrar" valor={enPesos(nota.por_cobrar_centavos)} />
					) : nota.saldo_centavos !== undefined ? (
						<Total final nombre="Saldo" valor={enPesos(nota.saldo_centavos)} />
					) : (
						<Total final nombre="Pago" valor={nota.pago} />
					)}
				</section>
			) : null}
		</div>
	);
}

/**
 * El cajón de una nota de entrega.
 * @param props La nota y qué hacer al cerrar.
 */
export function CajonNota({ notaId, alCerrar }: { notaId: string; alCerrar: () => void }) {
	const consulta = useConsulta(notaEntregaVentas, { nota_id: notaId });
	const { abrir } = useDireccionDeVentas();
	const router = useRouter();
	const tiene = useTieneDepartamento();
	const conConexion = useConConexion();
	const cancelar = useEnvio(cancelarNotaEntrega);
	const [ventana, setVentana] = useState<"cancelar" | "confirmar" | "credito" | undefined>(undefined);
	const nota = consulta.data;
	const relacionados =
		nota === undefined ? undefined : (
			<>
				<BotonConCifra
					texto={`${nota.pedido.folio} · pedido · ${nota.pedido.etapa}`}
					icono={Table}
					alTocar={tiene("ventas") ? () => abrir("pedido", nota.pedido.pedido_id) : undefined}
				/>
				<BotonConCifra
					texto={nota.despacho}
					icono={Truck}
					alTocar={tiene("aduana") ? () => router.history.push("/aduana") : undefined}
				/>
				<BotonConCifra
					texto={nota.pago}
					icono={CreditCard}
					alTocar={tiene("contaduria") ? () => router.history.push("/contaduria") : undefined}
				/>
			</>
		);
	// El pie: a la izquierda «Cerrar» y, por despachar, «Cancelar nota» (o lo que espera de Dirección); a la derecha
	// «PDF» y la acción de su estado en negro.
	const izquierda = (
		<div className="flex flex-wrap items-center gap-2">
			<Boton variante="fantasma" onClick={alCerrar}>
				Cerrar
			</Boton>
			{nota?.puede.cancelar === true ? (
				<Boton variante="peligro" disabled={!conConexion} onClick={() => setVentana("cancelar")}>
					Cancelar nota
				</Boton>
			) : nota === undefined || nota.esperando === null ? null : (
				<span className="font-semibold text-tinta2">{nota.esperando}</span>
			)}
		</div>
	);
	return (
		<>
			<Cajon
				abierto
				ancho
				alCerrar={alCerrar}
				contexto={
					nota === undefined ? "Nota de entrega" : `${nota.folio} · Nota de entrega ${nota.numero} de ${nota.de}`
				}
				titulo={nota?.cliente.nombre ?? ""}
				{...(relacionados === undefined ? {} : { relacionados })}
				pieIzquierda={izquierda}
				accion={
					nota === undefined ? undefined : (
						<div className="flex flex-wrap justify-end gap-2">
							{nota.puede.pdf ? (
								<Boton icono={Printer} onClick={() => abrirHoja("nota_entrega", nota.nota_id)}>
									PDF
								</Boton>
							) : null}
							{nota.puede.confirmar_entrega ? (
								<Boton
									variante="principal"
									icono={CheckCheck}
									disabled={!conConexion}
									onClick={() => setVentana("confirmar")}
								>
									Confirmar entrega
								</Boton>
							) : null}
							{nota.puede.nota_credito && nota.esperando === null ? (
								<Boton variante="principal" disabled={!conConexion} onClick={() => setVentana("credito")}>
									Nota de crédito
								</Boton>
							) : null}
						</div>
					)
				}
			>
				{cancelar.choco && nota !== undefined ? (
					<div className="mb-4">
						<EstadoDePantalla tipo="choque" documento={nota.folio} />
					</div>
				) : null}
				<SegunConsulta consulta={consulta}>{(datos) => <CuerpoDeNota nota={datos} />}</SegunConsulta>
			</Cajon>
			{ventana === "cancelar" && nota !== undefined ? (
				<VentanaConMotivo
					titulo={`Cancelar ${nota.folio}`}
					textoAccion="Cancelar nota"
					enviando={cancelar.enviando}
					alCerrar={() => setVentana(undefined)}
					alConfirmar={async (motivo) => {
						let error: string | undefined;
						const hecho = await cancelar.enviar(
							{ datos: { nota_id: nota.nota_id, motivo }, version: nota.version },
							(campos) => {
								error = campos.motivo;
							},
						);
						if (hecho !== undefined) setVentana(undefined);
						return error;
					}}
				/>
			) : null}
			{ventana === "confirmar" && nota !== undefined ? (
				<VentanaConfirmarEntrega notaId={nota.nota_id} alCerrar={() => setVentana(undefined)} />
			) : null}
			{ventana === "credito" && nota !== undefined ? (
				<VentanaNotaCredito
					notaId={nota.nota_id}
					folio={nota.folio}
					subtitulo={[
						nota.cliente.nombre,
						...(nota.total_centavos === undefined ? [] : [enPesos(nota.total_centavos)]),
					].join(" · ")}
					lineas={nota.lineas}
					alCerrar={() => setVentana(undefined)}
				/>
			) : null}
		</>
	);
}
