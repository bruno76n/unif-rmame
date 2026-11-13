/**
 * Listas de precios de Catálogo: el selector de la lista (las generales y las de los clientes), el buscador, el
 * encabezado con su descripción y sus modelos sin precio, los porcentajes de un cliente, la tabla por sección con su
 * referencia, la diferencia y desde cuándo vale cada precio, y la barra de selección.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Listas de precios»)
 */

import { cambiarPorcentajesCliente } from "@uniformame/compartido/contratos/catalogo/listas";
import { listasDePrecios } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { errorDeCampo, esperar, type Salida, useAccionDeCatalogo } from "../acciones.ts";
import { conFicha, useBusqueda, useIr } from "../direccion.ts";
import { cuantos, diaCorto, pesos } from "../textos.ts";
import { BarraDeSeleccion } from "./seleccion.tsx";

/** Lo que regresa la consulta. */
type DatosDeLaLista = z.infer<typeof listasDePrecios.resultado>;

/** Cómo se dice el tipo de un cliente en el encabezado de su lista. */
const tipoDeCliente = { escuela: "Escuela", mayorista: "Mayorista", empresa_otro: "Cliente" } as const;

/**
 * La descripción del encabezado: la de la lista, o la del cliente armada con su tipo y su municipio.
 * @param lista La lista.
 */
function descripcionDe(lista: DatosDeLaLista["lista"]): string {
	if (lista.cliente === null) return lista.descripcion ?? "";
	return `${tipoDeCliente[lista.cliente.tipo]} en ${lista.cliente.municipio}. Es su lista de precios: lo que ve Ventas a externos al levantar un pedido.`;
}

/**
 * La diferencia contra la referencia: «Igual», «+$n» o «−$n».
 * @param diferencia En centavos, o nada.
 */
function textoDeDiferencia(diferencia: number | null | undefined): string {
	if (diferencia === null || diferencia === undefined) return "—";
	if (diferencia === 0) return "Igual";
	return `${diferencia > 0 ? "+" : "−"}${pesos(Math.abs(diferencia))}`;
}

/** Listas de precios. */
export function PestanaListasDePrecios() {
	const busqueda = useBusqueda();
	const ir = useIr();
	const consulta = useConsulta(listasDePrecios, {
		...(busqueda.lista === undefined ? {} : { lista_id: busqueda.lista }),
		...(busqueda.buscar === undefined ? {} : { buscar: busqueda.buscar }),
	});
	const [escogidos, setEscogidos] = useState<Record<string, string[]>>({});
	const [vuelta, setVuelta] = useState(0);
	return (
		<SegunConsulta consulta={consulta}>
			{(datos) => {
				const todos = datos.secciones.flatMap((seccion) => seccion.productos);
				const seleccion = Object.values(escogidos)
					.flat()
					.flatMap((id) => todos.filter((producto) => producto.id === id))
					.map((producto) => ({ ...producto, tiene_precio: producto.precio_centavos !== null, descontinuado: false }));
				return (
					<>
						<div className="flex flex-wrap items-end gap-3">
							<div className="min-w-60">
								<Selector
									etiqueta="Lista de precios"
									opciones={datos.listas.map((lista) => ({
										valor: lista.id,
										texto:
											lista.tipo === "cliente" ? `Clientes externos · ${lista.nombre}` : `Generales · ${lista.nombre}`,
									}))}
									value={datos.lista.id}
									onChange={(evento) => ir({ lista: evento.target.value })}
								/>
							</div>
							<div className="min-w-60 flex-1">
								<Campo
									etiqueta="Buscar"
									placeholder="Buscar producto en esta lista"
									type="search"
									defaultValue={busqueda.buscar ?? ""}
									onChange={(evento) => ir({ buscar: evento.target.value.trim() || undefined })}
								/>
							</div>
							<span className="pb-3 text-tinta2 tabular-nums">{cuantos(datos.total, "producto", "productos")}</span>
						</div>
						<Panel
							titulo={datos.lista.nombre}
							derecha={
								datos.lista.modelos_sin_precio > 0 ? (
									<b className="text-texto-error">
										{cuantos(datos.lista.modelos_sin_precio, "modelo sin precio", "modelos sin precio")}
									</b>
								) : (
									<b className="text-texto-bien">Todo con precio</b>
								)
							}
						>
							<p className="m-0 text-tinta2">{descripcionDe(datos.lista)}</p>
							{datos.lista.tipo === "cliente" ? <Porcentajes key={datos.lista.id} lista={datos.lista} /> : null}
						</Panel>
						{seleccion.length > 0 ? (
							<BarraDeSeleccion
								productos={seleccion}
								lista={datos.lista.id}
								conDescontinuar={false}
								alQuitar={() => {
									setEscogidos({});
									setVuelta((numero) => numero + 1);
								}}
							/>
						) : null}
						{datos.total === 0 ? (
							<EstadoDePantalla
								tipo="vacio"
								texto={
									busqueda.buscar === undefined
										? "Ningún producto en esta lista."
										: "Ningún producto en esta lista con esa búsqueda."
								}
							/>
						) : (
							datos.secciones.map((seccion) => (
								<Panel key={`${datos.lista.id}-${seccion.id}-${vuelta}`} titulo={seccion.nombre}>
									<Tabla
										nombre={`${datos.lista.nombre} · ${seccion.nombre}`}
										filas={seccion.productos}
										claveDeFila={(producto) => producto.id}
										alSeleccionar={(claves) => setEscogidos((antes) => ({ ...antes, [seccion.id]: claves }))}
										alTocarFila={(producto) => ir(conFicha(producto.id))}
										columnas={[
											{
												clave: "producto",
												encabezado: "Producto",
												celda: (producto) => (
													<span className="flex flex-col">
														<b>{producto.nombre}</b>
														<span className="text-etiqueta text-tinta2">{producto.escuela ?? "Básico"}</span>
													</span>
												),
											},
											{ clave: "mayoreo", encabezado: "Mayoreo", celda: (producto) => producto.categoria },
											{
												clave: "precio",
												encabezado: "Precio en esta lista",
												alinear: "derecha",
												celda: (producto) =>
													producto.precio_centavos === null ? (
														<b className="text-texto-error">Sin precio</b>
													) : (
														<b>{pesos(producto.precio_centavos)}</b>
													),
											},
											{
												clave: "referencia",
												encabezado: datos.lista.referencia,
												alinear: "derecha",
												celda: (producto) =>
													producto.referencia_centavos === null ? "—" : pesos(producto.referencia_centavos),
											},
											{
												clave: "diferencia",
												encabezado: "Diferencia",
												alinear: "derecha",
												celda: (producto) => textoDeDiferencia(producto.diferencia_centavos),
											},
											{
												clave: "vigente",
												encabezado: "Vigente desde",
												celda: (producto) =>
													producto.vigente_desde === null ? (
														"—"
													) : (
														<span className="flex flex-col">
															<span>{diaCorto(producto.vigente_desde)}</span>
															<span className="text-etiqueta text-tinta2">
																{producto.antes_centavos === null
																	? "Sin cambios"
																	: `${pesos(producto.antes_centavos)} antes`}
															</span>
														</span>
													),
											},
										]}
									/>
								</Panel>
							))
						)}
					</>
				);
			}}
		</SegunConsulta>
	);
}

/**
 * «% de básicos» y «% de especiales» de la lista de un cliente → `catalogo.cambiar_porcentajes_cliente`.
 * @param props La lista.
 */
function Porcentajes({ lista }: { lista: DatosDeLaLista["lista"] }) {
	const [basicos, setBasicos] = useState(lista.pct_basicos === null ? "" : String(Number(lista.pct_basicos)));
	const [especiales, setEspeciales] = useState(
		lista.pct_especiales === null ? "" : String(Number(lista.pct_especiales)),
	);
	const [salida, setSalida] = useState<Salida<unknown>>();
	const accion = useAccionDeCatalogo(cambiarPorcentajesCliente);
	const conConexion = useConConexion();
	const comoNumero = (texto: string) => (texto.trim() === "" ? null : Number(texto));
	const guardar = async () =>
		setSalida(
			await esperar(
				accion.mutateAsync({
					datos: { lista_id: lista.id, pct_basicos: comoNumero(basicos), pct_especiales: comoNumero(especiales) },
					version: lista.version,
				}),
			),
		);
	return (
		<div className="mt-3 flex flex-wrap items-end gap-3">
			<div className="w-40">
				<Campo
					etiqueta="% de básicos"
					inputMode="decimal"
					value={basicos}
					error={errorDeCampo(salida, "pct_basicos")}
					onChange={(evento) => setBasicos(evento.target.value)}
				/>
			</div>
			<div className="w-40">
				<Campo
					etiqueta="% de especiales"
					inputMode="decimal"
					value={especiales}
					error={errorDeCampo(salida, "pct_especiales")}
					onChange={(evento) => setEspeciales(evento.target.value)}
				/>
			</div>
			<Boton variante="secundario" disabled={accion.isPending || !conConexion} onClick={() => void guardar()}>
				Guardar
			</Boton>
		</div>
	);
}
