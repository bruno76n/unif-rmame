/**
 * El cajón Recibir del taller: «Del taller · {L}» y la prenda; las cifras «{n} contadas aquí» y «{n} de {m} tallas
 * contadas»; «Por talla · Va a {destino}» con una casilla por talla, vacía, hasta 4 cifras, y «Parte va a bodega» en
 * las que la llevan. «Recibir en aduana» llama `inventario.recibir_del_taller`; cada talla se revisa con el campo del
 * contrato, y la que no se contó se marca con su error («Cuenta esta talla, aunque sea 0»). Lo que aprobó Calidad nunca llega a esta pantalla: el conteo es a ciegas.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Cajones»: Recibir del taller)
 */

import { detalleRecibirTaller } from "@uniformame/compartido/contratos/inventario/aduana-cajones";
import { recibirDelTaller } from "@uniformame/compartido/contratos/inventario/taller";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { CifraDeCajon } from "@uniformame/interfaz/pagina/cifra-de-cajon";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { useState } from "react";
import { useConsulta } from "../../../comun/api.tsx";
import { useCierreDelCajon } from "../../../comun/cambios-sin-guardar.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useEnvio } from "../envio.ts";

/** El campo de las piezas de una talla, del contrato: la pantalla revisa igual que la API. */
const piezasDeTalla = recibirDelTaller.entrada.shape.tallas.element.shape.piezas;

/**
 * Lee lo escrito en una talla con el campo del contrato.
 * @param texto Lo escrito; vacío es una talla sin contar.
 * @returns Las piezas, o el error que daría la API («Cuenta esta talla, aunque sea 0»).
 */
function leerTalla(texto: string): { piezas: number } | { error: string } {
	const limpio = texto.trim();
	const leido = piezasDeTalla.safeParse(limpio === "" ? undefined : Number(limpio));
	return leido.success ? { piezas: leido.data } : { error: leido.error.issues[0]?.message ?? "" };
}

/**
 * El cajón Recibir del taller.
 * @param props El lote y cómo cerrar el cajón.
 */
export function CajonRecibirTaller({ loteId, alCerrar }: { loteId: string; alCerrar: () => void }) {
	const consulta = useConsulta(detalleRecibirTaller, { lote_id: loteId });
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(recibirDelTaller);
	const [contadas, setContadas] = useState<Readonly<Record<string, string>>>({});
	const [revisar, setRevisar] = useState(false);
	const detalle = consulta.data;
	const conCambios = Object.values(contadas).some((valor) => valor.trim() !== "");
	const cierre = useCierreDelCajon(conCambios, alCerrar);
	const tallas = detalle?.tallas ?? [];
	const leidas = tallas.map((talla) => ({ talla, leida: leerTalla(contadas[talla.variante_id] ?? "") }));
	const escritas = leidas.flatMap(({ talla, leida }) => ("piezas" in leida ? [{ talla, piezas: leida.piezas }] : []));
	const total = escritas.reduce((suma, escrita) => suma + escrita.piezas, 0);
	/** Recibe lo contado; si falta una talla, la marca y no manda nada. */
	const recibir = async () => {
		if (detalle === undefined) return;
		if (escritas.length < tallas.length) {
			setRevisar(true);
			return;
		}
		const salio = await enviar({
			datos: {
				lote_id: detalle.lote_id,
				tallas: escritas.map(({ talla, piezas }) => ({ variante_id: talla.variante_id, piezas })),
			},
		});
		if (salio !== undefined) cierre.alCerrar();
	};
	return (
		<Cajon
			abierto
			ancho
			conCambios={conCambios}
			alCerrar={cierre.alCerrar}
			{...(detalle === undefined ? {} : { contexto: `Del taller · ${detalle.folio}` })}
			titulo={detalle?.prenda ?? ""}
			accion={
				detalle === undefined || detalle.recibido ? undefined : (
					<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void recibir()}>
						Recibir en aduana
					</Boton>
				)
			}
		>
			<SegunConsulta consulta={consulta}>
				{(datos) =>
					datos.recibido ? (
						<EstadoDePantalla tipo="vacio" texto={`${datos.folio} ya se recibió en aduana.`} />
					) : (
						<div className="flex flex-col gap-5">
							<div className="grid grid-cols-2 gap-3">
								<CifraDeCajon numero={String(total)} nombre="contadas aquí" />
								<CifraDeCajon numero={`${escritas.length} de ${datos.tallas.length}`} nombre="tallas contadas" />
							</div>
							<TituloDeBloque titulo="Por talla" detalle={`Va a ${datos.va_a}`} />
							<div className="grid grid-cols-4 gap-3 max-telefono:grid-cols-2">
								{datos.tallas.map((talla) => {
									const valor = contadas[talla.variante_id] ?? "";
									const leida = leerTalla(valor);
									return (
										<div key={talla.variante_id} className="flex flex-col gap-1">
											<Campo
												etiqueta={`Talla ${talla.talla}`}
												inputMode="numeric"
												maxLength={4}
												value={valor}
												error={revisar && "error" in leida ? leida.error : undefined}
												onChange={(evento) =>
													setContadas((antes) => ({ ...antes, [talla.variante_id]: evento.target.value }))
												}
											/>
											{talla.parte_a_bodega ? <TextoConTono tono="normal">Parte va a bodega</TextoConTono> : null}
										</div>
									);
								})}
							</div>
						</div>
					)
				}
			</SegunConsulta>
			{cierre.pregunta}
		</Cajon>
	);
}
