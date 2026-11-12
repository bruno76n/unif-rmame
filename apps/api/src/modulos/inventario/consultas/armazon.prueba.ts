/**
 * Prueba de lo que Inventario pone en el armazón: las pastillas de Aduana y Bodega cuentan lo que dice su archivo y se
 * ponen rojas cuando algo urge, cada cuenta ve solo las suyas; y «¿Dónde está?» encuentra por código o por prenda y
 * talla, con las piezas de cada ubicación, lo apartado y lo libre.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «El menú solo muestra los departamentos de la cuenta, cada
 * pastilla cuenta lo que dice su archivo…» y «¿Dónde está? encuentra por código o por prenda y talla, con las piezas
 * de cada ubicación»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	meterPiezas,
	nuevoTraspaso,
	ubicacionesPorCodigo,
	variantesLibres,
} from "../../../nucleo/pruebas/inventario-de-prueba.ts";
import { pedidoLineaEnBodega } from "../../../nucleo/pruebas/linea-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Una pastilla. */
interface Pastilla {
	conteo: number;
	rojo: boolean;
}

describe("Las pastillas de Aduana y Bodega y «¿Dónde está?»", () => {
	let servidor: ServidorDePrueba;
	let ubicacion: Record<string, string>;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		ubicacion = await ubicacionesPorCodigo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Las pastillas como las ve una cuenta. */
	async function pastillas(quien: string) {
		const respuesta = await pedirConsulta(servidor, "inventario.pastillas_menu", {}, quien);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		return respuesta.cuerpo.resultado as { aduana: Pastilla | null; bodega: Pastilla | null };
	}

	it("Bodega suma sus excepciones y se pone roja con un pedido en línea por surtir; cada cuenta ve solo la suya", async () => {
		const antes = await pastillas("bodega");
		expect(antes.aduana).toBeNull();
		await servidor.base.dueno.query(
			`INSERT INTO excepciones (id, tipo, area, estado, descripcion, ubicacion_id, detectada_en)
			 VALUES ($1, 'reserva_sin_documento', 'bodega', 'por_revisar', 'Prueba de la pastilla', $2, now())`,
			[uuidv7(), ubicacion.BOD],
		);
		const conExcepcion = await pastillas("bodega");
		expect(conExcepcion.bodega?.conteo).toBe((antes.bodega?.conteo ?? 0) + 1);
		await pedidoLineaEnBodega(servidor);
		const conPedido = await pastillas("bodega");
		expect(conPedido.bodega).toEqual({ conteo: (conExcepcion.bodega?.conteo ?? 0) + 1, rojo: true });
		expect((await pastillas("aduana")).bodega).toBeNull();
		expect((await pedirConsulta(servidor, "inventario.pastillas_menu", {}, "ventas")).estado).toBe(403);
	});

	it("Aduana cuenta lo parado en aduana y se pone roja si algo sale hoy o mañana", async () => {
		const antes = await pastillas("aduana");
		const [variante = ""] = await variantesLibres(servidor, 1);
		const traspaso = await nuevoTraspaso(servidor, {
			tipo: "lote_temporada",
			estado: "en_aduana",
			origen: { ubicacionId: ubicacion.TAL ?? "" },
			destino: { ubicacionId: ubicacion.BOD ?? "" },
			renglones: [{ varianteId: variante, piezas: 2 }],
		});
		// Lleva cuatro días en aduana (más de las 72 horas de «parado») y sale hoy.
		await servidor.base.dueno.query(
			"UPDATE traspasos SET llego_aduana_en = now() - interval '4 days', fecha_salida_esperada = current_date WHERE id = $1",
			[traspaso.traspasoId],
		);
		expect((await pastillas("aduana")).aduana).toEqual({ conteo: (antes.aduana?.conteo ?? 0) + 1, rojo: true });
	});

	it("«¿Dónde está?» encuentra por código y por prenda y talla, con sus piezas, lo apartado y lo libre", async () => {
		const [variante = ""] = await variantesLibres(servidor, 1);
		await meterPiezas(servidor, ubicacion.BOD ?? "", variante, 5);
		await meterPiezas(servidor, ubicacion.ADU ?? "", variante, 2);
		const { rows } = await servidor.base.dueno.query(
			`SELECT v.codigo, p.nombre AS prenda, t.nombre AS talla FROM variantes v JOIN productos p ON p.id = v.producto_id
			 JOIN tallas t ON t.id = v.talla_id WHERE v.id = $1`,
			[variante],
		);
		const [{ codigo, prenda, talla }] = rows as [{ codigo: string; prenda: string; talla: string }];
		const porCodigo = await pedirConsulta(servidor, "inventario.donde_esta", { texto: codigo }, "bodega");
		expect(porCodigo.estado, JSON.stringify(porCodigo.cuerpo)).toBe(200);
		const [encontrada] = (
			porCodigo.cuerpo.resultado as { variantes: { ubicaciones: { codigo: string; piezas: number }[] }[] }
		).variantes;
		expect(encontrada).toMatchObject({ variante_id: variante, prenda, talla, total: 7, comprometidas: 0, libres: 7 });
		const deUbicaciones = (encontrada?.ubicaciones ?? []).map((lugar) => [lugar.codigo, lugar.piezas] as const);
		expect(deUbicaciones).toContainEqual(["BOD", 5]);
		expect(deUbicaciones).toContainEqual(["ADU", 2]);
		expect(deUbicaciones.map(([codigoDe]) => codigoDe)).not.toContain("TAL");
		// Por prenda y talla: una palabra de la prenda y su talla.
		const palabra = prenda.split(" ")[0] ?? prenda;
		const porNombre = await pedirConsulta(
			servidor,
			"inventario.donde_esta",
			{ texto: `${palabra} ${talla}`, limite: "5" },
			"direccion",
		);
		const nombres = (porNombre.cuerpo.resultado as { variantes: { talla: string; prenda: string }[] }).variantes;
		expect(nombres.length).toBeGreaterThan(0);
		expect(nombres.every((una) => una.talla.toLowerCase() === talla.toLowerCase() || una.prenda.includes(talla))).toBe(
			true,
		);
		// Sin resultados, vacío; sin Aduana, Bodega ni Dirección, 403.
		const nada = await pedirConsulta(servidor, "inventario.donde_esta", { texto: "zzzz inexistente" }, "bodega");
		expect(nada.cuerpo.resultado).toEqual({ variantes: [] });
		expect((await pedirConsulta(servidor, "inventario.donde_esta", { texto: codigo }, "ventas")).estado).toBe(403);
	});
});
