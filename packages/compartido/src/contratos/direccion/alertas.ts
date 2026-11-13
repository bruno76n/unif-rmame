/**
 * El contrato de `direccion.alertas`: las alertas cruzadas de Dirección, cada una con su detalle.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Alertas cruzadas») y docs/modulos/direccion/alertas-e-indicadores.md
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";

/** Las reglas de las alertas, en el orden de su tabla. */
export const reglasDeAlerta = [
	"lote_detenido",
	"consumo_tela",
	"concentracion",
	"descontinuado",
	"sin_reposicion",
	"sin_sincronizar",
	"cuadre_residuo",
] as const;

/** Una alerta, como la muestra su tarjeta. */
export const alertaDeDireccion = z.object({
	clave: z.string().describe("La regla y su entidad: `lote_detenido:{lote}`"),
	regla: z.enum(reglasDeAlerta),
	titulo: z.string(),
	detalle: z.string().describe("La segunda línea de la tarjeta"),
	cruza: z.array(z.string()).describe("Los nombres de los departamentos que cruza"),
	color: z.enum(["rojo", "ambar"]),
	ver: z
		.string()
		.nullable()
		.describe("La ruta de la web de «Ver» (`produccion/lotes/{id}`); nula si la cuenta no tiene ese departamento"),
});

export const alertas = definirConsulta({
	nombre: "direccion.alertas",
	descripcion:
		"Las alertas cruzadas de este momento, en el orden de su tabla, con la misma función que el trabajo de alertas",
	entrada: z.object({}),
	salida: z.object({ alertas: z.array(alertaDeDireccion) }),
	permiso: { departamento: "direccion" },
});
