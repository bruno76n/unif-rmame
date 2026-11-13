/**
 * La ventana que confirma algo con su motivo (cancelar, descontinuar, dar de baja…): lo que pasa arriba, el campo
 * «Motivo» con «Escribe al menos {n} letras.» que cambia a «Listo.», y el botón, que se prende al llegar a esas letras
 * (`general.largo_minimo_motivo`, que trae `admin.armazon`) y con conexión. El error que da la API al motivo sale junto
 * al campo. La usan todos los departamentos.
 * Fase 19 · docs/interfaz/comunes.md («La ventana», regla 3)
 */

import { armazon } from "@uniformame/compartido/contratos/admin/armazon";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { unirClases } from "@uniformame/interfaz/clases";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { type ReactNode, useState } from "react";
import { useConsulta } from "./api.tsx";
import { useConConexion } from "./estado-de-la-app.ts";

/** Lo que recibe la ventana con motivo. */
export interface PropsDeVentanaConMotivo {
	/** Si está abierta (por omisión, sí: quien la pinta decide cuándo). */
	abierta?: boolean;
	alCerrar: () => void;
	titulo: string;
	subtitulo?: string | undefined;
	/** Lo que pasa al confirmar, arriba del motivo. */
	children?: ReactNode;
	/** El texto del botón. */
	textoAccion: string;
	/** Un ejemplo dentro del campo («Por ejemplo: se vendió, ya no tiene arreglo»). */
	ejemplo?: string | undefined;
	/** El botón en rojo (lo normal: el motivo es para quitar algo); `false`, en negro. */
	peligro?: boolean;
	/** Si la acción va en camino. */
	enviando?: boolean;
	/** Manda la acción con el motivo; si regresa un texto (o una promesa de uno), es el error que la API le dio al motivo. */
	alConfirmar: (motivo: string) => unknown;
}

/**
 * Las letras que pide un motivo, de `admin.armazon` (que ya pidió el armazón).
 * @returns El largo mínimo; mientras no llega, 1.
 */
export function useLargoMinimoDelMotivo(): number {
	return useConsulta(armazon, {}).data?.largo_minimo_motivo ?? 1;
}

/**
 * La ventana con motivo.
 * @param props Si está abierta, su título, lo que pasa, el botón y qué hacer al confirmar y al cerrar.
 */
export function VentanaConMotivo({
	abierta = true,
	alCerrar,
	titulo,
	subtitulo,
	children,
	textoAccion,
	ejemplo,
	peligro = true,
	enviando = false,
	alConfirmar,
}: PropsDeVentanaConMotivo) {
	const largoMinimo = useLargoMinimoDelMotivo();
	const conConexion = useConConexion();
	const [motivo, setMotivo] = useState("");
	const [error, setError] = useState<string | undefined>(undefined);
	const listo = motivo.trim().length >= largoMinimo;
	const cerrar = () => {
		setMotivo("");
		setError(undefined);
		alCerrar();
	};
	const confirmar = async () => {
		const respuesta = await alConfirmar(motivo.trim());
		const conError = typeof respuesta === "string" ? respuesta : undefined;
		setError(conError);
		if (conError === undefined) setMotivo("");
	};
	return (
		<Ventana
			abierta={abierta}
			alCerrar={cerrar}
			titulo={titulo}
			{...(subtitulo === undefined ? {} : { subtitulo })}
			accion={
				<Boton
					variante={peligro ? "peligro" : "principal"}
					disabled={!listo || !conConexion || enviando}
					onClick={() => void confirmar()}
				>
					{textoAccion}
				</Boton>
			}
		>
			<div className="flex flex-col gap-3">
				{children}
				<Campo
					etiqueta="Motivo"
					enVentana
					value={motivo}
					{...(ejemplo === undefined ? {} : { placeholder: ejemplo })}
					error={error}
					onChange={(evento) => setMotivo(evento.target.value)}
				/>
				{error === undefined ? (
					<span className={unirClases("text-etiqueta", listo ? "text-texto-bien" : "text-tinta3")}>
						{listo ? "Listo." : `Escribe al menos ${largoMinimo} letras.`}
					</span>
				) : null}
			</div>
		</Ventana>
	);
}
