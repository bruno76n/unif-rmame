/**
 * Falla de máquina: «¿Qué máquina?» con las activas (primero las de la persona; la que tiene falla abierta dice desde
 * cuándo, en rojo si la detuvo) y «{máquina}: ¿qué le pasa?» con un botón por motivo; si ya tiene falla abierta, en
 * lugar de los motivos dice que ya está reportada.
 * Fase 20 · docs/interfaz/tablet.md («Falla de máquina»)
 */

import { diaDeNegocio, textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { BotonVolver, Opcion } from "@uniformame/interfaz/tablet/botones";
import { MensajeDeTablet } from "@uniformame/interfaz/tablet/captura";
import { Temporal } from "temporal-polyfill";
import type { MaquinaDeLaTablet } from "../copia/lecturas.ts";

/**
 * «Reportada desde hoy», «En reparación desde el 7 nov».
 * @param falla La falla abierta.
 */
export function desdeCuando(falla: NonNullable<MaquinaDeLaTablet["falla"]>): string {
	const estado = falla.estado === "en_reparacion" ? "En reparación" : "Reportada";
	const hoy = diaDeNegocio(Temporal.Now.instant()).toString();
	return `${estado} desde ${falla.desde === hoy ? "hoy" : `el ${textoDeDiaCorto(falla.desde)}`}`;
}

/**
 * Un texto que va a media frase: solo su primera letra en minúscula («No prende» → «no prende»), así un nombre propio
 * del motivo se queda como viene.
 * @param texto El texto.
 */
function aMediaFrase(texto: string): string {
	return `${texto.slice(0, 1).toLocaleLowerCase("es-MX")}${texto.slice(1)}`;
}

/**
 * «¿Qué máquina?».
 * @param props Las máquinas y qué hacer al escoger una o al volver.
 */
export function QueMaquina({
	maquinas,
	alEscoger,
	alVolver,
}: {
	maquinas: readonly MaquinaDeLaTablet[];
	alEscoger: (maquina: MaquinaDeLaTablet) => void;
	alVolver: () => void;
}) {
	return (
		<section className="mx-auto flex max-w-245 flex-col gap-4.5">
			<BotonVolver onClick={alVolver}>Volver</BotonVolver>
			<h1 className="m-0 text-tablet-titulo tracking-tight">¿Qué máquina?</h1>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
				{maquinas.map((maquina) => (
					<Opcion
						key={maquina.id}
						titulo={maquina.nombre}
						detalle={maquina.folio}
						{...(maquina.falla === null
							? maquina.esSuya
								? { nota: "La tuya", tono: "suya" as const }
								: {}
							: {
									nota: desdeCuando(maquina.falla),
									tono: maquina.falla.detiene ? ("rojo" as const) : ("normal" as const),
								})}
						onClick={() => alEscoger(maquina)}
					/>
				))}
			</div>
		</section>
	);
}

/**
 * «{máquina}: ¿qué le pasa?».
 * @param props La máquina, los motivos y qué hacer al escoger uno o con «Otra máquina».
 */
export function QueLePasa({
	maquina,
	motivos,
	alEscoger,
	alOtra,
}: {
	maquina: MaquinaDeLaTablet;
	motivos: readonly { id: string; nombre: string }[];
	alEscoger: (motivo: { id: string; nombre: string }) => void;
	alOtra: () => void;
}) {
	return (
		<section className="mx-auto flex max-w-245 flex-col gap-4.5">
			<BotonVolver onClick={alOtra}>Otra máquina</BotonVolver>
			<h1 className="m-0 text-tablet-titulo tracking-tight">{maquina.nombre}: ¿qué le pasa?</h1>
			{maquina.falla === null ? (
				<div className="grid grid-cols-3 gap-3 max-menu:grid-cols-2">
					{motivos.map((motivo) => (
						<Opcion key={motivo.id} titulo={motivo.nombre} onClick={() => alEscoger(motivo)} />
					))}
				</div>
			) : (
				<MensajeDeTablet tono="ambar">
					Ya está reportada: {aMediaFrase(maquina.falla.motivo)}, {desdeCuando(maquina.falla).toLowerCase()}
				</MensajeDeTablet>
			)}
		</section>
	);
}
