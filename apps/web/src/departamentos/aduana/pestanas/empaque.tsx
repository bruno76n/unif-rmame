/**
 * Empaque en línea: los pedidos en línea con `linea.pedidos`, solo las dos etapas de Aduana (`estados`), con el recorte
 * de Aduana (sin precios, totales ni datos del pago). Dos columnas con su conteo: «Esperando prendas» (ámbar), cada W-
 * con su folio y fecha, el destinatario y su municipio y cada prenda con palomita y «En aduana» o con reloj y dónde
 * viene, y abajo «Falta {n} de {m}» como lo arma la consulta; y «Listos para empacar» (verde azulado). Abajo, la nota de
 * lo que llega con uniformame.mx. Sin botones.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Empaque en línea»)
 */

import { pedidosLinea } from "@uniformame/compartido/contratos/linea/consultas";
import { Tarjeta } from "@uniformame/interfaz/contenedores/tarjeta";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Check, Clock } from "lucide-react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";

/** Las dos etapas que ve Aduana, en su orden: lo que espera prendas y lo listo para empacar. */
const etapasDeEmpaque = "esperando_prendas,listo_para_empacar";

/** Lo que regresa `linea.pedidos`. */
type Pedidos = z.infer<typeof pedidosLinea.resultado>;

/** Una columna del tablero. */
type Columna = Pedidos["columnas"][number];

/** Un W- de una columna. */
type PedidoEnLinea = Columna["pedidos"][number];

/**
 * Un pedido en línea: su folio y fecha, a quién va y cada prenda con dónde está; si espera prendas, cuántas faltan (como
 * lo arma la consulta).
 * @param props El W-.
 */
function TarjetaDeEmpaque({ pedido }: { pedido: PedidoEnLinea }) {
	return (
		<Tarjeta nombre={`Pedido en línea ${pedido.folio}`}>
			<span className="flex items-baseline justify-between gap-2">
				<b>{pedido.folio}</b>
				<span className="text-etiqueta text-tinta3">{pedido.fecha}</span>
			</span>
			<span className="text-tinta2">{`${pedido.cliente} · ${pedido.municipio}`}</span>
			<ul className="m-0 flex list-none flex-col gap-1 p-0">
				{pedido.prendas.map((prenda) => (
					<li key={`${prenda.prenda}-${prenda.talla}`} className="flex items-center gap-2 text-etiqueta">
						{prenda.en_aduana ? (
							<Check size={13} strokeWidth={1.9} aria-hidden />
						) : (
							<Clock size={13} strokeWidth={1.9} aria-hidden />
						)}
						<span>{`${prenda.prenda} · ${prenda.talla}`}</span>
						<span className="ml-auto text-tinta3">
							{prenda.en_aduana ? "En aduana" : (prenda.donde ?? "En camino desde Bodega")}
						</span>
					</li>
				))}
			</ul>
			{pedido.falta === null ? null : <TextoConTono tono="ambar">{pedido.falta}</TextoConTono>}
		</Tarjeta>
	);
}

/** La pestaña Empaque en línea: lee `linea.pedidos` con las dos etapas de Aduana y pinta sus estados. */
export function EmpaqueDeAduana() {
	const consulta = useConsulta(pedidosLinea, { estados: etapasDeEmpaque });
	return <SegunConsulta consulta={consulta}>{(datos) => <Contenido datos={datos} />}</SegunConsulta>;
}

/**
 * Lo que pinta Empaque en línea con los datos.
 * @param props Lo que regresa `linea.pedidos`.
 */
function Contenido({ datos }: { datos: Pedidos }) {
	const columnas = datos.columnas;
	const cuantos = columnas.reduce((suma, columna) => suma + columna.pedidos.length, 0);
	return (
		<div className="flex flex-col gap-5">
			{cuantos === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Ningún pedido en línea en aduana" />
			) : (
				<div className="grid grid-cols-2 items-start gap-4 max-telefono:grid-cols-1">
					{columnas.map((columna) => (
						<section key={columna.estado} aria-label={columna.texto} className="flex flex-col gap-3">
							<header className="flex items-center gap-3">
								<Estado texto={columna.texto} color={columna.color} />
								<span className="text-tinta3 tabular-nums">{columna.pedidos.length}</span>
							</header>
							{columna.pedidos.map((pedido) => (
								<TarjetaDeEmpaque key={pedido.pedido_linea_id} pedido={pedido} />
							))}
						</section>
					))}
				</div>
			)}
			<p className="m-0 text-etiqueta text-tinta3">
				Empacar, pedir la guía y entregar a la paquetería llegan con uniformame.mx.
			</p>
		</div>
	);
}
