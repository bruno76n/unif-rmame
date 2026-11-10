/**
 * Lo que `admin` manda en vivo al llegar sus eventos, además de `cambios`.
 * Fase 4 · docs/modulos/admin/impresion.md (reglas 3 y 5) y docs/cimientos/EVENTOS-Y-TRABAJOS.md
 *
 * `impresion.pedida` le avisa al puente de la impresora (`impresion`), que pide sus trabajos;
 * `impresion.terminada` le avisa a la sesión que pidió imprimir (`impresion_terminada`).
 */

import { z } from "zod";
import type { EnVivo } from "../../nucleo/modulos.ts";

/** Los datos de `impresion.pedida`. */
const pedida = z.object({ trabajo_id: z.uuid(), dispositivo_id: z.uuid() });

/** Los datos de `impresion.terminada`. */
const terminada = z.object({
	trabajo_id: z.uuid(),
	sesion_id: z.uuid().nullable(),
	resultado: z.enum(["impreso", "fallo"]),
	texto: z.string(),
});

/** Por tipo de evento, lo que manda en vivo `admin`. */
export const enVivoDeAdmin: Record<string, EnVivo> = {
	"impresion.pedida": (evento) => {
		const datos = pedida.parse(evento.datos);
		return [
			{ para: { dispositivoId: datos.dispositivo_id }, nombre: "impresion", datos: { trabajo_id: datos.trabajo_id } },
		];
	},
	"impresion.terminada": (evento) => {
		const datos = terminada.parse(evento.datos);
		if (datos.sesion_id === null) return [];
		const { sesion_id, ...aviso } = datos;
		return [{ para: { sesionId: sesion_id }, nombre: "impresion_terminada", datos: aviso }];
	},
};
