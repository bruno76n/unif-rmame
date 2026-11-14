/**
 * El marco de la tablet del taller: toda la pantalla, con el encabezado oscuro (la marca «UA», «Puerta del taller», la
 * red, la hora y, con alguien adentro, su nombre y «Salir») y el cuerpo. Sin internet, el encabezado lleva su línea ámbar.
 * Fase 20 · docs/interfaz/tablet.md («El encabezado») y docs/interfaz/DISENO.md
 *
 * Uso: `<MarcoDeTablet conectada guardadas={0} hora="10:42" persona={{ nombre: "Juana", iniciales: "JP" }}
 * alSalir={...}>…</MarcoDeTablet>`. Lo que dice la red lo arma quien lo usa.
 */

import { LogOut, Wifi, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { unirClases } from "../clases.ts";

/** Lo que recibe el marco. */
export interface PropsDelMarco {
	conectada: boolean;
	/** «Sin internet · 2 capturas guardadas aquí»; con red, «Conectada». */
	textoDeLaRed: string;
	/** «10:42». */
	hora: string;
	/** Quien está adentro, si hay alguien. */
	persona?: { nombre: string; iniciales: string };
	alSalir?: () => void;
	children: ReactNode;
}

/**
 * La tablet, con su encabezado.
 * @param props La red, la hora, quien está adentro y el cuerpo.
 */
export function MarcoDeTablet({ conectada, textoDeLaRed, hora, persona, alSalir, children }: PropsDelMarco) {
	const IconoDeRed = conectada ? Wifi : WifiOff;
	return (
		<div className="flex h-dvh flex-col bg-fondo text-tablet">
			<header
				className={unirClases(
					"flex h-tablet-encabezado flex-none items-center gap-3 bg-tinta px-5 text-white",
					conectada ? "" : "shadow-[inset_0_-4px_0_var(--color-estado-ambar)]",
				)}
			>
				<span className="grid size-8.5 place-items-center rounded-chico bg-marca font-bold text-xs">UA</span>
				<b className="text-[17px]">Puerta del taller</b>
				<span
					role="status"
					className={unirClases(
						"inline-flex h-7.5 items-center gap-2 rounded-chico px-3 font-semibold text-sm",
						conectada ? "bg-white/10 text-aviso-bien" : "bg-estado-ambar font-bold text-tinta",
					)}
				>
					<IconoDeRed aria-hidden="true" size={16} />
					{textoDeLaRed}
				</span>
				<span className="flex-1" />
				<span className="font-bold text-[20px] text-linea tabular-nums">{hora}</span>
				{persona === undefined ? null : (
					<>
						<span className="inline-flex items-center gap-2">
							<span className="grid size-9 place-items-center rounded-full bg-tinta2 font-bold text-sm">
								{persona.iniciales}
							</span>
							<b>{persona.nombre}</b>
						</span>
						<button
							type="button"
							onClick={alSalir}
							className="inline-flex h-11.5 items-center gap-2 rounded-mediano bg-white/12 px-4.5 font-bold"
						>
							<LogOut aria-hidden="true" size={20} />
							Salir
						</button>
					</>
				)}
			</header>
			<main className="min-h-0 flex-1 overflow-auto p-5.5">{children}</main>
		</div>
	);
}
