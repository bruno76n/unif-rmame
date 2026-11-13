/**
 * El cajón del pedido (ancho): su cliente, los botones con cifra, el avance, los datos, los avisos, las prendas con su
 * hilo y su tabla por talla, las notas de entrega, el historial y el pie según la etapa.
 * Fase 19 · docs/interfaz/fabrica/ventas.md («Pedido (ancho)»)
 *
 * Todo llega de `ventas.pedido` (y el hilo de `produccion.hilo_pedido`): lo que se puede hacer lo dice la consulta, que
 * lo apaga para quien solo lee (Contaduría, Dirección). Los botones llaman a sus acciones tal cual.
 */

import { useRouter } from "@tanstack/react-router";
import { hiloPedido } from "@uniformame/compartido/contratos/produccion/hilo";
import { pedidoVentas } from "@uniformame/compartido/contratos/ventas/consultas-pedidos";
import { cancelarPedido, confirmarPedido } from "@uniformame/compartido/contratos/ventas/pedidos";
import { BarraAvance } from "@uniformame/interfaz/avance/barra-avance";
import { Hilo } from "@uniformame/interfaz/avance/hilo";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { BotonConCifra } from "@uniformame/interfaz/botones/boton-con-cifra";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { MuestraDeColor } from "@uniformame/interfaz/estados/muestra-de-color";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Banknote, CreditCard, Factory, FileText, Printer, Receipt, Truck } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { useTieneDepartamento } from "../cuenta.ts";
import { useDireccionDeVentas } from "../direccion.ts";
import { useEnvio } from "../envio.ts";
import { VentanaPasarABodega } from "../ventanas/pasar-a-bodega.tsx";
import { Historial } from "./historial.tsx";

/** Lo que da la consulta. */
type Pedido = z.infer<typeof pedidoVentas.resultado>;

/**
 * Abre la hoja de un documento (el PDF): de ahí se imprime o se manda.
 * @param tipo El tipo de hoja.
 * @param id El documento.
 */
export function abrirHoja(tipo: string, id: string): void {
	window.open(`/v1/etiquetas/${tipo}/${id}?formato=pdf`, "_blank", "noopener");
}

/**
 * Una prenda del pedido: su precio, su importe, su hilo y su tabla por talla.
 * @param props La prenda y las paradas de su hilo.
 */
function PrendaDelPedido({
	prenda,
	paradas,
}: {
	prenda: Pedido["prendas"][number];
	paradas: Parameters<typeof Hilo>[0]["paradas"] | undefined;
}) {
	return (
		<article className="flex flex-col gap-3 rounded-grande border border-linea p-4">
			<header className="flex items-start justify-between gap-3">
				<div>
					<b className="font-bold">{prenda.nombre}</b>
					<p className="m-0 text-etiqueta text-tinta2">{prenda.precio}</p>
				</div>
				<div className="text-right">
					<b className="font-bold tabular-nums">{montoEnPantalla(prenda.importe_centavos)}</b>
					<p className="m-0 text-etiqueta text-tinta2">{prenda.piezas.toLocaleString("es-MX")} piezas</p>
				</div>
			</header>
			{paradas === undefined ? null : <Hilo paradas={paradas} />}
			<Tabla
				nombre={`${prenda.nombre} por talla`}
				filas={prenda.filas}
				claveDeFila={(fila) => fila.concepto}
				columnas={[
					{ clave: "concepto", encabezado: "Talla", celda: (fila) => <b className="font-semibold">{fila.concepto}</b> },
					...prenda.tallas.map((talla, i) => ({
						clave: `talla-${talla}`,
						encabezado: talla,
						alinear: "derecha" as const,
						celda: (fila: (typeof prenda.filas)[number]) => {
							const piezas = fila.piezas[i] ?? 0;
							return piezas === 0 ? "—" : piezas.toLocaleString("es-MX");
						},
					})),
					{
						clave: "total",
						encabezado: "Total",
						alinear: "derecha",
						celda: (fila) => <b className="font-bold">{fila.total.toLocaleString("es-MX")}</b>,
					},
				]}
			/>
		</article>
	);
}

/**
 * El cuerpo del cajón del pedido, con sus datos.
 * @param props El pedido y qué hacer con sus botones.
 */
function CuerpoDelPedido({ pedido, alMandar, alArmar }: { pedido: Pedido; alMandar: () => void; alArmar: () => void }) {
	const hilo = useConsulta(hiloPedido, { pedido_id: pedido.pedido_id }, pedido.estado !== "borrador");
	const { abrir } = useDireccionDeVentas();
	return (
		<div className="flex flex-col gap-5">
			<section className="flex flex-col gap-3 rounded-grande bg-suave p-4">
				<div className="flex items-start justify-between gap-3">
					<div>
						<span className="text-etiqueta text-tinta3">Avance</span>
						<b className="block font-bold text-subtitulo">{pedido.avance.texto}</b>
					</div>
					<Estado
						texto={pedido.estado_armado.texto}
						color={pedido.estado_armado.color}
						{...(pedido.estado_armado.abajo === null ? {} : { abajo: pedido.estado_armado.abajo })}
					/>
				</div>
				<BarraAvance segmentos={pedido.avance.tramos} />
				<p className="m-0 flex flex-wrap gap-x-4 text-etiqueta text-tinta2">
					{pedido.avance.tramos
						.filter((tramo) => tramo.valor > 0)
						.map((tramo) => (
							<span key={tramo.etiqueta}>
								{tramo.etiqueta} <b className="tabular-nums">{tramo.valor.toLocaleString("es-MX")}</b>
							</span>
						))}
				</p>
			</section>
			<section className="grid grid-cols-2 gap-4 max-telefono:grid-cols-1">
				<Dato etiqueta="Entrega">
					{pedido.entrega.texto} <TextoConTono tono={pedido.entrega.tono}>{pedido.entrega.cuando}</TextoConTono>
				</Dato>
				<Dato etiqueta="Forma de pago">{pedido.forma_pago}</Dato>
				<Dato etiqueta="Levantó">{pedido.levanto}</Dato>
				<Dato etiqueta="Total">{montoEnPantalla(pedido.total_centavos)}</Dato>
			</section>
			{pedido.avisos.map((aviso) => (
				<Recuadro
					key={aviso.texto}
					color={aviso.color}
					{...(aviso.boton === "mandar" && pedido.puede.mandar
						? {
								boton: (
									<Boton chico onClick={alMandar}>
										Mandar a producción
									</Boton>
								),
							}
						: aviso.boton === "armar_nota" && pedido.puede.armar_nota
							? {
									boton: (
										<Boton chico variante="principal" icono={Receipt} onClick={alArmar}>
											Armar nota de entrega
										</Boton>
									),
								}
							: {})}
				>
					{aviso.texto}
				</Recuadro>
			))}
			<section className="flex flex-col gap-3">
				<TituloDeBloque
					titulo="Prendas"
					detalle={`${pedido.prendas.length} ${pedido.prendas.length === 1 ? "producto" : "productos"} · ${pedido.prendas
						.reduce((total, prenda) => total + prenda.piezas, 0)
						.toLocaleString("es-MX")} piezas`}
				/>
				{pedido.prendas.map((prenda) => (
					<PrendaDelPedido
						key={prenda.producto_id}
						prenda={prenda}
						paradas={hilo.data?.prendas.find((suya) => suya.producto_id === prenda.producto_id)?.paradas}
					/>
				))}
			</section>
			<section className="flex flex-col gap-3">
				<TituloDeBloque
					titulo="Notas de entrega"
					detalle={`${pedido.notas.length} ${pedido.notas.length === 1 ? "nota" : "notas"} · ${pedido.notas
						.reduce((total, nota) => total + nota.piezas, 0)
						.toLocaleString("es-MX")} piezas`}
				/>
				{pedido.notas.length === 0 ? (
					<p className="m-0 text-tinta3">Sin notas todavía</p>
				) : (
					<Tabla
						nombre="Notas de entrega del pedido"
						filas={pedido.notas}
						claveDeFila={(nota) => nota.nota_id}
						alTocarFila={(nota) => abrir("nota", nota.nota_id)}
						columnas={[
							{ clave: "nota", encabezado: "Nota", celda: (nota) => <b className="font-bold">{nota.folio}</b> },
							{ clave: "fecha", encabezado: "Fecha", celda: (nota) => nota.fecha },
							{ clave: "prendas", encabezado: "Prendas", celda: (nota) => nota.prendas },
							{
								clave: "piezas",
								encabezado: "Piezas",
								alinear: "derecha",
								celda: (nota) => nota.piezas.toLocaleString("es-MX"),
							},
							{
								clave: "estado",
								encabezado: "Estado",
								celda: (nota) => <Estado texto={nota.estado.texto} color={nota.estado.color} />,
							},
							{
								clave: "total",
								encabezado: "Total",
								alinear: "derecha",
								celda: (nota) => montoEnPantalla(nota.total_centavos),
							},
						]}
					/>
				)}
			</section>
			<Historial entidad="pedidos" entidadId={pedido.pedido_id} />
		</div>
	);
}

/**
 * El cajón del pedido.
 * @param props El pedido y qué hacer al cerrar.
 */
export function CajonPedido({ pedidoId, alCerrar }: { pedidoId: string; alCerrar: () => void }) {
	const consulta = useConsulta(pedidoVentas, { pedido_id: pedidoId });
	const { abrir, navegar } = useDireccionDeVentas();
	const router = useRouter();
	const tiene = useTieneDepartamento();
	const conConexion = useConConexion();
	const confirmar = useEnvio(confirmarPedido);
	const cancelar = useEnvio(cancelarPedido);
	const [ventana, setVentana] = useState<"cancelar" | "bodega" | undefined>(undefined);
	const pedido = consulta.data;
	const ir = (ruta: string) => router.history.push(ruta);
	const relacionados =
		pedido === undefined ? undefined : (
			<>
				<BotonConCifra
					cifra={pedido.relacionados.lotes.cuantos}
					texto={pedido.relacionados.lotes.texto}
					icono={Factory}
					{...(tiene("produccion") ? { alTocar: () => ir(`/produccion/ordenes?pedido=${pedido.pedido_id}`) } : {})}
				/>
				<BotonConCifra
					cifra={pedido.relacionados.listas_en_aduana}
					texto={pedido.relacionados.listas_en_aduana === 1 ? "lista en aduana" : "listas en aduana"}
					icono={Truck}
					{...(tiene("aduana") ? { alTocar: () => ir("/aduana") } : {})}
				/>
				<BotonConCifra
					cifra={pedido.relacionados.notas}
					texto={pedido.relacionados.notas === 1 ? "nota de entrega" : "notas de entrega"}
					icono={FileText}
					{...(tiene("ventas") ? { alTocar: () => navegar({ del_pedido: pedido.pedido_id }, "notas") } : {})}
				/>
				<BotonConCifra
					texto={
						pedido.relacionados.anticipo_recibido_centavos === null
							? "sin anticipo"
							: `${montoEnPantalla(pedido.relacionados.anticipo_recibido_centavos)} anticipo recibido`
					}
					icono={Banknote}
					alTocar={tiene("contaduria") ? () => ir("/contaduria") : undefined}
				/>
				<BotonConCifra texto={pedido.relacionados.credito} icono={CreditCard} />
			</>
		);
	const puede = pedido?.puede;
	const acciones =
		pedido === undefined || puede === undefined ? undefined : (
			<div className="flex flex-wrap justify-end gap-2">
				{puede.pasar_a_bodega ? (
					<Boton disabled={!conConexion} onClick={() => setVentana("bodega")}>
						Pasar a bodega
					</Boton>
				) : null}
				{puede.pdf ? (
					<Boton icono={Printer} onClick={() => abrirHoja("pedido", pedido.pedido_id)}>
						PDF
					</Boton>
				) : null}
				{puede.editar ? (
					<Boton disabled={!conConexion} onClick={() => abrir("modificar", pedido.pedido_id)}>
						Editar
					</Boton>
				) : null}
				{puede.modificar ? (
					<Boton disabled={!conConexion} onClick={() => abrir("modificar", pedido.pedido_id)}>
						Modificar pedido
					</Boton>
				) : null}
				{puede.confirmar ? (
					<Boton
						variante="principal"
						disabled={!conConexion || confirmar.enviando}
						onClick={() => void confirmar.enviar({ datos: { pedido_id: pedido.pedido_id }, version: pedido.version })}
					>
						Confirmar pedido
					</Boton>
				) : null}
				{pedido.estado === "confirmado" && (puede.modificar || puede.armar_nota) ? (
					<Boton
						variante="principal"
						icono={Receipt}
						disabled={!conConexion || !puede.armar_nota}
						onClick={() => abrir("armar", pedido.pedido_id)}
					>
						Armar nota de entrega
					</Boton>
				) : null}
			</div>
		);
	return (
		<>
			<Cajon
				abierto
				ancho
				alCerrar={alCerrar}
				contexto={
					pedido === undefined
						? "Pedido"
						: `${pedido.folio} · Pedido${pedido.version_vigente >= 2 ? ` · versión ${pedido.version_vigente}` : ""}`
				}
				titulo={pedido?.cliente.nombre ?? ""}
				{...(relacionados === undefined ? {} : { relacionados })}
				{...(puede?.cancelar === true
					? {
							pieIzquierda: (
								<Boton variante="peligro" disabled={!conConexion} onClick={() => setVentana("cancelar")}>
									Cancelar con motivo
								</Boton>
							),
						}
					: {})}
				{...(acciones === undefined ? {} : { accion: acciones })}
			>
				{pedido === undefined ? null : (
					<div className="mb-4 flex items-center gap-3">
						<MuestraDeColor color={pedido.cliente.color} tamano="grande" />
						<span className="text-tinta2">{pedido.etapa.texto}</span>
					</div>
				)}
				{confirmar.choco || cancelar.choco ? (
					<div className="mb-4">
						<EstadoDePantalla tipo="choque" documento={pedido?.folio ?? "El pedido"} />
					</div>
				) : null}
				<SegunConsulta consulta={consulta}>
					{(datos) => (
						<CuerpoDelPedido
							pedido={datos}
							alMandar={() => abrir("mandar", datos.pedido_id)}
							alArmar={() => abrir("armar", datos.pedido_id)}
						/>
					)}
				</SegunConsulta>
			</Cajon>
			{ventana === "cancelar" && pedido !== undefined ? (
				<VentanaConMotivo
					titulo={`Cancelar ${pedido.folio}`}
					textoAccion="Cancelar pedido"
					enviando={cancelar.enviando}
					alCerrar={() => setVentana(undefined)}
					alConfirmar={async (motivo) => {
						let error: string | undefined;
						const salio = await cancelar.enviar(
							{ datos: { pedido_id: pedido.pedido_id, motivo }, version: pedido.version },
							(campos) => {
								error = campos.motivo;
							},
						);
						if (salio !== undefined) {
							setVentana(undefined);
							alCerrar();
						}
						return error;
					}}
				>
					{pedido.lotes_a_temporada > 0 ? (
						<p className="m-0 text-tinta2">
							Sus {pedido.lotes_a_temporada} {pedido.lotes_a_temporada === 1 ? "lote pasa" : "lotes pasan"} a temporada:
							lo que se produzca va a bodega.
						</p>
					) : null}
				</VentanaConMotivo>
			) : null}
			{ventana === "bodega" && pedido !== undefined ? (
				<VentanaPasarABodega
					pedidoId={pedido.pedido_id}
					folio={pedido.folio}
					version={pedido.version}
					listo={pedido.listo_por_talla}
					alCerrar={() => setVentana(undefined)}
				/>
			) : null}
		</>
	);
}
