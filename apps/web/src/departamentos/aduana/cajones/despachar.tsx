/**
 * El cajón Despachar: «{folio} · A {destino}» y el título; las cifras («{cantidad} salen» o «esperan nota»,
 * «{antigüedad} desde el {fecha}», «{fecha} la esperan» o «sin fecha»); Destino y Qué es; según lo que es, el candado
 * «Sin nota de entrega no sale…» con la tabla por talla y «Ver pedido {PE}» (con Ventas a externos), la nota de entrega
 * sin precios, la tabla por talla de un lote, o por qué no sale; «Juntar en el mismo despacho» con lo que también puede
 * salir a ese destino, ya marcado; las etiquetas, con «Imprimir etiquetas» y «PDF» (`inventario.marcar_etiquetas_impresas`);
 * y «Despachar a {destino o cliente}» (`inventario.despachar`), que abre En tránsito con el despacho resaltado.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Cajones»: Despachar)
 */

import { useRouter } from "@tanstack/react-router";
import { detalleDespachar } from "@uniformame/compartido/contratos/inventario/aduana-cajones";
import { despachar, marcarEtiquetasImpresas } from "@uniformame/compartido/contratos/inventario/despachos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { BotonConCifra } from "@uniformame/interfaz/botones/boton-con-cifra";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { CifraDeCajon } from "@uniformame/interfaz/pagina/cifra-de-cajon";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { FileText, Lock, Printer, Send } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useTieneDepartamento } from "../../../comun/tiene-departamento.ts";
import { useEnvio } from "../comun.tsx";
import { useDireccionDeAduana } from "../direccion.ts";

/** Lo que regresa la consulta. */
type Detalle = z.infer<typeof detalleDespachar.resultado>;

/**
 * La tabla por talla: Prenda · Tallas · Piezas, con su total.
 * @param props Las prendas y el total.
 */
function TablaPorTalla({ prendas, total }: { prendas: Detalle["por_talla"]; total: number }) {
	return (
		<Tabla
			nombre="Por talla"
			filas={prendas}
			claveDeFila={(prenda) => prenda.prenda}
			columnas={[
				{ clave: "prenda", encabezado: "Prenda", celda: (prenda) => prenda.prenda, suma: "Total" },
				{
					clave: "tallas",
					encabezado: "Tallas",
					celda: (prenda) => prenda.tallas.map((talla) => `${talla.talla}: ${talla.piezas}`).join(" · "),
				},
				{
					clave: "piezas",
					encabezado: "Piezas",
					alinear: "derecha",
					celda: (prenda) => prenda.piezas,
					suma: <b>{total}</b>,
				},
			]}
		/>
	);
}

/**
 * Las etiquetas: su estado, «Imprimir etiquetas» a la Zebra de Aduana y «PDF», que abre las etiquetas.
 * @param props Lo que se despacha.
 */
function Etiquetas({ detalle }: { detalle: Detalle }) {
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(marcarEtiquetasImpresas);
	if (detalle.etiquetas === null) return null;
	/** Manda las etiquetas a la impresora o al PDF. */
	const mandar = async (destino: "impresora" | "pdf") => {
		const salio = await enviar({ datos: { traspaso_id: detalle.traspaso_id, destino }, version: detalle.version });
		if (salio?.pdf_ruta !== undefined) window.open(salio.pdf_ruta, "_blank", "noopener");
	};
	return (
		<div className="flex flex-wrap items-center gap-3">
			<Estado texto={detalle.etiquetas.estado.texto} color={detalle.etiquetas.estado.color} />
			<Boton chico icono={Printer} disabled={!conConexion || enviando} onClick={() => void mandar("impresora")}>
				Imprimir etiquetas
			</Boton>
			<Boton chico icono={FileText} disabled={!conConexion || enviando} onClick={() => void mandar("pdf")}>
				PDF
			</Boton>
		</div>
	);
}

/**
 * El cajón Despachar.
 * @param props Lo que está en aduana y cómo cerrar el cajón.
 */
export function CajonDespachar({ traspasoId, alCerrar }: { traspasoId: string; alCerrar: () => void }) {
	const consulta = useConsulta(detalleDespachar, { traspaso_id: traspasoId });
	const conConexion = useConConexion();
	const tiene = useTieneDepartamento();
	const router = useRouter();
	const { navegar } = useDireccionDeAduana();
	const { enviar, enviando, choco } = useEnvio(despachar);
	const [fuera, setFuera] = useState<readonly string[]>([]);
	const detalle = consulta.data;
	/** Despacha lo que se ve y lo marcado para juntar; abre En tránsito con el despacho resaltado. */
	const despacharLo = async () => {
		if (detalle === undefined) return;
		const juntos = detalle.juntar.filter((junto) => !fuera.includes(junto.traspaso_id));
		const salio = await enviar({
			datos: {
				traspasos: [
					{ traspaso_id: detalle.traspaso_id, version: detalle.version },
					...juntos.map((junto) => ({ traspaso_id: junto.traspaso_id, version: junto.version })),
				],
			},
		});
		if (salio !== undefined) navegar({ resaltar: salio.despacho_id }, "transito");
	};
	const pedido = detalle?.pedido ?? null;
	return (
		<Cajon
			abierto
			ancho
			alCerrar={alCerrar}
			{...(detalle === undefined ? {} : { contexto: `${detalle.folio} · ${detalle.destino}` })}
			titulo={detalle?.titulo ?? ""}
			relacionados={
				pedido !== null && detalle?.caso === "sin_nota" && tiene("ventas") ? (
					<BotonConCifra
						texto={`Ver pedido ${pedido.folio}`}
						alTocar={() => router.history.push(`/ventas/pedidos?cajon=pedido&id=${pedido.pedido_id}`)}
					/>
				) : undefined
			}
			accion={
				detalle?.boton == null ? undefined : (
					<Boton
						variante="principal"
						icono={Send}
						disabled={!conConexion || enviando}
						onClick={() => void despacharLo()}
					>
						{detalle.boton}
					</Boton>
				)
			}
		>
			{choco && detalle !== undefined ? <EstadoDePantalla tipo="choque" documento={detalle.folio} /> : null}
			<SegunConsulta consulta={consulta}>
				{(datos) => (
					<div className="flex flex-col gap-5">
						<div className="grid grid-cols-3 gap-3 max-telefono:grid-cols-1">
							<CifraDeCajon numero={datos.cantidad} nombre={datos.salen} />
							<CifraDeCajon numero={datos.antiguedad} nombre={datos.desde} rojo={datos.antiguedad_color === "rojo"} />
							<CifraDeCajon
								numero={datos.la_esperan ?? "—"}
								nombre={datos.la_esperan === null ? "sin fecha" : "la esperan"}
							/>
						</div>
						<div className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1">
							<Dato etiqueta="Destino">{datos.dato_destino}</Dato>
							<Dato etiqueta="Qué es">{datos.que_es}</Dato>
						</div>
						{datos.aviso === null ? null : (
							<Recuadro color={datos.caso === "sin_nota" ? "ambar" : "azul"}>
								<span className="inline-flex items-center gap-2">
									{datos.caso === "sin_nota" ? <Lock size={17} strokeWidth={1.9} aria-hidden /> : null}
									{datos.aviso}
								</span>
							</Recuadro>
						)}
						{datos.nota === null ? null : (
							<div className="flex flex-col gap-3">
								<TituloDeBloque
									titulo={`Nota de entrega ${datos.nota.folio}`}
									detalle={`Del pedido ${datos.nota.pedido} · sin precios`}
								/>
								<Dato etiqueta={datos.nota.cliente}>{datos.nota.direccion}</Dato>
							</div>
						)}
						{datos.por_talla.length === 0 ? null : (
							<div className="flex flex-col gap-3">
								{datos.nota === null ? (
									<TituloDeBloque
										titulo="Por talla"
										{...(datos.caso === "sin_nota" && datos.pedido !== null
											? { detalle: `Del pedido ${datos.pedido.folio}` }
											: {})}
									/>
								) : null}
								<TablaPorTalla prendas={datos.por_talla} total={datos.total} />
							</div>
						)}
						{datos.juntar.length === 0 ? null : (
							<div className="flex flex-col gap-2">
								<TituloDeBloque titulo="Juntar en el mismo despacho" />
								{datos.juntar.map((junto) => (
									<Casilla
										key={junto.traspaso_id}
										etiqueta={`${junto.folio} · ${junto.titulo} · ${junto.cantidad}`}
										marcada={!fuera.includes(junto.traspaso_id)}
										alCambiar={(marcada) =>
											setFuera((antes) =>
												marcada ? antes.filter((suyo) => suyo !== junto.traspaso_id) : [...antes, junto.traspaso_id],
											)
										}
									/>
								))}
							</div>
						)}
						<Etiquetas detalle={datos} />
						{datos.queda_en_camino === null ? null : <Recuadro color="azul">{datos.queda_en_camino}</Recuadro>}
					</div>
				)}
			</SegunConsulta>
		</Cajon>
	);
}
