/**
 * La captura en la tablet del taller: los puntos del PIN y su teclado de 1 a 9, 0 y borrar; el contador con «−» y «+»
 * de 84 px; la casilla grande de un código, con su error dentro; y el mensaje de color de un paso (el tope, un error,
 * una advertencia).
 * Fase 20 · docs/interfaz/tablet.md («Entrada con nombre y PIN», «Registrar una operación», «Escanear bulto», «Tomar
 * consumible»)
 *
 * Uso: `<PuntosDePin llenos={2} error={false} />`, `<TecladoDePin alTeclear={...} alBorrar={...} />`,
 * `<Contador etiqueta="Buenas" valor={24} alCambiar={...} minimo={0} />`, `<CampoDeTablet etiqueta="Código del bulto" … />`,
 * `<MensajeDeTablet tono="rojo">…</MensajeDeTablet>`.
 */

import { Delete, Minus, Plus } from "lucide-react";
import { type InputHTMLAttributes, type ReactNode, useId } from "react";
import { unirClases } from "../clases.ts";

/**
 * Los cuatro puntos del PIN: se llenan al teclear; con error, su borde es rojo.
 * @param props Cuántos van y si el último PIN fue equivocado.
 */
export function PuntosDePin({ llenos, error }: { llenos: number; error: boolean }) {
	return (
		<div className="flex gap-4.5" role="img" aria-label={`${llenos} de 4 cifras`}>
			{[0, 1, 2, 3].map((punto) => (
				<i
					key={punto}
					className={unirClases(
						"size-punto-pin rounded-full",
						punto < llenos
							? "bg-tinta"
							: error
								? "shadow-[inset_0_0_0_3px_var(--color-estado-rojo)]"
								: "shadow-[inset_0_0_0_3px_var(--color-tinta3)]",
					)}
				/>
			))}
		</div>
	);
}

/**
 * El teclado del PIN: 1 a 9, 0 y borrar.
 * @param props Qué hacer con cada cifra y con borrar.
 */
export function TecladoDePin({ alTeclear, alBorrar }: { alTeclear: (cifra: string) => void; alBorrar: () => void }) {
	const tecla =
		"grid h-tecla place-items-center rounded-tablet bg-panel font-bold text-tablet-tecla shadow-panel active:bg-riel";
	return (
		<div className="grid grid-cols-3 gap-3.5">
			{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((cifra) => (
				<button key={cifra} type="button" className={tecla} onClick={() => alTeclear(cifra)}>
					{cifra}
				</button>
			))}
			<span />
			<button type="button" className={tecla} onClick={() => alTeclear("0")}>
				0
			</button>
			<button type="button" className={tecla} onClick={alBorrar} aria-label="Borrar">
				<Delete aria-hidden="true" size={30} />
			</button>
		</div>
	);
}

/**
 * Un contador con «−» y «+»: «Buenas», «Dañadas» o un consumible. Ninguno baja del mínimo ni pasa del máximo.
 * @param props Su etiqueta, su valor, sus límites, su tono, su unidad y si es el chico de los consumibles.
 */
export function Contador({
	etiqueta,
	valor,
	alCambiar,
	minimo = 0,
	maximo = Number.POSITIVE_INFINITY,
	tono = "normal",
	unidad,
	chico = false,
}: {
	etiqueta: string;
	valor: number;
	alCambiar: (valor: number) => void;
	minimo?: number;
	maximo?: number;
	tono?: "normal" | "bien" | "mal" | "elegido";
	unidad?: string;
	chico?: boolean;
}) {
	const boton = unirClases(
		"grid place-items-center rounded-tablet bg-suave shadow-[inset_0_0_0_1px_var(--color-linea2)] active:bg-riel disabled:opacity-40",
		chico ? "size-16" : "size-contador",
	);
	return (
		<div
			className={unirClases(
				"rounded-tablet bg-panel px-4.5 py-4 shadow-panel",
				tono === "elegido" ? "ring-3 ring-estado-verde" : "",
			)}
		>
			<small
				className={unirClases(
					"font-bold",
					chico ? "text-[18px] text-tinta" : "text-[16px]",
					tono === "bien" ? "text-texto-bien" : tono === "mal" ? "text-texto-error" : chico ? "" : "text-tinta2",
				)}
			>
				{etiqueta}
			</small>
			<div className="mt-2 flex items-center justify-between gap-2.5">
				<button
					type="button"
					className={boton}
					aria-label={`Menos ${etiqueta.toLowerCase()}`}
					disabled={valor <= minimo}
					onClick={() => alCambiar(Math.max(minimo, valor - 1))}
				>
					<Minus aria-hidden="true" size={chico ? 28 : 34} strokeWidth={2.4} />
				</button>
				<b
					className={unirClases(
						"min-w-22 text-center font-extrabold tabular-nums",
						chico ? "text-[44px]" : "text-tablet-contador",
					)}
					aria-live="polite"
				>
					{valor}
				</b>
				<button
					type="button"
					className={boton}
					aria-label={`Más ${etiqueta.toLowerCase()}`}
					disabled={valor >= maximo}
					onClick={() => alCambiar(Math.min(maximo, valor + 1))}
				>
					<Plus aria-hidden="true" size={chico ? 28 : 34} strokeWidth={2.4} />
				</button>
			</div>
			{unidad === undefined ? null : (
				<small className="mt-1.5 block text-center font-semibold text-tablet-chico text-tinta3">{unidad}</small>
			)}
		</div>
	);
}

/** El tono de un mensaje: el tope (azul), un error (rojo) o una advertencia (ámbar). */
export type TonoDeMensaje = "azul" | "rojo" | "ambar";

/** Los colores de cada tono. */
const colores: Readonly<Record<TonoDeMensaje, string>> = {
	azul: "bg-tablet-tope text-tablet-tope-texto",
	rojo: "bg-tablet-error text-tablet-error-texto",
	ambar: "bg-tablet-advertencia text-tablet-advertencia-texto",
};

/**
 * Un mensaje de color dentro de un paso.
 * @param props Su tono y lo que dice.
 */
export function MensajeDeTablet({ tono, children }: { tono: TonoDeMensaje; children: ReactNode }) {
	return (
		<div
			role={tono === "rojo" ? "alert" : "status"}
			className={unirClases("rounded-grande px-4.5 py-3.5 font-bold text-[17px]", colores[tono])}
		>
			{children}
		</div>
	);
}

/**
 * La casilla grande de un código, para el dedo y para un lector de mano: 72 px de alto, la letra de 28 px en negritas y
 * centrada; si hubo error, va en rojo debajo, dentro de la misma tarjeta.
 * @param props Su etiqueta, su error y lo de una casilla.
 */
export function CampoDeTablet({
	etiqueta,
	error,
	...resto
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; error?: string | undefined }) {
	const campoId = useId();
	const errorId = `${campoId}-error`;
	return (
		<div className="flex w-full max-w-115 flex-col gap-2">
			<label htmlFor={campoId} className="text-center font-semibold text-[15px] text-tinta2">
				{etiqueta}
			</label>
			<input
				id={campoId}
				aria-invalid={error === undefined ? undefined : true}
				aria-describedby={error === undefined ? undefined : errorId}
				className={unirClases(
					"h-campo-tablet w-full rounded-tablet border-2 bg-panel px-4 text-center font-bold text-[28px] tracking-wide",
					"focus:border-marca focus:outline-none focus:ring-4 focus:ring-marca/20",
					error === undefined ? "border-linea2" : "border-estado-rojo",
				)}
				{...resto}
			/>
			{error === undefined ? null : (
				<p id={errorId} role="alert" className="m-0 text-center font-bold text-[17px] text-tablet-error-texto">
					{error}
				</p>
			)}
		</div>
	);
}
