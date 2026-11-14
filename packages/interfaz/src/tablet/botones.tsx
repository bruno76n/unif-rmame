/**
 * Los botones grandes de la tablet del taller, para usar con el dedo: «Volver», el botón verde de 88 px que registra o
 * toma, el mosaico del inicio con su ícono, la opción de una lista (una persona, una máquina, un motivo, una operación) y
 * la tarjeta de un bulto de «Bultos para ti» con la orilla del color de su lote.
 * Fase 20 · docs/interfaz/tablet.md y docs/interfaz/DISENO.md
 *
 * Uso: `<BotonVolver onClick={...}>Volver</BotonVolver>`, `<BotonGrande icono={Check} disabled={...}>Registrar 24
 * piezas</BotonGrande>`, `<Mosaico icono={ScanLine} titulo="Escanear bulto" principal />`, `<Opcion titulo="Recta 3"
 * detalle="MQ-03" nota="La tuya" tono="suya" />`, `<TarjetaDeBulto folio="B-2026-121-03" … />`.
 */

import { ArrowLeft, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { unirClases } from "../clases.ts";

/** Lo de un botón de HTML, menos su clase. */
type DeBoton = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "type">;

/**
 * «Volver», «Otra máquina» o «No soy {nombre}»: arriba a la izquierda, con su flecha.
 * @param props Su texto y lo de un botón.
 */
export function BotonVolver({ children, ...resto }: DeBoton) {
	return (
		<button
			type="button"
			className="inline-flex h-volver items-center gap-2 self-start rounded-grande bg-panel py-0 pr-4.5 pl-3 font-bold text-[17px] shadow-panel"
			{...resto}
		>
			<ArrowLeft aria-hidden="true" size={22} />
			{children}
		</button>
	);
}

/**
 * El botón verde de 88 px: «Registrar 24 piezas», «Tomar»; gris cuando está apagado.
 * @param props Su ícono, su texto y lo de un botón.
 */
export function BotonGrande({ icono: Icono, children, ...resto }: DeBoton & { icono: LucideIcon }) {
	return (
		<button
			type="button"
			className="flex h-boton-grande w-full items-center justify-center gap-3 rounded-[18px] bg-estado-verde font-extrabold text-tablet-boton text-white disabled:bg-linea2"
			{...resto}
		>
			<Icono aria-hidden="true" size={32} strokeWidth={2.6} />
			{children}
		</button>
	);
}

/**
 * Un mosaico del inicio: «Escanear bulto» (el principal, negro), «Falla de máquina», «Tomar consumible».
 * @param props Su ícono, su título, si es el principal y lo de un botón.
 */
export function Mosaico({
	icono: Icono,
	titulo,
	principal = false,
	...resto
}: DeBoton & { icono: LucideIcon; titulo: string; principal?: boolean }) {
	return (
		<button
			type="button"
			className={unirClases(
				"flex min-h-mosaico flex-col justify-between gap-4 rounded-tablet p-4.5 text-left active:scale-[.98]",
				principal ? "bg-tinta text-white" : "bg-panel shadow-panel",
			)}
			{...resto}
		>
			<Icono aria-hidden="true" size={34} />
			<b className="text-[19px] leading-tight">{titulo}</b>
		</button>
	);
}

/** El tono de una opción: normal, la de la persona (con su marco) o detenida (en rojo). */
export type TonoDeOpcion = "normal" | "suya" | "rojo";

/**
 * Una opción de una lista: una persona de «¿Quién eres?», una máquina, un motivo, una operación.
 * @param props Su título, su detalle, su nota (con el color de su tono) y lo de un botón.
 */
export function Opcion({
	titulo,
	detalle,
	nota,
	tono = "normal",
	principio,
	...resto
}: DeBoton & { titulo: string; detalle?: string; nota?: string; tono?: TonoDeOpcion; principio?: ReactNode }) {
	return (
		<button
			type="button"
			className={unirClases(
				"flex min-h-opcion items-center gap-3.5 rounded-[14px] px-4 py-3.5 text-left shadow-panel active:scale-[.98]",
				"disabled:cursor-not-allowed disabled:opacity-60",
				tono === "rojo" ? "bg-tablet-detenida" : "bg-panel",
				tono === "suya" ? "ring-3 ring-tinta" : "",
			)}
			{...resto}
		>
			{principio}
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<b className="text-[20px]">{titulo}</b>
				{detalle === undefined ? null : <span className="font-semibold text-tablet-chico text-tinta3">{detalle}</span>}
				{nota === undefined ? null : (
					<em
						className={unirClases(
							"font-bold text-[13.5px] not-italic",
							tono === "rojo" ? "text-tablet-error-texto" : "text-marca",
						)}
					>
						{nota}
					</em>
				)}
			</span>
		</button>
	);
}

/** El color de la salud del lote de un bulto. */
export type TonoDeBulto = "normal" | "ambar" | "rojo";

/** La orilla de cada tono. */
const orillaDeBulto: Readonly<Record<TonoDeBulto, string>> = {
	normal: "border-estado-azul",
	ambar: "border-estado-ambar",
	rojo: "border-estado-rojo",
};

/**
 * Un bulto de «Bultos para ti», como la muestra: el folio en gris, la operación en grande, «{prenda} · talla {t}» en
 * hasta dos renglones y cuántas piezas esperan.
 * @param props Lo del bulto, el tono de su lote y lo de un botón.
 */
export function TarjetaDeBulto({
	folio,
	prenda,
	operacion,
	listas,
	textoDeListas,
	tono,
	...resto
}: DeBoton & {
	folio: string;
	prenda: string;
	operacion: string;
	listas: number;
	/** «lista para ti» o «listas para ti». */
	textoDeListas: string;
	tono: TonoDeBulto;
}) {
	return (
		<button
			type="button"
			className={unirClases(
				"flex min-h-opcion items-center gap-3 rounded-[14px] border-l-8 bg-panel px-4 py-3.5 text-left shadow-panel active:scale-[.98]",
				orillaDeBulto[tono],
			)}
			{...resto}
		>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="font-semibold text-tinta3 text-[15px] tabular-nums">{folio}</span>
				<b className="truncate font-extrabold text-[19px]">{operacion}</b>
				{/* La prenda y su talla en hasta dos renglones: un nombre largo nunca esconde la talla. */}
				<span className="line-clamp-2 font-semibold text-tinta2 text-[15px]">{prenda}</span>
			</span>
			<span className="flex min-w-22 flex-col items-center">
				<b className="font-extrabold text-tablet-bulto leading-none tabular-nums">{listas}</b>
				<small className="font-semibold text-[12.5px] text-tinta3">{textoDeListas}</small>
			</span>
		</button>
	);
}
