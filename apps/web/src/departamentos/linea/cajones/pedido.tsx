/**
 * El cajón del pedido en línea (ancho): «{W} · {etapa}» y el cliente; los botones con cifra a Aduana y a Bodega; las
 * cifras (el total, a dónde va y lo prometido); el cliente, el envío, el pago y el cupón; las excepciones abiertas en
 * rojo; las prendas con dónde está cada una; los totales; el camino del pedido; el historial; y el pie con «Cancelar
 * pedido» y «Ver en aduana».
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Pedido en línea (ancho)», «Ventanas»)
 *
 * Todo llega armado de `linea.pedido`: lo que se puede hacer lo dice la consulta. «Cancelar pedido» llama a
 * `linea.cancelar_pedido` con la versión que se leyó; si el W- cambió mientras se veía, el cajón lo avisa con lo nuevo.
 */

import { useRouter } from "@tanstack/react-router";
import { pedidoLinea } from "@uniformame/compartido/contratos/linea/consultas";
import { cancelarPedidoLinea } from "@uniformame/compartido/contratos/linea/pedidos";
import { Pasos } from "@uniformame/interfaz/avance/pasos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { BotonConCifra } from "@uniformame/interfaz/botones/boton-con-cifra";
import { unirClases } from "@uniformame/interfaz/clases";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { puntoDelEstado } from "@uniformame/interfaz/estados/colores";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Box, Truck } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { Historial } from "../../../comun/historial.tsx";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useTieneDepartamento } from "../../../comun/tiene-departamento.ts";
import { enOtroDepartamento } from "../enlaces.ts";
import { useEnvio } from "../envio.ts";
import { VentanaCancelarPedido } from "../ventanas/cancelar.tsx";

/** Lo que da la consulta. */
type Pedido = z.infer<typeof pedidoLinea.resultado>;

/**
 * Una cifra del cajón: el valor grande y su línea abajo.
 * @param props El valor y su línea.
 */
function CifraDelCajon({ valor, linea }: { valor: string; linea: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<b className="font-bold text-subtitulo tabular-nums">{valor}</b>
			<span className="text-etiqueta text-tinta2">{linea}</span>
		</div>
	);
}

/**
 * Dónde está una prenda, con el punto de su color.
 * @param props Sus lugares.
 */
function DondeEsta({ donde }: { donde: Pedido["prendas"][number]["donde"] }) {
	if (donde.length === 0) return <span className="text-tinta3">—</span>;
	return (
		<span className="flex flex-col gap-1">
			{donde.map((lugar) => (
				<span key={lugar.texto} className="inline-flex items-center gap-2">
					<span
						aria-hidden="true"
						className={unirClases("size-2 flex-none rounded-full", puntoDelEstado[lugar.color])}
					/>
					{lugar.texto}
				</span>
			))}
		</span>
	);
}

/**
 * Un renglón de los totales.
 * @param props Su nombre, su monto y si es el total.
 */
function RenglonDeTotal({
	nombre,
	monto,
	total = false,
}: {
	nombre: string;
	monto: number | undefined;
	total?: boolean;
}) {
	return (
		<div className={unirClases("flex justify-between gap-6", total && "border-linea border-t pt-2 font-bold")}>
			<span className={total ? undefined : "text-tinta2"}>{nombre}</span>
			<span className="tabular-nums">{montoEnPantalla(monto)}</span>
		</div>
	);
}

/**
 * El cuerpo del cajón, con sus datos.
 * @param props El W-.
 */
function CuerpoDelPedido({ pedido }: { pedido: Pedido }) {
	const hechos = pedido.camino.findIndex((paso) => !paso.hecho);
	return (
		<div className="flex flex-col gap-5">
			<section className="grid grid-cols-3 gap-4 rounded-grande bg-suave p-4 max-telefono:grid-cols-1">
				<CifraDelCajon valor={montoEnPantalla(pedido.cifras.total_centavos)} linea={pedido.cifras.total_linea} />
				<CifraDelCajon valor={pedido.cifras.municipio} linea="envío a" />
				<CifraDelCajon valor={pedido.cifras.promesa.texto} linea={pedido.cifras.promesa.linea} />
			</section>
			{pedido.avisos.map((aviso) => (
				<Recuadro key={aviso} color="rojo">
					{aviso}
				</Recuadro>
			))}
			<section className="grid grid-cols-2 gap-4 max-telefono:grid-cols-1">
				<Dato etiqueta="Cliente">
					<span className="flex flex-col">
						<span>{pedido.cliente.nombre}</span>
						<span>{pedido.cliente.correo}</span>
						{pedido.cliente.telefono === null ? null : <span>{pedido.cliente.telefono}</span>}
					</span>
				</Dato>
				<Dato etiqueta="Envío">
					<span className="flex flex-col">
						<span>{pedido.envio.destinatario}</span>
						{pedido.envio.direccion.map((linea) => (
							<span key={linea}>{linea}</span>
						))}
						{pedido.envio.referencias === null ? null : <span className="text-tinta2">{pedido.envio.referencias}</span>}
						<span>
							{pedido.envio.metodo} {montoEnPantalla(pedido.envio.costo_centavos)}
						</span>
					</span>
				</Dato>
				<Dato etiqueta="Pago">
					<span className="flex flex-col">
						<span>{pedido.pago.metodo}</span>
						<span className="text-tinta2">{pedido.pago.referencia}</span>
						{pedido.pago.pagado === null ? null : <span>{pedido.pago.pagado}</span>}
						{pedido.pago.comision_centavos == null ? null : (
							<span className="text-tinta2">Comisión {montoEnPantalla(pedido.pago.comision_centavos)}</span>
						)}
					</span>
				</Dato>
				{pedido.cupon === null ? null : <Dato etiqueta="Cupón">{pedido.cupon}</Dato>}
			</section>
			<section className="flex flex-col gap-3">
				<TituloDeBloque
					titulo="Prendas"
					detalle={`${pedido.relacionados.prendas} ${pedido.relacionados.prendas === 1 ? "prenda" : "prendas"}`}
				/>
				<Tabla
					nombre="Prendas del pedido"
					filas={pedido.prendas}
					claveDeFila={(prenda) => String(prenda.renglon)}
					columnas={[
						{
							clave: "prenda",
							encabezado: "Prenda",
							celda: (prenda) => (
								<span className="flex flex-col">
									<b className="font-semibold">{prenda.prenda}</b>
									{prenda.paquete === null ? null : (
										<span className="text-etiqueta text-tinta2">
											{prenda.paquete} · descuento {montoEnPantalla(prenda.descuento_paquete_centavos)}
										</span>
									)}
								</span>
							),
						},
						{ clave: "talla", encabezado: "Talla", celda: (prenda) => prenda.talla },
						{
							clave: "piezas",
							encabezado: "Piezas",
							alinear: "derecha",
							celda: (prenda) => prenda.piezas.toLocaleString("es-MX"),
						},
						{ clave: "donde", encabezado: "Dónde está", celda: (prenda) => <DondeEsta donde={prenda.donde} /> },
						{
							clave: "precio",
							encabezado: "Precio",
							alinear: "derecha",
							celda: (prenda) => montoEnPantalla(prenda.precio_unitario_centavos),
						},
						{
							clave: "importe",
							encabezado: "Importe",
							alinear: "derecha",
							celda: (prenda) => montoEnPantalla(prenda.importe_centavos),
						},
					]}
				/>
				<div className="ml-auto flex w-full max-w-xs flex-col gap-1.5">
					<RenglonDeTotal nombre="Subtotal" monto={pedido.totales.subtotal_centavos} />
					<RenglonDeTotal nombre="Descuento" monto={pedido.totales.descuento_centavos} />
					<RenglonDeTotal nombre="Envío" monto={pedido.totales.envio_centavos} />
					<RenglonDeTotal nombre="Descuento del envío" monto={pedido.totales.descuento_envio_centavos} />
					<RenglonDeTotal nombre="Total" monto={pedido.totales.total_centavos} total />
				</div>
			</section>
			<section className="flex flex-col gap-3">
				<TituloDeBloque titulo="Camino del pedido" />
				<Pasos
					pasos={pedido.camino.map((paso) => (paso.detalle === null ? paso.texto : `${paso.texto} · ${paso.detalle}`))}
					actual={hechos === -1 ? pedido.camino.length : hechos}
				/>
				{pedido.cierre === null ? null : <Recuadro color="rojo">{pedido.cierre}</Recuadro>}
			</section>
			<Historial entidad="pedidos_linea" entidadId={pedido.pedido_linea_id} />
		</div>
	);
}

/**
 * El cajón del pedido en línea.
 * @param props El W- y qué hacer al cerrar.
 */
export function CajonPedidoLinea({ pedidoLineaId, alCerrar }: { pedidoLineaId: string; alCerrar: () => void }) {
	const consulta = useConsulta(pedidoLinea, { pedido_linea_id: pedidoLineaId });
	const tiene = useTieneDepartamento();
	const router = useRouter();
	const conConexion = useConConexion();
	const { enviar, enviando, choco } = useEnvio(cancelarPedidoLinea);
	const [cancelando, setCancelando] = useState(false);
	// Un choque de versión cierra la ventana: el cajón lo avisa con lo nuevo. Se hace al pintar, como en la ventana
	// con motivo, y no en un efecto.
	const [chocoAntes, setChocoAntes] = useState(choco);
	if (choco !== chocoAntes) {
		setChocoAntes(choco);
		if (choco) setCancelando(false);
	}
	const pedido = consulta.data;
	const ir = (ruta: string) => router.history.push(ruta);

	/**
	 * Manda la cancelación con su motivo y la versión que se leyó. Sin red, la ventana sigue abierta con lo escrito
	 * para volver a intentar; si la regla no habla del motivo, el aviso de abajo ya lo dijo y la ventana se cierra.
	 * @param motivo El motivo.
	 * @returns El error que la API le dio al motivo, si hubo.
	 */
	const confirmar = async (motivo: string): Promise<string | undefined> => {
		if (pedido === undefined) return undefined;
		let errorDelMotivo: string | undefined;
		const salio = await enviar(
			{ datos: { pedido_linea_id: pedido.pedido_linea_id, motivo }, version: pedido.version },
			(falla) => {
				errorDelMotivo = falla.campos.motivo;
				if (errorDelMotivo === undefined) setCancelando(false);
			},
		);
		if (salio !== undefined) setCancelando(false);
		return errorDelMotivo;
	};

	const relacionados =
		pedido === undefined ? undefined : (
			<>
				<BotonConCifra
					texto={`${pedido.relacionados.en_aduana} de ${pedido.relacionados.prendas} prendas en aduana`}
					icono={Truck}
					{...(tiene("aduana") ? { alTocar: () => ir(enOtroDepartamento.aduana) } : {})}
				/>
				<BotonConCifra
					cifra={pedido.relacionados.por_surtir_bodega}
					texto="por surtir de bodega"
					icono={Box}
					{...(tiene("bodega") ? { alTocar: () => ir(enOtroDepartamento.bodega) } : {})}
				/>
			</>
		);
	return (
		<>
			<Cajon
				abierto
				ancho
				alCerrar={alCerrar}
				contexto={pedido === undefined ? "Pedido en línea" : `${pedido.folio} · ${pedido.etapa.texto}`}
				titulo={pedido?.cliente.nombre ?? ""}
				{...(relacionados === undefined ? {} : { relacionados })}
				{...(pedido?.puede.cancelar === true
					? {
							pieIzquierda: (
								<span className="flex gap-2">
									<Boton variante="fantasma" onClick={alCerrar}>
										Cerrar
									</Boton>
									<Boton variante="peligro" disabled={!conConexion} onClick={() => setCancelando(true)}>
										Cancelar pedido
									</Boton>
								</span>
							),
						}
					: {})}
				{...(pedido?.puede.ver_en_aduana === true && tiene("aduana")
					? {
							accion: (
								<Boton icono={Truck} onClick={() => ir(enOtroDepartamento.aduana)}>
									Ver en aduana
								</Boton>
							),
						}
					: {})}
			>
				{choco ? (
					<div className="mb-4">
						<EstadoDePantalla tipo="choque" documento={pedido?.folio ?? "El pedido"} />
					</div>
				) : null}
				<SegunConsulta consulta={consulta}>{(datos) => <CuerpoDelPedido pedido={datos} />}</SegunConsulta>
			</Cajon>
			{cancelando && pedido !== undefined ? (
				<VentanaCancelarPedido
					folio={pedido.folio}
					enviando={enviando}
					alConfirmar={confirmar}
					alCerrar={() => setCancelando(false)}
				/>
			) : null}
		</>
	);
}
