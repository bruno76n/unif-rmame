/**
 * Prueba de decidir una autorización: una sola vez, con «Confirmar con Google», con el efecto del módulo de
 * origen en la misma transacción y un solo renglón de bitácora; «Pedida por ti»; y desde dónde se decide.
 * Fase 7 · docs/fases/07-autorizaciones-y-personal.md (parte 1)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { cuentaDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { conGoogle, mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import {
	crearServidorDePrueba,
	encabezadosDeLaWeb,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Lo que regresa pedir una aprobación. */
const laPedida = z.object({ autorizacion_id: z.uuid(), folio: z.string() });

describe("una autorización se decide una sola vez, con Google, con el efecto de su módulo en la misma transacción", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Ventas (o quien se diga) pide autorizar el pago de una factura nueva. */
	async function pedir(quien = "ventas", resumen = "Pagar lo recibido de Textiles Aurora") {
		const factura = uuidv7();
		const pedida = await mandarAccion(
			servidor,
			"prueba.pedir_aprobacion",
			{ datos: { factura_id: factura, resumen } },
			quien,
		);
		expect(pedida.estado).toBe(200);
		const { autorizacion_id: id, folio } = laPedida.parse(pedida.cuerpo.resultado);
		return { id, folio, factura, version: await version(id) };
	}

	/** La versión de una autorización. */
	async function version(id: string): Promise<number> {
		const { rows } = await servidor.base.dueno.query("SELECT version FROM autorizaciones WHERE id = $1", [id]);
		return Number(rows[0]?.version);
	}

	/** Decide una autorización. */
	function decidir(
		au: { id: string; version: number },
		datos: { decision: "autorizar" | "rechazar"; motivo?: string; desde?: string },
		quien = "duena",
		encabezados: Record<string, string> = conGoogle(),
	) {
		return mandarAccion(
			servidor,
			"direccion.decidir_autorizacion",
			{ datos: { autorizacion_id: au.id, desde: "direccion", ...datos }, version: au.version },
			quien,
			encabezados,
		);
	}

	/** La autorización como quedó. */
	async function leer(id: string) {
		const { rows } = await servidor.base.dueno.query(
			"SELECT estado, motivo_rechazo, decidida_por, misma_persona, confirmado_con_google_en FROM autorizaciones WHERE id = $1",
			[id],
		);
		return rows[0];
	}

	/** Los renglones de bitácora de una autorización. */
	async function bitacoraDe(id: string) {
		const { rows } = await servidor.base.dueno.query(
			`SELECT b.descripcion, b.modulo, d.clave AS departamento, b.misma_persona, b.antes, b.despues
			 FROM bitacora b LEFT JOIN departamentos d ON d.id = b.departamento_id WHERE b.entidad_id = $1`,
			[id],
		);
		return rows;
	}

	/** Las notas que dejó el efecto de prueba. */
	async function efectos(factura: string): Promise<string[]> {
		const { rows } = await servidor.base.dueno.query("SELECT texto FROM prueba_notas WHERE texto LIKE $1", [
			`efecto:%:${factura}`,
		]);
		return rows.map((renglon) => String(renglon.texto));
	}

	it("se decide una sola vez, con Google; sin Dirección no; el efecto queda en la misma transacción con un solo renglón de bitácora", async () => {
		const au = await pedir();
		expect((await decidir(au, { decision: "autorizar" }, "ventas")).estado).toBe(403);
		expect((await decidir(au, { decision: "autorizar" }, "direccion", {})).cuerpo).toMatchObject({
			error: "reautenticar",
		});
		const decidida = await decidir(au, { decision: "autorizar" }, "direccion", conGoogle());
		expect(decidida.cuerpo).toMatchObject({
			resultado: {
				estado: "autorizada",
				folio: au.folio,
				datos: { factura: au.factura },
				mensaje: "Autorizado por Dirección: pago fuera de lo normal",
			},
		});
		expect(await leer(au.id)).toMatchObject({
			estado: "autorizada",
			decidida_por: cuentaDePrueba("direccion"),
			misma_persona: false,
			confirmado_con_google_en: expect.any(Date),
		});
		expect(await efectos(au.factura)).toEqual([`efecto:autorizar:${au.factura}`]);
		expect(await bitacoraDe(au.id)).toEqual([
			{
				descripcion: "Autorizó: Pagar lo recibido de Textiles Aurora",
				modulo: "direccion",
				departamento: "direccion",
				misma_persona: false,
				antes: { estado: "por_autorizar", documento: { estado: "detenida" } },
				despues: { estado: "autorizada", documento: { estado: "por_pagar" } },
			},
		]);
		const otraVez = await decidir(
			{ id: au.id, version: await version(au.id) },
			{ decision: "rechazar", motivo: "Ya no" },
		);
		expect(otraVez.cuerpo).toMatchObject({ codigo: "ya_decidida", mensaje: "Esa autorización ya se decidió." });
		const { rows } = await servidor.base.dueno.query(
			"SELECT datos FROM eventos WHERE tipo = 'autorizacion.decidida' AND entidad_id = $1",
			[au.id],
		);
		expect(rows).toEqual([
			{
				datos: {
					autorizacion_id: au.id,
					tipo: "pago_fuera_de_lo_normal",
					decision: "autorizar",
					pedida_por: cuentaDePrueba("ventas"),
				},
			},
		]);
	});

	it("rechazar pide motivo de 5 a 90 letras, que queda guardado; el efecto recibe el rechazo", async () => {
		const au = await pedir();
		const sinMotivo = await decidir(au, { decision: "rechazar" });
		expect(sinMotivo.cuerpo).toMatchObject({
			error: "validacion",
			campos: { motivo: "Escribe el motivo: le llega a quien lo pidió" },
		});
		expect((await decidir(au, { decision: "rechazar", motivo: "No" })).cuerpo).toMatchObject({ error: "validacion" });
		const rechazada = await decidir(au, { decision: "rechazar", motivo: "No cuadra con la nota" });
		expect(rechazada.cuerpo).toMatchObject({
			resultado: { estado: "rechazada", mensaje: "Rechazado: pago fuera de lo normal" },
		});
		expect(await leer(au.id)).toMatchObject({ estado: "rechazada", motivo_rechazo: "No cuadra con la nota" });
		expect(await efectos(au.factura)).toEqual([`efecto:rechazar:${au.factura}`]);
		expect((await bitacoraDe(au.id))[0]).toMatchObject({
			descripcion: "Rechazó: Pagar lo recibido de Textiles Aurora · No cuadra con la nota",
		});
	});

	it("si el efecto del módulo de origen falla, su error sale tal cual y no se decide nada; un efecto que escribe bitácora tampoco", async () => {
		const au = await pedir();
		await servidor.base.dueno.query(
			"INSERT INTO prueba_notas (id, texto, monto_centavos) VALUES (gen_random_uuid(), $1, 0)",
			[`bloquea:${au.factura}`],
		);
		const fallida = await decidir(au, { decision: "autorizar" });
		expect(fallida.cuerpo).toMatchObject({
			codigo: "factura_bloqueada",
			mensaje: "Esa factura no se puede decidir.",
		});
		expect(await leer(au.id)).toMatchObject({ estado: "por_autorizar", decidida_por: null });
		expect(await bitacoraDe(au.id)).toEqual([]);
		const otra = await pedir();
		await servidor.base.dueno.query(
			"INSERT INTO prueba_notas (id, texto, monto_centavos) VALUES (gen_random_uuid(), $1, 0)",
			[`escribe:${otra.factura}`],
		);
		expect((await decidir(otra, { decision: "autorizar" })).estado).toBe(500);
		expect(await leer(otra.id)).toMatchObject({ estado: "por_autorizar" });
		expect(await efectos(otra.factura)).toEqual([]);
	});

	it("«Pedida por ti»: quien la pide la ve marcada; si la decide, la bitácora lo dice", async () => {
		const au = await pedir("duena", "Pagar lo que pidió la dueña");
		const pantalla = await servidor.app.inject({
			method: "GET",
			url: "/v1/consultas/direccion.autorizaciones",
			headers: encabezadosDeLaWeb("duena"),
		});
		const { resultado } = pantalla.json();
		const tarjeta = resultado.por_autorizar.find((una: { id: string }) => una.id === au.id);
		expect(tarjeta).toMatchObject({
			folio: au.folio,
			tipo: "pago_fuera_de_lo_normal",
			departamento: "Contaduría",
			pedida_por_ti: true,
			puede_decidir: true,
			documento_id: au.factura,
			version: au.version,
		});
		expect(resultado.filtros[0]).toMatchObject({ tipo: null, nombre: "Todas" });
		expect(resultado.filtros).toContainEqual(
			expect.objectContaining({ tipo: "pago_fuera_de_lo_normal", nombre: "Pago fuera de lo normal" }),
		);
		// Para otra cuenta de Dirección no es suya.
		const otra = await servidor.app.inject({
			method: "GET",
			url: "/v1/consultas/direccion.autorizaciones",
			headers: encabezadosDeLaWeb("direccion"),
		});
		// «Lo pidió» lleva el nombre de la persona de la cuenta, no su correo.
		const { rows } = await servidor.base.dueno.query(
			"SELECT p.nombre FROM usuarios u JOIN personas p ON p.id = u.persona_id WHERE u.id = $1",
			[cuentaDePrueba("duena")],
		);
		expect(otra.json().resultado.por_autorizar.find((una: { id: string }) => una.id === au.id)).toMatchObject({
			pedida_por_ti: false,
			pedida_por: rows[0]?.nombre,
		});
		await decidir(au, { decision: "autorizar" });
		expect(await leer(au.id)).toMatchObject({ misma_persona: true });
		expect((await bitacoraDe(au.id))[0]).toMatchObject({
			descripcion: "Autorizó: Pagar lo que pidió la dueña · pedida y autorizada por la misma persona",
			misma_persona: true,
		});
		const resueltas = await servidor.app.inject({
			method: "GET",
			url: "/v1/consultas/direccion.autorizaciones",
			headers: encabezadosDeLaWeb("duena"),
		});
		expect(resueltas.json().resultado.resueltas.find((una: { id: string }) => una.id === au.id)).toMatchObject({
			resultado: "autorizada",
			misma_persona: true,
		});
	});

	it("desde Bodega y Administración solo decide la dueña y solo lo suyo; el alta de usuario solo la decide la dueña", async () => {
		const au = await pedir();
		expect((await decidir(au, { decision: "autorizar", desde: "bodega" }, "direccion")).cuerpo).toMatchObject({
			codigo: "solo_duena",
		});
		expect((await decidir(au, { decision: "autorizar", desde: "bodega" })).cuerpo).toMatchObject({
			codigo: "no_se_decide_aqui",
			mensaje: "Desde esta pantalla solo se decide: ajuste de inventario.",
		});
		expect((await decidir(au, { decision: "autorizar", desde: "admin" })).cuerpo).toMatchObject({
			codigo: "no_se_decide_aqui",
		});
		// Un alta de usuario esperando: otra cuenta de Dirección no la decide.
		const usuario = uuidv7();
		await servidor.base.dueno.query(
			"INSERT INTO usuarios (id, persona_id, correo, estado) VALUES ($1, $2, $3, 'solicitada')",
			[usuario, await nuevaPersona(servidor.base.dueno), `${usuario}@alameda.invalid`],
		);
		const alta = uuidv7();
		await servidor.base.dueno.query(
			`INSERT INTO autorizaciones (id, folio, tipo, departamento_origen_id, resumen, usuario_solicitado_id, creado_por)
			 SELECT $1, 'AU-9999', 'alta_usuario', id, 'Alta de cuenta', $2, $3 FROM departamentos WHERE clave = 'admin'`,
			[alta, usuario, cuentaDePrueba("admin")],
		);
		const deAlta = { id: alta, version: await version(alta) };
		expect((await decidir(deAlta, { decision: "autorizar" }, "direccion")).cuerpo).toMatchObject({
			codigo: "solo_duena",
			mensaje: "Las cuentas nuevas solo las da la dueña.",
		});
		const pantalla = await servidor.app.inject({
			method: "GET",
			url: "/v1/consultas/direccion.autorizaciones?tipo=alta_usuario",
			headers: encabezadosDeLaWeb("direccion"),
		});
		expect(pantalla.json().resultado.por_autorizar).toEqual([
			expect.objectContaining({
				id: alta,
				puede_decidir: false,
				no_puede_porque: "Las cuentas nuevas solo las da la dueña",
			}),
		]);
	});
});
