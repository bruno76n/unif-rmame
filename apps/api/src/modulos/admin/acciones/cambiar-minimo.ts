/**
 * `admin.cambiar_minimo`: la dueña cambia un mínimo de existencia en Configuración · Decisiones de operación. Los
 * mínimos son de Inventario: esta acción solo llama `inventario.guardar_minimo` y deja la bitácora.
 * Fase 14 · docs/modulos/admin/configuracion.md («`admin.cambiar_minimo`»)
 */

import { cambiarMinimo } from "@uniformame/compartido/contratos/admin/configuracion";
import { z } from "zod";
import { versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { minimos } from "../../inventario/tablas.ts";

/** Lo que regresa `inventario.guardar_minimo`. */
const minimoGuardado = z.object({
	minimo_id: z.uuid(),
	piezas: z.number().int(),
	ubicacion: z.string(),
	antes: z.number().int(),
	cambio: z.boolean(),
});

/** Cómo se nombra cada nivel en la bitácora y el mensaje. */
const nombreDelNivel = { mayor_venta: "tallas de mayor venta", demas: "demás tallas" } as const;

export const accionCambiarMinimo = implementarAccion(cambiarMinimo, async (contexto, datos, version) => {
	const guardado = minimoGuardado.parse(
		await contexto.interna("inventario.guardar_minimo", { ...datos, ...(version === undefined ? {} : { version }) }),
	);
	const texto = `Mínimo en ${guardado.ubicacion} (${nombreDelNivel[datos.nivel]}): ${guardado.piezas}`;
	const nueva = await versionActual(contexto.transaccion, minimos, guardado.minimo_id);
	const resultado = { mensaje: texto, minimo_id: guardado.minimo_id, piezas: guardado.piezas, version: nueva };
	const entidad = { nombre: "minimos", id: guardado.minimo_id };
	// Con la misma cantidad no se escribe nada: tampoco su bitácora.
	if (!guardado.cambio) return { resultado, entidad, sinBitacora: true };
	contexto.bitacora({
		descripcion: texto,
		entidad: "minimos",
		entidadId: guardado.minimo_id,
		antes: { piezas: guardado.antes },
		despues: { piezas: guardado.piezas },
		departamento: "admin",
	});
	return { resultado, entidad };
});
