/**
 * Los contratos de las personas: darlas de alta, editarlas, darlas de baja, reactivarlas y abrir su ficha.
 * Fase 7 · docs/modulos/personal/personas.md y docs/interfaz/fabrica/personal.md («La persona»)
 *
 * El pago por día es sueldo: solo lo manda y lo recibe quien tiene «ven sueldos y tarifas».
 */

import { z } from "zod";
import { definirAccion, definirConsulta } from "../definir.ts";

/** Las áreas: deciden por dónde entra la persona. */
export const areas = ["taller", "oficina", "aduana_bodega", "tienda"] as const;

/** Las formas de pago. */
export const formasDePago = ["tiempo", "pieza", "mixta"] as const;

/** Los roles en una tienda. */
export const rolesDeTienda = ["cajera", "encargada"] as const;

/** El tope del pago por día: $99,999. */
export const pagoDiaMaximoCentavos = 9_999_900;

/** Los campos de la ficha, como los manda el cajón al dar de alta o al guardar. */
const ficha = {
	nombre: z.string().trim().min(5, "Nombre y apellido").max(40, "Nombre y apellido").describe("Nombre y apellido"),
	area: z.enum(areas).describe("Su área: decide por dónde entra"),
	ubicacion_id: z.uuid("Escoge la tienda.").optional().describe("En una tienda: cuál"),
	rol_tienda: z.enum(rolesDeTienda, "Escoge si es cajera o encargada.").optional().describe("En una tienda: su rol"),
	puesto: z.string().trim().min(3, "Escribe el puesto").max(30, "Escribe el puesto").describe("Su puesto, libre"),
	forma_pago: z.enum(formasDePago).describe("Por tiempo, por pieza o mixta"),
	pago_dia_centavos: z
		.number()
		.int("Pesos por día")
		.positive("Pesos por día")
		.max(pagoDiaMaximoCentavos, "Pesos por día")
		.optional()
		.describe("Por día o base por día; no va por pieza. Pide «ven sueldos y tarifas»"),
	fecha_ingreso: z.iso.date().describe("Fecha de ingreso, nunca futura"),
};

/** Personal da de alta a una persona, con su folio E- y sin PIN. */
export const darAltaPersona = definirAccion({
	nombre: "personal.dar_alta_persona",
	descripcion: "Da de alta a una persona (tenga o no cuenta) con su folio E- y sin PIN",
	entrada: z.object(ficha),
	salida: z.object({ persona_id: z.uuid(), folio: z.string() }),
	permiso: { departamento: "personal" },
});

/** Personal edita la ficha de una persona; el pago por día, solo con el permiso. */
export const editarPersona = definirAccion({
	nombre: "personal.editar_persona",
	descripcion: "Edita la ficha de una persona; el pago por día solo con «ven sueldos y tarifas»",
	entrada: z.object({ persona_id: z.uuid().describe("La persona"), ...ficha }),
	salida: z.object({}),
	permiso: { departamento: "personal" },
	errores: [
		{
			codigo: "tiene_cuenta",
			mensaje: "Entra con Google y nadie de tienda entra al sistema de fábrica. Quítale el acceso antes.",
		},
	],
	edita: true,
});

/** Personal da de baja a una persona: nada se borra, y deja de entrar. */
export const darBajaPersona = definirAccion({
	nombre: "personal.dar_baja_persona",
	descripcion: "Da de baja a una persona con su motivo: conserva su historia y le quita lo que la deja entrar",
	entrada: z.object({
		persona_id: z.uuid().describe("La persona"),
		motivo: z.string().trim().min(5, "Escribe el motivo").max(80, "Escribe el motivo").describe("Por qué, de 5 a 80"),
	}),
	salida: z.object({}),
	permiso: { departamento: "personal" },
	errores: [
		{ codigo: "ya_dada_de_baja", mensaje: "Esa persona ya está dada de baja." },
		{ codigo: "es_la_duena", mensaje: "La dueña no se da de baja." },
	],
	edita: true,
});

/** Personal reactiva a una persona dada de baja; no le regresa PIN ni cuenta. */
export const reactivarPersona = definirAccion({
	nombre: "personal.reactivar_persona",
	descripcion: "Reactiva a una persona dada de baja, sin PIN ni cuenta",
	entrada: z.object({
		persona_id: z.uuid().describe("La persona"),
		fecha_ingreso: z.iso.date().optional().describe("Si vuelve con otra fecha de ingreso"),
	}),
	salida: z.object({}),
	permiso: { departamento: "personal" },
	errores: [{ codigo: "no_esta_de_baja", mensaje: "Esa persona ya está activa." }],
	edita: true,
});

/** El cajón de la persona: su ficha, o los valores del alta. Abrir una ficha queda en la bitácora. */
export const persona = definirConsulta({
	nombre: "personal.persona",
	descripcion: "La ficha de una persona, o los valores del alta; abrir una ficha queda en la bitácora",
	entrada: z.object({ persona_id: z.uuid().optional().describe("La persona; sin ella, los valores del alta") }),
	salida: z.object({
		id: z.uuid().nullable(),
		folio: z.string().nullable(),
		nombre: z.string(),
		area: z.enum(areas),
		ubicacion_id: z.uuid().nullable(),
		rol_tienda: z.enum(rolesDeTienda).nullable(),
		puesto: z.string(),
		forma_pago: z.enum(formasDePago),
		pago_dia_centavos: z.number().int().nullable().optional().describe("Solo con «ven sueldos y tarifas»"),
		fecha_ingreso: z.string(),
		baja_en: z.string().nullable(),
		motivo_baja: z.string().nullable(),
		entra_al_sistema: z.string().nullable().describe("«PIN del taller», «Cuenta de Google · {puesto}»…"),
		version: z.number().int().nullable(),
	}),
	permiso: { departamento: "personal" },
	recortables: ["pago_dia_centavos"],
});

/** Personal · Personas: la lista por área, con su pago a la vista solo si se pide y se tiene el permiso. */
export const personasDeLaLista = definirConsulta({
	nombre: "personal.personas",
	descripcion: "Las personas por área; ver las tarifas pide «ven sueldos y tarifas» y queda en la bitácora",
	entrada: z.object({
		area: z
			.enum([...areas, "baja"])
			.optional()
			.describe("Un área, o las dadas de baja; sin ella, todas"),
		ubicacion_id: z.uuid().optional().describe("En el área tienda: cuál"),
		ver_tarifas: z.enum(["si", "no"]).optional().describe("«si» para ver el pago por día"),
	}),
	salida: z.object({
		personas: z.array(
			z.object({
				id: z.uuid(),
				folio: z.string(),
				nombre: z.string(),
				area: z.enum(areas),
				ubicacion_id: z.uuid().nullable(),
				puesto: z.string(),
				forma_pago: z.enum(formasDePago),
				pago_dia_centavos: z.number().int().nullable().optional().describe("Solo con «ver tarifas» y el permiso"),
				fecha_ingreso: z.string(),
				baja_en: z.string().nullable(),
				entra_al_sistema: z.string(),
			}),
		),
	}),
	permiso: { departamento: "personal" },
	recortables: ["pago_dia_centavos"],
});
