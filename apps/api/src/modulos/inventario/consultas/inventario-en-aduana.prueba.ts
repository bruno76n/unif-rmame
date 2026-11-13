/**
 * Prueba de `inventario.inventario_en_aduana` con los datos de la muestra y lo que pone cada caso: el cuadre de las
 * piezas por ubicación con Aduana resaltada y su total; lo que está aquí de lo más viejo a lo más nuevo, con su botón
 * («Ver pedido» en un pedido en línea, «Devolver al proveedor» en lo que regresa a un proveedor, con sus rollos) y
 * «Etiquetas por imprimir»; pagina; y solo la pide Aduana, sin precios ni costos.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver…») y docs/interfaz/fabrica/aduana.md («Inventario en aduana»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	decidirDePrueba,
	ordenParaRecibir,
	recibirDePrueba,
	traspasoEnAduana,
} from "../../../nucleo/pruebas/aduana-de-prueba.ts";
import {
	pedidoLineaEnBodega,
	recibirCompletoEnAduana,
	surtirPedidoLinea,
} from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { comoAduana, soloAduanaYSinPrecios, valorDe } from "./aduana-de-prueba.ts";

/** Un renglón, en lo que revisa la prueba. */
interface Renglon {
	traspaso_id: string;
	titulo: string;
	detalle: string;
	boton: string;
	etiquetas_por_imprimir: boolean;
	devolucion: { cantidad: string; unidad: string; es_tela: boolean; rollos: { folio: string }[] } | null;
}

/** Lo que regresa la consulta, en lo que revisa la prueba. */
interface Inventario {
	cuadre: { nombre: string; piezas: number; resaltada: boolean }[];
	total: number;
	renglones: Renglon[];
	cursor: string | null;
	hay_mas: boolean;
}

describe("Inventario en aduana", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	const inventario = async (parametros: Record<string, string> = {}) =>
		(await comoAduana(servidor, "inventario.inventario_en_aduana", parametros)) as unknown as Inventario;

	it("el cuadre con Aduana resaltada y su total, que es la suma de las piezas de cada ubicación", async () => {
		const datos = await inventario();
		expect(datos.cuadre.map((ubicacion) => ubicacion.nombre)).toEqual([
			"Aduana",
			"Bodega",
			"Tienda 1",
			"Tienda 2",
			"Taller",
			"Tránsito",
			"En camino a aduana",
		]);
		expect(datos.cuadre.filter((ubicacion) => ubicacion.resaltada).map((ubicacion) => ubicacion.nombre)).toEqual([
			"Aduana",
		]);
		expect(datos.total).toBe(datos.cuadre.reduce((suma, ubicacion) => suma + ubicacion.piezas, 0));
		expect(datos.total).toBe(Number(await valorDe(servidor, "SELECT coalesce(sum(piezas), 0) FROM existencias")));
	});

	it("de lo más viejo a lo más nuevo, con su botón, sus etiquetas y lo que regresa al proveedor", async () => {
		const aTienda = await traspasoEnAduana(servidor, "T2");
		const enLinea = await surtirPedidoLinea(servidor, (await pedidoLineaEnBodega(servidor, 1)).id);
		await recibirCompletoEnAduana(servidor, enLinea.traspasoId ?? "");
		// Una orden que llega con 20 m de más: Dirección rechaza lo de más y regresa desde aduana.
		const orden = await ordenParaRecibir(servidor, 100);
		await recibirDePrueba(servidor, orden, [
			{ metros: "60", partida: "P-1" },
			{ metros: "60", partida: "P-1" },
		]);
		const autorizacion = await valorDe(
			servidor,
			"SELECT id FROM autorizaciones WHERE tipo = 'recepcion_de_mas' ORDER BY creado_en DESC LIMIT 1",
		);
		await decidirDePrueba(servidor, autorizacion, { decision: "rechazar", motivo: "Solo pedimos cien metros" });
		const datos = await inventario();
		const llegadas = datos.renglones.map((renglon) => renglon.traspaso_id);
		expect(llegadas.indexOf(aTienda.id)).toBeLessThan(llegadas.indexOf(enLinea.traspasoId ?? ""));
		expect(datos.renglones.find((renglon) => renglon.traspaso_id === aTienda.id)?.boton).toBe("despachar");
		expect(datos.renglones.find((renglon) => renglon.traspaso_id === enLinea.traspasoId)?.boton).toBe("ver_pedido");
		const regresa = datos.renglones.find((renglon) => renglon.boton === "devolver");
		expect(regresa?.titulo).toMatch(/^Regresa a /);
		expect(regresa?.detalle).toBe(`${orden.folio} · lo de más que rechazó Dirección`);
		expect(regresa?.devolucion?.es_tela).toBe(true);
		expect(regresa?.devolucion?.cantidad).toBe("20");
		expect(regresa?.devolucion?.rollos).toHaveLength(2);
		const delMaterial = datos.renglones.find((renglon) => renglon.titulo.startsWith("Gabardina de prueba"));
		expect(delMaterial?.detalle).toMatch(/ · 2 rollos$/);
		expect(delMaterial?.etiquetas_por_imprimir).toBe(true);
		const pagina = await inventario({ limite: "1" });
		expect(pagina.renglones).toHaveLength(1);
		expect(pagina.hay_mas).toBe(true);
		const siguiente = await inventario({ limite: "1", cursor: pagina.cursor ?? "" });
		expect(siguiente.renglones[0]?.traspaso_id).toBe(datos.renglones[1]?.traspaso_id);
	});

	it("solo la pide Aduana, sin precios ni costos", async () => {
		await soloAduanaYSinPrecios(servidor, "inventario.inventario_en_aduana");
	});
});
