/**
 * La entrada con nombre y PIN: «¿Quién eres?» con un botón por persona con PIN (la bloqueada dice «Bloqueado» y no abre
 * su PIN), y «{nombre}, tu PIN» con sus cuatro puntos, su línea de error, «No soy {nombre}» y el teclado. Al cuarto
 * dígito la tablet lo revisa sola, sin red.
 * Fase 20 · docs/interfaz/tablet.md («Entrada con nombre y PIN»)
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import { BotonVolver, Opcion } from "@uniformame/interfaz/tablet/botones";
import { PuntosDePin, TecladoDePin } from "@uniformame/interfaz/tablet/captura";
import { useState } from "react";
import type { PersonaConPin } from "../copia/lecturas.ts";
import type { RevisionDePin } from "../pin/pin.ts";

/**
 * «¿Quién eres?».
 * @param props Las personas con PIN y qué hacer al escoger una.
 */
export function QuienEres({
	personas,
	alEscoger,
}: {
	personas: readonly PersonaConPin[];
	alEscoger: (persona: PersonaConPin) => void;
}) {
	return (
		<section className="mx-auto flex max-w-245 flex-col gap-5">
			<h1 className="m-0 text-tablet-pin tracking-tight">¿Quién eres?</h1>
			{personas.length === 0 ? (
				<p className="m-0 rounded-[14px] bg-panel p-7 text-center font-semibold text-[18px] text-tinta3 shadow-panel">
					Nadie tiene PIN todavía. Personal lo asigna en PIN del taller.
				</p>
			) : (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
					{personas.map((persona) => (
						<Opcion
							key={persona.id}
							titulo={persona.nombre}
							{...(persona.bloqueada ? { nota: "Bloqueado", tono: "rojo" as const, disabled: true } : {})}
							principio={
								<span className="grid size-12 flex-none place-items-center rounded-full bg-tinta font-bold text-white">
									{persona.iniciales}
								</span>
							}
							onClick={() => alEscoger(persona)}
						/>
					))}
				</div>
			)}
		</section>
	);
}

/**
 * «{nombre}, tu PIN».
 * @param props La persona, cómo revisar su PIN, qué hacer al entrar y «No soy {nombre}».
 */
export function TuPin({
	persona,
	revisar,
	alEntrar,
	alRegresar,
}: {
	persona: PersonaConPin;
	revisar: (pin: string) => Promise<RevisionDePin>;
	alEntrar: () => void;
	alRegresar: () => void;
}) {
	const [pin, setPin] = useState("");
	const [error, setError] = useState("");
	const nombre = persona.nombre.split(" ")[0] ?? persona.nombre;
	const teclear = async (cifra: string) => {
		const escrito = `${pin}${cifra}`.slice(0, 4);
		setPin(escrito);
		setError("");
		if (escrito.length < 4) return;
		const revision = await revisar(escrito);
		setPin("");
		if (revision.resultado === "entra") alEntrar();
		else if (revision.resultado === "equivocado")
			setError(`PIN equivocado · ${plural(revision.quedan, "intento más", "intentos más")}`);
		else setError("Bloqueado: pide al encargado que lo desbloquee en Personal");
	};
	return (
		<section className="mx-auto grid h-full max-w-245 grid-cols-[1fr_minmax(320px,420px)] items-center gap-10 max-telefono:grid-cols-1">
			<div className="flex flex-col gap-5.5">
				<h1 className="m-0 text-tablet-pin tracking-tight">{nombre}, tu PIN</h1>
				<PuntosDePin llenos={pin.length} error={error !== ""} />
				<p className="m-0 min-h-6.5 font-bold text-[18px] text-texto-error" role="alert">
					{error}
				</p>
				<BotonVolver onClick={alRegresar}>No soy {nombre}</BotonVolver>
			</div>
			<TecladoDePin
				alTeclear={(cifra) => void teclear(cifra)}
				alBorrar={() => {
					setPin((anterior) => anterior.slice(0, -1));
					setError("");
				}}
			/>
		</section>
	);
}
