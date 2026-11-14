/**
 * El diario: un archivo local con un renglón por paso de cada trabajo (recibido, impreso y confirmado) y su hora, para
 * que ningún trabajo se pierda aunque el puente se apague a la mitad. Al arrancar, lo recibido sin imprimir se imprime
 * y lo impreso sin confirmar se confirma. Confirmado, el trabajo sale del diario.
 * Fase 20 · docs/apps/puente-de-impresion.md (regla 5 y «El diario»)
 *
 * No guarda el ZPL: guarda la ruta de su etiqueta y, si hace falta, lo vuelve a bajar. Cada renglón se escribe hasta el
 * disco antes de seguir, y al reescribirlo también; un renglón cortado por un apagón se ignora. Guarda además la clave del
 * pedido de trabajos hasta que llega su respuesta, para que un pedido perdido no deje trabajos entregados sin imprimir.
 */

import { open, readFile } from "node:fs/promises";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { escribirDeUnJalon } from "./archivos.ts";

/** Un trabajo como lo recibe el puente. */
const trabajoDelDiario = z.object({
	id: z.uuid(),
	tipo: z.string(),
	ids: z.array(z.uuid()),
	copias: z.number().int(),
	ruta: z.string(),
});

/** Un trabajo como lo recibe el puente: lo que hace falta para volver a bajar su ZPL. */
export type TrabajoDelDiario = z.infer<typeof trabajoDelDiario>;

/** Un renglón del diario. */
const paso = z.discriminatedUnion("paso", [
	z.object({ paso: z.literal("recibido"), en: z.string(), trabajo: trabajoDelDiario }),
	z.object({
		paso: z.literal("impreso"),
		en: z.string(),
		trabajo_id: z.uuid(),
		resultado: z.enum(["impreso", "fallo"]),
		error: z.string().optional(),
		clave: z.uuid(),
	}),
	z.object({ paso: z.literal("confirmado"), en: z.string(), trabajo_id: z.uuid() }),
	z.object({ paso: z.literal("pidiendo"), en: z.string(), clave: z.uuid() }),
	z.object({ paso: z.literal("pedido"), en: z.string(), clave: z.uuid() }),
]);

/** Un renglón del diario. */
type Paso = z.infer<typeof paso>;

/** Cómo terminó un trabajo en la Zebra: lo que se confirma, con la clave de esa confirmación. */
export interface Terminado {
	resultado: "impreso" | "fallo";
	error?: string;
	clave: string;
}

/** Lo que quedó a medias: por imprimir, o impreso y por confirmar. */
export type Pendiente =
	| { trabajo: TrabajoDelDiario; estado: "por_imprimir" }
	| ({ trabajo: TrabajoDelDiario; estado: "por_confirmar" } & Terminado);

/** El diario del puente. */
export interface Diario {
	/** Anota un trabajo recibido; si ya estaba, no hace nada. */
	recibido: (trabajo: TrabajoDelDiario) => Promise<void>;
	/** Anota cómo terminó en la Zebra, con la clave con que se confirmará. */
	impreso: (trabajoId: string, terminado: Terminado) => Promise<void>;
	/** El trabajo ya se confirmó: sale del diario. */
	confirmado: (trabajoId: string) => Promise<void>;
	/** Lo que quedó a medias, en el orden en que llegó. */
	pendientes: () => Promise<Pendiente[]>;
	/**
	 * La clave del pedido de trabajos: la del que no tuvo respuesta, o una nueva que se anota antes de pedir. Con la misma
	 * clave la API contesta lo mismo, así que los trabajos que entregó y nunca llegaron vuelven a llegar.
	 */
	claveDelPedido: () => Promise<string>;
	/** El pedido tuvo respuesta y sus trabajos ya están en el diario: la siguiente vez, clave nueva. */
	pedidoRecibido: (clave: string) => Promise<void>;
}

/**
 * La clave del pedido de trabajos que no tuvo respuesta, si hay.
 * @param renglones Los renglones del diario, en orden.
 */
function pedidoAbierto(renglones: readonly Paso[]): string | undefined {
	let abierta: string | undefined;
	for (const renglon of renglones) {
		if (renglon.paso === "pidiendo") abierta = renglon.clave;
		else if (renglon.paso === "pedido" && renglon.clave === abierta) abierta = undefined;
	}
	return abierta;
}

/**
 * El diario sin lo que ya no hace falta: los trabajos confirmados y los pedidos con respuesta. Mientras haya un pedido
 * sin respuesta se recuerdan los trabajos confirmados, porque repetir su clave los vuelve a traer y no se deben imprimir
 * otra vez.
 * @param renglones Los renglones del diario, en orden.
 */
function compactado(renglones: readonly Paso[]): Paso[] {
	const abierta = pedidoAbierto(renglones);
	const confirmados = new Set(
		renglones.flatMap((renglon) => (renglon.paso === "confirmado" ? [renglon.trabajo_id] : [])),
	);
	return renglones.filter((renglon) => {
		if (renglon.paso === "pidiendo") return renglon.clave === abierta;
		if (renglon.paso === "pedido") return false;
		if (renglon.paso === "confirmado") return abierta !== undefined;
		if (renglon.paso === "recibido") return !confirmados.has(renglon.trabajo.id);
		return !confirmados.has(renglon.trabajo_id);
	});
}

/**
 * Abre el diario.
 * @param archivo Su archivo.
 * @param ahora La hora de cada paso.
 */
export function crearDiario(archivo: string, ahora: () => Date = () => new Date()): Diario {
	/** Los renglones que se pueden leer, en orden; uno cortado por un apagón se ignora. */
	async function leer(): Promise<Paso[]> {
		const texto = await readFile(archivo, "utf8").catch(() => "");
		return texto.split("\n").flatMap((renglon) => {
			if (renglon === "") return [];
			try {
				const leido = paso.safeParse(JSON.parse(renglon));
				return leido.success ? [leido.data] : [];
			} catch {
				return [];
			}
		});
	}

	/**
	 * Agrega un renglón y espera a que llegue al disco. Si un apagón dejó el último renglón cortado, empieza en uno nuevo:
	 * así el cortado se ignora solo y este se lee.
	 */
	async function escribir(renglon: Paso): Promise<void> {
		const descriptor = await open(archivo, "a+");
		try {
			const { size } = await descriptor.stat();
			const ultimo = Buffer.alloc(1);
			if (size > 0) await descriptor.read(ultimo, 0, 1, size - 1);
			const salto = size > 0 && ultimo.toString() !== "\n" ? "\n" : "";
			await descriptor.write(`${salto}${JSON.stringify(renglon)}\n`);
			await descriptor.datasync();
		} finally {
			await descriptor.close();
		}
	}

	/** Reescribe el diario sin lo que ya no hace falta, de un jalón y hasta el disco. */
	async function compactar(): Promise<void> {
		const quedan = compactado(await leer());
		await escribirDeUnJalon(archivo, quedan.map((renglon) => `${JSON.stringify(renglon)}\n`).join(""));
	}

	/** Lo de cada trabajo que sigue en el diario, en el orden en que llegó. */
	async function porTrabajo(): Promise<Map<string, { trabajo: TrabajoDelDiario; terminado?: Terminado }>> {
		const trabajos = new Map<string, { trabajo: TrabajoDelDiario; terminado?: Terminado }>();
		for (const renglon of await leer()) {
			if (renglon.paso === "pidiendo" || renglon.paso === "pedido") continue;
			if (renglon.paso === "recibido") trabajos.set(renglon.trabajo.id, { trabajo: renglon.trabajo });
			else if (renglon.paso === "confirmado") trabajos.delete(renglon.trabajo_id);
			else {
				const suyo = trabajos.get(renglon.trabajo_id);
				const terminado: Terminado = {
					resultado: renglon.resultado,
					clave: renglon.clave,
					...(renglon.error === undefined ? {} : { error: renglon.error }),
				};
				if (suyo !== undefined) trabajos.set(renglon.trabajo_id, { trabajo: suyo.trabajo, terminado });
			}
		}
		return trabajos;
	}

	return {
		recibido: async (trabajo) => {
			// Uno que ya está, o que ya se confirmó (la respuesta repetida de un pedido sin anotar), no se anota otra vez.
			const yaConfirmado = (await leer()).some(
				(renglon) => renglon.paso === "confirmado" && renglon.trabajo_id === trabajo.id,
			);
			if (yaConfirmado || (await porTrabajo()).has(trabajo.id)) return;
			await escribir({ paso: "recibido", en: ahora().toISOString(), trabajo: trabajoDelDiario.parse(trabajo) });
		},
		impreso: (trabajoId, terminado) =>
			escribir({ paso: "impreso", en: ahora().toISOString(), trabajo_id: trabajoId, ...terminado }),
		confirmado: async (trabajoId) => {
			await escribir({ paso: "confirmado", en: ahora().toISOString(), trabajo_id: trabajoId });
			// Confirmado, sale del diario.
			await compactar();
		},
		claveDelPedido: async () => {
			const abierta = pedidoAbierto(await leer());
			if (abierta !== undefined) return abierta;
			const clave = uuidv7();
			await escribir({ paso: "pidiendo", en: ahora().toISOString(), clave });
			return clave;
		},
		pedidoRecibido: async (clave) => {
			await escribir({ paso: "pedido", en: ahora().toISOString(), clave });
			// Con respuesta, el pedido ya no hace falta: así una vuelta sin trabajos no hace crecer el diario.
			await compactar();
		},
		pendientes: async () =>
			[...(await porTrabajo()).values()].map(({ trabajo, terminado }) =>
				terminado === undefined
					? { trabajo, estado: "por_imprimir" as const }
					: { trabajo, estado: "por_confirmar" as const, ...terminado },
			),
	};
}
