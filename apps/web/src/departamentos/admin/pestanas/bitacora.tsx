/**
 * Bitácora, solo para leer: el buscador, las fechas y los filtros con su conteo, y la tabla, lo más reciente arriba con
 * «Ver más». Una alerta sin revisar lleva «Marcar revisada» (la dueña).
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Bitácora»)
 *
 * Lo buscado, el tipo, las alertas y las fechas van en la dirección. Sin el permiso de sueldos, lo que lleva sueldos
 * ya llega recortado de `admin.bitacora`.
 */

import { marcarAlertaRevisada } from "@uniformame/compartido/contratos/admin/bitacora";
import { bitacoraDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-bitacora";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Buscador } from "@uniformame/interfaz/captura/buscador";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Filtros } from "@uniformame/interfaz/captura/filtros";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Lock } from "lucide-react";
import { usePaginas } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunPaginas } from "../../../comun/segun-paginas.tsx";
import { busquedaDeAdmin, useDireccionDeAdmin } from "../direccion.ts";
import { useEnvio } from "../envio.ts";

/** La pestaña Bitácora. */
export function PestanaBitacora() {
	const { busqueda, navegar } = useDireccionDeAdmin();
	const conConexion = useConConexion();
	const revisar = useEnvio(marcarAlertaRevisada);
	const parametros = {
		...(busqueda.buscar === undefined ? {} : { buscar: busqueda.buscar }),
		...(busqueda.tipo === undefined ? {} : { tipo: busqueda.tipo }),
		...(busqueda.alertas === undefined ? {} : { solo_alertas: busqueda.alertas }),
		...(busqueda.desde === undefined ? {} : { desde: busqueda.desde }),
		...(busqueda.hasta === undefined ? {} : { hasta: busqueda.hasta }),
	};
	const paginas = usePaginas(bitacoraDeAdmin, parametros);
	const [primera] = paginas.data?.pages ?? [];
	const conteos = primera?.conteos;
	const filtro = busqueda.alertas === "si" ? "alertas" : (busqueda.tipo ?? "todo");
	return (
		<>
			<div className="flex flex-wrap items-end gap-3">
				<div className="min-w-0 flex-1 basis-72">
					<Buscador
						etiqueta="Buscar en la bitácora"
						ayuda="Persona, departamento o qué pasó"
						valor={busqueda.buscar ?? ""}
						alBuscar={(texto) => navegar({ buscar: texto === "" ? undefined : texto })}
					/>
				</div>
				<Campo
					etiqueta="Desde"
					type="date"
					value={busqueda.desde ?? ""}
					onChange={(evento) => navegar({ desde: busquedaDeAdmin.shape.desde.parse(evento.target.value) })}
				/>
				<Campo
					etiqueta="Hasta"
					type="date"
					value={busqueda.hasta ?? ""}
					onChange={(evento) => navegar({ hasta: busquedaDeAdmin.shape.hasta.parse(evento.target.value) })}
				/>
			</div>
			<Filtros
				nombre="Filtrar la bitácora"
				filtros={[
					{ clave: "todo", texto: "Todo", ...(conteos === undefined ? {} : { conteo: conteos.todo }) },
					{ clave: "cambio", texto: "Cambios", ...(conteos === undefined ? {} : { conteo: conteos.cambio }) },
					{ clave: "acceso", texto: "Accesos", ...(conteos === undefined ? {} : { conteo: conteos.acceso }) },
					{
						clave: "consulta_sensible",
						texto: "Consultas sensibles",
						punto: "bg-ambar",
						...(conteos === undefined ? {} : { conteo: conteos.consulta_sensible }),
					},
					{
						clave: "alertas",
						texto: "Alertas",
						punto: "bg-rojo",
						...(conteos === undefined ? {} : { conteo: conteos.alertas }),
					},
				]}
				activo={filtro}
				alEscoger={(clave) =>
					navegar(
						clave === "alertas"
							? { alertas: "si", tipo: undefined }
							: { alertas: undefined, tipo: busquedaDeAdmin.shape.tipo.parse(clave === "todo" ? undefined : clave) },
					)
				}
			/>
			<Panel>
				<SegunPaginas paginas={paginas} renglones={8}>
					{({ todas, verMas }) => {
						const renglones = todas.flatMap((pagina) => pagina.renglones);
						return renglones.length === 0 ? (
							<EstadoDePantalla
								tipo="vacio"
								texto={busqueda.buscar === undefined ? "Sin movimientos" : `Nada con «${busqueda.buscar}»`}
							/>
						) : (
							<div className="flex flex-col gap-3">
								<Tabla
									nombre="Bitácora"
									filas={renglones}
									claveDeFila={(renglon) => renglon.id}
									columnas={[
										{
											clave: "cuando",
											encabezado: "Cuándo",
											celda: (renglon) => <DosRenglones arriba={renglon.fecha} abajo={renglon.hora} />,
										},
										{
											clave: "tipo",
											encabezado: "Tipo",
											celda: (renglon) => (
												<TextoConTono
													tono={renglon.es_alerta ? "rojo" : renglon.tipo === "consulta_sensible" ? "ambar" : "normal"}
												>
													{renglon.es_alerta ? `${renglon.tipo_texto} · alerta` : renglon.tipo_texto}
												</TextoConTono>
											),
										},
										{ clave: "quien", encabezado: "Quién", celda: (renglon) => renglon.quien },
										{
											clave: "departamento",
											encabezado: "Departamento",
											celda: (renglon) => renglon.departamento ?? "—",
										},
										{
											clave: "que_paso",
											encabezado: "Qué pasó",
											celda: (renglon) => (
												<DosRenglones arriba={renglon.descripcion} abajo={renglon.folio ?? undefined} />
											),
										},
										{
											clave: "revisar",
											encabezado: "",
											alinear: "derecha",
											celda: (renglon) =>
												renglon.es_alerta && !renglon.revisada && primera?.es_duena === true ? (
													<Boton
														chico
														disabled={!conConexion || revisar.enviando}
														onClick={() => void revisar.enviar({ datos: { bitacora_id: renglon.id } })}
													>
														Marcar revisada
													</Boton>
												) : null,
										},
									]}
								/>
								{verMas}
							</div>
						);
					}}
				</SegunPaginas>
			</Panel>
			<span className="inline-flex items-center gap-2 text-etiqueta text-tinta3">
				<Lock aria-hidden="true" size={13} />
				La bitácora solo crece: nadie la edita ni la borra, tampoco la dueña
			</span>
		</>
	);
}
