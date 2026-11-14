/**
 * El cajón Llegada de aduana: «{D} · De aduana» y lo que trae; las cifras (lo que mandó aduana y cuándo salió); la
 * tabla (prenda y talla con sus piezas, o rollo, partida y metros); «Llegó completo a bodega» y «Llegó con
 * diferencias», que agrega «Llegaron» por renglón con «Cuadra», «Faltan {n}» o «Sobran {n}» al escribir, y «Recibir lo
 * contado». Las dos llaman `inventario.recibir_despacho` con la versión del despacho.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Cajones»: Llegada de aduana)
 */

import { detalleDeLlegadaAduana } from "@uniformame/compartido/contratos/inventario/bodega-cajones";
import { recibirDespacho } from "@uniformame/compartido/contratos/inventario/despachos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { CifraDeCajon } from "@uniformame/interfaz/pagina/cifra-de-cajon";
import { type ColumnaDeTabla, Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useCierreDelCajon } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useEnvio } from "../envio.ts";

/** Lo que regresa la consulta. */
type Llegada = z.infer<typeof detalleDeLlegadaAduana.resultado>;

/** Un renglón. */
type Renglon = Llegada["renglones"][number];

/**
 * Lo que dice un renglón contado: «Cuadra», «Faltan {n}» o «Sobran {n}».
 * @param props Lo que mandó aduana y lo que se escribió.
 */
function ComoLlego({ enviado, llegaron }: { enviado: string; llegaron: string }) {
	if (llegaron.trim() === "") return null;
	const diferencia = Number((Number(llegaron) - Number(enviado)).toFixed(3));
	if (diferencia === 0) return <TextoConTono tono="normal">Cuadra</TextoConTono>;
	return <TextoConTono tono="ambar">{diferencia < 0 ? `Faltan ${-diferencia}` : `Sobran ${diferencia}`}</TextoConTono>;
}

/**
 * El cajón Llegada de aduana.
 * @param props El despacho y cómo cerrar el cajón.
 */
export function CajonLlegada({ despachoId, alCerrar }: { despachoId: string; alCerrar: () => void }) {
	const consulta = useConsulta(detalleDeLlegadaAduana, { despacho_id: despachoId });
	const conConexion = useConConexion();
	const { enviar, enviando, choco } = useEnvio(recibirDespacho);
	const [conDiferencias, setConDiferencias] = useState(false);
	const [llegaron, setLlegaron] = useState<Readonly<Record<string, string>>>({});
	const llegada = consulta.data;
	const conCambios = Object.keys(llegaron).length > 0;
	const cierre = useCierreDelCajon(conCambios, alCerrar);
	const todosContados = llegada?.renglones.every(
		(renglon) => (llegaron[renglon.traspaso_linea_id] ?? "").trim() !== "",
	);
	/** Recibe el despacho, completo o con lo contado de cada renglón. */
	const recibir = async (modo: "completo" | "con_diferencias") => {
		if (llegada === undefined) return;
		const salio = await enviar({
			datos: {
				despacho_id: llegada.despacho_id,
				modo,
				...(modo === "completo"
					? {}
					: {
							renglones: llegada.renglones.map((renglon) => {
								const contado = (llegaron[renglon.traspaso_linea_id] ?? "0").trim();
								return renglon.es_material
									? { traspaso_linea_id: renglon.traspaso_linea_id, cantidad: contado }
									: { traspaso_linea_id: renglon.traspaso_linea_id, piezas: Number(contado) };
							}),
						}),
			},
			version: llegada.version,
		});
		if (salio !== undefined) cierre.alCerrar();
	};
	const columnas: ColumnaDeTabla<Renglon>[] = [
		{
			clave: "prenda",
			encabezado: "Prenda y talla",
			celda: (renglon) => (renglon.rollo === null ? renglon.prenda : `${renglon.prenda} · ${renglon.rollo}`),
		},
		{ clave: "partida", encabezado: "Partida", celda: (renglon) => renglon.partida ?? "—" },
		{
			clave: "enviado",
			encabezado: "Piezas o metros",
			alinear: "derecha",
			celda: (renglon) => renglon.enviado,
		},
		...(conDiferencias
			? [
					{
						clave: "llegaron",
						encabezado: "Llegaron",
						celda: (renglon: Renglon) => (
							<span className="flex items-center gap-2">
								<Campo
									etiqueta={`Llegaron de ${renglon.prenda}`}
									inputMode="decimal"
									value={llegaron[renglon.traspaso_linea_id] ?? ""}
									onChange={(evento) =>
										setLlegaron((antes) => ({ ...antes, [renglon.traspaso_linea_id]: evento.target.value }))
									}
								/>
								<ComoLlego enviado={renglon.enviado} llegaron={llegaron[renglon.traspaso_linea_id] ?? ""} />
							</span>
						),
					},
				]
			: []),
	];
	return (
		<Cajon
			abierto
			conCambios={conCambios}
			alCerrar={cierre.alCerrar}
			{...(llegada === undefined ? {} : { contexto: `${llegada.folio} · De aduana` })}
			titulo={llegada?.trae ?? ""}
			accion={
				llegada === undefined || llegada.recibido ? undefined : conDiferencias ? (
					<Boton
						variante="principal"
						disabled={!conConexion || enviando || !todosContados}
						onClick={() => void recibir("con_diferencias")}
					>
						Recibir lo contado
					</Boton>
				) : (
					<span className="flex flex-wrap gap-2">
						<Boton disabled={!conConexion} onClick={() => setConDiferencias(true)}>
							Llegó con diferencias
						</Boton>
						<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void recibir("completo")}>
							Llegó completo a bodega
						</Boton>
					</span>
				)
			}
		>
			{choco && llegada !== undefined ? <EstadoDePantalla tipo="choque" documento={llegada.folio} /> : null}
			<SegunConsulta consulta={consulta}>
				{(datos) => (
					<div className="flex flex-col gap-5">
						<div className="grid grid-cols-2 gap-3">
							<CifraDeCajon numero={datos.mando} nombre="mandó aduana" />
							<CifraDeCajon numero={datos.salio} nombre="salió" />
						</div>
						{conDiferencias ? (
							<TextoConTono tono="ambar">Escribe cuántas llegaron de cada prenda, aunque sea 0</TextoConTono>
						) : null}
						<Tabla
							nombre="Lo que trae"
							filas={datos.renglones}
							claveDeFila={(renglon) => renglon.traspaso_linea_id}
							columnas={columnas}
						/>
					</div>
				)}
			</SegunConsulta>
			{cierre.pregunta}
		</Cajon>
	);
}
