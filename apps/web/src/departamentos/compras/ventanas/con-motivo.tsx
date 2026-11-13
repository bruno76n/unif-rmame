/**
 * Las ventanas de Compras que piden un motivo: «Cancelar {OC}», «Descartar {OC}», «Cerrar {OC} con faltante», «Dar de
 * baja» un material o un proveedor y «Ya no lo surte». Lo que se dice arriba, el motivo («Escribe al menos {n}
 * letras.», que cambia a «Listo.») y el botón, que se prende al llegar a las letras de `general.largo_minimo_motivo`.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Ventanas») y docs/interfaz/comunes.md («La ventana», regla 3)
 */

import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { type ReactNode, useState } from "react";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";

/** Lo que recibe una ventana con motivo. */
interface PropsDeVentanaConMotivo {
	abierta: boolean;
	alCerrar: () => void;
	titulo: string;
	/** Lo que se dice arriba del motivo. */
	subtitulo?: string;
	/** Lo de más, abajo del motivo (lo que pasa al confirmar). */
	children?: ReactNode;
	/** El texto del botón. */
	boton: string;
	/** `general.largo_minimo_motivo`. */
	largoMinimo: number;
	/** Si la acción va en camino. */
	enviando: boolean;
	alConfirmar: (motivo: string) => void;
}

/**
 * Una ventana con motivo.
 * @param props Si está abierta, su título y lo que dice, el botón, cuántas letras pide y qué hacer al confirmar.
 */
export function VentanaConMotivo({
	abierta,
	alCerrar,
	titulo,
	subtitulo,
	children,
	boton,
	largoMinimo,
	enviando,
	alConfirmar,
}: PropsDeVentanaConMotivo) {
	const conConexion = useConConexion();
	const [motivo, setMotivo] = useState("");
	const listo = motivo.trim().length >= largoMinimo;
	const cerrar = () => {
		setMotivo("");
		alCerrar();
	};
	return (
		<Ventana
			abierta={abierta}
			alCerrar={cerrar}
			titulo={titulo}
			{...(subtitulo === undefined ? {} : { subtitulo })}
			accion={
				<Boton
					variante="peligro"
					disabled={!listo || !conConexion || enviando}
					onClick={() => alConfirmar(motivo.trim())}
				>
					{boton}
				</Boton>
			}
		>
			<div className="flex flex-col gap-2">
				<Campo etiqueta="Motivo" enVentana value={motivo} onChange={(evento) => setMotivo(evento.target.value)} />
				<span className={`text-etiqueta ${listo ? "text-texto-bien" : "text-tinta3"}`}>
					{listo ? "Listo." : `Escribe al menos ${largoMinimo} letras.`}
				</span>
				{children}
			</div>
		</Ventana>
	);
}
