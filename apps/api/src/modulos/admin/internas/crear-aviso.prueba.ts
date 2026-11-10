/**
 * Prueba de `admin.crear_aviso`, de la alerta que se vuelve aviso y de `admin.marcar_aviso_leido`.
 * Fase 4 · docs/fases/04-servicios-comunes.md (partes 3 y 4)
 */

import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearBase } from "../../../nucleo/base/conexion.ts";
import { enAccionDePrueba } from "../../../nucleo/pruebas/accion-de-prueba.ts";
import { mandarAccion } from "../../../nucleo/pruebas/llamadas.ts";
import {
	crearServidorDePrueba,
	quienesDePrueba,
	type ServidorDePrueba,
} from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { procesarEventos, repartirConLosModulos } from "../../../nucleo/trabajos/procesar-eventos.ts";

/** El id de una cuenta de prueba. */
function cuenta(nombre: string): string {
	const quien = quienesDePrueba[nombre];
	if (quien?.tipo !== "cuenta") throw new Error(`no hay cuenta de prueba ${nombre}`);
	return quien.usuarioId;
}

describe("un aviso no se repite sin leer; va por correo según su parámetro; una alerta se vuelve aviso a la dueña", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Crea un aviso con la interna, dentro de una acción de prueba. */
	function crear(aviso: Record<string, unknown>): Promise<{ aviso_ids: string[] }> {
		return enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, async (contexto) => {
			const creados = await contexto.interna("admin.crear_aviso", aviso);
			return creados as { aviso_ids: string[] };
		});
	}

	/** Los avisos de un tipo, con su cuenta y si van por correo. */
	async function avisosDe(
		tipo: string,
	): Promise<{ usuario_id: string; por_correo: boolean; leido_en: string | null }[]> {
		const { rows } = await servidor.base.dueno.query(
			"SELECT usuario_id, por_correo, leido_en FROM avisos WHERE tipo = $1 ORDER BY creado_en",
			[tipo],
		);
		return rows;
	}

	it("uno por cuenta de la regla; el mismo tipo y documento sin leer no se repite; ya leído, sí", async () => {
		const documento = "01936f2e-0000-7000-8000-0000000000d1";
		const aviso = {
			tipo: "pin_bloqueado",
			destinatarios: { regla: "departamento:admin" },
			texto: "Ana se bloqueó en la tablet por 5 PIN equivocados",
			entidad: "personas",
			entidadId: documento,
		};
		const primero = await crear(aviso);
		expect(primero.aviso_ids).toHaveLength(2);
		expect((await avisosDe("pin_bloqueado")).map((renglon) => renglon.usuario_id).sort()).toEqual(
			[cuenta("admin"), cuenta("soporte")].sort(),
		);
		expect((await crear(aviso)).aviso_ids).toEqual([]);
		// La cuenta de Administración lo lee: a ella le vuelve a llegar; a soporte, que no lo ha leído, no.
		const leido = await mandarAccion(servidor, "admin.marcar_aviso_leido", { datos: { todos: true } }, "admin");
		expect(leido.estado).toBe(200);
		const segundo = await crear(aviso);
		expect(segundo.aviso_ids).toHaveLength(1);
		expect(await avisosDe("pin_bloqueado")).toHaveLength(3);
	});

	it("va por correo según avisos.correo_{tipo}, decidido al crearlo", async () => {
		await crear({ tipo: "autorizacion_pedida", destinatarios: { regla: "duena" }, texto: "Ventas pide autorización" });
		await crear({
			tipo: "autorizacion_decidida",
			destinatarios: { cuentas: [cuenta("ventas")] },
			texto: "AU-0028 autorizada",
		});
		expect((await avisosDe("autorizacion_pedida"))[0]?.por_correo).toBe(true);
		expect((await avisosDe("autorizacion_decidida"))[0]?.por_correo).toBe(false);
		const { rows } = await servidor.base.dueno.query(
			"SELECT count(*)::int AS n FROM graphile_worker.jobs WHERE task_identifier = 'admin.enviar_correos'",
		);
		expect(rows[0]?.n).toBe(1);
	});

	it("una alerta de la bitácora se vuelve el aviso alerta_seguridad a la dueña, con su descripción", async () => {
		await enAccionDePrueba(crearBase(servidor.base.app), servidor.modulos, (contexto) =>
			contexto.interna("admin.escribir_bitacora", {
				tipo: "acceso",
				descripcion: "Intento de entrar sin acceso: x@otro.invalid",
				esAlerta: true,
			}),
		);
		await procesarEventos({
			base: crearBase(servidor.base.app),
			repartir: repartirConLosModulos(servidor.modulos, () => Temporal.Now.instant()),
			avisarFalla: async () => undefined,
			ahora: () => Temporal.Now.instant(),
		});
		const { rows } = await servidor.base.dueno.query(
			"SELECT usuario_id, texto, entidad, enlace FROM avisos WHERE tipo = 'alerta_seguridad'",
		);
		expect(rows).toEqual([
			{
				usuario_id: cuenta("duena"),
				texto: "Intento de entrar sin acceso: x@otro.invalid",
				entidad: "bitacora",
				enlace: "admin/bitacora",
			},
		]);
	});

	it("cada quien marca solo sus avisos: los ids de otra cuenta se ignoran; sin ids ni todos, 400", async () => {
		const { aviso_ids } = await crear({
			tipo: "alerta_direccion",
			destinatarios: { cuentas: [cuenta("duena")] },
			texto: "Una alerta de Dirección",
		});
		const deOtra = await mandarAccion(servidor, "admin.marcar_aviso_leido", { datos: { aviso_ids } }, "ventas");
		expect(deOtra.estado).toBe(200);
		expect((await avisosDe("alerta_direccion"))[0]?.leido_en).toBeNull();
		await mandarAccion(servidor, "admin.marcar_aviso_leido", { datos: { aviso_ids } }, "duena");
		expect((await avisosDe("alerta_direccion"))[0]?.leido_en).not.toBeNull();
		expect((await mandarAccion(servidor, "admin.marcar_aviso_leido", { datos: {} }, "duena")).cuerpo).toMatchObject({
			campos: { aviso_ids: "Di qué avisos o todos." },
		});
	});
});
