/**
 * Productos de Catálogo: «Lista» o «Galería», el buscador, los filtros (sección, escuela o modelo, estado y canal) y las
 * píldoras, todo en la dirección; un bloque plegable por sección con su «Nuevo producto»; y la barra de selección con
 * «Imprimir etiquetas», «Cambiar precios» y «Descontinuar con motivo». Tocar un producto abre su ficha.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Productos»)
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import { productosDeCatalogo } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { ChevronDown, ChevronRight, Plus, Shirt } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { conAlta, conFicha, useBusqueda, useIr } from "../direccion.ts";
import { escuelaOBasico, nombreDeCanal, textoDeLoQueDetiene } from "../textos.ts";
import { BarraDeSeleccion } from "./seleccion.tsx";

/** Un producto de la pestaña. */
type Producto = z.infer<typeof productosDeCatalogo.resultado>["secciones"][number]["productos"][number];

/** Productos. */
export function PestanaProductos() {
	const busqueda = useBusqueda();
	const ir = useIr();
	const consulta = useConsulta(productosDeCatalogo, {
		...(busqueda.buscar === undefined ? {} : { buscar: busqueda.buscar }),
		...(busqueda.seccion === undefined ? {} : { seccion_id: busqueda.seccion }),
		...(busqueda.escuela === undefined ? {} : { escuela: busqueda.escuela }),
		...(busqueda.estado === undefined ? {} : { estado: busqueda.estado }),
		...(busqueda.canal === undefined ? {} : { canal: busqueda.canal }),
		...(busqueda.pildora === undefined ? {} : { pildora: busqueda.pildora }),
	});
	const vista = busqueda.vista ?? "lista";
	const [escogidos, setEscogidos] = useState<Record<string, string[]>>({});
	const [plegadas, setPlegadas] = useState<ReadonlySet<string>>(new Set());
	const [vuelta, setVuelta] = useState(0);
	const conFiltros = ["buscar", "seccion", "escuela", "estado", "canal", "pildora"].some(
		(clave) => busqueda[clave as keyof typeof busqueda] !== undefined,
	);
	return (
		<>
			<div className="flex flex-wrap items-end gap-3">
				<Filtros
					nombre="Vista"
					filtros={[
						{ clave: "lista", texto: "Lista" },
						{ clave: "galeria", texto: "Galería" },
					]}
					activo={vista}
					alEscoger={(clave) => ir({ vista: clave === "galeria" ? "galeria" : undefined })}
				/>
				<div className="min-w-60 flex-1">
					<Campo
						etiqueta="Buscar producto"
						placeholder="Producto, escuela o código"
						type="search"
						defaultValue={busqueda.buscar ?? ""}
						onChange={(evento) => ir({ buscar: evento.target.value.trim() || undefined })}
					/>
				</div>
				<span className="pb-3 text-tinta2 tabular-nums">
					{consulta.data === undefined ? "" : plural(consulta.data.total, "producto", "productos")}
				</span>
			</div>
			<SegunConsulta consulta={consulta}>
				{(datos) => {
					const todos = datos.secciones.flatMap((seccion) => seccion.productos);
					const seleccion = Object.values(escogidos)
						.flat()
						.flatMap((id) => todos.filter((producto) => producto.id === id));
					const quitarSeleccion = () => {
						setEscogidos({});
						setVuelta((numero) => numero + 1);
					};
					return (
						<>
							<div className="grid grid-cols-4 gap-3 max-menu:grid-cols-2 max-telefono:grid-cols-1">
								<Selector
									etiqueta="Sección"
									vacio="Todas las secciones"
									opciones={datos.filtros.secciones.map((seccion) => ({ valor: seccion.id, texto: seccion.nombre }))}
									value={busqueda.seccion ?? ""}
									onChange={(evento) => ir({ seccion: evento.target.value || undefined })}
								/>
								<Selector
									etiqueta="Escuela o modelo"
									vacio="Toda escuela o modelo"
									opciones={[
										{ valor: "basico", texto: "Básicos, sin escuela" },
										...datos.filtros.escuelas.map((escuela) => ({ valor: escuela.id, texto: escuela.nombre })),
									]}
									value={busqueda.escuela ?? ""}
									onChange={(evento) => ir({ escuela: evento.target.value || undefined })}
								/>
								<Selector
									etiqueta="Estado"
									opciones={[
										{ valor: "activos", texto: "Activos" },
										{ valor: "descontinuados", texto: "Descontinuados" },
										{ valor: "todos", texto: "Todos los estados" },
									]}
									value={busqueda.estado ?? "activos"}
									onChange={(evento) => {
										const estado = evento.target.value;
										ir({ estado: estado === "descontinuados" || estado === "todos" ? estado : undefined });
									}}
								/>
								<Selector
									etiqueta="Canal"
									vacio="Todos los canales"
									opciones={[
										{ valor: "mostrador", texto: "Se vende en mostrador" },
										{ valor: "en_linea", texto: "Se vende en línea" },
										{ valor: "externos", texto: "Se vende a externos" },
									]}
									value={busqueda.canal ?? ""}
									onChange={(evento) => {
										const canal = evento.target.value;
										ir({
											canal: canal === "mostrador" || canal === "en_linea" || canal === "externos" ? canal : undefined,
										});
									}}
								/>
							</div>
							<Filtros
								nombre="Píldoras"
								filtros={[
									{ clave: "todo", texto: "Todo", conteo: datos.pildoras.todo },
									{ clave: "sin_foto", texto: "Sin foto", conteo: datos.pildoras.sin_foto, punto: "bg-ambar" },
									{
										clave: "sin_etiqueta",
										texto: "Sin etiqueta",
										conteo: datos.pildoras.sin_etiqueta,
										punto: "bg-ambar",
									},
									{
										clave: "sin_precio_cliente",
										texto: "Sin precio de cliente",
										conteo: datos.pildoras.sin_precio_cliente,
										punto: "bg-rojo",
									},
								]}
								activo={busqueda.pildora ?? "todo"}
								alEscoger={(clave) =>
									ir({
										pildora:
											clave === busqueda.pildora ||
											(clave !== "sin_foto" && clave !== "sin_etiqueta" && clave !== "sin_precio_cliente")
												? undefined
												: clave,
									})
								}
							/>
							{vista === "lista" && seleccion.length > 0 ? (
								<BarraDeSeleccion productos={seleccion} alQuitar={quitarSeleccion} />
							) : null}
							{datos.total === 0 ? (
								<EstadoDePantalla
									tipo="vacio"
									texto={conFiltros ? "Ningún producto cumple esos filtros." : "Sin productos"}
									accion={
										conFiltros ? (
											<Boton
												variante="secundario"
												onClick={() =>
													ir({
														buscar: undefined,
														seccion: undefined,
														escuela: undefined,
														estado: undefined,
														canal: undefined,
														pildora: undefined,
													})
												}
											>
												Quitar filtros
											</Boton>
										) : undefined
									}
								/>
							) : (
								datos.secciones.map((seccion) => {
									const plegada = plegadas.has(seccion.id);
									const variantes = seccion.productos.reduce((suma, producto) => suma + producto.variantes, 0);
									return (
										<Panel
											key={`${seccion.id}-${vuelta}`}
											titulo={
												<button
													type="button"
													aria-expanded={!plegada}
													className="inline-flex items-center gap-2"
													onClick={() =>
														setPlegadas((antes) => {
															const nuevas = new Set(antes);
															if (plegada) nuevas.delete(seccion.id);
															else nuevas.add(seccion.id);
															return nuevas;
														})
													}
												>
													{plegada ? (
														<ChevronRight aria-hidden="true" size={18} />
													) : (
														<ChevronDown aria-hidden="true" size={18} />
													)}
													{seccion.nombre}
												</button>
											}
											derecha={
												<>
													<span className="text-etiqueta text-tinta2">
														{`${plural(seccion.productos.length, "producto", "productos")}, ${plural(variantes, "variante", "variantes")}`}
													</span>
													<Boton
														chico
														variante="secundario"
														icono={Plus}
														onClick={() => ir(conAlta({ seccion_alta: seccion.id }))}
													>
														Nuevo producto
													</Boton>
												</>
											}
										>
											{plegada ? null : vista === "lista" ? (
												<TablaDeProductos
													productos={seccion.productos}
													alSeleccionar={(claves) => setEscogidos((antes) => ({ ...antes, [seccion.id]: claves }))}
													alTocar={(producto) => ir(conFicha(producto.id))}
												/>
											) : (
												<Galeria productos={seccion.productos} alTocar={(producto) => ir(conFicha(producto.id))} />
											)}
										</Panel>
									);
								})
							)}
						</>
					);
				}}
			</SegunConsulta>
		</>
	);
}

/**
 * Dónde se vende un producto: «Mostrador · En línea · Externos»; el de en línea en ámbar si no tiene foto.
 * @param props El producto.
 */
function Canales({ producto }: { producto: Producto }) {
	const canales = (["mostrador", "en_linea", "externos"] as const).filter((canal) => producto.canales[canal]);
	const sinFoto = producto.detiene.some((detiene) => detiene.tipo === "sin_foto");
	return (
		<span className="text-etiqueta">
			{canales.map((canal, i) => (
				<span key={canal}>
					{i === 0 ? null : " · "}
					<span className={canal === "en_linea" && sinFoto ? "font-semibold text-texto-advertencia" : undefined}>
						{nombreDeCanal[canal]}
					</span>
				</span>
			))}
		</span>
	);
}

/**
 * Lo que detiene a un producto, o «Nada».
 * @param props El producto.
 */
function LoQueLoDetiene({ producto }: { producto: Producto }) {
	if (producto.detiene.length === 0) return <span className="text-tinta3">Nada</span>;
	return (
		<span className="flex flex-col">
			{producto.detiene.map((detiene) => (
				<span
					key={detiene.tipo}
					className={
						detiene.tipo === "sin_precio" ? "font-semibold text-texto-error" : "font-semibold text-texto-advertencia"
					}
				>
					{textoDeLoQueDetiene(detiene)}
				</span>
			))}
		</span>
	);
}

/**
 * La tabla de una sección.
 * @param props Sus productos, qué hacer al escoger y al tocar uno.
 */
function TablaDeProductos({
	productos,
	alSeleccionar,
	alTocar,
}: {
	productos: readonly Producto[];
	alSeleccionar: (claves: string[]) => void;
	alTocar: (producto: Producto) => void;
}) {
	return (
		<Tabla
			nombre="Productos"
			filas={productos}
			claveDeFila={(producto) => producto.id}
			alSeleccionar={alSeleccionar}
			alTocarFila={alTocar}
			columnas={[
				{
					clave: "producto",
					encabezado: "Producto",
					ordenarPor: (producto) => producto.nombre,
					celda: (producto) => (
						<span className="flex items-center gap-3">
							<span className="grid size-9 flex-none place-items-center rounded-mediano bg-suave text-tinta3">
								<Shirt aria-hidden="true" size={18} />
							</span>
							<span className="flex flex-col">
								<b>{producto.nombre}</b>
								<span className="text-etiqueta text-tinta2">{escuelaOBasico(producto.escuela?.nombre)}</span>
							</span>
						</span>
					),
				},
				{
					clave: "mayoreo",
					encabezado: "Mayoreo",
					ordenarPor: (producto) => producto.categoria,
					celda: (producto) => producto.categoria,
				},
				{ clave: "canales", encabezado: "Se vende en", celda: (producto) => <Canales producto={producto} /> },
				{
					clave: "tallas",
					encabezado: "Tallas",
					ordenarPor: (producto) => producto.variantes,
					celda: (producto) => (
						<span className="flex flex-col">
							<span>{producto.tallas}</span>
							<span className="text-etiqueta text-tinta2">
								{`${plural(producto.variantes, "variante", "variantes")}, ${producto.por_pedido} por pedido`}
							</span>
						</span>
					),
				},
				{
					clave: "mostrador",
					encabezado: "Mostrador",
					alinear: "derecha",
					ordenarPor: (producto) => producto.mostrador_centavos ?? -1,
					celda: (producto) =>
						producto.mostrador_centavos === null ? "—" : montoEnPantalla(producto.mostrador_centavos),
				},
				{
					clave: "detiene",
					encabezado: "Lo que lo detiene",
					celda: (producto) => <LoQueLoDetiene producto={producto} />,
				},
			]}
		/>
	);
}

/**
 * La galería de una sección: una tarjeta por producto.
 * @param props Sus productos y qué hacer al tocar uno.
 */
function Galeria({ productos, alTocar }: { productos: readonly Producto[]; alTocar: (producto: Producto) => void }) {
	return (
		<ul className="m-0 grid list-none grid-cols-4 gap-3 p-0 max-menu:grid-cols-2 max-telefono:grid-cols-1">
			{productos.map((producto) => (
				<li key={producto.id}>
					<button
						type="button"
						onClick={() => alTocar(producto)}
						className="flex w-full flex-col gap-1.5 rounded-grande border border-linea p-3 text-left hover:bg-suave"
					>
						<span className="grid h-28 place-items-center rounded-mediano bg-suave text-tinta3">
							<Shirt aria-hidden="true" size={28} />
						</span>
						<b>{producto.nombre}</b>
						<span className="text-etiqueta text-tinta2">
							{`${escuelaOBasico(producto.escuela?.nombre)} · ${producto.tallas}`}
						</span>
						<span className="font-bold tabular-nums">
							{producto.mostrador_centavos === null ? "Sin precio" : montoEnPantalla(producto.mostrador_centavos)}
						</span>
						<Canales producto={producto} />
						<LoQueLoDetiene producto={producto} />
					</button>
				</li>
			))}
		</ul>
	);
}
