/**
 * La cuadrícula «Asistencia del {semana}»: una fila por persona que cobra por tiempo o mixta, un botón por día de
 * trabajo («✓» completo, «½» medio, «F» falta, vacío sin capturar; gris y sin botón fuera de su ingreso o su baja) y
 * «Días». Abajo, la leyenda, los días sin capturar y «Cerrar semana» (o «Cerrada · la tiene contaduría»).
 * Fase 19 · docs/interfaz/fabrica/personal.md («Asistencia»)
 *
 * Cada toque manda `personal.cambiar_dia_asistencia` con el valor que queda (✓ → ½ → F → ✓; uno vacío pasa a ✓) y el
 * foco se queda en ese día. Con días sin capturar, «Cerrar semana» no cierra: pone el foco en el primero y lo avisa.
 */

import { plural } from "@uniformame/compartido/calculos/textos";
import {
	type asistenciaDePersonal,
	cambiarDiaAsistencia,
	cerrarSemanaAsistencia,
	type valoresDeDia,
} from "@uniformame/compartido/contratos/personal/asistencia";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { unirClases } from "@uniformame/interfaz/clases";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { LineaDeAviso, TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { Lock } from "lucide-react";
import { useRef } from "react";
import type { z } from "zod";
import { useAvisar } from "../../../comun/avisos-de-abajo.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../envio.ts";

/** La semana de la cuadrícula, como la regresa la consulta. */
export type SemanaDeAsistencia = z.infer<typeof asistenciaDePersonal.resultado>["semana"];

/** Una persona de la cuadrícula. */
type PersonaDeLaSemana = SemanaDeAsistencia["personas"][number];

/** Un valor de un día, o vacío si está sin capturar. */
type Valor = (typeof valoresDeDia)[number] | null;

/** Cómo se ve cada valor: su marca, su nombre y sus colores (del sistema de diseño). */
const comoSeVe: Readonly<
	Record<"completo" | "medio" | "falta" | "vacio", { marca: string; nombre: string; clase: string }>
> = {
	completo: { marca: "✓", nombre: "Día completo", clase: "bg-verde/12 text-texto-bien" },
	medio: { marca: "½", nombre: "Medio día", clase: "bg-ambar/12 text-texto-advertencia" },
	falta: { marca: "F", nombre: "Falta", clase: "bg-rojo/12 text-texto-error" },
	vacio: { marca: "", nombre: "Sin capturar", clase: "bg-panel ring-[1.5px] ring-estado-rojo ring-inset" },
};

/** El valor que sigue al tocar un día: ✓ → ½ → F → ✓; uno vacío pasa a ✓. */
const siguiente: Readonly<Record<"completo" | "medio" | "falta" | "vacio", (typeof valoresDeDia)[number]>> = {
	vacio: "completo",
	completo: "medio",
	medio: "falta",
	falta: "completo",
};

/**
 * La clave de un día en la cuadrícula, para ponerle el foco.
 * @param personaId La persona.
 * @param fecha El día.
 */
export function claveDelDia(personaId: string, fecha: string): string {
	return `${personaId}|${fecha}`;
}

/**
 * Un día de la cuadrícula: un botón con su marca, o gris sin botón.
 * @param props La persona, el día, su encabezado, si la semana está cerrada y qué hacer al tocarlo.
 */
function Dia({
	persona,
	dia,
	encabezado,
	cerrada,
	alTocar,
}: {
	persona: PersonaDeLaSemana;
	dia: PersonaDeLaSemana["dias"][number];
	encabezado: string;
	cerrada: boolean;
	alTocar: () => void;
}) {
	const forma = comoSeVe[dia.valor ?? "vacio"];
	const caja = "inline-grid h-8 w-[38px] place-items-center rounded-mediano font-extrabold text-sm";
	if (!dia.capturable) return <span aria-hidden="true" className={unirClases(caja, "bg-suave")} />;
	return (
		<button
			type="button"
			data-dia={claveDelDia(persona.persona_id, dia.fecha)}
			aria-label={`${persona.nombre} ${encabezado}: ${forma.nombre}`}
			title={forma.nombre}
			disabled={cerrada}
			onClick={alTocar}
			className={unirClases(caja, forma.clase, "disabled:cursor-default disabled:opacity-75")}
		>
			{forma.marca}
		</button>
	);
}

/** La leyenda de la cuadrícula. */
function Leyenda() {
	return (
		<span className="inline-flex flex-wrap gap-3.5 font-medium text-etiqueta text-tinta3">
			{Object.values(comoSeVe).map((forma) => (
				<span key={forma.nombre} className="inline-flex items-center gap-1.5">
					<i
						className={unirClases(
							"inline-grid h-5 w-[22px] place-items-center rounded-chico font-extrabold text-[11px] not-italic",
							forma.clase,
						)}
					>
						{forma.marca}
					</i>
					{forma.nombre}
				</span>
			))}
		</span>
	);
}

/**
 * Pone el foco en un día de la cuadrícula.
 * @param clave La clave del día (`claveDelDia`).
 */
export function enfocarDia(clave: string): void {
	const boton = document.querySelector<HTMLButtonElement>(`[data-dia="${clave}"]`);
	boton?.focus();
}

/**
 * Lo que hace «Cerrar semana»: con días sin capturar, pone el foco en el primero y avisa cuántos faltan; si no, cierra.
 * @returns `cerrar(semana)` y si va en camino.
 */
export function useCerrarSemana() {
	const avisar = useAvisar();
	const { enviar, enviando } = useEnvio(cerrarSemanaAsistencia);
	const cerrar = async (semana: SemanaDeAsistencia) => {
		const primero = semana.primero_sin_capturar;
		if (semana.sin_capturar > 0 && primero !== null) {
			enfocarDia(claveDelDia(primero.persona_id, primero.fecha));
			avisar(
				`${semana.sin_capturar === 1 ? "Falta" : "Faltan"} ${plural(semana.sin_capturar, "día", "días")} por capturar`,
				"no_se_pudo",
			);
			return;
		}
		if (semana.asistencia_semana_id === null || semana.version === null) return;
		await enviar({ datos: { asistencia_semana_id: semana.asistencia_semana_id }, version: semana.version });
	};
	return { cerrar, enviando };
}

/**
 * La cuadrícula de una semana.
 * @param props La semana.
 */
export function Cuadricula({ semana }: { semana: SemanaDeAsistencia }) {
	const conConexion = useConConexion();
	const { enviar, enviando, choco } = useEnvio(cambiarDiaAsistencia);
	const cierre = useCerrarSemana();
	// Un segundo toque al mismo día con la misma versión no sale (llegaría con una versión vieja); en cuanto se lee el día
	// con su versión nueva, el siguiente toque sí sale, aunque las demás consultas sigan volviéndose a leer.
	const enCamino = useRef<string | null>(null);
	const tocar = async (persona: PersonaDeLaSemana, dia: PersonaDeLaSemana["dias"][number]) => {
		const clave = `${persona.persona_id}|${dia.fecha}|${dia.version ?? "nuevo"}`;
		if (enCamino.current === clave || !conConexion) return;
		enCamino.current = clave;
		const valor: Valor = dia.valor;
		await enviar({
			datos: {
				persona_id: persona.persona_id,
				fecha: dia.fecha,
				valor: siguiente[valor ?? "vacio"],
				...(dia.version === null ? {} : { version: dia.version }),
			},
		});
		if (enCamino.current === clave) enCamino.current = null;
	};
	if (semana.personas.length === 0) return <EstadoDePantalla tipo="vacio" texto="Nadie cobra por tiempo esta semana" />;
	return (
		<div className="flex flex-col gap-2.5" aria-busy={enviando}>
			{choco ? <EstadoDePantalla tipo="choque" documento={`La semana del ${semana.texto}`} /> : null}
			<Tabla
				nombre={`Asistencia del ${semana.texto}`}
				filas={semana.personas}
				claveDeFila={(persona) => persona.persona_id}
				columnas={[
					{
						clave: "persona",
						encabezado: "Persona",
						celda: (persona) => <DosRenglones arriba={persona.nombre} abajo={persona.detalle} />,
					},
					...semana.dias.map((encabezado, indice) => ({
						clave: encabezado.fecha,
						encabezado: encabezado.texto,
						celda: (persona: PersonaDeLaSemana) => {
							const dia = persona.dias[indice];
							return dia === undefined ? null : (
								<Dia
									persona={persona}
									dia={dia}
									encabezado={encabezado.texto}
									cerrada={semana.cerrada}
									alTocar={() => void tocar(persona, dia)}
								/>
							);
						},
					})),
					{
						clave: "dias",
						encabezado: "Días",
						alinear: "derecha" as const,
						celda: (persona) => <b className="tabular-nums">{persona.total}</b>,
					},
				]}
			/>
			<div className="flex flex-wrap items-center gap-3">
				<Leyenda />
				<span className="flex-1" />
				{semana.cerrada ? (
					<LineaDeAviso tono="bien">Cerrada · la tiene contaduría</LineaDeAviso>
				) : (
					<>
						{semana.sin_capturar > 0 ? (
							<TextoConTono tono="ambar">
								{plural(semana.sin_capturar, "día sin capturar", "días sin capturar")}
							</TextoConTono>
						) : null}
						<Boton
							variante="principal"
							icono={Lock}
							disabled={!conConexion || cierre.enviando}
							onClick={() => void cierre.cerrar(semana)}
						>
							Cerrar semana
						</Boton>
					</>
				)}
			</div>
		</div>
	);
}
