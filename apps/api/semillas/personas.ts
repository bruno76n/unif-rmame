/**
 * Las personas de la muestra: el Taller, la oficina, Aduana y bodega, las dos tiendas y una baja.
 * Fase 7 · docs/modulos/personal/personas.md y la muestra (`docs/interfaz/muestra/sistema-alameda.html`)
 *
 * Van directo a la base con sus folios E- de la muestra, y el contador de E- sigue después del último. Las de
 * la dueña, la oficina, Aduana y bodega y el encargado del taller llevan los ids que ya usan sus cuentas;
 * Lupita Ramos, el que usan las pruebas de la tablet.
 */

import { and, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { contadoresFolio } from "../src/modulos/admin/tablas.ts";
import { ubicaciones } from "../src/modulos/inventario/tablas.ts";
import { personas } from "../src/modulos/personal/tablas.ts";
import type { Base } from "../src/nucleo/base/conexion.ts";

/** Una persona de la muestra: su folio, su nombre, dónde trabaja y cómo cobra (en pesos por día). */
interface PersonaDeLaMuestra {
	id?: string;
	folio: string;
	nombre: string;
	area: "taller" | "oficina" | "aduana_bodega" | "tienda";
	tienda?: "T1" | "T2";
	puesto: string;
	forma: "tiempo" | "pieza" | "mixta";
	dia?: number;
	ingreso: string;
	baja?: { en: string; motivo: string };
}

/** Las personas de la muestra. */
const personasDeLaMuestra: readonly PersonaDeLaMuestra[] = [
	{
		id: "01936f2e-0000-7000-8000-0000000000e4",
		folio: "E-001",
		nombre: "Tomás Ruiz",
		area: "taller",
		puesto: "Encargado de taller",
		forma: "tiempo",
		dia: 700,
		ingreso: "2015-03-02",
	},
	{
		folio: "E-002",
		nombre: "Beto Aguilar",
		area: "taller",
		puesto: "Cortador",
		forma: "tiempo",
		dia: 520,
		ingreso: "2017-08-14",
	},
	{
		id: "01936f2e-0000-7000-8000-00000000a001",
		folio: "E-003",
		nombre: "Lupita Ramos",
		area: "taller",
		puesto: "Costura",
		forma: "pieza",
		ingreso: "2016-01-11",
	},
	{ folio: "E-004", nombre: "Ana Torres", area: "taller", puesto: "Costura", forma: "pieza", ingreso: "2019-02-04" },
	{ folio: "E-005", nombre: "Rocío Medina", area: "taller", puesto: "Costura", forma: "pieza", ingreso: "2018-06-18" },
	{ folio: "E-006", nombre: "Mari Cruz", area: "taller", puesto: "Costura", forma: "pieza", ingreso: "2020-09-07" },
	{
		folio: "E-007",
		nombre: "Juana Pérez",
		area: "taller",
		puesto: "Ojal y botón",
		forma: "pieza",
		ingreso: "2014-04-21",
	},
	{ folio: "E-008", nombre: "Elena Soto", area: "taller", puesto: "Costura", forma: "pieza", ingreso: "2021-07-12" },
	{ folio: "E-009", nombre: "Paty Lara", area: "taller", puesto: "Costura", forma: "pieza", ingreso: "2022-01-17" },
	{
		folio: "E-010",
		nombre: "Blanca Ruiz",
		area: "taller",
		puesto: "Remates y escudo",
		forma: "pieza",
		ingreso: "2019-10-01",
	},
	{
		folio: "E-011",
		nombre: "Sergio Gómez",
		area: "taller",
		puesto: "Planchado",
		forma: "mixta",
		dia: 220,
		ingreso: "2018-03-05",
	},
	{
		folio: "E-012",
		nombre: "Diana Vega",
		area: "taller",
		puesto: "Empaque",
		forma: "tiempo",
		dia: 330,
		ingreso: "2023-02-20",
	},
	{
		folio: "E-013",
		nombre: "Gloria Rivas",
		area: "taller",
		puesto: "Revisión de calidad",
		forma: "tiempo",
		dia: 420,
		ingreso: "2024-05-06",
	},
	{
		id: "01936f2e-0000-7000-8000-0000000000e2",
		folio: "E-014",
		nombre: "Rosa Méndez",
		area: "oficina",
		puesto: "Oficina",
		forma: "tiempo",
		dia: 650,
		ingreso: "2012-09-03",
	},
	{
		id: "01936f2e-0000-7000-8000-0000000000e3",
		folio: "E-015",
		nombre: "Javier Pérez",
		area: "aduana_bodega",
		puesto: "Encargado de aduana y bodega",
		forma: "tiempo",
		dia: 560,
		ingreso: "2020-01-13",
	},
	{
		folio: "E-016",
		nombre: "Leticia Gómez",
		area: "tienda",
		tienda: "T1",
		puesto: "Encargada",
		forma: "tiempo",
		dia: 480,
		ingreso: "2017-07-03",
	},
	{
		folio: "E-017",
		nombre: "Karla Núñez",
		area: "tienda",
		tienda: "T1",
		puesto: "Cajera",
		forma: "tiempo",
		dia: 380,
		ingreso: "2023-07-24",
	},
	{
		folio: "E-018",
		nombre: "Norma Castillo",
		area: "tienda",
		tienda: "T2",
		puesto: "Encargada",
		forma: "tiempo",
		dia: 480,
		ingreso: "2018-07-09",
	},
	{
		folio: "E-019",
		nombre: "Fernanda Ortiz",
		area: "tienda",
		tienda: "T2",
		puesto: "Cajera",
		forma: "tiempo",
		dia: 380,
		ingreso: "2025-06-30",
	},
	{
		folio: "E-020",
		nombre: "Rosa Elena Díaz",
		area: "taller",
		puesto: "Costura",
		forma: "pieza",
		ingreso: "2021-03-08",
		baja: { en: "2026-08-29T18:00:00Z", motivo: "Renunció: se cambió de ciudad" },
	},
	{
		id: "01936f2e-0000-7000-8000-0000000000e1",
		folio: "E-021",
		nombre: "Carmen Villaseñor",
		area: "oficina",
		puesto: "Dueña",
		forma: "tiempo",
		dia: 1000,
		ingreso: "2008-01-07",
	},
];

/**
 * Carga las personas de la muestra y pone el contador de E- después de la última. Una que ya existe se deja.
 * @param base La base, con el rol dueño.
 */
export async function cargarPersonasDeLaMuestra(base: Base): Promise<void> {
	const tiendas = await base.select({ id: ubicaciones.id, codigo: ubicaciones.codigo }).from(ubicaciones);
	const idDe = new Map(tiendas.map((tienda) => [tienda.codigo, tienda.id]));
	await base
		.insert(personas)
		.values(
			personasDeLaMuestra.map((persona) => ({
				id: persona.id ?? uuidv7(),
				folio: persona.folio,
				nombre: persona.nombre,
				area: persona.area,
				ubicacionId: persona.tienda === undefined ? null : (idDe.get(persona.tienda) ?? null),
				rolTienda: persona.tienda === undefined ? null : persona.puesto === "Cajera" ? "cajera" : "encargada",
				puesto: persona.puesto,
				formaPago: persona.forma,
				pagoDiaCentavos: persona.dia === undefined ? null : persona.dia * 100,
				fechaIngreso: persona.ingreso,
				bajaEn: persona.baja?.en ?? null,
				motivoBaja: persona.baja?.motivo ?? null,
			})),
		)
		.onConflictDoNothing();
	await base
		.update(contadoresFolio)
		.set({ siguiente: sql`greatest(${contadoresFolio.siguiente}, ${personasDeLaMuestra.length + 1})` })
		.where(and(eq(contadoresFolio.tipo, "persona"), eq(contadoresFolio.alcance, "")));
}
