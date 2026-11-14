/**
 * Atender los trabajos: terminar lo que quedó a medias en el diario, pedir los nuevos y, uno por uno en el orden en que
 * llegaron, anotarlo, bajar su ZPL, preguntarle a la Zebra su estado, mandárselo, anotarlo impreso y confirmarlo. Una
 * Zebra sin etiquetas, con la tapa abierta, en pausa o callada deja el trabajo en `fallo` con su texto.
 * Fase 20 · docs/apps/puente-de-impresion.md («Cómo trabaja» y «El diario»)
 *
 * Sin internet se detiene donde iba: lo que ya está en el diario lo termina en la siguiente vuelta, y confirmar otra vez
 * con la misma clave recibe la misma respuesta. Si se apaga entre imprimir y anotarlo, al arrancar lo vuelve a mandar:
 * una etiqueta repetida se tira; una que falta detiene la mercancía.
 */

import { v7 as uuidv7 } from "uuid";
import type { ApiDelPuente } from "./api.ts";
import type { DireccionDeZebra } from "./configuracion.ts";
import type { Diario, Terminado, TrabajoDelDiario } from "./diario.ts";
import type { Registro } from "./registro.ts";
import { mandarZpl, preguntarEstado, textosDeLaZebra } from "./zebra.ts";

/** Lo que usa el puente para atender sus trabajos. */
export interface PiezasDelPuente {
	api: ApiDelPuente;
	diario: Diario;
	registro: Registro;
	/** La Zebra de su configuración. */
	zebra: () => Promise<DireccionDeZebra>;
	/** Cuánto espera a la Zebra (10 segundos); las pruebas lo bajan. */
	esperaDeLaZebra?: number;
}

/**
 * Imprime un trabajo: baja su ZPL, le pregunta a la Zebra y se lo manda.
 * @param piezas Lo del puente.
 * @param trabajo El trabajo.
 * @returns Cómo terminó, con la clave de su confirmación.
 */
async function imprimir(piezas: PiezasDelPuente, trabajo: TrabajoDelDiario): Promise<Terminado> {
	const zpl = await piezas.api.bajarZpl(trabajo.ruta);
	const zebra = await piezas.zebra();
	const clave = uuidv7();
	const estado = await preguntarEstado(zebra, piezas.esperaDeLaZebra);
	if (!estado.lista) return { resultado: "fallo", error: estado.error, clave };
	try {
		await mandarZpl(zebra, zpl, piezas.esperaDeLaZebra);
		return { resultado: "impreso", clave };
	} catch {
		return { resultado: "fallo", error: textosDeLaZebra.noContesta, clave };
	}
}

/**
 * Confirma un trabajo y lo saca del diario.
 * @param piezas Lo del puente.
 * @param trabajo El trabajo.
 * @param terminado Cómo terminó, con su clave.
 */
async function confirmar(piezas: PiezasDelPuente, trabajo: TrabajoDelDiario, terminado: Terminado): Promise<void> {
	await piezas.api.confirmar(trabajo.id, terminado);
	await piezas.diario.confirmado(trabajo.id);
	await piezas.registro.anotar(
		`Trabajo ${trabajo.id} (${trabajo.tipo}, ${trabajo.ids.length} × ${trabajo.copias}): ${
			terminado.resultado === "impreso" ? "impreso" : `fallo: ${terminado.error ?? ""}`
		}`,
	);
}

/**
 * Termina lo que está en el diario, en el orden en que llegó: imprime lo recibido y confirma lo impreso.
 * @param piezas Lo del puente.
 * @throws Lo que corte la vuelta (sin red, revocado, versión vieja): lo que falte sigue en el diario.
 */
export async function terminarPendientes(piezas: PiezasDelPuente): Promise<void> {
	for (const pendiente of await piezas.diario.pendientes()) {
		const terminado = pendiente.estado === "por_confirmar" ? pendiente : await imprimir(piezas, pendiente.trabajo);
		if (pendiente.estado === "por_imprimir") await piezas.diario.impreso(pendiente.trabajo.id, terminado);
		await confirmar(piezas, pendiente.trabajo, terminado);
	}
}

/**
 * Una vuelta: termina lo del diario, pide los trabajos nuevos, los anota, los imprime y, si ya le toca, cambia su llave.
 * @param piezas Lo del puente.
 * @throws Lo que corte la vuelta: lo recibido queda en el diario para la siguiente.
 */
export async function atenderTrabajos(piezas: PiezasDelPuente): Promise<void> {
	await terminarPendientes(piezas);
	const { trabajos, rotar_llave: rotar } = await piezas.api.trabajos();
	for (const trabajo of trabajos) await piezas.diario.recibido(trabajo);
	await terminarPendientes(piezas);
	if (rotar === true) {
		await piezas.api.rotarLlave();
		await piezas.registro.anotar("Cambió su llave");
	}
}
