/**
 * Las pantallas del aparato, antes de que alguien entre: «Registrar esta tablet» (el código de la dueña), «Preparando la
 * tablet…» mientras baja su foto, la revocada (que sigue mandando lo guardado) y la de actualizar.
 * Fase 20 · docs/interfaz/tablet.md («Las pantallas del aparato»)
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { type FormEvent, useState } from "react";

/**
 * El centro de una pantalla del aparato.
 * @param props Su título y lo que lleva.
 */
function Centro({ titulo, children }: { titulo: string; children?: ReactNode }) {
	return (
		<section className="mx-auto flex h-full max-w-150 flex-col justify-center gap-5">
			<h1 className="m-0 text-tablet-titulo tracking-tight">{titulo}</h1>
			{children}
		</section>
	);
}

/**
 * «Registrar esta tablet»: la casilla del código de 6 caracteres y «Registrar».
 * @param props Qué hacer con el código: regresa el error, si lo hubo.
 */
export function RegistrarTablet({ alRegistrar }: { alRegistrar: (codigo: string) => Promise<string | null> }) {
	const [codigo, setCodigo] = useState("");
	const [error, setError] = useState<string>();
	const [enviando, setEnviando] = useState(false);
	const registrar = async (evento: FormEvent) => {
		evento.preventDefault();
		setEnviando(true);
		const fallo = await alRegistrar(codigo);
		setEnviando(false);
		setError(fallo ?? undefined);
	};
	return (
		<Centro titulo="Registrar esta tablet">
			<form className="flex flex-col gap-4" onSubmit={(evento) => void registrar(evento)}>
				<Campo
					etiqueta="Escribe el código que te dio la dueña"
					value={codigo}
					maxLength={7}
					autoComplete="off"
					autoCapitalize="characters"
					error={error}
					onChange={(evento) => setCodigo(evento.target.value)}
				/>
				<Boton variante="principal" type="submit" disabled={enviando || codigo.trim().length < 6}>
					Registrar
				</Boton>
			</form>
		</Centro>
	);
}

/**
 * «Preparando la tablet…», con su avance: nadie entra hasta que termina.
 * @param props Cuántos renglones van.
 */
export function Preparando({ renglones }: { renglones: number }) {
	return (
		<Centro titulo="Preparando la tablet…">
			<p className="m-0 font-semibold text-tinta3" role="status">
				{renglones === 0 ? "Bajando lo del taller" : `${plural(renglones, "renglón", "renglones")} bajados`}
			</p>
		</Centro>
	);
}

/**
 * La tablet revocada: no entra nadie y, mientras le quede cola, la sigue mandando.
 * @param props Cuántas capturas faltan por mandar.
 */
export function Revocada({ pendientes }: { pendientes: number }) {
	return (
		<Centro titulo="Este aparato fue revocado: ya no entra.">
			{pendientes === 0 ? null : (
				<p className="m-0 font-semibold text-tinta3" role="status">
					Enviando {plural(pendientes, "captura guardada", "capturas guardadas")}…
				</p>
			)}
		</Centro>
	);
}

/**
 * Hay una versión nueva: la cola espera y no se pierde.
 * @param props Qué hacer con «Actualizar».
 */
export function Actualizar({ alActualizar }: { alActualizar: () => void }) {
	return (
		<Centro titulo="Hay una versión nueva. Actualiza para seguir.">
			<Boton variante="principal" icono={RefreshCw} onClick={alActualizar}>
				Actualizar
			</Boton>
		</Centro>
	);
}
