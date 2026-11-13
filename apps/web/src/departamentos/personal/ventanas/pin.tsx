/**
 * La ventana «PIN de {persona}»: el PIN en grande, cifra por cifra («4 1 8 9»), y «Se muestra una sola vez: dáselo en
 * persona.»; al restablecer, antes «El anterior ya no entra.». «Listo» cierra. Si la respuesta llegó sin el PIN (un
 * reintento de la misma intención), dice «El PIN ya se generó. Si no lo viste, usa «Restablecer».».
 * Fase 19 · docs/interfaz/fabrica/personal.md («Ventanas») y docs/modulos/personal/pin-del-taller.md (regla 3)
 *
 * «Asignar PIN» y «Restablecer» mandan su acción al apretarse; la ventana se abre con lo que regresó. El PIN solo vive
 * en la memoria de esta ventana: al cerrarla, se olvida.
 */

import { asignarPin, restablecerPin } from "@uniformame/compartido/contratos/personal/pines";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { useState } from "react";
import { useEnvio } from "../envio.ts";

/** Lo que muestra la ventana: de quién, el PIN (si llegó) y si se restableció. */
interface PinDado {
	nombre: string;
	pin: string | undefined;
	restablecido: boolean;
}

/**
 * La ventana con el PIN recién dado.
 * @param props Lo que se dio y cómo cerrarla.
 */
function VentanaDelPin({ dado, alCerrar }: { dado: PinDado; alCerrar: () => void }) {
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`PIN de ${dado.nombre}`}
			accion={
				<Boton variante="principal" onClick={alCerrar}>
					Listo
				</Boton>
			}
		>
			{dado.pin === undefined ? (
				<LineaDeAviso tono="advertencia">El PIN ya se generó. Si no lo viste, usa «Restablecer».</LineaDeAviso>
			) : (
				<div className="flex flex-col gap-3">
					<output
						aria-label={`PIN de ${dado.nombre}`}
						className="block rounded-grande bg-suave p-3.5 text-center font-extrabold text-[38px] tabular-nums tracking-[0.12em]"
					>
						{dado.pin.split("").join(" ")}
					</output>
					<p className="m-0 text-tinta2">
						{dado.restablecido ? "El anterior ya no entra. " : ""}Se muestra una sola vez: dáselo en persona.
					</p>
				</div>
			)}
		</Ventana>
	);
}

/**
 * «Asignar PIN» y «Restablecer»: mandan su acción y abren la ventana con el PIN que regresó.
 * @returns `asignar(persona)`, `restablecer(persona, version)`, si va en camino y la ventana para pintarla.
 */
export function useDarPin() {
	const asignacion = useEnvio(asignarPin);
	const restablecimiento = useEnvio(restablecerPin);
	const [dado, setDado] = useState<PinDado | null>(null);
	const asignar = async (persona: { persona_id: string; nombre: string }) => {
		const salio = await asignacion.enviar({ datos: { persona_id: persona.persona_id } });
		if (salio !== undefined) setDado({ nombre: persona.nombre, pin: salio.pin, restablecido: false });
	};
	const restablecer = async (persona: { persona_id: string; nombre: string }, version: number) => {
		const salio = await restablecimiento.enviar({ datos: { persona_id: persona.persona_id }, version });
		if (salio !== undefined) setDado({ nombre: persona.nombre, pin: salio.pin, restablecido: true });
	};
	return {
		asignar,
		restablecer,
		enviando: asignacion.enviando || restablecimiento.enviando,
		ventana: dado === null ? null : <VentanaDelPin dado={dado} alCerrar={() => setDado(null)} />,
	};
}
