/**
 * El contrato de `contaduria.nomina_semana`: la pestaña Nómina, con la cuenta de una semana tal como se paga, su
 * gráfica de 8 semanas, sus grupos por área y por tienda, y las personas para el descuento semanal. Pide Contaduría
 * con «ven sueldos y tarifas»; sin ese permiso, la pantalla muestra el candado. Queda en la bitácora como consulta
 * sensible.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Nómina») y docs/modulos/contaduria/nomina.md («La cuenta de la
 * nómina»)
 *
 * Lo que se ve es lo que se paga: los montos salen de la misma cuenta que usa `contaduria.pagar_nomina`, y el total se
 * manda tal cual como `total_visto_centavos`.
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { monto } from "./vistas.ts";

export const nominaSemana = definirConsulta({
	nombre: "contaduria.nomina_semana",
	descripcion:
		"La nómina de una semana: su estado, su total y su cuenta por persona, agrupada por área y por tienda, con la gráfica de las últimas semanas; congelada si ya se pagó",
	entrada: z.object({
		asistencia_semana_id: z
			.uuid()
			.optional()
			.describe("La semana; sin ella, la nómina por pagar más vieja o, si no hay, la semana que corre"),
		semanas: z.coerce.number().int().min(1).max(26).optional().describe("Cuántas semanas en la gráfica; sin él, 8"),
	}),
	salida: z.object({
		semana: z
			.object({
				asistencia_semana_id: z.uuid(),
				texto: z.string().describe("«del 2 al 7 de noviembre»"),
				anterior_id: z.uuid().nullable(),
				siguiente_id: z.uuid().nullable(),
			})
			.nullable()
			.describe("Nula si todavía no hay ninguna semana de asistencia"),
		nomina: z
			.object({
				nomina_id: z.uuid(),
				version: z.number().int(),
				estado: z.enum(["por_pagar", "pagada"]),
				fecha_pago: z.string().describe("«10 de noviembre»"),
				pagada: z.string().nullable().describe("«Pagada el 10 de noviembre»"),
			})
			.nullable()
			.describe("Nula mientras la asistencia sigue sin cerrar"),
		total_nomina_centavos: monto.describe("El total que se paga"),
		grafica: z.array(
			z.object({
				semana: z.string().describe("«2 nov»"),
				actual: z.boolean(),
				total_tiempo_nomina_centavos: monto,
				total_piezas_nomina_centavos: monto,
			}),
		),
		opciones: z.string().describe("«Piezas dañadas: no se pagan · Descuento mayor que lo ganado: se perdona»"),
		grupos: z.array(
			z.object({
				clave: z.string(),
				titulo: z.string().describe("«Taller», «Oficina», «Aduana y bodega», «Tienda 1»"),
				personas: z.number().int(),
				total_nomina_centavos: monto,
				renglones: z.array(
					z.object({
						persona_id: z.uuid(),
						nombre: z.string(),
						puesto: z.string(),
						forma: z.string().describe("«Por tiempo», «Por pieza» o «Mixta»"),
						dias: z.number().describe("Los días, en medios"),
						piezas: z.number().int(),
						total_tiempo_nomina_centavos: monto,
						total_piezas_nomina_centavos: monto,
						total_correcciones_nomina_centavos: monto.describe("Negativo o cero"),
						descuento_semanal_centavos: monto.describe("El descuento de la semana"),
						descuento_motivo: z.string().nullable(),
						arrastre_nomina_centavos: monto.describe("Lo que pasó de la semana anterior"),
						total_descontado_nomina_centavos: monto,
						total_nomina_centavos: monto,
						no_alcanzo_nomina_centavos: monto.describe("Lo que no alcanzó a descontarse"),
						destino_no_alcanzo: z.enum(["perdonado", "siguiente_semana"]).nullable(),
						cobra_por_tiempo: z.boolean().describe("Tiene piezas que no se pagan aparte"),
						medio_pago: z.enum(["efectivo", "transferencia"]).nullable(),
						referencia_pago: z.string().nullable(),
					}),
				),
			}),
		),
		personas: z
			.array(
				z.object({
					persona_id: z.uuid(),
					nombre: z.string(),
					area: z.string(),
					descuento_semanal_centavos: monto.describe("El de hoy, si tiene"),
					descuento_motivo: z.string().nullable(),
					version: z.number().int().nullable().describe("La del descuento vigente"),
				}),
			)
			.describe("Las activas, para la ventana «Descuento semanal»"),
	}),
	permiso: { departamento: "contaduria", permisoFino: "ven_sueldos_y_tarifas" },
});
