/**
 * La Zebra de mentira: un servidor TCP local que guarda lo que recibe y contesta `~HS` con papel, sin papel, con la tapa
 * abierta o en pausa; callada, no contesta nada. Lo recibido es el ZPL de cada conexión, byte por byte, en UTF-8.
 * Fase 20 · docs/apps/puente-de-impresion.md («Cómo se prueba») y docs/fases/20-tablet-puente-de-impresion-e-impresos.md
 * («El puente se prueba con una Zebra de mentira»)
 */

import { createServer, type Socket } from "node:net";

/** Cómo está la Zebra de mentira. */
export type EstadoDeLaZebraDeMentira = "con_papel" | "sin_papel" | "tapa_abierta" | "en_pausa" | "callada";

/** La Zebra de mentira, ya escuchando. */
export interface ZebraDeMentira {
	/** Su dirección y su puerto, como los guarda el puente. */
	direccion: { direccion: string; puerto: number };
	/** El ZPL de cada conexión que mandó algo distinto de `~HS`, en el orden en que llegó. */
	recibido: string[];
	/** Cambia cómo está. */
	ponerEn: (estado: EstadoDeLaZebraDeMentira) => void;
	cerrar: () => Promise<void>;
}

/**
 * La respuesta de `~HS` de cada estado: tres textos entre STX y ETX, como los da una ZD421.
 * @param estado Cómo está.
 */
function respuestaDeEstado(estado: EstadoDeLaZebraDeMentira): string {
	const sinPapel = estado === "sin_papel" ? "1" : "0";
	const pausa = estado === "en_pausa" ? "1" : "0";
	const tapa = estado === "tapa_abierta" ? "1" : "0";
	const [stx, etx] = [String.fromCharCode(2), String.fromCharCode(3)];
	return [
		`${stx}030,${sinPapel},${pausa},1245,000,0,0,0,000,0,0,0${etx}\r\n`,
		`${stx}000,0,${tapa},0,0,2,4,0,00000000,1,000${etx}\r\n`,
		`${stx}1234,0${etx}\r\n`,
	].join("");
}

/** Levanta la Zebra de mentira en un puerto libre, con papel. */
export async function levantarZebraDeMentira(): Promise<ZebraDeMentira> {
	let estado: EstadoDeLaZebraDeMentira = "con_papel";
	const recibido: string[] = [];
	const abiertas = new Set<Socket>();
	const servidor = createServer((conexion) => {
		abiertas.add(conexion);
		const pedazos: Buffer[] = [];
		conexion.on("data", (pedazo: Buffer) => {
			pedazos.push(pedazo);
			if (Buffer.concat(pedazos).toString("latin1") === "~HS" && estado !== "callada")
				conexion.write(respuestaDeEstado(estado));
		});
		conexion.on("end", () => {
			const zpl = Buffer.concat(pedazos).toString("utf8");
			if (zpl !== "" && zpl !== "~HS") recibido.push(zpl);
			conexion.end();
		});
		conexion.on("close", () => abiertas.delete(conexion));
		conexion.on("error", () => undefined);
	});
	await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
	const direccion = servidor.address();
	if (direccion === null || typeof direccion === "string") throw new Error("la Zebra de mentira no escucha");
	return {
		direccion: { direccion: "127.0.0.1", puerto: direccion.port },
		recibido,
		ponerEn: (nuevo) => {
			estado = nuevo;
		},
		cerrar: async () => {
			for (const conexion of abiertas) conexion.destroy();
			await new Promise((listo) => servidor.close(listo));
		},
	};
}
