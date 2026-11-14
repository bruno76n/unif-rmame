/**
 * La ventana «Capturar nota o factura» (ancha): el proveedor y sus órdenes (una o varias, con lo que le toca a cada una
 * sin IVA), el folio, la fecha, el subtotal, el IVA, el total, el UUID y el XML y el PDF o la foto (opcionales); por orden
 * con algo recibido, sus materiales con el precio «En la nota»; y el recuadro con la orden, lo recibido y la factura.
 * «Guardar» sube el XML y el PDF y llama a `contaduria.capturar_factura_proveedor` con sus `archivo_id`; si una subida
 * falla, el aviso dice por qué y lo capturado se queda. Se abre desde Cuentas por pagar y desde la orden en Compras, por la
 * dirección (`?ventana=capturar_factura&orden_compra_id=…`).
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Capturar nota o factura») y
 * docs/modulos/contaduria/facturas-de-proveedor.md
 *
 * El aviso del cambio de precio sale de `cambioDePrecio` del paquete compartido, el mismo de Compras.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { cambioDePrecio } from "@uniformame/compartido/calculos/compras";
import { centavosACampo, pesosACentavos, sumarCentavos } from "@uniformame/compartido/calculos/dinero";
import { capturarFacturaOpciones } from "@uniformame/compartido/contratos/contaduria/consultas-pagar";
import { capturarFacturaProveedor } from "@uniformame/compartido/contratos/contaduria/por-pagar";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { CampoDeArchivo } from "@uniformame/interfaz/captura/campo-de-archivo";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { aceptaDe, useSubidaAlMandar } from "../../../comun/subida.ts";
import { useEnvio } from "../envio.ts";

/** Lo que da la consulta. */
type Opciones = z.infer<typeof capturarFacturaOpciones.resultado>;

/** Un monto en pesos escrito en un campo. */
const montoEscrito = (mensaje: string) => z.string().refine((texto) => pesosACentavos(texto) !== null, mensaje);

/** El formulario de la factura, con el esquema del contrato para el folio, la fecha y el UUID. */
const formularioDeFactura = z.object({
	folio_proveedor: capturarFacturaProveedor.entrada.shape.folio_proveedor,
	fecha_factura: z.union([z.literal(""), z.iso.date("Escribe la fecha.")]),
	subtotal: montoEscrito("Escribe el subtotal en pesos"),
	iva: montoEscrito("Escribe el IVA en pesos"),
	total: montoEscrito("Escribe el total en pesos"),
	uuid_cfdi: z.union([z.literal(""), z.uuid("Ese UUID no es válido.")]),
});

/**
 * El cuerpo de la ventana, con las opciones ya leídas.
 * @param props Las opciones, cómo cambiar de proveedor y qué hacer al cerrar.
 */
function CapturaDeFactura({
	opciones,
	alCambiarProveedor,
	alCerrar,
}: {
	opciones: Opciones;
	alCambiarProveedor: (proveedorId: string) => void;
	alCerrar: () => void;
}) {
	const { enviar, enviando } = useEnvio(capturarFacturaProveedor);
	const conConexion = useConConexion();
	const { subir, subiendo } = useSubidaAlMandar("factura_proveedor", "contaduria");
	const [xml, setXml] = useState<File | null>(null);
	const [pdf, setPdf] = useState<File | null>(null);
	const [erroresDeArchivo, setErroresDeArchivo] = useState<Record<string, string>>({});
	const [escogidas, setEscogidas] = useState<string[]>([]);
	const [importes, setImportes] = useState<Record<string, string>>({});
	const [precios, setPrecios] = useState<Record<string, string>>({});
	const [totalTocado, setTotalTocado] = useState(false);
	// Al cambiar de proveedor (y al abrir), se proponen sus órdenes recibidas que esperan factura. Se hace al pintar y por
	// el proveedor, no por las opciones: volver a leerlas no borra lo que ya se escogió.
	const [proveedorAntes, setProveedorAntes] = useState<string | null | undefined>(undefined);
	if (opciones.proveedor_id !== proveedorAntes) {
		setProveedorAntes(opciones.proveedor_id);
		setEscogidas(opciones.ordenes.filter((orden) => orden.propuesta).map((orden) => orden.orden_compra_id));
	}
	const formulario = useForm<z.input<typeof formularioDeFactura>>({
		resolver: zodResolver(formularioDeFactura),
		defaultValues: { folio_proveedor: "", fecha_factura: "", subtotal: "", iva: "", total: "", uuid_cfdi: "" },
	});
	const errores = formulario.formState.errors;
	const [subtotal, iva] = formulario.watch(["subtotal", "iva"]);
	// El total se llena con subtotal + IVA mientras no se escriba a mano.
	useEffect(() => {
		const suma = (pesosACentavos(subtotal) ?? 0) + (pesosACentavos(iva) ?? 0);
		if (!totalTocado) formulario.setValue("total", suma === 0 ? "" : centavosACampo(suma));
	}, [subtotal, iva, totalTocado, formulario]);
	const ordenes = opciones.ordenes.filter((orden) => escogidas.includes(orden.orden_compra_id));
	const varias = ordenes.length > 1;
	const guardar = formulario.handleSubmit(async (valores) => {
		// El XML y el PDF se suben primero; si alguno no se pudo, ya lo avisó y no se guarda.
		const xmlId = xml === null ? undefined : await subir(xml);
		if (xml !== null && xmlId === undefined) return;
		const pdfId = pdf === null ? undefined : await subir(pdf);
		if (pdf !== null && pdfId === undefined) return;
		const preciosNota = ordenes.flatMap((orden) =>
			orden.lineas.flatMap((linea) => {
				const nuevo = pesosACentavos(precios[linea.orden_compra_linea_id] ?? "");
				return nuevo === null || nuevo === linea.precio_centavos
					? []
					: [{ orden_compra_linea_id: linea.orden_compra_linea_id, precio_centavos: nuevo }];
			}),
		);
		const salio = await enviar(
			{
				datos: {
					ordenes: ordenes.map((orden) => ({
						orden_compra_id: orden.orden_compra_id,
						...(varias ? { importe_sin_iva_centavos: pesosACentavos(importes[orden.orden_compra_id] ?? "") ?? 0 } : {}),
					})),
					folio_proveedor: valores.folio_proveedor,
					...(valores.fecha_factura === "" ? {} : { fecha_factura: valores.fecha_factura }),
					subtotal_centavos: pesosACentavos(valores.subtotal) ?? 0,
					iva_centavos: pesosACentavos(valores.iva) ?? 0,
					total_centavos: pesosACentavos(valores.total) ?? 0,
					...(valores.uuid_cfdi === "" ? {} : { uuid_cfdi: valores.uuid_cfdi }),
					...(xmlId === undefined ? {} : { archivo_xml_id: xmlId }),
					...(pdfId === undefined ? {} : { archivo_pdf_id: pdfId }),
					...(preciosNota.length === 0 ? {} : { precios_nota: preciosNota }),
				},
			},
			(campos) => {
				setErroresDeArchivo(campos);
				for (const [campo, mensaje] of Object.entries(campos)) {
					const enElFormulario = campo.replace("_centavos", "").replace("total_facturado", "total");
					const conocido = formularioDeFactura.keyof().safeParse(enElFormulario);
					if (conocido.success) formulario.setError(conocido.data, { message: mensaje });
				}
			},
		);
		if (salio !== undefined) alCerrar();
	});
	// Lo de las órdenes escogidas, sumado en enteros.
	const totalDeOrdenes = sumarCentavos(ordenes.map((orden) => orden.total_centavos ?? 0));
	const recibido = sumarCentavos(ordenes.map((orden) => orden.recibido_centavos ?? 0));
	return (
		<form className="flex flex-col gap-4" onSubmit={(evento) => void guardar(evento)}>
			<Selector
				enVentana
				etiqueta="Proveedor"
				vacio="Escoge el proveedor"
				opciones={opciones.proveedores.map((proveedor) => ({ valor: proveedor.id, texto: proveedor.nombre }))}
				value={opciones.proveedor_id ?? ""}
				onChange={(evento) => alCambiarProveedor(evento.target.value)}
			/>
			{opciones.ordenes.length === 0 ? null : (
				<fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
					<legend className="mb-1 font-semibold">Órdenes</legend>
					{opciones.ordenes.map((orden) => (
						<div key={orden.orden_compra_id} className="flex flex-wrap items-center gap-3">
							<Casilla
								etiqueta={`${orden.folio} · ${orden.estado} · ${montoEnPantalla(orden.total_centavos)}`}
								marcada={escogidas.includes(orden.orden_compra_id)}
								alCambiar={(marcada) =>
									setEscogidas((antes) =>
										marcada ? [...antes, orden.orden_compra_id] : antes.filter((id) => id !== orden.orden_compra_id),
									)
								}
							/>
							{varias && escogidas.includes(orden.orden_compra_id) ? (
								<Campo
									enVentana
									etiqueta={`Lo de ${orden.folio}, sin IVA`}
									inputMode="decimal"
									value={importes[orden.orden_compra_id] ?? ""}
									onChange={(evento) =>
										setImportes((antes) => ({ ...antes, [orden.orden_compra_id]: evento.target.value }))
									}
								/>
							) : null}
						</div>
					))}
				</fieldset>
			)}
			<div className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1">
				<Campo
					enVentana
					etiqueta="Folio del proveedor"
					placeholder="Como viene en su factura"
					autoComplete="off"
					error={errores.folio_proveedor?.message}
					{...formulario.register("folio_proveedor")}
				/>
				<Campo
					enVentana
					type="date"
					etiqueta="Fecha de la factura (opcional)"
					error={errores.fecha_factura?.message}
					{...formulario.register("fecha_factura")}
				/>
				<Campo
					enVentana
					etiqueta="Subtotal"
					inputMode="decimal"
					error={errores.subtotal?.message}
					{...formulario.register("subtotal")}
				/>
				<Campo
					enVentana
					etiqueta="IVA"
					inputMode="decimal"
					error={errores.iva?.message}
					{...formulario.register("iva")}
				/>
				<Campo
					enVentana
					etiqueta="Total"
					inputMode="decimal"
					error={errores.total?.message}
					{...formulario.register("total", { onChange: () => setTotalTocado(true) })}
				/>
				<Campo
					enVentana
					etiqueta="UUID del CFDI (opcional)"
					autoComplete="off"
					error={errores.uuid_cfdi?.message}
					{...formulario.register("uuid_cfdi")}
				/>
				<CampoDeArchivo
					enVentana
					etiqueta="XML (opcional)"
					acepta={aceptaDe.xml}
					archivo={xml}
					error={erroresDeArchivo.archivo_xml_id}
					alEscoger={setXml}
				/>
				<CampoDeArchivo
					enVentana
					etiqueta="PDF o foto (opcional)"
					acepta={aceptaDe.pdfOFoto}
					archivo={pdf}
					error={erroresDeArchivo.archivo_pdf_id}
					alEscoger={setPdf}
				/>
			</div>
			{ordenes
				.filter((orden) => orden.lineas.length > 0)
				.map((orden) => (
					<section key={orden.orden_compra_id} className="flex flex-col gap-2">
						<TituloDeBloque titulo={orden.folio} />
						<Tabla
							nombre={`Materiales de ${orden.folio}`}
							filas={orden.lineas}
							claveDeFila={(linea) => linea.orden_compra_linea_id}
							columnas={[
								{ clave: "material", encabezado: "Material", celda: (linea) => linea.material },
								{ clave: "recibido", encabezado: "Recibido", alinear: "derecha", celda: (linea) => linea.recibido },
								{
									clave: "orden",
									encabezado: "Orden",
									alinear: "derecha",
									celda: (linea) => montoEnPantalla(linea.precio_centavos),
								},
								{
									clave: "nota",
									encabezado: "En la nota",
									celda: (linea) => {
										const escrito = precios[linea.orden_compra_linea_id] ?? centavosACampo(linea.precio_centavos);
										const nuevo = pesosACentavos(escrito);
										const cambio =
											nuevo === null
												? null
												: cambioDePrecio(linea.precio_centavos, nuevo, opciones.umbral_cambio_precio_pct);
										return (
											<span className="flex flex-col gap-1">
												<Campo
													etiqueta="Precio"
													inputMode="decimal"
													value={escrito}
													onChange={(evento) =>
														setPrecios((antes) => ({ ...antes, [linea.orden_compra_linea_id]: evento.target.value }))
													}
												/>
												{cambio === null ? null : (
													<TextoConTono tono={cambio.ambar ? "ambar" : "normal"}>{cambio.texto}</TextoConTono>
												)}
											</span>
										);
									},
								},
							]}
						/>
					</section>
				))}
			{ordenes.length === 0 ? null : (
				<Recuadro color="azul">
					Orden {montoEnPantalla(totalDeOrdenes)} · recibido {montoEnPantalla(recibido)}
					{pesosACentavos(subtotal) === null ? "" : ` · factura ${montoEnPantalla(pesosACentavos(subtotal))}`}
				</Recuadro>
			)}
			<div className="flex justify-end">
				<Boton
					variante="principal"
					disabled={!conConexion || enviando || subiendo || ordenes.length === 0}
					onClick={() => void guardar()}
				>
					Guardar
				</Boton>
			</div>
		</form>
	);
}

/**
 * La ventana «Capturar nota o factura».
 * @param props La orden con que se abre (desde Compras) y qué hacer al cerrar.
 */
export function VentanaCapturarFactura({
	ordenCompraId,
	alCerrar,
}: {
	ordenCompraId: string | undefined;
	alCerrar: () => void;
}) {
	const [proveedorId, setProveedorId] = useState<string | undefined>(undefined);
	const consulta = useConsulta(capturarFacturaOpciones, {
		...(proveedorId === undefined ? {} : { proveedor_id: proveedorId }),
		...(ordenCompraId === undefined || proveedorId !== undefined ? {} : { orden_compra_id: ordenCompraId }),
	});
	return (
		<Ventana abierta ancha alCerrar={alCerrar} titulo="Capturar nota o factura">
			<SegunConsulta consulta={consulta} renglones={6}>
				{(opciones) => <CapturaDeFactura opciones={opciones} alCambiarProveedor={setProveedorId} alCerrar={alCerrar} />}
			</SegunConsulta>
		</Ventana>
	);
}
