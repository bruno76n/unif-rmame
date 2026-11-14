/**
 * Los contratos de las consultas de Gastos y del Contador externo: `contaduria.gastos`, `contaduria.contador_externo`
 * y `contaduria.paquete_mes` (la ventana «Paquete de {mes}»). Solo las pide Contaduría.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Gastos», «Contador externo», «Ventanas»)
 *
 * La nómina del paquete viaja en `total_nomina_centavos`, un campo de sueldo: sin «ven sueldos y tarifas» no viaja y la
 * pantalla pinta «••••».
 */

import { z } from "zod";
import { definirConsulta } from "../definir.ts";
import { cuentasFabrica, cursor, estadoArmado, monto, opcion, pagina } from "./vistas.ts";

export const gastosDeContaduria = definirConsulta({
	nombre: "contaduria.gastos",
	descripcion:
		"Gastos de un mes: por categoría contra el mes anterior completo, el registro de gastos (el más reciente arriba) y lo que necesita la ventana «Registrar gasto»",
	entrada: z.object({
		mes: z.iso
			.date()
			.refine((fecha) => fecha.endsWith("-01"), "El primer día del mes")
			.optional()
			.describe("El primer día del mes; sin él, el mes que corre"),
		cursor,
	}),
	salida: z.object({
		mes: z.iso.date(),
		mes_texto: z.string().describe("«noviembre»"),
		mes_anterior_texto: z.string().describe("«octubre»"),
		al_dia: z.number().int().nullable().describe("El día al que va el mes que corre; nulo en un mes pasado"),
		hoy: z.iso.date().describe("El día de negocio, en hora de México: la fecha con que abre «Registrar gasto»"),
		por_categoria: z.array(
			z.object({
				categoria: z.string(),
				este_mes_centavos: monto,
				mes_anterior_centavos: monto,
			}),
		),
		renglones: z.array(
			z.object({
				gasto_id: z.uuid(),
				version: z.number().int(),
				folio: z.string().describe("El G-, o el SM- de su servicio"),
				fecha: z.string().describe("«9 nov»"),
				categoria: z.string().describe("Con su máquina, si es de un servicio"),
				donde: z.string(),
				salio_de: z.string().describe("«Efectivo», la cuenta, o «—» en uno de servicio"),
				monto_centavos: monto,
				comprobante_archivo_id: z.uuid().nullable(),
				de_mantenimiento: z.boolean(),
				cancelado: z.boolean(),
			}),
		),
		...pagina,
		categorias: z.array(opcion).describe("Las que se escogen, sin «Reparación de máquinas»"),
		ubicaciones: z.array(opcion).describe("El Taller y las tiendas"),
		tipos_comprobante: z.array(opcion),
		cuentas_fabrica: cuentasFabrica,
	}),
	permiso: { departamento: "contaduria" },
});

export const contadorExterno = definirConsulta({
	nombre: "contaduria.contador_externo",
	descripcion:
		"Contador externo: el paquete del mes por enviar, los paquetes con su estado y su archivo, y los documentos que regresó el contador",
	entrada: z.object({ cursor }),
	salida: z.object({
		por_enviar: z
			.object({
				paquete_contador_id: z.uuid(),
				mes_texto: z.string().describe("«octubre 2026»"),
				fecha_limite: z.string().describe("«17 de noviembre»"),
				vencido: z.boolean(),
			})
			.nullable()
			.describe("El más viejo por enviar; nulo si ya se mandó el último"),
		paquetes: z.array(
			z.object({
				paquete_contador_id: z.uuid(),
				mes_texto: z.string(),
				enviado: z.string().nullable().describe("«12 nov»"),
				estado: estadoArmado,
				archivo_id: z
					.uuid()
					.nullable()
					.describe("El ZIP, cuando ya está armado y quien llama ve sueldos y tarifas (lleva la nómina)"),
			}),
		),
		documentos: z.array(
			z.object({
				documento_contador_id: z.uuid(),
				archivo_id: z.uuid(),
				nombre: z.string(),
				tipo: z.string().describe("«Declaración», «Acuse», «Facturas» o «Documento»"),
				mes: z.string().nullable().describe("«octubre 2026»"),
				llego: z.string().describe("«12 nov»"),
			}),
		),
		...pagina,
	}),
	permiso: { departamento: "contaduria" },
});

export const paqueteMes = definirConsulta({
	nombre: "contaduria.paquete_mes",
	descripcion:
		"La cuenta del paquete de un mes para el contador: en vivo mientras no se manda y congelada después, por concepto, con su signo y sus documentos",
	entrada: z.object({ paquete_contador_id: z.uuid().describe("El paquete") }),
	salida: z.object({
		paquete_contador_id: z.uuid(),
		version: z.number().int(),
		mes_texto: z.string().describe("«octubre»"),
		enviado: z.boolean(),
		renglones: z.array(
			z.object({
				concepto: z.string().describe("«Cobranza a clientes», «Gasto · Luz»…"),
				signo: z.enum(["ingreso", "egreso", "informativo"]),
				monto_centavos: monto.describe("Fuera de la nómina"),
				total_nomina_centavos: monto.describe("El de la nómina, solo con «ven sueldos y tarifas»"),
				es_nomina: z.boolean(),
				documentos: z.number().int(),
				de_meses_anteriores: z.boolean(),
			}),
		),
	}),
	permiso: { departamento: "contaduria" },
	recortables: ["total_nomina_centavos"],
});
