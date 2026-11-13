/**
 * La ventana «Apartados de {dispositivo}»: lo que subió el aparato y no se pudo aplicar (cuándo pasó, qué acción, por
 * qué se apartó, la persona y sus reintentos), con «Reintentar» (`admin.reintentar_comando_apartado`) y «Descartar»
 * con motivo (la dueña, `admin.descartar_comando_apartado`); «Mostrar descartados» trae también los descartados.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Ventanas»: «Apartados de {dispositivo}») y
 * docs/modulos/admin/dispositivos.md («`admin.reintentar_comando_apartado`», «`admin.descartar_comando_apartado`»)
 */

import { comandosApartadosDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-dispositivos";
import {
	descartarComandoApartado,
	reintentarComandoApartado,
} from "@uniformame/compartido/contratos/admin/dispositivos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Interruptor } from "@uniformame/interfaz/captura/interruptor";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useState } from "react";
import { usePaginas } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { useEnvio } from "../envio.ts";
import type { Registrado } from "../pestanas/dispositivos.tsx";

/**
 * La ventana con los apartados de un aparato.
 * @param props El aparato y qué hacer al cerrar.
 */
export function VentanaApartados({ aparato, alCerrar }: { aparato: Registrado; alCerrar: () => void }) {
	const [conDescartados, setConDescartados] = useState(false);
	const paginas = usePaginas(comandosApartadosDeAdmin, {
		dispositivo_id: aparato.dispositivo_id,
		...(conDescartados ? { incluir_descartados: "si" as const } : {}),
	});
	const reintentar = useEnvio(reintentarComandoApartado);
	const descartar = useEnvio(descartarComandoApartado);
	const conConexion = useConConexion();
	const [aDescartar, setADescartar] = useState<string | undefined>(undefined);
	const [primera] = paginas.data?.pages ?? [];
	const renglones = paginas.data?.pages.flatMap((pagina) => pagina.renglones) ?? [];
	/** Descarta con el motivo; si la regla lo detiene, regresa su mensaje para el campo. */
	const confirmarDescarte = async (motivo: string) => {
		if (aDescartar === undefined) return undefined;
		let error: string | undefined;
		const salio = await descartar.enviar({ datos: { comando_id: aDescartar, motivo } }, (campos) => {
			error = campos.motivo;
		});
		if (salio !== undefined) setADescartar(undefined);
		return error;
	};
	return (
		<Ventana abierta ancha alCerrar={alCerrar} titulo={`Apartados de ${aparato.nombre}`} volver="Cerrar">
			<div className="flex flex-col gap-3">
				<Interruptor etiqueta="Mostrar descartados" prendido={conDescartados} alCambiar={setConDescartados} />
				{paginas.isPending ? (
					<EstadoDePantalla tipo="cargando" renglones={3} />
				) : paginas.isError ? (
					<EstadoDePantalla tipo="error" alReintentar={() => void paginas.refetch()} />
				) : renglones.length === 0 ? (
					<EstadoDePantalla tipo="vacio" texto="Sin apartados" bien />
				) : (
					<Tabla
						nombre="Apartados"
						filas={renglones}
						claveDeFila={(renglon) => renglon.comando_id}
						columnas={[
							{ clave: "cuando", encabezado: "Cuándo pasó", celda: (renglon) => renglon.cuando },
							{
								clave: "accion",
								encabezado: "Acción",
								celda: (renglon) => <DosRenglones arriba={renglon.accion} abajo={renglon.persona ?? "—"} />,
							},
							{
								clave: "motivo",
								encabezado: "Por qué se apartó",
								celda: (renglon) => <DosRenglones arriba={renglon.motivo} abajo={renglon.descartado ?? undefined} />,
							},
							{
								clave: "reintentos",
								encabezado: "Reintentos",
								alinear: "derecha",
								celda: (renglon) => renglon.reintentos,
							},
							{
								clave: "botones",
								encabezado: "",
								alinear: "derecha",
								celda: (renglon) =>
									renglon.descartado === null ? (
										<span className="inline-flex gap-2">
											<Boton
												chico
												disabled={!conConexion || reintentar.enviando}
												onClick={() => void reintentar.enviar({ datos: { comando_id: renglon.comando_id } })}
											>
												Reintentar
											</Boton>
											{primera?.es_duena === true ? (
												<Boton
													chico
													variante="peligro"
													disabled={!conConexion}
													onClick={() => setADescartar(renglon.comando_id)}
												>
													Descartar
												</Boton>
											) : null}
										</span>
									) : null,
							},
						]}
					/>
				)}
				{paginas.hasNextPage ? (
					<Boton chico onClick={() => void paginas.fetchNextPage()}>
						Ver más
					</Boton>
				) : null}
			</div>
			<VentanaConMotivo
				abierta={aDescartar !== undefined}
				alCerrar={() => setADescartar(undefined)}
				titulo="Descartar apartado"
				subtitulo="No aplica nada: si fue un hecho real, se captura en su departamento."
				textoAccion="Descartar"
				enviando={descartar.enviando}
				alConfirmar={confirmarDescarte}
			/>
		</Ventana>
	);
}
