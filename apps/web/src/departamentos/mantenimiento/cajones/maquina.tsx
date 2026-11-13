/**
 * El cajón Máquina: «{folio} · {área}» con su estado y el nombre de la máquina; sus cifras (reparaciones, paro con su
 * costo en rojo y fallas en el año), su tipo, marca y modelo, serie y quién la trae (con «Cambiar quién la trae»); su
 * historial del más reciente al más viejo. El pie: «Cerrar» · «Dar de baja» (rojo), apagado con una falla abierta.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Cajones»: Máquina; «Ventanas»: quién la trae y dar de baja)
 */

import { maquinaDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { bajaMaquina } from "@uniformame/compartido/contratos/mantenimiento/maquinas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { CifraDeCajon, ListaConDia } from "../comun.tsx";
import { useEnvio } from "../envio.ts";
import { VentanaQuienLaTrae } from "../ventanas/quien-la-trae.tsx";

/** Lo que regresa la consulta. */
type Maquina = z.infer<typeof maquinaDeMantenimiento.resultado>;

/**
 * Un renglón del historial, escrito: la falla tal como llega; el servicio, con su técnico, su costo y su paro.
 * @param renglon El renglón.
 */
function textoDelHistorial(renglon: Maquina["historial"][number]): string {
	if (renglon.tipo === "falla") return renglon.texto;
	return `${renglon.que_se_hizo} · ${renglon.tecnico} · ${montoEnPantalla(renglon.costo_centavos)}, ${renglon.horas_paro} h de paro`;
}

/**
 * El cuerpo del cajón.
 * @param props La máquina y cómo abrir «Cambiar quién la trae».
 */
function CuerpoDeMaquina({ maquina, alCambiarQuien }: { maquina: Maquina; alCambiarQuien: () => void }) {
	const conConexion = useConConexion();
	return (
		<div className="flex flex-col gap-5">
			<div className="flex">
				<Estado texto={maquina.estado.texto} color={maquina.estado.color} />
			</div>
			<div className="grid grid-cols-3 gap-3 max-telefono:grid-cols-1">
				<CifraDeCajon numero={montoEnPantalla(maquina.reparaciones_centavos)} nombre="en reparaciones" />
				<CifraDeCajon
					numero={`${maquina.horas_paro} h`}
					nombre={`de paro, ≈ ${montoEnPantalla(maquina.paro_centavos)}`}
					rojo
				/>
				<CifraDeCajon
					numero={String(maquina.fallas_en_el_anio)}
					nombre={`${maquina.fallas_en_el_anio === 1 ? "falla" : "fallas"} en el año`}
				/>
			</div>
			<section className="grid grid-cols-2 gap-4 max-telefono:grid-cols-1">
				<Dato etiqueta="Tipo">{maquina.tipo}</Dato>
				<Dato etiqueta="Marca y modelo">{maquina.marca_modelo ?? "—"}</Dato>
				<Dato etiqueta="Serie">{maquina.serie ?? "—"}</Dato>
				<Dato etiqueta="La trae">
					<span className="flex flex-wrap items-center gap-3">
						{maquina.la_trae?.nombre ?? "—"}
						{maquina.dada_de_baja === null ? (
							<Boton chico disabled={!conConexion} onClick={alCambiarQuien}>
								Cambiar quién la trae
							</Boton>
						) : null}
					</span>
				</Dato>
			</section>
			<section className="flex flex-col gap-2">
				<TituloDeBloque titulo="Historial" />
				<ListaConDia
					vacio="Sin fallas ni servicios"
					renglones={maquina.historial.map((renglon) => ({
						clave: renglon.clave,
						texto: textoDelHistorial(renglon),
						dia: renglon.fecha,
					}))}
				/>
			</section>
		</div>
	);
}

/**
 * El cajón Máquina.
 * @param props La máquina y cómo cerrar el cajón.
 */
export function CajonMaquina({ maquinaId, alCerrar }: { maquinaId: string; alCerrar: () => void }) {
	const consulta = useConsulta(maquinaDeMantenimiento, { maquina_id: maquinaId });
	const conConexion = useConConexion();
	const [ventana, setVentana] = useState<"quien" | "baja" | null>(null);
	const baja = useEnvio(bajaMaquina);
	const maquina = consulta.data;
	const conFalla = maquina?.falla_abierta != null;
	return (
		<Cajon
			abierto
			alCerrar={alCerrar}
			{...(maquina === undefined ? {} : { contexto: `${maquina.folio} · ${maquina.area}` })}
			titulo={maquina?.nombre ?? ""}
			accion={
				maquina === undefined || maquina.dada_de_baja !== null ? undefined : (
					<span className="flex flex-col items-end gap-1">
						<Boton variante="peligro" disabled={!conConexion || conFalla} onClick={() => setVentana("baja")}>
							Dar de baja
						</Boton>
						{conFalla ? (
							<LineaDeAviso tono="advertencia">
								{`${maquina.nombre} tiene una falla abierta: resuélvela antes de darla de baja`}
							</LineaDeAviso>
						) : null}
					</span>
				)
			}
		>
			<SegunConsulta consulta={consulta}>
				{(datos) => <CuerpoDeMaquina maquina={datos} alCambiarQuien={() => setVentana("quien")} />}
			</SegunConsulta>
			{maquina !== undefined && ventana === "quien" ? (
				<VentanaQuienLaTrae maquina={maquina} alCerrar={() => setVentana(null)} />
			) : null}
			{maquina !== undefined && ventana === "baja" ? (
				<VentanaConMotivo
					titulo={`Dar de baja ${maquina.nombre}`}
					textoAccion="Dar de baja"
					enviando={baja.enviando}
					alCerrar={() => setVentana(null)}
					alConfirmar={async (motivo) => {
						let error: string | undefined;
						const salio = await baja.enviar(
							{ datos: { maquina_id: maquina.maquina_id, motivo }, version: maquina.version },
							(falla) => {
								error = falla.campos.motivo ?? falla.mensaje;
							},
						);
						if (salio !== undefined) {
							setVentana(null);
							alCerrar();
						}
						return error;
					}}
				>
					{baja.choco ? <EstadoDePantalla tipo="choque" documento={maquina.nombre} /> : null}
					<LineaDeAviso tono="info">
						Sale de la tablet y de la lista de máquinas. Sus fallas, servicios y costos se conservan.
					</LineaDeAviso>
				</VentanaConMotivo>
			) : null}
		</Cajon>
	);
}
