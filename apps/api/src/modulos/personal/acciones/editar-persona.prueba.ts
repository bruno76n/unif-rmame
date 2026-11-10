/**
 * Prueba de dar de alta y editar a una persona, y de abrir su ficha: el pago por día no viaja ni se cambia sin
 * «ven sueldos y tarifas», abrir la ficha queda en la bitácora, y no se pasa a tienda a alguien con cuenta.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 2)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** La ficha de una persona de por tiempo, como la manda el cajón. */
function ficha(cambio: Record<string, unknown> = {}) {
	return {
		nombre: "Diana Vega",
		area: "taller",
		puesto: "Empaque",
		forma_pago: "tiempo",
		pago_dia_centavos: 33_000,
		fecha_ingreso: "2023-02-20",
		...cambio,
	};
}

/** Lo que regresa el alta. */
const delAlta = z.object({ persona_id: z.uuid(), folio: z.string().regex(/^E-\d{3}$/) });

describe("el pago por día no viaja ni se cambia sin «ven sueldos y tarifas», y abrir la ficha queda como consulta sensible", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** La versión y el pago por día de una persona. */
	async function leer(id: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT version, pago_dia_centavos::int AS pago_dia_centavos, forma_pago, puesto, area FROM personas WHERE id = $1",
			[id],
		);
		return rows[0];
	}

	/** Abre la ficha como una cuenta. */
	async function abrirFicha(id: string, quien: string) {
		const respuesta = await servidor.app.inject({
			method: "GET",
			url: `/v1/consultas/personal.persona?persona_id=${id}`,
			headers: encabezadosDeLaWeb(quien),
		});
		return respuesta.json();
	}

	it("el alta: con el pago por día pide el permiso; sin él, por pieza sí; con él, queda en la bitácora como sueldo", async () => {
		const sinPermiso = await mandarAccion(servidor, "personal.dar_alta_persona", { datos: ficha() }, "personal");
		expect(sinPermiso.estado).toBe(403);
		expect(sinPermiso.cuerpo).toMatchObject({
			codigo: "sin_permiso_fino",
			mensaje: "Esta cuenta no puede poner sueldos. Lo decide la dueña en Administración del sistema.",
		});
		const porPieza = await mandarAccion(
			servidor,
			"personal.dar_alta_persona",
			{ datos: ficha({ nombre: "Lupe Garza", forma_pago: "pieza", pago_dia_centavos: undefined }) },
			"personal",
		);
		expect(porPieza.cuerpo).toMatchObject({
			resultado: { mensaje: "Lupe Garza dada de alta. Falta asignarle PIN del taller" },
		});
		const conPermiso = await mandarAccion(
			servidor,
			"personal.dar_alta_persona",
			{ datos: ficha() },
			"personal_sueldos",
		);
		const { persona_id: id, folio } = delAlta.parse(conPermiso.cuerpo.resultado);
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion, sensible_sueldos, despues FROM bitacora WHERE entidad_id = $1",
			[id],
		);
		expect(rows).toEqual([
			{
				descripcion: "Dio de alta a Diana Vega",
				sensible_sueldos: true,
				despues: expect.objectContaining({ folio, pago_dia_centavos: 33_000, area: "taller" }),
			},
		]);
	});

	it("los errores de la ficha: la tienda y su rol, el pago por día según la forma, la fecha no futura", async () => {
		const casos = [
			[ficha({ area: "tienda" }), "ubicacion_id", "Escoge la tienda."],
			[ficha({ pago_dia_centavos: undefined }), "pago_dia_centavos", "Pesos por día"],
			[ficha({ fecha_ingreso: "2099-01-01" }), "fecha_ingreso", "La fecha de ingreso no puede ser después de hoy."],
			[ficha({ nombre: "Ana" }), "nombre", "Nombre y apellido"],
		] as const;
		for (const [datos, campo, mensaje] of casos) {
			const respuesta = await mandarAccion(servidor, "personal.dar_alta_persona", { datos }, "personal_sueldos");
			expect([campo, respuesta.cuerpo.campos]).toEqual([campo, { [campo]: mensaje }]);
		}
	});

	it("editar sin el permiso: el pago por día no viaja y se conserva; mandarlo o cambiar si lleva pago, 403", async () => {
		const alta = await mandarAccion(servidor, "personal.dar_alta_persona", { datos: ficha() }, "personal_sueldos");
		const { persona_id: id } = delAlta.parse(alta.cuerpo.resultado);
		const { pago_dia_centavos: _pago, ...sinPago } = ficha({ puesto: "Empaque y etiquetas" });
		const editada = await mandarAccion(
			servidor,
			"personal.editar_persona",
			{ datos: { persona_id: id, ...sinPago }, version: Number((await leer(id))?.version) },
			"personal",
		);
		expect(editada.cuerpo).toMatchObject({ resultado: { mensaje: "Diana Vega actualizada" } });
		expect(await leer(id)).toMatchObject({ puesto: "Empaque y etiquetas", pago_dia_centavos: 33_000 });
		for (const datos of [
			{ ...sinPago, pago_dia_centavos: 1 },
			{ ...sinPago, forma_pago: "pieza" },
		]) {
			const respuesta = await mandarAccion(
				servidor,
				"personal.editar_persona",
				{ datos: { persona_id: id, ...datos }, version: Number((await leer(id))?.version) },
				"personal",
			);
			expect(respuesta.cuerpo).toMatchObject({ codigo: "sin_permiso_fino" });
		}
		// Con el permiso: cambia el pago y la bitácora lo dice, marcada como sueldo.
		await mandarAccion(
			servidor,
			"personal.editar_persona",
			{ datos: { persona_id: id, ...sinPago, pago_dia_centavos: 35_000 }, version: Number((await leer(id))?.version) },
			"personal_sueldos",
		);
		expect(await leer(id)).toMatchObject({ pago_dia_centavos: 35_000 });
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion, sensible_sueldos, antes, despues FROM bitacora WHERE entidad_id = $1 ORDER BY ocurrido_en DESC LIMIT 1",
			[id],
		);
		expect(rows[0]).toEqual({
			descripcion: "Editó la ficha de Diana Vega (forma de pago o tarifa)",
			sensible_sueldos: true,
			antes: { pago_dia_centavos: 33_000 },
			despues: { pago_dia_centavos: 35_000 },
		});
	});

	it("la ficha: sin el permiso no trae el pago por día y lo dice; con él, sí; abrirla queda en la bitácora", async () => {
		const alta = await mandarAccion(servidor, "personal.dar_alta_persona", { datos: ficha() }, "personal_sueldos");
		const { persona_id: id } = delAlta.parse(alta.cuerpo.resultado);
		const sinPermiso = await abrirFicha(id, "personal");
		expect(sinPermiso.resultado).not.toHaveProperty("pago_dia_centavos");
		expect(sinPermiso.recortado).toContain("pago_dia_centavos");
		expect(sinPermiso.resultado).toMatchObject({ nombre: "Diana Vega", entra_al_sistema: "Sin PIN" });
		expect((await abrirFicha(id, "personal_sueldos")).resultado).toMatchObject({ pago_dia_centavos: 33_000 });
		const { rows } = await servidor.base.dueno.query(
			"SELECT descripcion FROM bitacora WHERE tipo = 'consulta_sensible' AND entidad_id = $1",
			[id],
		);
		expect(rows.map((renglon) => renglon.descripcion)).toContain("Consultó la ficha de Diana Vega");
		// Sin persona: los valores del alta.
		const nueva = await servidor.app.inject({
			method: "GET",
			url: "/v1/consultas/personal.persona",
			headers: encabezadosDeLaWeb("personal"),
		});
		expect(nueva.json().resultado).toMatchObject({ id: null, area: "taller", forma_pago: "pieza" });
	});

	it("no se pasa a tienda a alguien con cuenta: 422 tiene_cuenta", async () => {
		const id = "01936f2e-0000-7000-8000-0000000000e2";
		const tienda = await servidor.base.dueno.query("SELECT id FROM ubicaciones WHERE codigo = 'T1'");
		const respuesta = await mandarAccion(
			servidor,
			"personal.editar_persona",
			{
				datos: {
					persona_id: id,
					...ficha({
						nombre: "Rosa Méndez",
						area: "tienda",
						ubicacion_id: tienda.rows[0]?.id,
						rol_tienda: "encargada",
						pago_dia_centavos: 65_000,
					}),
				},
				version: Number((await leer(id))?.version),
			},
			"personal_sueldos",
		);
		expect(respuesta.cuerpo).toMatchObject({
			codigo: "tiene_cuenta",
			mensaje:
				"Rosa Méndez entra con Google y nadie de tienda entra al sistema de fábrica. Quítale el acceso antes de pasarla a una tienda.",
		});
	});
});
