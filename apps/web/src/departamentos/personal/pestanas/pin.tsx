/**
 * PIN del taller de Personal: las personas activas del Taller sin cuenta de Google, con Persona, Puesto, PIN («••••»
 * si tiene, nunca se vuelve a mostrar; «Sin PIN» en ámbar; «Bloqueado» en rojo con desde cuándo) y su botón: «Asignar
 * PIN» (negro), «Restablecer» (gris) o «Desbloquear». Al pie, «El PIN solo sirve en la tablet registrada del taller».
 * Fase 19 · docs/interfaz/fabrica/personal.md («PIN del taller»)
 */

import { textoDeMomentoCorto } from "@uniformame/compartido/calculos/fechas";
import { desbloquearPin, type pinesDelTaller } from "@uniformame/compartido/contratos/personal/pines";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../envio.ts";
import { useDarPin } from "../ventanas/pin.tsx";

/** Lo que regresa la consulta. */
type Pines = z.infer<typeof pinesDelTaller.resultado>;

/** Una persona de la lista. */
type PersonaConPin = Pines["personas"][number];

/**
 * El PIN de una persona: tapado si tiene, o su estado.
 * @param props Su PIN.
 */
function SuPin({ tablet }: { tablet: PersonaConPin["tablet"] }) {
	if (tablet.estado === null) return <span title="PIN asignado">••••</span>;
	return (
		<Estado
			texto={tablet.estado.texto}
			color={tablet.estado.color}
			{...(tablet.bloqueado_desde === null ? {} : { abajo: `Desde ${textoDeMomentoCorto(tablet.bloqueado_desde)}` })}
		/>
	);
}

/**
 * PIN del taller de Personal.
 * @param props Lo que regresa `personal.pines`.
 */
export function PinDePersonal({ datos }: { datos: Pines }) {
	const conConexion = useConConexion();
	const pin = useDarPin();
	const desbloqueo = useEnvio(desbloquearPin);
	const apagado = !conConexion || pin.enviando || desbloqueo.enviando;
	return (
		<div className="flex flex-col gap-4">
			{desbloqueo.choco ? <EstadoDePantalla tipo="choque" documento="El PIN" /> : null}
			{datos.personas.length === 0 ? (
				<EstadoDePantalla tipo="vacio" texto="Nadie del Taller puede tener PIN" />
			) : (
				<Tabla
					nombre="PIN del taller"
					filas={datos.personas}
					claveDeFila={(persona) => persona.persona_id}
					columnas={[
						{ clave: "persona", encabezado: "Persona", celda: (persona) => persona.nombre },
						{ clave: "puesto", encabezado: "Puesto", celda: (persona) => persona.puesto },
						{ clave: "pin", encabezado: "PIN", celda: (persona) => <SuPin tablet={persona.tablet} /> },
						{
							clave: "boton",
							encabezado: "",
							alinear: "derecha",
							celda: (persona) => {
								const { tablet } = persona;
								if (!tablet.tiene || tablet.version === null) {
									return (
										<Boton chico variante="principal" disabled={apagado} onClick={() => void pin.asignar(persona)}>
											Asignar PIN
										</Boton>
									);
								}
								const version = tablet.version;
								return (
									<span className="inline-flex gap-2">
										{tablet.bloqueado_desde !== null ? (
											<Boton
												chico
												variante="principal"
												disabled={apagado}
												onClick={() => void desbloqueo.enviar({ datos: { persona_id: persona.persona_id }, version })}
											>
												Desbloquear
											</Boton>
										) : null}
										<Boton chico disabled={apagado} onClick={() => void pin.restablecer(persona, version)}>
											Restablecer
										</Boton>
									</span>
								);
							},
						},
					]}
				/>
			)}
			<LineaDeAviso tono="info">El PIN solo sirve en la tablet registrada del taller</LineaDeAviso>
			{pin.ventana}
		</div>
	);
}
