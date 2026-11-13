/**
 * Etiquetas de Catálogo: «Variantes nuevas sin etiqueta» por producto con su «PDF de {n} etiquetas», y «Por variante»:
 * las tallas de un producto con su código, el estado de su etiqueta y cuántas, con «Generar PDF» y la vista previa de la
 * etiqueta de la talla escogida. Las dos llaman a `catalogo.imprimir_etiquetas` y abren el PDF.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Etiquetas»)
 */

import { imprimirEtiquetas } from "@uniformame/compartido/contratos/catalogo/etiquetas";
import { etiquetasDeCatalogo } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Shirt } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { esperar, useAccionDeCatalogo } from "../acciones.ts";
import { useBusqueda, useIr } from "../direccion.ts";
import { cuantos, escuelaOBasico, pesos } from "../textos.ts";

/** El producto de «Por variante». */
type ProductoDeEtiquetas = NonNullable<z.infer<typeof etiquetasDeCatalogo.resultado>["producto"]>;

/** Cómo se dice el estado de la etiqueta de una talla. */
const textoDeEtiqueta = {
	por_imprimir: "Por imprimir",
	por_reimprimir: "Por imprimir",
	al_fabricar: "Al fabricar el pedido",
	impresa: "Impresa",
} as const;

/** Etiquetas. */
export function PestanaEtiquetas() {
	const busqueda = useBusqueda();
	const ir = useIr();
	const consulta = useConsulta(
		etiquetasDeCatalogo,
		busqueda.etiquetas_de === undefined ? {} : { producto_id: busqueda.etiquetas_de },
	);
	const accion = useAccionDeCatalogo(imprimirEtiquetas);
	const conConexion = useConConexion();
	const nuevas = async (productoId: string) => {
		const salida = await esperar(accion.mutateAsync({ datos: { producto_ids: [productoId], solo_pendientes: true } }));
		if (salida.bien) window.open(salida.resultado.url, "_blank", "noopener");
	};
	return (
		<SegunConsulta consulta={consulta}>
			{(datos) => (
				<>
					<Panel titulo="Variantes nuevas sin etiqueta">
						{datos.nuevas.length === 0 ? (
							<EstadoDePantalla tipo="vacio" texto="Todas impresas" bien />
						) : (
							<ul className="m-0 flex list-none flex-col p-0">
								{datos.nuevas.map((nueva) => (
									<li
										key={nueva.producto_id}
										className="flex flex-wrap items-center gap-3 border-linea border-b py-3 last:border-b-0"
									>
										<span className="grid size-10 place-items-center rounded-mediano bg-suave text-tinta3">
											<Shirt aria-hidden="true" size={18} />
										</span>
										<span className="flex flex-1 flex-col">
											<b>{nueva.nombre}</b>
											<span className="text-etiqueta text-tinta2">
												{`${escuelaOBasico(nueva.escuela)} · ${cuantos(nueva.variantes, "variante", "variantes")}`}
											</span>
										</span>
										<Boton
											chico
											disabled={accion.isPending || !conConexion}
											onClick={() => void nuevas(nueva.producto_id)}
										>
											{`PDF de ${cuantos(nueva.variantes, "etiqueta", "etiquetas")}`}
										</Boton>
									</li>
								))}
							</ul>
						)}
					</Panel>
					<Panel
						titulo="Por variante"
						derecha={
							<div className="w-72 max-telefono:w-full">
								<Selector
									etiqueta="Producto"
									vacio="Escoge un producto"
									opciones={datos.productos.map((producto) => ({
										valor: producto.id,
										texto: `${producto.nombre} · ${escuelaOBasico(producto.escuela)}`,
									}))}
									value={busqueda.etiquetas_de ?? ""}
									onChange={(evento) => ir({ etiquetas_de: evento.target.value || undefined })}
								/>
							</div>
						}
					>
						{datos.producto === null ? (
							<EstadoDePantalla tipo="vacio" texto="Escoge un producto para ver sus variantes." />
						) : (
							<PorVariante
								key={datos.producto.id}
								producto={datos.producto}
								maximo={datos.maximo_por_talla}
								llevaPrecio={datos.lleva_precio}
							/>
						)}
					</Panel>
				</>
			)}
		</SegunConsulta>
	);
}

/**
 * Las tallas de un producto con cuántas etiquetas de cada una, «Generar PDF» y la vista previa.
 * @param props El producto, el máximo por talla y si la etiqueta lleva precio.
 */
function PorVariante({
	producto,
	maximo,
	llevaPrecio,
}: {
	producto: ProductoDeEtiquetas;
	maximo: number;
	llevaPrecio: boolean;
}) {
	const etiquetables = producto.variantes.filter((variante) => !variante.es_pedido_especial && !variante.descontinuada);
	const [cuantas, setCuantas] = useState<Record<string, string>>(
		Object.fromEntries(
			etiquetables.map((variante) => [variante.id, variante.estado_etiqueta === "impresa" ? "0" : "1"]),
		),
	);
	const [vista, setVista] = useState(producto.variantes[0]?.id);
	const accion = useAccionDeCatalogo(imprimirEtiquetas);
	const conConexion = useConConexion();
	const renglones = etiquetables
		.map((variante) => ({ variante_id: variante.id, cuantas: Number(cuantas[variante.id] ?? "0") }))
		.filter((renglon) => Number.isInteger(renglon.cuantas) && renglon.cuantas > 0);
	const total = renglones.reduce((suma, renglon) => suma + renglon.cuantas, 0);
	const fueraDeRango = renglones.some((renglon) => renglon.cuantas > maximo);
	const generar = async () => {
		const salida = await esperar(accion.mutateAsync({ datos: { renglones } }));
		if (salida.bien) window.open(salida.resultado.url, "_blank", "noopener");
	};
	const enVista = producto.variantes.find((variante) => variante.id === vista);
	return (
		<div className="flex flex-col gap-4">
			<p className="m-0 text-tinta2">
				{`${producto.nombre} · ${escuelaOBasico(producto.escuela)} · ${cuantos(producto.variantes.length, "variante con código", "variantes con código")}`}
			</p>
			<div className="grid grid-cols-[2fr_1fr] gap-5 max-menu:grid-cols-1">
				<div>
					<Tabla
						nombre={`Variantes de ${producto.nombre}`}
						filas={producto.variantes}
						claveDeFila={(variante) => variante.id}
						alTocarFila={(variante) => setVista(variante.id)}
						columnas={[
							{
								clave: "talla",
								encabezado: "Talla",
								celda: (variante) => (
									<span className="flex flex-col">
										<b>{variante.talla}</b>
										{variante.es_pedido_especial ? (
											<span className="text-etiqueta text-tinta2">Pedido especial</span>
										) : null}
									</span>
								),
							},
							{
								clave: "codigo",
								encabezado: "Código",
								celda: (variante) => <span className="font-mono">{variante.codigo}</span>,
							},
							{
								clave: "etiqueta",
								encabezado: "Etiqueta",
								celda: (variante) =>
									variante.descontinuada ? "Descontinuada" : textoDeEtiqueta[variante.estado_etiqueta],
							},
							{
								clave: "cuantas",
								encabezado: "Cuántas",
								alinear: "derecha",
								celda: (variante) =>
									variante.es_pedido_especial || variante.descontinuada ? (
										"—"
									) : (
										<span className="inline-block w-24">
											<Campo
												etiqueta={`Cuántas de la talla ${variante.talla}`}
												inputMode="numeric"
												value={cuantas[variante.id] ?? "0"}
												error={Number(cuantas[variante.id]) > maximo ? `Hasta ${maximo}` : undefined}
												onChange={(evento) =>
													setCuantas((antes) => ({ ...antes, [variante.id]: evento.target.value.trim() }))
												}
											/>
										</span>
									),
							},
						]}
					/>
					<div className="flex items-center justify-end gap-3 pt-3">
						<span className="text-tinta2 tabular-nums">{cuantos(total, "etiqueta", "etiquetas")}</span>
						<Boton
							disabled={total === 0 || fueraDeRango || accion.isPending || !conConexion}
							onClick={() => void generar()}
						>
							Generar PDF
						</Boton>
					</div>
				</div>
				{enVista === undefined ? null : (
					<div className="flex flex-col gap-2">
						<b>{`Así queda la etiqueta de la talla ${enVista.talla}`}</b>
						<div className="flex flex-col gap-1 rounded-mediano border border-linea2 bg-panel p-4">
							<b>{producto.nombre}</b>
							<span className="text-etiqueta">{`${escuelaOBasico(producto.escuela)} · Talla ${enVista.talla}`}</span>
							<span className="font-mono text-subtitulo tracking-widest">{enVista.codigo}</span>
							{llevaPrecio && enVista.precio_centavos !== null ? <b>{pesos(enVista.precio_centavos)}</b> : null}
							{enVista.es_pedido_especial ? <span className="font-semibold">Pedido especial</span> : null}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
