/**
 * Prueba de lo demás que sube la tablet: un consumible se descuenta en la unidad de inventario (÷ el factor de la
 * tablet), aunque la existencia quede negativa; un material que no es consumible o repetido se aparta; un PIN
 * bloqueado en la tablet queda bloqueado en Personal, y uno ajeno se aparta.
 * Fase 12 · docs/fases/12-produccion.md (parte 4)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { altaDeMaterial, altaDeProveedor } from "../../../nucleo/pruebas/compras-de-prueba.ts";
import { nuevaPersona } from "../../../nucleo/pruebas/personas-de-prueba.ts";
import { subirDeLaTablet } from "../../../nucleo/pruebas/produccion-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

describe("Un consumible se descuenta en la unidad de inventario; un PIN bloqueado en la tablet queda bloqueado en Personal", () => {
	let servidor: ServidorDePrueba;
	let persona: string;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		persona = await nuevaPersona(servidor.base.dueno, "taller");
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[]) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	it("3 agujas de una caja de 100 son 0.030 cajas que salen de Bodega con la persona; lo que no es consumible o va repetido se aparta", async () => {
		const proveedor = await altaDeProveedor(servidor);
		const agujas = await altaDeMaterial(servidor, proveedor, {
			nombre: `Agujas de prueba ${uuidv7().slice(-6)}`,
			tipo: "consumible",
			unidad: "cajas",
			unidad_tablet: "agujas",
			factor_tablet: "100",
		});
		const boton = await altaDeMaterial(servidor, proveedor, { nombre: `Botón de prueba ${uuidv7().slice(-6)}` });
		const tomar = (renglones: unknown[]) =>
			subirDeLaTablet(servidor, "produccion.tomar_consumible", { id: uuidv7(), renglones }, persona);
		expect(await tomar([{ material_id: agujas, cantidad: 3 }])).toMatchObject({ resultado: "aplicado" });
		expect(
			await consultar(
				`SELECT l.cantidad, m.persona_id, u.codigo FROM movimiento_lineas l JOIN movimientos m ON m.id = l.movimiento_id
				 JOIN ubicaciones u ON u.id = l.origen_ubicacion_id WHERE l.material_id = $1`,
				[agujas],
			),
		).toEqual([{ cantidad: "0.030", persona_id: persona, codigo: "BOD" }]);
		expect(await tomar([{ material_id: boton, cantidad: 1 }])).toMatchObject({ resultado: "apartado" });
		expect(
			await tomar([
				{ material_id: agujas, cantidad: 1 },
				{ material_id: agujas, cantidad: 2 },
			]),
		).toMatchObject({ resultado: "apartado" });
	});

	it("el PIN que la tablet bloqueó queda bloqueado; uno de otra persona se aparta", async () => {
		const pin = uuidv7();
		await servidor.base.dueno.query(
			"INSERT INTO pines (id, persona_id, ubicacion_id, pin_hash) SELECT $1, $2, id, 'x' FROM ubicaciones WHERE codigo = 'TAL'",
			[pin, persona],
		);
		const otra = await nuevaPersona(servidor.base.dueno, "taller");
		expect(
			await subirDeLaTablet(servidor, "produccion.registrar_bloqueo_pin", { pin_id: pin, intentos: 5 }, otra),
		).toMatchObject({
			resultado: "apartado",
		});
		expect(
			await subirDeLaTablet(servidor, "produccion.registrar_bloqueo_pin", { pin_id: pin, intentos: 5 }, persona),
		).toMatchObject({
			resultado: "aplicado",
		});
		expect(await consultar("SELECT estado, intentos_fallidos FROM pines WHERE id = $1", [pin])).toEqual([
			{ estado: "bloqueado", intentos_fallidos: 5 },
		]);
	});
});
