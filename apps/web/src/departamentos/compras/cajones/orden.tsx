/**
 * El cajón de una orden de compra (ancho): su estado y sus avisos, sus datos (el proveedor abre su cajón), «Lo que se
 * pidió» con lo recibido y lo que falta, el total y su historial. En borrador, las cantidades, los precios y «Promete
 * llegar» se capturan: «Guardar», «Marcar enviada» y «Descartar borrador». Enviada: «Cancelar con motivo»; recibida en
 * parte: «Cerrar con faltante»; con algo recibido y Contaduría: «Capturar nota o factura», que abre la ventana de
 * Contaduría por su dirección.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Orden de compra») y docs/modulos/compras/ordenes-de-compra.md
 */

import { useRouter } from "@tanstack/react-router";
import { cantidadConUnidad, errorDeCantidad } from "@uniformame/compartido/calculos/compras";
import { centavosACampo, pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { ordenDeCompra } from "@uniformame/compartido/contratos/compras/consultas-cajones";
import {
	cancelarOrden,
	cerrarOrdenConFaltante,
	guardarBorradorOrden,
	marcarOrdenEnviada,
} from "@uniformame/compartido/contratos/compras/ordenes";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Enlace } from "@uniformame/interfaz/botones/enlace";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { FileText } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { leerFalla, useAccion, useConsulta } from "../../../comun/api.tsx";
import { useCierreDelCajon } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { Historial } from "../../../comun/historial.tsx";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { useDireccionDeCompras } from "../direccion.ts";

/** Lo que regresa la consulta. */
type Orden = z.infer<typeof ordenDeCompra.resultado>;

/** Lo capturado de una línea del borrador. */
interface LineaCapturada {
	cantidad: string;
	precio: string;
}

/** Las consultas que cambian con la orden. */
const cambianConLaOrden = [
	"compras.orden",
	"compras.ordenes",
	"compras.pendientes",
	"compras.por_pedir",
	"compras.material",
	"compras.material_por_que",
	"admin.historial_entidad",
];

/** La dirección de la ventana «Capturar nota o factura» de Contaduría, con la orden ya puesta. */
function direccionCapturarFactura(ordenId: string): string {
	return `/contaduria/cuentas-por-pagar?${new URLSearchParams({ ventana: "capturar_factura", orden_compra_id: ordenId }).toString()}`;
}

/**
 * Lo capturado del borrador como lo pide la acción, o los errores de cada línea.
 * @param datos La orden.
 * @param lineas Lo capturado por línea.
 * @param fecha La fecha prometida.
 */
function leerBorrador(datos: Orden, lineas: Record<string, LineaCapturada>, fecha: string) {
	const errores: Record<string, string> = {};
	const renglones = datos.lineas.map((linea) => {
		const capturada = lineas[linea.orden_compra_linea_id];
		const cantidad = capturada?.cantidad ?? String(Number(linea.pedido));
		const precio = pesosACentavos(capturada?.precio ?? centavosACampo(linea.precio_centavos));
		const error = errorDeCantidad(cantidad, {
			multiplo: linea.multiplo,
			maxima: datos.cantidad_maxima,
			unidad: linea.unidad,
		});
		if (error !== null) errores[`${linea.orden_compra_linea_id}:cantidad`] = error;
		if (precio === null || precio <= 0) errores[`${linea.orden_compra_linea_id}:precio`] = "Escribe el precio.";
		return {
			orden_compra_linea_id: linea.orden_compra_linea_id,
			cantidad: Number(cantidad.replaceAll(",", "")),
			precio_centavos: precio ?? 0,
		};
	});
	if (fecha === "") errores.fecha = "Escribe la fecha en que promete llegar";
	return { datos: { orden_compra_id: datos.orden.orden_compra_id, renglones, fecha_prometida: fecha }, errores };
}

/**
 * El contenido del cajón.
 * @param props La orden, lo capturado y si hubo choque.
 */
function ContenidoDeOrden({
	datos,
	lineas,
	alCapturar,
	fecha,
	alCambiarFecha,
	errores,
	choque,
}: {
	datos: Orden;
	lineas: Record<string, LineaCapturada>;
	alCapturar: (id: string, cambio: Partial<LineaCapturada>) => void;
	fecha: string;
	alCambiarFecha: (fecha: string) => void;
	errores: Record<string, string>;
	choque: boolean;
}) {
	const { ir } = useDireccionDeCompras();
	const { orden } = datos;
	const editar = datos.puede.editar;
	return (
		<div className="flex flex-col gap-2">
			{choque ? <EstadoDePantalla tipo="choque" documento={orden.folio} /> : null}
			<div>
				<Estado
					texto={orden.estado_armado.texto}
					color={orden.estado_armado.color}
					{...(orden.estado_armado.abajo === null ? {} : { abajo: orden.estado_armado.abajo })}
				/>
			</div>
			{orden.avisos.map((aviso) => (
				<p
					key={aviso}
					role="status"
					className="m-0 rounded-mediano bg-suave px-4 py-3 font-semibold text-texto-advertencia"
				>
					{aviso}
				</p>
			))}
			<div className="mt-2 grid grid-cols-3 gap-2 max-telefono:grid-cols-2">
				<Dato etiqueta="Proveedor">
					<Enlace onClick={() => ir({ cajon: "proveedor", id: orden.proveedor_id })}>{orden.proveedor}</Enlace>
				</Dato>
				<Dato etiqueta="Condición de pago">{orden.condicion}</Dato>
				<Dato etiqueta="Levantó">{orden.levanto}</Dato>
				<Dato etiqueta="Creada">{textoDeDiaCorto(orden.creada)}</Dato>
				<Dato etiqueta="Enviada">{orden.enviada === null ? "Todavía no" : textoDeDiaCorto(orden.enviada)}</Dato>
				{orden.llego === null ? (
					<Dato etiqueta="Promete llegar">
						{orden.fecha_prometida === null ? "—" : textoDeDiaCorto(orden.fecha_prometida)}
					</Dato>
				) : (
					<Dato etiqueta="Llegó">{textoDeDiaCorto(orden.llego)}</Dato>
				)}
			</div>
			{editar ? (
				<div className="mt-2 flex flex-col gap-1">
					<Campo
						etiqueta="Promete llegar"
						type="date"
						max={orden.fecha_maxima}
						value={fecha}
						onChange={(evento) => alCambiarFecha(evento.target.value)}
						error={errores.fecha}
					/>
					<span className="text-etiqueta text-tinta2">
						{orden.proveedor} dice que tarda {plural(orden.dice_tardar, "día", "días")}
					</span>
				</div>
			) : null}
			<TituloDeBloque titulo={`Lo que se pidió · ${plural(datos.lineas.length, "material", "materiales")}`} />
			<Tabla
				nombre="Lo que se pidió"
				filas={datos.lineas}
				claveDeFila={(linea) => linea.orden_compra_linea_id}
				columnas={[
					{
						clave: "material",
						encabezado: "Material",
						celda: (linea) => <b className="font-semibold">{linea.material}</b>,
					},
					{
						clave: "pedido",
						encabezado: "Pedido",
						alinear: "derecha",
						celda: (linea) =>
							editar ? (
								<Campo
									etiqueta={`Cantidad de ${linea.material}`}
									inputMode="numeric"
									value={lineas[linea.orden_compra_linea_id]?.cantidad ?? String(Number(linea.pedido))}
									onChange={(evento) => alCapturar(linea.orden_compra_linea_id, { cantidad: evento.target.value })}
									error={errores[`${linea.orden_compra_linea_id}:cantidad`]}
								/>
							) : (
								cantidadConUnidad(linea.pedido, linea.unidad)
							),
					},
					{
						clave: "recibido",
						encabezado: "Recibido",
						alinear: "derecha",
						celda: (linea) => cantidadConUnidad(linea.recibido, linea.unidad),
					},
					{
						clave: "falta",
						encabezado: "Falta",
						alinear: "derecha",
						celda: (linea) =>
							Number(linea.falta) === 0 ? (
								"Nada"
							) : (
								<span className={linea.falta_rojo ? "font-bold text-estado-rojo" : ""}>
									{cantidadConUnidad(linea.falta, linea.unidad)}
								</span>
							),
					},
					{
						clave: "precio",
						encabezado: "Precio",
						alinear: "derecha",
						celda: (linea) =>
							editar ? (
								<Campo
									etiqueta={`Precio de ${linea.material}`}
									inputMode="decimal"
									value={lineas[linea.orden_compra_linea_id]?.precio ?? centavosACampo(linea.precio_centavos)}
									onChange={(evento) => alCapturar(linea.orden_compra_linea_id, { precio: evento.target.value })}
									error={errores[`${linea.orden_compra_linea_id}:precio`]}
								/>
							) : (
								<span className="flex flex-col items-end">
									{montoEnPantalla(linea.precio_centavos)}
									{linea.precio_orden_centavos === null ? null : (
										<span className="text-etiqueta text-tinta3">
											La orden decía {montoEnPantalla(linea.precio_orden_centavos)}
										</span>
									)}
								</span>
							),
					},
					{
						clave: "importe",
						encabezado: "Importe",
						alinear: "derecha",
						celda: (linea) => montoEnPantalla(linea.importe_centavos),
						suma: <b>{montoEnPantalla(datos.total_centavos)}</b>,
					},
				]}
			/>
			<Historial entidad="ordenes_compra" entidadId={orden.orden_compra_id} />
		</div>
	);
}

/**
 * El cajón de una orden de compra.
 * @param props La orden y cómo cerrar el cajón.
 */
export function CajonOrden({ ordenId, alCerrar }: { ordenId: string; alCerrar: () => void }) {
	const conConexion = useConConexion();
	const router = useRouter();
	const consulta = useConsulta(ordenDeCompra, { orden_compra_id: ordenId });
	const [lineas, setLineas] = useState<Record<string, LineaCapturada>>({});
	const [fechaEscrita, setFechaEscrita] = useState<string | null>(null);
	const [choque, setChoque] = useState(false);
	const [ventana, setVentana] = useState<"cancelar" | "cerrar" | null>(null);
	const guardar = useAccion(guardarBorradorOrden, cambianConLaOrden);
	const enviar = useAccion(marcarOrdenEnviada, cambianConLaOrden);
	const cancelar = useAccion(cancelarOrden, cambianConLaOrden);
	const cerrarConFaltante = useAccion(cerrarOrdenConFaltante, cambianConLaOrden);
	const datos = consulta.data;
	const fecha = fechaEscrita ?? datos?.orden.fecha_prometida ?? datos?.orden.fecha_propuesta ?? "";
	const conCambios = Object.keys(lineas).length > 0 || fechaEscrita !== null;
	const { alCerrar: cerrar, pregunta } = useCierreDelCajon(conCambios, alCerrar);
	const leido = datos === undefined ? null : leerBorrador(datos, lineas, fecha);
	const sinErrores = leido !== null && Object.keys(leido.errores).length === 0;
	// Al guardar, lo capturado ya es lo guardado; con choque, se queda lo capturado y se ve lo nuevo.
	const alResponder = {
		onSuccess: () => {
			setLineas({});
			setFechaEscrita(null);
			setChoque(false);
		},
		onError: (falla: unknown) => {
			const conChoque = leerFalla(falla).tipo === "choque";
			setChoque(conChoque);
			if (conChoque) consulta.refetch();
		},
	};
	const conLaOrden = (accion: typeof guardar | typeof enviar) => {
		if (datos === undefined || leido === null || !sinErrores) return;
		accion.mutate({ datos: leido.datos, version: datos.orden.version }, alResponder);
	};
	const ocupado = guardar.isPending || enviar.isPending || cancelar.isPending || cerrarConFaltante.isPending;
	const puede = datos?.puede;
	const orden = datos?.orden;
	const faltante = (datos?.lineas ?? [])
		.filter((linea) => Number(linea.falta) > 0)
		.map((linea) => `${cantidadConUnidad(linea.falta, linea.unidad)} de ${linea.material}`)
		.join(", ");
	return (
		<>
			<Cajon
				abierto
				ancho
				alCerrar={cerrar}
				conCambios={conCambios}
				{...(orden === undefined ? {} : { contexto: `Orden de compra · ${orden.proveedor}` })}
				titulo={orden?.folio ?? ""}
				// Con captura, «Cerrar» es el del cajón, que pregunta antes; sin captura, «Listo».
				{...(puede?.editar
					? {}
					: {
							pieIzquierda: (
								<Boton variante="fantasma" onClick={cerrar}>
									Listo
								</Boton>
							),
						})}
				accion={
					<span className="flex flex-wrap justify-end gap-2">
						{orden?.pdf_archivo_id ? (
							<Boton
								variante="fantasma"
								icono={FileText}
								onClick={() => window.open(`/v1/archivos/${orden.pdf_archivo_id}`, "_blank", "noopener")}
							>
								Ver PDF
							</Boton>
						) : null}
						{puede?.editar ? (
							<Boton variante="peligro" disabled={!conConexion || ocupado} onClick={() => setVentana("cancelar")}>
								Descartar borrador
							</Boton>
						) : null}
						{puede?.cancelar ? (
							<Boton variante="peligro" disabled={!conConexion || ocupado} onClick={() => setVentana("cancelar")}>
								Cancelar con motivo
							</Boton>
						) : null}
						{puede?.cerrar_con_faltante ? (
							<Boton variante="peligro" disabled={!conConexion || ocupado} onClick={() => setVentana("cerrar")}>
								Cerrar con faltante
							</Boton>
						) : null}
						{puede?.editar ? (
							<>
								<Boton disabled={!conConexion || ocupado || !sinErrores} onClick={() => conLaOrden(guardar)}>
									Guardar
								</Boton>
								<Boton
									variante="principal"
									disabled={!conConexion || ocupado || !sinErrores}
									onClick={() => conLaOrden(enviar)}
								>
									Marcar enviada
								</Boton>
							</>
						) : null}
						{puede?.capturar_factura && orden !== undefined ? (
							<Boton
								variante="principal"
								onClick={() => router.history.push(direccionCapturarFactura(orden.orden_compra_id))}
							>
								Capturar nota o factura
							</Boton>
						) : null}
					</span>
				}
			>
				<SegunConsulta consulta={consulta}>
					{(leidos) => (
						<ContenidoDeOrden
							datos={leidos}
							lineas={lineas}
							alCapturar={(id, cambio) =>
								setLineas((antes) => ({
									...antes,
									[id]: {
										cantidad:
											cambio.cantidad ??
											antes[id]?.cantidad ??
											String(Number(leidos.lineas.find((uno) => uno.orden_compra_linea_id === id)?.pedido ?? 0)),
										precio:
											cambio.precio ??
											antes[id]?.precio ??
											centavosACampo(leidos.lineas.find((uno) => uno.orden_compra_linea_id === id)?.precio_centavos),
									},
								}))
							}
							fecha={fecha}
							alCambiarFecha={setFechaEscrita}
							errores={leido?.errores ?? {}}
							choque={choque}
						/>
					)}
				</SegunConsulta>
			</Cajon>
			{pregunta}
			{datos === undefined || orden === undefined ? null : (
				<>
					<VentanaConMotivo
						abierta={ventana === "cancelar"}
						alCerrar={() => setVentana(null)}
						titulo={puede?.editar ? `Descartar ${orden.folio}` : `Cancelar ${orden.folio}`}
						subtitulo={`${orden.proveedor}, ${plural(datos.lineas.length, "material", "materiales")}, ${montoEnPantalla(datos.total_centavos)}.`}
						textoAccion={puede?.editar ? "Descartar orden" : "Cancelar orden"}
						enviando={cancelar.isPending}
						alConfirmar={(motivo) =>
							cancelar.mutate(
								{ datos: { orden_compra_id: orden.orden_compra_id, motivo }, version: orden.version },
								{ onSuccess: () => setVentana(null) },
							)
						}
					/>
					<VentanaConMotivo
						abierta={ventana === "cerrar"}
						alCerrar={() => setVentana(null)}
						titulo={`Cerrar ${orden.folio} con faltante`}
						subtitulo={`Falta: ${faltante}`}
						textoAccion="Cerrar orden"
						enviando={cerrarConFaltante.isPending}
						alConfirmar={(motivo) =>
							cerrarConFaltante.mutate(
								{ datos: { orden_compra_id: orden.orden_compra_id, motivo }, version: orden.version },
								{ onSuccess: () => setVentana(null) },
							)
						}
					>
						<p className="m-0 text-etiqueta text-tinta2">
							Lo que faltó deja de contar como en camino y Por pedir lo vuelve a sugerir si hace falta. Se paga lo
							recibido.
						</p>
					</VentanaConMotivo>
				</>
			)}
		</>
	);
}
