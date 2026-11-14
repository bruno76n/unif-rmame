/**
 * Escanear bulto: la vista de la cámara, que lee el Code 128 de la etiqueta, y la casilla «Código del bulto» para
 * escribirlo o para un lector de mano que escribe y manda Enter. Sin permiso de la cámara, la casilla sigue sirviendo.
 * Fase 20 · docs/interfaz/tablet.md («Escanear bulto») y docs/apps/tablet.md («El lector de etiquetas»)
 */

import { BotonVolver } from "@uniformame/interfaz/tablet/botones";
import { CampoDeTablet } from "@uniformame/interfaz/tablet/captura";
import { ScanLine } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { crearLector } from "../lector/lector.ts";

/** Cada cuánto mira la cámara. */
const cadaCuantoLee = 300;

/**
 * Escanear bulto.
 * @param props Qué hacer con un código (regresa el error, si lo hubo) y con «Volver».
 */
export function Escanear({
	alLeer,
	alVolver,
}: {
	alLeer: (codigo: string) => Promise<string | null>;
	alVolver: () => void;
}) {
	const video = useRef<HTMLVideoElement>(null);
	const [codigo, setCodigo] = useState("");
	const [error, setError] = useState<string>();
	const [sinCamara, setSinCamara] = useState(false);
	const leyendo = useRef(false);

	/** Busca lo leído o escrito; si no es un bulto que pueda abrir, dice por qué. */
	const buscar = async (leido: string) => {
		if (leyendo.current || leido.trim() === "") return;
		leyendo.current = true;
		const fallo = await alLeer(leido);
		leyendo.current = false;
		setError(fallo ?? undefined);
	};

	const buscarLeido = useRef(buscar);
	buscarLeido.current = buscar;

	// La cámara de atrás, una vez por pantalla: lee la etiqueta, vibra y busca el bulto.
	useEffect(() => {
		let flujo: MediaStream | undefined;
		let reloj: ReturnType<typeof setInterval> | undefined;
		const abrir = async () => {
			try {
				flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
				if (video.current === null) return;
				video.current.srcObject = flujo;
				await video.current.play();
				const lector = crearLector();
				reloj = setInterval(() => {
					if (video.current === null || leyendo.current) return;
					void lector.detect(video.current).then((leidos) => {
						const [primero] = leidos;
						if (primero === undefined) return;
						navigator.vibrate?.(80);
						void buscarLeido.current(primero.rawValue);
					});
				}, cadaCuantoLee);
			} catch {
				setSinCamara(true);
			}
		};
		void abrir();
		return () => {
			clearInterval(reloj);
			for (const pista of flujo?.getTracks() ?? []) pista.stop();
		};
	}, []);

	const alEnviar = (evento: FormEvent) => {
		evento.preventDefault();
		void buscar(codigo);
	};
	return (
		<section className="mx-auto flex max-w-225 flex-col gap-4.5">
			<BotonVolver onClick={alVolver}>Volver</BotonVolver>
			<div className="flex flex-col items-center gap-3.5 rounded-[18px] bg-panel px-5 py-10 shadow-panel">
				{sinCamara ? (
					<>
						<ScanLine aria-hidden="true" size={72} className="text-tinta3" />
						<p className="m-0 font-semibold text-tinta3">Sin cámara: escribe el código o usa el lector</p>
					</>
				) : (
					<video ref={video} muted playsInline className="aspect-video w-full max-w-115 rounded-grande bg-tinta" />
				)}
				<form className="flex w-full justify-center" onSubmit={alEnviar}>
					<CampoDeTablet
						etiqueta="Código del bulto"
						error={error}
						value={codigo}
						autoFocus
						autoComplete="off"
						autoCapitalize="characters"
						onChange={(evento) => setCodigo(evento.target.value)}
					/>
				</form>
			</div>
		</section>
	);
}
