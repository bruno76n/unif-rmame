/**
 * El cajón Falla: «{FM} · {fecha}» con su estado y «{máquina}: {lo que le pasa}»; sus cifras (paro, si la detuvo y
 * el costo de la reparación), quién la reportó, quién la traía, la máquina y el técnico; la nota de seguimiento; lo que
 * está deteniendo si está abierta; y su servicio si está resuelta. El pie: «Cerrar» · «Mandar a reparación» (solo
 * reportada) · «Registrar reparación» (si no está resuelta).
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Cajones»: Falla)
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { fallaDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { CifraDeCajon } from "@uniformame/interfaz/pagina/cifra-de-cajon";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { TituloDeBloque } from "@uniformame/interfaz/pagina/seccion";
import { Clock } from "lucide-react";
import { useState } from "react";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { montoEnPantalla } from "../../../comun/montos.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { ListaConDia } from "../comun.tsx";
import { VentanaMandarAReparacion } from "../ventanas/mandar-a-reparacion.tsx";
import { VentanaNotaSeguimiento } from "../ventanas/nota-seguimiento.tsx";
import { VentanaServicio } from "../ventanas/servicio.tsx";

/** Lo que regresa la consulta. */
type Falla = z.infer<typeof fallaDeMantenimiento.resultado>;

/** La ventana abierta desde el cajón. */
type VentanaDeLaFalla = "mandar" | "nota" | "reparacion" | null;

/**
 * El cuerpo del cajón.
 * @param props La falla y cómo abrir la ventana de la nota.
 */
function CuerpoDeFalla({ falla, alNota }: { falla: Falla; alNota: () => void }) {
	const conConexion = useConConexion();
	const abierta = falla.estado_clave !== "resuelta";
	const botonDeNota = (
		<Boton chico disabled={!conConexion} onClick={alNota}>
			Nota de seguimiento
		</Boton>
	);
	return (
		<div className="flex flex-col gap-5">
			<div className="flex">
				<Estado texto={falla.estado.texto} color={falla.estado.color} />
			</div>
			<div className="grid grid-cols-3 gap-3">
				<CifraDeCajon numero={`${falla.horas_paro} h`} nombre="de paro" />
				<CifraDeCajon numero={falla.detuvo ? "Sí" : "No"} nombre="la detuvo" />
				<CifraDeCajon numero={montoEnPantalla(falla.reparacion_centavos)} nombre="reparación" />
			</div>
			<section className="grid grid-cols-2 gap-4 max-telefono:grid-cols-1">
				<Dato etiqueta="Reportó">{falla.reporto}</Dato>
				<Dato etiqueta="La trae">{falla.la_trae ?? "—"}</Dato>
				<Dato etiqueta="Máquina">{falla.maquina_detalle}</Dato>
				<Dato etiqueta="Técnico">{falla.tecnico ?? "Sin asignar"}</Dato>
			</section>
			{falla.nota_seguimiento === null ? (
				abierta ? (
					<div>{botonDeNota}</div>
				) : null
			) : (
				<Recuadro color="azul" boton={abierta ? botonDeNota : undefined}>
					<span className="inline-flex items-center gap-2">
						<Clock aria-hidden="true" size={17} strokeWidth={1.9} />
						{falla.nota_seguimiento}
					</span>
				</Recuadro>
			)}
			{abierta && falla.deteniendo.length > 0 ? (
				<section className="flex flex-col gap-2">
					<TituloDeBloque titulo="Lo que está deteniendo" />
					<ListaConDia
						renglones={falla.deteniendo.map((lote) => ({
							clave: lote.lote_id,
							texto: (
								<>
									<b className="font-bold">{lote.folio}</b> · {lote.texto}
								</>
							),
							dia: lote.entrega,
						}))}
					/>
				</section>
			) : null}
			{falla.servicio === null ? null : (
				<section className="flex flex-col gap-3">
					<TituloDeBloque
						titulo="Servicio"
						detalle={`${falla.servicio.folio} · ${textoDeDiaCorto(falla.servicio.fecha)}`}
					/>
					<div className="grid grid-cols-3 gap-4 max-telefono:grid-cols-1">
						<Dato etiqueta="Qué se hizo">{falla.servicio.que_se_hizo}</Dato>
						<Dato etiqueta="Costo">{montoEnPantalla(falla.servicio.costo_centavos)}</Dato>
						<Dato etiqueta="Paro">
							{`${falla.servicio.horas_paro} ${falla.servicio.horas_paro === 1 ? "hora" : "horas"}, ≈ ${montoEnPantalla(falla.servicio.paro_centavos)}`}
						</Dato>
					</div>
				</section>
			)}
		</div>
	);
}

/**
 * El cajón Falla.
 * @param props La falla y cómo cerrar el cajón.
 */
export function CajonFalla({ fallaId, alCerrar }: { fallaId: string; alCerrar: () => void }) {
	const consulta = useConsulta(fallaDeMantenimiento, { falla_id: fallaId });
	const conConexion = useConConexion();
	const [ventana, setVentana] = useState<VentanaDeLaFalla>(null);
	const falla = consulta.data;
	const cerrarVentana = () => setVentana(null);
	return (
		<Cajon
			abierto
			alCerrar={alCerrar}
			{...(falla === undefined ? {} : { contexto: `${falla.folio} · ${textoDeDiaCorto(falla.fecha)}` })}
			titulo={falla?.titulo ?? ""}
			accion={
				falla === undefined || falla.estado_clave === "resuelta" ? undefined : (
					<span className="flex flex-wrap gap-2">
						{falla.estado_clave === "reportada" ? (
							<Boton disabled={!conConexion} onClick={() => setVentana("mandar")}>
								Mandar a reparación
							</Boton>
						) : null}
						<Boton variante="principal" disabled={!conConexion} onClick={() => setVentana("reparacion")}>
							Registrar reparación
						</Boton>
					</span>
				)
			}
		>
			<SegunConsulta consulta={consulta}>
				{(datos) => <CuerpoDeFalla falla={datos} alNota={() => setVentana("nota")} />}
			</SegunConsulta>
			{falla !== undefined && ventana === "mandar" ? (
				<VentanaMandarAReparacion falla={falla} alCerrar={cerrarVentana} />
			) : null}
			{falla !== undefined && ventana === "nota" ? (
				<VentanaNotaSeguimiento falla={falla} alCerrar={cerrarVentana} />
			) : null}
			{falla !== undefined && ventana === "reparacion" ? (
				<VentanaServicio
					falla={falla}
					alCerrar={cerrarVentana}
					alRegistrar={() => {
						cerrarVentana();
						alCerrar();
					}}
				/>
			) : null}
		</Cajon>
	);
}
