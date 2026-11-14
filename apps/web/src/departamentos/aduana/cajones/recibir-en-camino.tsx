/**
 * El cajón Recibir lo que viene en camino: «{folio} · De {Bodega, Calidad o el cliente}» y lo que es; las cifras
 * (cuánto mandaron, cuándo salió y a dónde va). Lo de Bodega: Prenda y talla · Mandaron, con «Llegó completo»
 * (`inventario.recibir_en_aduana` con todo) o «Llegó con diferencias», que agrega «Llegaron» con «Cuadra», «Faltan {n}» o
 * «Sobran {n}» y cambia el botón a «Recibir lo contado». Un reproceso se cuenta a ciegas: una casilla «Llegaron» vacía
 * y «Recibir lo contado» (`inventario.recibir_reproceso`). La devolución de un cliente: por renglón, lo esperado, lo que
 * llegó y si llegó con defecto, del catálogo; «Recibir devolución».
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Cajones»: Recibir lo que viene en camino)
 */

import { detalleRecibirEnCamino } from "@uniformame/compartido/contratos/inventario/aduana-cajones";
import { recibirEnAduana } from "@uniformame/compartido/contratos/inventario/recepciones";
import { recibirReproceso } from "@uniformame/compartido/contratos/inventario/taller";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
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
type Detalle = z.infer<typeof detalleRecibirEnCamino.resultado>;

/** Un renglón. */
type Renglon = Detalle["renglones"][number];

/** Lo que se dice si falta un renglón por contar. */
const faltaContar = "Escribe cuántas llegaron de cada prenda, aunque sea 0";

/**
 * Lo que dice un renglón contado: «Cuadra», «Faltan {n}» o «Sobran {n}».
 * @param props Lo que mandaron y lo que se escribió.
 */
function ComoLlego({ mandaron, llegaron }: { mandaron: string; llegaron: string }) {
	if (llegaron.trim() === "") return null;
	const diferencia = Number((Number(llegaron.replace(",", ".")) - Number(mandaron)).toFixed(3));
	if (diferencia === 0) return <TextoConTono tono="normal">Cuadra</TextoConTono>;
	return <TextoConTono tono="ambar">{diferencia < 0 ? `Faltan ${-diferencia}` : `Sobran ${diferencia}`}</TextoConTono>;
}

/**
 * El cajón Recibir lo que viene en camino, de un traspaso o de un reproceso.
 * @param props El traspaso o el reproceso, y cómo cerrar el cajón.
 */
export function CajonRecibirEnCamino({
	traspasoId,
	reprocesoId,
	alCerrar,
}: {
	traspasoId?: string | undefined;
	reprocesoId?: string | undefined;
	alCerrar: () => void;
}) {
	const consulta = useConsulta(
		detalleRecibirEnCamino,
		reprocesoId === undefined ? { traspaso_id: traspasoId } : { reproceso_id: reprocesoId },
	);
	const conConexion = useConConexion();
	const enAduana = useEnvio(recibirEnAduana);
	const delReproceso = useEnvio(recibirReproceso);
	const [conDiferencias, setConDiferencias] = useState(false);
	const [llegaron, setLlegaron] = useState<Readonly<Record<string, string>>>({});
	const [defectos, setDefectos] = useState<Readonly<Record<string, string>>>({});
	const [revisar, setRevisar] = useState(false);
	const detalle = consulta.data;
	const conCambios = Object.values(llegaron).some((valor) => valor.trim() !== "");
	const cierre = useCierreDelCajon(conCambios, alCerrar);
	const enviando = enAduana.enviando || delReproceso.enviando;
	const contado = (clave: string) => (llegaron[clave] ?? "").trim() !== "";
	/** Recibe completo, lo contado de cada renglón, la devolución o el reproceso. */
	const recibir = async (modo: "completo" | "contado") => {
		if (detalle === undefined) return;
		if (detalle.tipo === "reproceso") {
			if (!/^\d{1,4}$/.test((llegaron.reproceso ?? "").trim())) {
				setRevisar(true);
				return;
			}
			const salio = await delReproceso.enviar({
				datos: { reproceso_id: detalle.id, piezas: Number(llegaron.reproceso) },
			});
			if (salio !== undefined) cierre.alCerrar();
			return;
		}
		if (modo === "contado" && !detalle.renglones.every((renglon) => contado(renglon.traspaso_linea_id))) {
			setRevisar(true);
			return;
		}
		const renglones = detalle.renglones.map((renglon) => {
			const valor = (llegaron[renglon.traspaso_linea_id] ?? "0").trim().replace(",", ".");
			const defecto = defectos[renglon.traspaso_linea_id] ?? "";
			return renglon.es_material
				? { traspaso_linea_id: renglon.traspaso_linea_id, cantidad: valor }
				: {
						traspaso_linea_id: renglon.traspaso_linea_id,
						piezas: Number(valor),
						...(detalle.tipo === "devolucion" && defecto !== "" ? { con_defecto: true, defecto_id: defecto } : {}),
					};
		});
		const salio = await enAduana.enviar({
			datos: {
				traspaso_id: detalle.id,
				modo: modo === "completo" ? "completo" : "con_diferencias",
				...(modo === "completo" ? {} : { renglones }),
			},
			...(detalle.version === null ? {} : { version: detalle.version }),
		});
		if (salio !== undefined) cierre.alCerrar();
	};
	const contando = conDiferencias || detalle?.tipo === "devolucion";
	const columnas: ColumnaDeTabla<Renglon>[] = [
		{ clave: "prenda", encabezado: "Prenda y talla", celda: (renglon) => renglon.prenda },
		{
			clave: "mandaron",
			encabezado: detalle?.tipo === "devolucion" ? "Esperadas" : "Mandaron",
			alinear: "derecha",
			celda: (renglon) => renglon.mandaron,
		},
		...(contando
			? [
					{
						clave: "llegaron",
						encabezado: detalle?.tipo === "devolucion" ? "Llegaron bien" : "Llegaron",
						celda: (renglon: Renglon) => (
							<span className="flex items-center gap-2">
								<Campo
									etiqueta={`Llegaron de ${renglon.prenda}`}
									inputMode="decimal"
									value={llegaron[renglon.traspaso_linea_id] ?? ""}
									error={revisar && !contado(renglon.traspaso_linea_id) ? faltaContar : undefined}
									onChange={(evento) =>
										setLlegaron((antes) => ({ ...antes, [renglon.traspaso_linea_id]: evento.target.value }))
									}
								/>
								{detalle?.tipo === "devolucion" ? null : (
									<ComoLlego mandaron={renglon.mandaron} llegaron={llegaron[renglon.traspaso_linea_id] ?? ""} />
								)}
							</span>
						),
					},
				]
			: []),
		...(detalle?.tipo === "devolucion"
			? [
					{
						clave: "defecto",
						encabezado: "Con defecto",
						celda: (renglon: Renglon) => (
							<Selector
								etiqueta={`Defecto de ${renglon.prenda}`}
								vacio="Llegaron bien"
								opciones={detalle.defectos.map((defecto) => ({ valor: defecto.defecto_id, texto: defecto.nombre }))}
								value={defectos[renglon.traspaso_linea_id] ?? ""}
								onChange={(evento) =>
									setDefectos((antes) => ({ ...antes, [renglon.traspaso_linea_id]: evento.target.value }))
								}
							/>
						),
					},
				]
			: []),
	];
	/** Los botones del pie, según lo que es y si se cuenta. */
	const botones = () => {
		if (detalle === undefined || detalle.recibido) return undefined;
		if (detalle.tipo === "devolucion") {
			return (
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void recibir("contado")}>
					Recibir devolución
				</Boton>
			);
		}
		if (detalle.tipo === "reproceso" || conDiferencias) {
			return (
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void recibir("contado")}>
					Recibir lo contado
				</Boton>
			);
		}
		return (
			<span className="flex flex-wrap gap-2">
				<Boton disabled={!conConexion} onClick={() => setConDiferencias(true)}>
					Llegó con diferencias
				</Boton>
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void recibir("completo")}>
					Llegó completo
				</Boton>
			</span>
		);
	};
	return (
		<Cajon
			abierto
			ancho
			conCambios={conCambios}
			alCerrar={cierre.alCerrar}
			{...(detalle === undefined ? {} : { contexto: `${detalle.folio} · De ${detalle.de}` })}
			titulo={detalle?.que ?? ""}
			accion={botones()}
		>
			{enAduana.choco && detalle !== undefined ? <EstadoDePantalla tipo="choque" documento={detalle.folio} /> : null}
			<SegunConsulta consulta={consulta}>
				{(datos) =>
					datos.recibido ? (
						<EstadoDePantalla tipo="vacio" texto={`${datos.folio} ya se recibió.`} />
					) : (
						<div className="flex flex-col gap-5">
							<div className="grid grid-cols-3 gap-3 max-telefono:grid-cols-1">
								{datos.mandaron === "" ? null : <CifraDeCajon numero={datos.mandaron} nombre="mandaron" />}
								<CifraDeCajon numero={datos.salio} nombre="salió" />
								<CifraDeCajon numero={datos.va_a} nombre="va a" />
							</div>
							{datos.tipo === "reproceso" ? (
								<div className="max-w-60">
									<Campo
										etiqueta="Llegaron"
										inputMode="numeric"
										maxLength={4}
										value={llegaron.reproceso ?? ""}
										error={revisar ? "Escribe cuántas llegaron, aunque sea 0." : undefined}
										onChange={(evento) => setLlegaron({ reproceso: evento.target.value })}
									/>
								</div>
							) : (
								<>
									{contando ? <TextoConTono tono="ambar">{faltaContar}</TextoConTono> : null}
									<Tabla
										nombre="Lo que viene"
										filas={datos.renglones}
										claveDeFila={(renglon) => renglon.traspaso_linea_id}
										columnas={columnas}
									/>
								</>
							)}
						</div>
					)
				}
			</SegunConsulta>
			{cierre.pregunta}
		</Cajon>
	);
}
