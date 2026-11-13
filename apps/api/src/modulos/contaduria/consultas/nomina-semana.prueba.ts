/**
 * Prueba de `contaduria.nomina_semana`: la cuenta de la semana es la misma con que se paga (su total, mandado tal cual,
 * paga la nómina), queda congelada al pagarla, sale agrupada por área, deja «Consultó la nómina del {semana}» en la
 * bitácora y la pide solo Contaduría con «ven sueldos y tarifas».
 * Fase 19 · docs/fases/19-web-principal.md (criterios «Las consultas sensibles (… la nómina …) dejan su renglón en la
 * bitácora» y «Cada consulta revisa el departamento y el permiso fino en el servidor y no manda lo que la cuenta no
 * debe ver: … sueldos y tarifas sin su permiso») y docs/interfaz/fabrica/contaduria.md («Nómina»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { conGoogle, mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import {
	personaDeNomina,
	registroDeNomina,
	type SemanaDePrueba,
	semanaConNomina,
} from "../../../nucleo/pruebas/nomina-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que se lee de la respuesta. */
const nomina = z.object({
	semana: z.object({ asistencia_semana_id: z.string(), texto: z.string() }).nullable(),
	nomina: z
		.object({ nomina_id: z.string(), version: z.number(), estado: z.string(), pagada: z.string().nullable() })
		.nullable(),
	total_nomina_centavos: z.number(),
	opciones: z.string(),
	grupos: z.array(
		z.object({
			titulo: z.string(),
			renglones: z.array(z.object({ nombre: z.string(), forma: z.string(), total_nomina_centavos: z.number() })),
		}),
	),
	personas: z.array(z.object({ nombre: z.string() })),
});

describe("La nómina de la semana", () => {
	let servidor: ServidorDePrueba;
	let semana: SemanaDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		semana = await semanaConNomina(servidor, "2025-02-03");
		const lupita = await personaDeNomina(servidor, { nombre: "Lupita de Prueba", formaPago: "pieza" });
		await registroDeNomina(servidor, { personaId: lupita, fecha: "2025-02-04", buenas: 100, tarifaCentavos: 120 });
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide la nómina como Contaduría con el permiso de sueldos. */
	async function pedir(parametros: Record<string, string> = {}) {
		const pedida = await pedirConsulta(servidor, "contaduria.nomina_semana", parametros, "contaduria_sueldos");
		expect(pedida.estado, JSON.stringify(pedida.cuerpo)).toBe(200);
		return nomina.parse(pedida.cuerpo.resultado);
	}

	it("sin semana abre la nómina por pagar más vieja, agrupada por área, con las opciones con que se calcula", async () => {
		const datos = await pedir();
		expect(datos.semana?.asistencia_semana_id).toBe(semana.semanaId);
		expect(datos.semana?.texto).toBe("del 3 al 8 de febrero");
		expect(datos.nomina?.estado).toBe("por_pagar");
		const taller = datos.grupos.find((grupo) => grupo.titulo === "Taller");
		const lupita = taller?.renglones.find((renglon) => renglon.nombre === "Lupita de Prueba");
		expect(lupita).toMatchObject({ forma: "Por pieza", total_nomina_centavos: 12_000 });
		expect(datos.opciones).toBe("Piezas dañadas: no se pagan · Descuento mayor que lo ganado: se perdona");
		expect(datos.total_nomina_centavos).toBe(
			datos.grupos
				.flatMap((grupo) => grupo.renglones)
				.reduce((suma, renglon) => suma + renglon.total_nomina_centavos, 0),
		);
	});

	it("lo que se ve es lo que se paga: el total que regresa paga la nómina, y pagada queda congelada", async () => {
		const vista = await pedir({ asistencia_semana_id: semana.semanaId });
		if (vista.nomina === null) throw new Error("la semana no tiene nómina");
		const pagada = await mandarAccion(
			servidor,
			"contaduria.pagar_nomina",
			{
				datos: { nomina_id: vista.nomina.nomina_id, total_visto_centavos: vista.total_nomina_centavos },
				version: vista.nomina.version,
			},
			"contaduria_sueldos",
			conGoogle(),
		);
		expect(pagada.estado, JSON.stringify(pagada.cuerpo)).toBe(200);
		// Un registro que llega después no cambia la nómina pagada.
		const otra = await personaDeNomina(servidor, { nombre: "Tardía de Prueba", formaPago: "pieza" });
		await registroDeNomina(servidor, { personaId: otra, fecha: "2025-02-05", buenas: 50, tarifaCentavos: 100 });
		const congelada = await pedir({ asistencia_semana_id: semana.semanaId });
		expect(congelada.nomina?.estado).toBe("pagada");
		expect(congelada.nomina?.pagada).toMatch(/^Pagada el /);
		expect(congelada.total_nomina_centavos).toBe(vista.total_nomina_centavos);
		expect(congelada.grupos.flatMap((grupo) => grupo.renglones).map((renglon) => renglon.nombre)).not.toContain(
			"Tardía de Prueba",
		);
	});

	it("abrirla deja «Consultó la nómina del {semana}» en la bitácora, como consulta sensible", async () => {
		await pedir({ asistencia_semana_id: semana.semanaId });
		const { rows } = await servidor.base.dueno.query(
			"SELECT tipo, entidad FROM bitacora WHERE descripcion = 'Consultó la nómina del 3 al 8 de febrero'",
		);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows[0]).toMatchObject({ tipo: "consulta_sensible", entidad: "nominas" });
	});

	it("sin «ven sueldos y tarifas», 403 sin_permiso_fino; sin Contaduría, 403", async () => {
		const sinPermiso = await pedirConsulta(servidor, "contaduria.nomina_semana", {}, "contaduria");
		expect([sinPermiso.estado, sinPermiso.cuerpo.codigo]).toEqual([403, "sin_permiso_fino"]);
		expect((await pedirConsulta(servidor, "contaduria.nomina_semana", {}, "personal_sueldos")).estado).toBe(403);
	});
});
