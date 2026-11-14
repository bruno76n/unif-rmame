/**
 * La pestaña Contador externo: el paquete del mes con su fecha límite y «Preparar paquete» (o «Al día»), los paquetes
 * con su estado y su archivo, y los documentos que regresó el contador, con «Adjuntar documento»; cada documento lo abre
 * su enlace a `/v1/archivos/{id}`.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Contador externo»)
 */

import { contadorExterno } from "@uniformame/compartido/contratos/contaduria/consultas-gastos-contador";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Plus } from "lucide-react";
import { useState } from "react";
import { usePaginas } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunPaginas } from "../../../comun/segun-paginas.tsx";
import { VentanaAdjuntarDocumento } from "../ventanas/adjuntar-documento.tsx";
import { VentanaPaqueteMes } from "../ventanas/paquete-mes.tsx";

/** La pestaña Contador externo. */
export function PestanaContadorExterno() {
	const conConexion = useConConexion();
	const [paquete, setPaquete] = useState<string | undefined>(undefined);
	const [adjuntando, setAdjuntando] = useState(false);
	const paginas = usePaginas(contadorExterno, {});
	return (
		<SegunPaginas paginas={paginas} renglones={6}>
			{({ primera: datos, todas, verMas }) => {
				const documentos = todas.flatMap((pagina) => pagina.documentos);
				const porEnviar = datos.por_enviar;
				return (
					<>
						<Panel titulo="Paquete del mes">
							{porEnviar === null ? (
								<Recuadro color="verde">Al día · El último paquete ya se mandó</Recuadro>
							) : (
								<Recuadro
									color={porEnviar.vencido ? "rojo" : "ambar"}
									boton={
										<Boton
											variante="principal"
											disabled={!conConexion}
											onClick={() => setPaquete(porEnviar.paquete_contador_id)}
										>
											Preparar paquete
										</Boton>
									}
								>
									{porEnviar.mes_texto}
									<span className="block font-normal text-etiqueta">
										Ingresos, egresos, nómina y gastos por categoría · a más tardar el {porEnviar.fecha_limite}
									</span>
								</Recuadro>
							)}
						</Panel>
						<Panel titulo="Paquetes">
							{datos.paquetes.length === 0 ? (
								<EstadoDePantalla tipo="vacio" texto="Sin paquetes" />
							) : (
								<Tabla
									nombre="Paquetes"
									filas={datos.paquetes}
									claveDeFila={(uno) => uno.paquete_contador_id}
									alTocarFila={(uno) => setPaquete(uno.paquete_contador_id)}
									columnas={[
										{ clave: "mes", encabezado: "Mes", celda: (uno) => <b>{uno.mes_texto}</b> },
										{ clave: "enviado", encabezado: "Enviado el", celda: (uno) => uno.enviado ?? "—" },
										{
											clave: "estado",
											encabezado: "Estado",
											celda: (uno) => <Estado texto={uno.estado.texto} color={uno.estado.color} />,
										},
										{
											clave: "archivo",
											encabezado: "Archivo",
											celda: (uno) =>
												uno.archivo_id === null ? (
													"—"
												) : (
													<a
														href={`/v1/archivos/${uno.archivo_id}?descarga=true`}
														onClick={(evento) => evento.stopPropagation()}
													>
														Archivo
													</a>
												),
										},
									]}
								/>
							)}
						</Panel>
						<Panel
							titulo="Documentos del contador"
							derecha={
								<Boton chico icono={Plus} disabled={!conConexion} onClick={() => setAdjuntando(true)}>
									Adjuntar documento
								</Boton>
							}
						>
							{documentos.length === 0 ? (
								<EstadoDePantalla tipo="vacio" texto="Sin documentos del contador" />
							) : (
								<div className="flex flex-col gap-3">
									<Tabla
										nombre="Documentos del contador"
										filas={documentos}
										claveDeFila={(documento) => documento.documento_contador_id}
										columnas={[
											{
												clave: "documento",
												encabezado: "Documento",
												celda: (documento) => (
													<a href={`/v1/archivos/${documento.archivo_id}`} target="_blank" rel="noreferrer">
														{documento.nombre}
													</a>
												),
											},
											{ clave: "tipo", encabezado: "Tipo", celda: (documento) => documento.tipo },
											{ clave: "mes", encabezado: "Mes", celda: (documento) => documento.mes ?? "—" },
											{ clave: "llego", encabezado: "Llegó", celda: (documento) => documento.llego },
										]}
									/>
									{verMas}
								</div>
							)}
						</Panel>
						{paquete === undefined ? null : (
							<VentanaPaqueteMes paqueteId={paquete} alCerrar={() => setPaquete(undefined)} />
						)}
						{adjuntando ? <VentanaAdjuntarDocumento alCerrar={() => setAdjuntando(false)} /> : null}
					</>
				);
			}}
		</SegunPaginas>
	);
}
