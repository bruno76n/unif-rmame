/**
 * Un botón que escoge un archivo y lo entrega en el momento («Subir foto», «Cambiar foto»): el botón de siempre, que
 * abre el selector de archivos del sistema. Para un archivo que va dentro de un formulario se usa `CampoDeArchivo`.
 * Fase 19 · docs/interfaz/DISENO.md («Botón») y docs/modulos/admin/archivos.md (regla 1)
 */

import { useRef } from "react";
import { Boton, type PropsDeBoton } from "./boton.tsx";

/** Lo que recibe el botón de un archivo. */
export interface PropsDeBotonDeArchivo extends Omit<PropsDeBoton, "onClick" | "type"> {
	/** Los tipos que acepta, como el `accept` de HTML («image/jpeg,image/png,image/webp»). */
	acepta: string;
	alEscoger: (archivo: File) => void;
}

/**
 * Un botón que escoge un archivo.
 * @param props Los tipos que acepta, qué hacer con el escogido y lo de un botón.
 */
export function BotonDeArchivo({ acepta, alEscoger, children, ...resto }: PropsDeBotonDeArchivo) {
	const entrada = useRef<HTMLInputElement>(null);
	return (
		<>
			<Boton type="button" {...resto} onClick={() => entrada.current?.click()}>
				{children}
			</Boton>
			<input
				ref={entrada}
				type="file"
				accept={acepta}
				hidden
				aria-hidden="true"
				tabIndex={-1}
				onChange={(evento) => {
					const archivo = evento.target.files?.[0];
					// Se vacía para que escoger el mismo archivo otra vez también avise.
					evento.target.value = "";
					if (archivo !== undefined) alEscoger(archivo);
				}}
			/>
		</>
	);
}
