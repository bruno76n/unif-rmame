/**
 * Leer los avisos en vivo (`GET /v1/eventos`) de un aparato: los eventos del servidor que llegan en pedazos, con su
 * nombre y sus datos en JSON. Los aparatos no usan `EventSource` porque no manda el encabezado de su llave.
 * Fase 20 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («Avisos en vivo») · lo usan el puente y la tablet
 */

/** Un evento en vivo: su nombre y sus datos. */
export interface EventoEnVivo {
	nombre: string;
	datos: unknown;
}

/**
 * Lee los eventos completos de un texto que va llegando y regresa lo que sobra para el siguiente pedazo. Los
 * comentarios (el latido) y `retry` no son eventos.
 * @param texto Lo que ha llegado y no se ha leído.
 */
export function leerEventos(texto: string): { eventos: EventoEnVivo[]; resto: string } {
	const bloques = texto.replace(/\r\n/g, "\n").split("\n\n");
	const resto = bloques.pop() ?? "";
	const eventos = bloques.flatMap((bloque) => {
		let nombre = "message";
		const datos: string[] = [];
		for (const renglon of bloque.split("\n")) {
			if (renglon.startsWith("event:")) nombre = renglon.slice(6).trim();
			else if (renglon.startsWith("data:")) datos.push(renglon.slice(5).trimStart());
		}
		if (datos.length === 0) return [];
		try {
			return [{ nombre, datos: JSON.parse(datos.join("\n")) }];
		} catch {
			return [];
		}
	});
	return { eventos, resto };
}

/**
 * Escucha una conexión de avisos en vivo hasta que se cierre, y le pasa cada evento a quien escucha.
 * @param cuerpo El cuerpo de la respuesta.
 * @param alEvento Lo que se hace con cada evento, uno tras otro.
 */
export async function escucharEventos(
	cuerpo: ReadableStream<Uint8Array<ArrayBuffer>>,
	alEvento: (evento: EventoEnVivo) => Promise<void>,
): Promise<void> {
	const lector = cuerpo.pipeThrough(new TextDecoderStream()).getReader();
	let resto = "";
	for (;;) {
		const { value, done } = await lector.read();
		if (done) return;
		const leidos = leerEventos(resto + value);
		resto = leidos.resto;
		for (const evento of leidos.eventos) await alEvento(evento);
	}
}
