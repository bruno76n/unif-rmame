/**
 * Prueba de `inventario.en_camino_aduana`: lo que surtió Bodega y Aduana no ha recibido sale con su folio, quién
 * responde y su color de «Salió»; lo recibido ya no sale; pagina; y solo la pide Aduana, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…») y docs/interfaz/fabrica/aduana.md («En camino a aduana»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	pedidoLineaEnBodega,
	recibirCompletoEnAduana,
	surtirPedidoLinea,
} from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { comoAduana, soloAduanaYSinPrecios } from "./aduana-de-prueba.ts";

/** Un renglón, en lo que revisa la prueba. */
interface Renglon {
	traspaso_id: string;
	folio: string;
	detalle: string;
	cantidad: string;
	responde: string;
	salio: { texto: string; color: string };
}

describe("En camino a aduana", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	const renglones = async (parametros: Record<string, string> = {}) =>
		(await comoAduana(servidor, "inventario.en_camino_aduana", parametros)) as unknown as {
			renglones: Renglon[];
			cursor: string | null;
			hay_mas: boolean;
		};

	it("lo que surtió Bodega sale con quién responde y su color; recibido, ya no", async () => {
		const primero = await surtirPedidoLinea(servidor, (await pedidoLineaEnBodega(servidor, 1)).id);
		const segundo = await surtirPedidoLinea(servidor, (await pedidoLineaEnBodega(servidor, 2)).id);
		await servidor.base.dueno.query("UPDATE traspasos SET enviado_en = now() - interval '3 days' WHERE id = $1", [
			segundo.traspasoId,
		]);
		const datos = await renglones();
		const nuevo = datos.renglones.find((renglon) => renglon.traspaso_id === primero.traspasoId);
		expect(nuevo?.responde).toBe("Bodega");
		expect(nuevo?.cantidad).toBe("1 pieza");
		expect(nuevo?.detalle).toBe("Pedido en línea · va a En línea");
		expect(nuevo?.salio).toEqual({ texto: "Salió hoy", color: "verde" });
		const viejo = datos.renglones.find((renglon) => renglon.traspaso_id === segundo.traspasoId);
		expect(viejo?.salio).toEqual({ texto: "3 días", color: "rojo" });
		// Lo más viejo primero.
		expect(datos.renglones.indexOf(viejo as Renglon)).toBeLessThan(datos.renglones.indexOf(nuevo as Renglon));
		const pagina = await renglones({ limite: "1" });
		expect(pagina.renglones).toHaveLength(1);
		expect(pagina.hay_mas).toBe(true);
		const siguiente = await renglones({ limite: "1", cursor: pagina.cursor ?? "" });
		expect(siguiente.renglones[0]?.traspaso_id).not.toBe(pagina.renglones[0]?.traspaso_id);
		await recibirCompletoEnAduana(servidor, primero.traspasoId ?? "");
		const despues = await renglones();
		expect(despues.renglones.some((renglon) => renglon.traspaso_id === primero.traspasoId)).toBe(false);
	});

	it("solo la pide Aduana, sin precios ni costos", async () => {
		await soloAduanaYSinPrecios(servidor, "inventario.en_camino_aduana");
	});
});
