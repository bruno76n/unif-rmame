/**
 * Dispositivos: los registrados (tipo, ubicación, última sincronización, llave, versión del programa, reloj desfasado,
 * apartados y «Revocar») y los revocados, con lo que llegó después de revocar, que lleva a la bandeja de excepciones de
 * Bodega. «Registrar dispositivo» abre su ventana.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Dispositivos»)
 *
 * Todo llega armado de `admin.dispositivos`; Dirección abre esta pestaña con `/admin/dispositivos` y Pendientes con el
 * aparato en `?resaltar=`.
 */

import { useRouter } from "@tanstack/react-router";
import { plural } from "@uniformame/compartido/calculos/textos";
import { dispositivosDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-dispositivos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Seccion } from "@uniformame/interfaz/pagina/seccion";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Lock, Plus } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useTieneDepartamento } from "../../../comun/tiene-departamento.ts";
import { VentanaApartados } from "../ventanas/apartados.tsx";
import { VentanaRegistrarDispositivo } from "../ventanas/registrar-dispositivo.tsx";
import { VentanaRevocarDispositivo } from "../ventanas/revocar-dispositivo.tsx";

/** Lo que da la consulta. */
type Dispositivos = z.infer<typeof dispositivosDeAdmin.resultado>;
/** Un aparato registrado. */
export type Registrado = Dispositivos["registrados"][number];

/** El tono del texto de la última sincronización: rojo pasadas las horas del aviso. */
const tonoDeSincronizacion = { rojo: "rojo", verde: "normal", ninguno: "normal" } as const;

/** La pestaña Dispositivos. */
export function PestanaDispositivos() {
	const consulta = useConsulta(dispositivosDeAdmin, {});
	const conConexion = useConConexion();
	const tieneDepartamento = useTieneDepartamento();
	const router = useRouter();
	const [registrar, setRegistrar] = useState(false);
	const [revocar, setRevocar] = useState<Registrado | undefined>(undefined);
	const [apartados, setApartados] = useState<Registrado | undefined>(undefined);
	return (
		<SegunConsulta consulta={consulta} renglones={6}>
			{(datos) => (
				<>
					<Seccion
						titulo="Registrados"
						{...(datos.es_duena ? {} : { nota: "Solo la dueña registra y revoca" })}
						derecha={
							datos.es_duena ? (
								<Boton
									chico
									variante="principal"
									icono={Plus}
									disabled={!conConexion}
									onClick={() => setRegistrar(true)}
								>
									Registrar dispositivo
								</Boton>
							) : undefined
						}
					>
						<Tabla
							nombre="Registrados"
							filas={datos.registrados}
							claveDeFila={(aparato) => aparato.dispositivo_id}
							columnas={[
								{
									clave: "dispositivo",
									encabezado: "Dispositivo",
									celda: (aparato) => <DosRenglones arriba={<b>{aparato.nombre}</b>} abajo={aparato.registrado} />,
								},
								{ clave: "tipo", encabezado: "Tipo", celda: (aparato) => aparato.tipo_texto },
								{ clave: "ubicacion", encabezado: "Ubicación", celda: (aparato) => aparato.ubicacion ?? "—" },
								{
									clave: "sincronizacion",
									encabezado: "Última sincronización",
									celda: (aparato) => (
										<TextoConTono tono={tonoDeSincronizacion[aparato.sincronizacion.tono]}>
											{aparato.sincronizacion.texto}
										</TextoConTono>
									),
								},
								{
									clave: "llave",
									encabezado: "Llave",
									celda: (aparato) => <span className="font-mono">{aparato.llave_id}</span>,
								},
								{
									clave: "version",
									encabezado: "Versión",
									celda: (aparato) => (
										<DosRenglones
											arriba={aparato.version_app ?? "—"}
											{...(aparato.reloj_desfasado
												? { abajo: <TextoConTono tono="ambar">reloj desfasado</TextoConTono> }
												: {})}
										/>
									),
								},
								{
									clave: "acciones",
									encabezado: "",
									alinear: "derecha",
									celda: (aparato) => (
										<span className="inline-flex gap-2">
											{aparato.apartados === 0 ? null : (
												<Boton chico onClick={() => setApartados(aparato)}>
													{plural(aparato.apartados, "apartado", "apartados")}
												</Boton>
											)}
											{datos.es_duena ? (
												<Boton chico variante="peligro" disabled={!conConexion} onClick={() => setRevocar(aparato)}>
													Revocar
												</Boton>
											) : null}
										</span>
									),
								},
							]}
						/>
					</Seccion>
					{datos.revocados.length === 0 ? null : (
						<Seccion titulo="Revocados">
							<Tabla
								nombre="Revocados"
								filas={datos.revocados}
								claveDeFila={(aparato) => aparato.dispositivo_id}
								columnas={[
									{
										clave: "dispositivo",
										encabezado: "Dispositivo",
										celda: (aparato) => (
											<DosRenglones
												arriba={<b>{aparato.nombre}</b>}
												abajo={<span className="font-mono">{aparato.llave_id}</span>}
											/>
										),
									},
									{ clave: "revocado", encabezado: "Revocado", celda: (aparato) => aparato.revocado },
									{ clave: "motivo", encabezado: "Motivo", celda: (aparato) => aparato.motivo },
									{
										clave: "despues",
										encabezado: "",
										alinear: "derecha",
										celda: (aparato) => {
											if (aparato.despues_de_revocar === 0) return null;
											const texto = `${aparato.despues_de_revocar} ${aparato.despues_de_revocar === 1 ? "llegó" : "llegaron"} después de revocar`;
											// Lleva a la bandeja de excepciones de Bodega solo si la cuenta la tiene.
											return tieneDepartamento("bodega") ? (
												<Boton chico variante="fantasma" onClick={() => router.history.push("/bodega/excepciones")}>
													{texto}
												</Boton>
											) : (
												texto
											);
										},
									},
								]}
							/>
						</Seccion>
					)}
					<span className="inline-flex items-center gap-2 text-etiqueta text-tinta3">
						<Lock aria-hidden="true" size={13} />
						Cada dispositivo tiene su propia llave: revocar uno no toca a los demás
					</span>
					{registrar ? (
						<VentanaRegistrarDispositivo
							dondeSeUsa={datos.donde_se_usa}
							vigenciaMinutos={datos.vigencia_codigo_min}
							alCerrar={() => setRegistrar(false)}
						/>
					) : null}
					{revocar === undefined ? null : (
						<VentanaRevocarDispositivo aparato={revocar} alCerrar={() => setRevocar(undefined)} />
					)}
					{apartados === undefined ? null : (
						<VentanaApartados aparato={apartados} alCerrar={() => setApartados(undefined)} />
					)}
				</>
			)}
		</SegunConsulta>
	);
}
