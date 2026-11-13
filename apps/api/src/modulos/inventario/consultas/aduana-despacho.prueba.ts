/**
 * Prueba de `inventario.aduana_despacho` con los datos de la muestra y lo que pone cada caso: un grupo por destino en
 * su orden, solo los que tienen algo, con su resumen (el material no suma piezas, y solo material no dice «0 piezas»); «Sin nota» en lo que va a un
 * cliente sin nota de entrega; sin los pedidos en línea; y que solo la pide Aduana, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…») y docs/interfaz/fabrica/aduana.md («Despacho»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { traspasoEnAduana } from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import { pedidoListoEnAduana } from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import {
	pedidoLineaEnBodega,
	recibirCompletoEnAduana,
	surtirPedidoLinea,
} from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { comoAduana, soloAduanaYSinPrecios } from "./aduana-de-prueba.ts";

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Despacho {
	grupos: {
		carril: string;
		nombre: string;
		resumen: string;
		renglones: { traspaso_id: string; titulo: string; detalle: string; cantidad: string; boton: string }[];
	}[];
}

describe("Despacho de Aduana", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	it("un grupo por destino en su orden, con «Sin nota» y sin los pedidos en línea", async () => {
		const aTienda = await traspasoEnAduana(servidor, "T1");
		const delPedido = await pedidoListoEnAduana(servidor, 4);
		const enLinea = await surtirPedidoLinea(servidor, (await pedidoLineaEnBodega(servidor, 1)).id);
		await recibirCompletoEnAduana(servidor, enLinea.traspasoId ?? "");
		const datos = (await comoAduana(servidor, "inventario.aduana_despacho")) as unknown as Despacho;
		expect(datos.grupos.map((grupo) => grupo.nombre)).toEqual(["Tienda 1", "Clientes externos", "Bodega"]);
		const tienda = datos.grupos[0];
		expect(tienda?.resumen).toBe("1 por despachar · 8 piezas");
		expect(tienda?.renglones[0]).toMatchObject({ traspaso_id: aTienda.id, boton: "despachar" });
		const cliente = datos.grupos[1]?.renglones.find((renglon) => renglon.traspaso_id === delPedido.lote.traspasoId);
		expect(cliente?.boton).toBe("sin_nota");
		expect(cliente?.detalle).toMatch(/ · PE-\S+ · sin nota$/);
		// El material de la muestra que sigue en aduana va a Bodega y no suma piezas: con solo material, no dice «0 piezas».
		const bodega = datos.grupos[2];
		expect(bodega?.resumen).toMatch(/^\d+ por despachar$/);
		expect(bodega?.renglones.some((renglon) => renglon.cantidad.endsWith(" m"))).toBe(true);
		const todos = datos.grupos.flatMap((grupo) => grupo.renglones.map((renglon) => renglon.traspaso_id));
		expect(todos).not.toContain(enLinea.traspasoId);
	});

	it("solo la pide Aduana, sin precios ni costos", async () => {
		await soloAduanaYSinPrecios(servidor, "inventario.aduana_despacho");
	});
});
