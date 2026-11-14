/**
 * El diario: un archivo local con un renglón por paso de cada trabajo (recibido, impreso y confirmado) y su hora, para
 * que ningún trabajo se pierda aunque el puente se apague a la mitad. Al arrancar, lo recibido sin imprimir se imprime
 * y lo impreso sin confirmar se confirma. Confirmado, el trabajo sale del diario.
 * Fase 20 · docs/apps/puente-de-impresion.md (regla 5 y «El diario»)
 *
 * No guarda el ZPL: guarda la ruta de su etiqueta y, si hace falta, lo vuelve a bajar. Cada renglón se escribe hasta el
 * disco antes de seguir; un renglón cortado por un apagón se ignora.
 */

import { open, readFile, rename, writeFile } from "node:fs/promises";
import { z } from "zod";

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

	/** Agrega un renglón y espera a que llegue al disco. */
	async function escribir(renglon: Paso): Promise<void> {
		const descriptor = await open(archivo, "a");
		try {
			await descriptor.write(`${JSON.stringify(renglon)}\n`);
			await descriptor.datasync();
		} finally {
			await descriptor.close();
		}
	}

	/** Lo de cada trabajo que sigue en el diario, en el orden en que llegó. */
	async function porTrabajo(): Promise<Map<string, { trabajo: TrabajoDelDiario; terminado?: Terminado }>> {
		const trabajos = new Map<string, { trabajo: TrabajoDelDiario; terminado?: Terminado }>();
		for (const renglon of await leer()) {
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
			if ((await porTrabajo()).has(trabajo.id)) return;
			await escribir({ paso: "recibido", en: ahora().toISOString(), trabajo: trabajoDelDiario.parse(trabajo) });
		},
		impreso: (trabajoId, terminado) =>
			escribir({ paso: "impreso", en: ahora().toISOString(), trabajo_id: trabajoId, ...terminado }),
		confirmado: async (trabajoId) => {
			await escribir({ paso: "confirmado", en: ahora().toISOString(), trabajo_id: trabajoId });
			// Confirmado, sale del diario: se reescribe con lo que sigue pendiente, de un jalón.
			const quedan = (await leer()).filter((renglon) =>
				renglon.paso === "recibido" ? renglon.trabajo.id !== trabajoId : renglon.trabajo_id !== trabajoId,
			);
			const temporal = `${archivo}.nuevo`;
			await writeFile(temporal, quedan.map((renglon) => `${JSON.stringify(renglon)}\n`).join(""));
			await rename(temporal, archivo);
		},
		pendientes: async () =>
			[...(await porTrabajo()).values()].map(({ trabajo, terminado }) =>
				terminado === undefined
					? { trabajo, estado: "por_imprimir" as const }
					: { trabajo, estado: "por_confirmar" as const, ...terminado },
			),
	};
}
