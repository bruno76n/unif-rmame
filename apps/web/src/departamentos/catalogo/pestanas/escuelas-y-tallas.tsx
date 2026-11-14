/**
 * Escuelas y tallas de Catálogo: «Escuelas y modelos» (agregar, editar, dar de baja con motivo y reactivar las dadas de
 * baja), «Grupos de tallas» (agregar un grupo, sus tallas y su orden), «Tipos de prenda» (agregar y guardar) y
 * «Secciones» con sus productos activos.
 * Fase 19 · docs/interfaz/fabrica/catalogo.md («Escuelas y tallas»)
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import { darBajaEscuela, reactivarEscuela } from "@uniformame/compartido/contratos/catalogo/escuelas";
import { escuelasYTallas } from "@uniformame/compartido/contratos/catalogo/pantallas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { errorDeCampo, esperar, useAccionDeCatalogo } from "../acciones.ts";
import { VentanaEscuela } from "../ventanas/escuela.tsx";
import { VentanaGrupoTalla } from "../ventanas/grupo-talla.tsx";
import { VentanaTipoPrenda } from "../ventanas/tipo-prenda.tsx";

/** Lo que regresa la consulta. */
type Datos = z.infer<typeof escuelasYTallas.resultado>;

/** La ventana abierta de la pestaña. */
type Abierta =
	| { cual: "escuela"; escuela?: Datos["escuelas"][number] }
	| { cual: "baja_escuela"; escuela: Datos["escuelas"][number] }
	| { cual: "grupo"; grupo?: Datos["grupos"][number] }
	| { cual: "tipo"; tipo?: Datos["tipos"][number] };

/** Escuelas y tallas. */
export function PestanaEscuelasYTallas() {
	const consulta = useConsulta(escuelasYTallas, {});
	const [abierta, setAbierta] = useState<Abierta | undefined>(undefined);
	const darBaja = useAccionDeCatalogo(darBajaEscuela);
	const reactivar = useAccionDeCatalogo(reactivarEscuela);
	const conConexion = useConConexion();
	const cerrar = () => setAbierta(undefined);
	return (
		<SegunConsulta consulta={consulta}>
			{(datos) => {
				const activas = datos.escuelas.filter((escuela) => !escuela.baja);
				const deBaja = datos.escuelas.filter((escuela) => escuela.baja);
				return (
					<>
						<Panel
							titulo="Escuelas y modelos"
							derecha={
								<Boton chico variante="secundario" icono={Plus} onClick={() => setAbierta({ cual: "escuela" })}>
									Agregar escuela
								</Boton>
							}
						>
							<ul className="m-0 flex list-none flex-col p-0">
								{activas.map((escuela) => (
									<li
										key={escuela.id}
										className="flex flex-wrap items-center gap-3 border-linea border-b py-3 last:border-b-0"
									>
										<span
											aria-hidden="true"
											className="size-4 flex-none rounded-chico"
											style={{ backgroundColor: escuela.color }}
										/>
										<span className="flex flex-1 flex-col">
											<b>{escuela.nombre}</b>
											<span className="text-etiqueta text-tinta2">
												{escuela.municipio}
												{escuela.cliente_externo ? " · cliente externo" : ""}
											</span>
										</span>
										<span className="text-tinta2 tabular-nums">{plural(escuela.modelos, "modelo", "modelos")}</span>
										<Boton chico variante="fantasma" onClick={() => setAbierta({ cual: "escuela", escuela })}>
											Editar
										</Boton>
										<Boton chico variante="peligro" onClick={() => setAbierta({ cual: "baja_escuela", escuela })}>
											Dar de baja
										</Boton>
									</li>
								))}
							</ul>
							{deBaja.length === 0 ? null : (
								<>
									<h3 className="mt-4 mb-1 font-semibold text-tinta2">Dadas de baja</h3>
									<ul className="m-0 flex list-none flex-col p-0">
										{deBaja.map((escuela) => (
											<li key={escuela.id} className="flex items-center gap-3 py-2">
												<span className="flex-1 text-tinta2">{`${escuela.nombre} · ${escuela.municipio}`}</span>
												<Boton
													chico
													variante="secundario"
													disabled={reactivar.isPending || !conConexion}
													onClick={() =>
														void esperar(
															reactivar.mutateAsync({ datos: { escuela_id: escuela.id }, version: escuela.version }),
														)
													}
												>
													Reactivar
												</Boton>
											</li>
										))}
									</ul>
								</>
							)}
						</Panel>
						<Panel
							titulo="Grupos de tallas"
							derecha={
								<Boton chico variante="secundario" icono={Plus} onClick={() => setAbierta({ cual: "grupo" })}>
									Agregar grupo
								</Boton>
							}
						>
							<ul className="m-0 flex list-none flex-col p-0">
								{datos.grupos.map((grupo) => (
									<li
										key={grupo.id}
										className="flex flex-wrap items-center gap-3 border-linea border-b py-3 last:border-b-0"
									>
										<span className="flex flex-1 flex-col">
											<b>{grupo.nombre}</b>
											<span className="text-etiqueta text-tinta2">
												{grupo.tallas.map((talla) => talla.nombre).join(" · ")}
											</span>
										</span>
										<span className="text-tinta2 tabular-nums">
											{`${plural(grupo.productos, "producto la usa", "productos la usan")}`}
										</span>
										<Boton chico variante="fantasma" onClick={() => setAbierta({ cual: "grupo", grupo })}>
											Agregar talla
										</Boton>
									</li>
								))}
							</ul>
						</Panel>
						<Panel
							titulo="Tipos de prenda"
							derecha={
								<Boton chico variante="secundario" icono={Plus} onClick={() => setAbierta({ cual: "tipo" })}>
									Agregar tipo
								</Boton>
							}
						>
							<ul className="m-0 flex list-none flex-col p-0">
								{datos.tipos.map((tipo) => (
									<li
										key={tipo.id}
										className="flex flex-wrap items-center gap-3 border-linea border-b py-3 last:border-b-0"
									>
										<span className="flex flex-1 flex-col">
											<b>{tipo.nombre}</b>
											<span className="text-etiqueta text-tinta2">
												{`${tipo.seccion} · ${tipo.flujo ?? "Sin flujo"} · ${
													tipo.medidas.length === 0
														? "Sin medidas iniciales"
														: tipo.medidas.map((medida) => medida.medida).join(", ")
												}`}
											</span>
										</span>
										<Boton chico variante="fantasma" onClick={() => setAbierta({ cual: "tipo", tipo })}>
											Editar
										</Boton>
									</li>
								))}
							</ul>
						</Panel>
						<Panel titulo="Secciones">
							<ul className="m-0 flex list-none flex-col p-0">
								{datos.secciones.map((seccion) => (
									<li key={seccion.id} className="flex items-center gap-3 border-linea border-b py-2.5 last:border-b-0">
										<span className="flex-1">{seccion.nombre}</span>
										<span className="text-tinta2 tabular-nums">
											{plural(seccion.productos, "producto activo", "productos activos")}
										</span>
									</li>
								))}
							</ul>
						</Panel>
						{abierta?.cual === "escuela" ? (
							<VentanaEscuela abierta escuela={abierta.escuela} alCerrar={cerrar} />
						) : null}
						{abierta?.cual === "baja_escuela" ? (
							<VentanaConMotivo
								abierta
								alCerrar={cerrar}
								titulo={`Dar de baja ${abierta.escuela.nombre}`}
								textoAccion="Dar de baja"
								peligro
								alConfirmar={async (motivo) => {
									const salida = await esperar(
										darBaja.mutateAsync({
											datos: { escuela_id: abierta.escuela.id, motivo },
											version: abierta.escuela.version,
										}),
									);
									if (salida.bien) cerrar();
									return errorDeCampo(salida, "motivo");
								}}
							/>
						) : null}
						{abierta?.cual === "grupo" ? <VentanaGrupoTalla abierta grupo={abierta.grupo} alCerrar={cerrar} /> : null}
						{abierta?.cual === "tipo" ? (
							<VentanaTipoPrenda
								abierta
								tipo={abierta.tipo}
								secciones={datos.secciones}
								flujos={datos.flujos}
								alCerrar={cerrar}
							/>
						) : null}
					</>
				);
			}}
		</SegunConsulta>
	);
}
