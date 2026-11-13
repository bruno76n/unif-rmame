/**
 * Prueba de `patronaje.recetas` y `patronaje.receta` con los datos de la muestra: la lista en sus tres grupos con su
 * orden, la búsqueda y la sección; y la página de una receta (sus tallas, sus materiales con su conversión, el próximo
 * corte con sus piezas, el desperdicio estimado o medido, el patrón contra el corte, sus versiones y una versión vieja,
 * y la receta nueva con su tela y su avío). Solo Patronaje las pide, sin dinero.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/patronaje.md («Recetas» y «La página de
 * la receta»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mandarAccion, pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** Una prenda de la lista, lo que se revisa. */
interface PrendaDeLaLista {
	producto_id: string;
	prenda: string;
	para: string;
	tallas: { rango: string; cuantas: number };
	tela: { nombre: string; texto: string } | null;
	materiales: number | null;
	corte: { fecha: string; texto: string; rojo: boolean; detalle: string } | null;
	desperdicio: { texto: string; rojo: boolean; detalle: string } | null;
	estado: { texto: string; color: string };
}

/** Lo que regresa `patronaje.recetas`. */
interface Lista {
	secciones: { seccion_id: string; nombre: string }[];
	total: number;
	grupos: { clave: string; nombre: string; color: string; prendas: PrendaDeLaLista[] }[];
}

/** Lo que regresa `patronaje.receta`, lo que se revisa. */
interface Receta {
	prenda: string;
	estado: { texto: string; color: string };
	version: number;
	vigente: number | null;
	viendo: number | null;
	tallas: { talla_id: string; nombre: string; especial: boolean }[];
	talla_base_id: string | null;
	proximo_corte: { texto: string; lote: string; piezas: number; piezas_por_talla: { piezas: number }[] } | null;
	desperdicio: { pct: string; texto: string; para_cortar: string };
	medidas: unknown[];
	lineas: {
		papel: string;
		material_id: string;
		modo: string;
		unidad_receta: string;
		cantidad: string | null;
		tallas: { talla_id: string; cantidad: string }[];
		receta_por_unidad_inventario: string;
	}[];
	materiales: {
		material_id: string;
		nombre: string;
		tipo: string;
		unidad: string;
		unidad_captura: string;
		receta_por_unidad_inventario: string;
		se_cuenta_entera: boolean;
	}[];
	patron_contra_corte: { tela: string; tallas: { lotes: number; desperdicio: string | null }[] } | null;
	versiones: { numero: number; vigente: boolean; motivo: string; persona: string; lotes: string[] }[];
}

describe("patronaje.recetas y patronaje.receta: la lista de recetas y la página de una receta", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/**
	 * El id de una prenda de la muestra, por su nombre.
	 * @param nombre Su nombre.
	 */
	async function prenda(nombre: string): Promise<string> {
		const { rows } = await servidor.base.dueno.query("SELECT id FROM productos WHERE nombre = $1 LIMIT 1", [nombre]);
		return String(rows[0]?.id);
	}

	/** Pide la lista como Patronaje. */
	async function lista(parametros: Record<string, string> = {}): Promise<Lista> {
		const respuesta = await pedirConsulta(servidor, "patronaje.recetas", parametros, "patronaje");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|costo/);
		return respuesta.cuerpo.resultado as Lista;
	}

	/** Pide la receta de una prenda como Patronaje. */
	async function receta(productoId: string, version?: number): Promise<Receta> {
		const respuesta = await pedirConsulta(
			servidor,
			"patronaje.receta",
			{ producto_id: productoId, ...(version === undefined ? {} : { version_numero: String(version) }) },
			"patronaje",
		);
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|costo/);
		return respuesta.cuerpo.resultado as Receta;
	}

	it("la lista: tres grupos en su orden, los que tienen corte primero, con su tela, su corte y su desperdicio", async () => {
		const leida = await lista();
		expect(leida.grupos.map((grupo) => [grupo.clave, grupo.nombre, grupo.color])).toEqual([
			["sin_receta", "Sin receta", "rojo"],
			["sin_verificar", "Capturada sin verificar", "ambar"],
			["verificada", "Verificada contra corte", "verde"],
		]);
		expect(leida.total).toBe(leida.grupos.reduce((suma, grupo) => suma + grupo.prendas.length, 0));
		// Accesorios y servicios no lleva receta.
		expect(leida.secciones.map((seccion) => seccion.nombre)).not.toContain("Accesorios y servicios");
		const [sinReceta] = leida.grupos;
		expect(sinReceta?.prendas.slice(0, 2).map((uno) => uno.prenda)).toEqual([
			"Playera polo blanca con escudo",
			"Chamarra azul cielo con escudo",
		]);
		const bata = sinReceta?.prendas.find((uno) => uno.prenda === "Bata blanca de laboratorio con escudo");
		expect(bata).toMatchObject({ tela: null, materiales: null, corte: null, desperdicio: null });
		const pantalon = leida.grupos[1]?.prendas.find((uno) => uno.prenda === "Pantalón azul marino");
		expect(pantalon?.tela?.texto).toMatch(/^\d+\.\d{2} m en talla .+$/);
		expect(pantalon?.materiales).toBeGreaterThan(1);
		// Sin verificar y su corte ya pasó: en rojo.
		expect(pantalon?.corte).toMatchObject({ rojo: true });
		expect(pantalon?.corte?.detalle).toMatch(/^L-\d{4}-\d+ · \d+ pzas$/);
		expect(pantalon?.tallas.rango).toMatch(/^.+ a .+$/);
		const pants = leida.grupos[2]?.prendas.find((uno) => uno.prenda === "Pants marino liso");
		expect(pants?.desperdicio?.texto).toMatch(/^\+\d+%$/);
		expect(pants?.desperdicio?.detalle).toBe("1 lote · dato flojo");
		expect(pants?.estado).toEqual({ texto: "Verificada", color: "verde" });
	});

	it("la búsqueda encuentra por prenda o por escuela, y la sección filtra", async () => {
		const polo = await lista({ buscar: "polo" });
		const todas = polo.grupos.flatMap((grupo) => grupo.prendas);
		expect(todas.length).toBeGreaterThan(0);
		expect(todas.every((uno) => uno.prenda.toLowerCase().includes("polo"))).toBe(true);
		const { rows } = await servidor.base.dueno.query("SELECT nombre FROM escuelas ORDER BY nombre LIMIT 1");
		const escuela = String(rows[0]?.nombre);
		const deEscuela = (await lista({ buscar: escuela })).grupos.flatMap((grupo) => grupo.prendas);
		expect(deEscuela.length).toBeGreaterThan(0);
		expect(deEscuela.every((uno) => uno.para === escuela)).toBe(true);
		const nada = await lista({ buscar: "ninguna prenda se llama así" });
		expect(nada.total).toBe(0);
		const [seccion] = (await lista()).secciones;
		const deSeccion = await lista({ seccion_id: seccion?.seccion_id ?? "" });
		expect(deSeccion.total).toBeGreaterThan(0);
		expect(deSeccion.total).toBeLessThan((await lista()).total);
	});

	it("la receta: sus tallas, la tela principal primero, sus materiales con su conversión y el corte con sus piezas", async () => {
		const leida = await receta(await prenda("Pantalón azul marino"));
		expect(leida.estado).toEqual({ texto: "Sin verificar", color: "ambar" });
		expect(leida.vigente).toBe(1);
		expect(leida.viendo).toBeNull();
		expect(leida.tallas.length).toBeGreaterThan(2);
		expect(leida.tallas.map((talla) => talla.talla_id)).toContain(leida.talla_base_id);
		expect(leida.lineas[0]).toMatchObject({ papel: "tela_principal", modo: "por_talla", unidad_receta: "m" });
		expect(leida.lineas[0]?.tallas.length).toBeGreaterThan(0);
		expect(leida.lineas.slice(1).every((linea) => linea.papel === "avio")).toBe(true);
		// El hilo se captura en metros y se guarda en conos de 5,000 m; la tela, en metros.
		const hilo = leida.materiales.find((material) => material.nombre === "Hilo poliéster marino");
		expect(hilo).toMatchObject({ unidad: "conos", unidad_captura: "m", se_cuenta_entera: true });
		expect(Number(hilo?.receta_por_unidad_inventario)).toBe(5000);
		const resorte = leida.materiales.find((material) => material.nombre === "Resorte 3 cm blanco");
		expect(resorte).toMatchObject({ unidad_captura: "cm" });
		expect(Number(resorte?.receta_por_unidad_inventario)).toBe(100);
		// Lo que no se captura en m, cm ni pza no se ofrece.
		expect(leida.materiales.map((material) => material.nombre)).not.toContain("Aceite para máquina");
		expect(leida.proximo_corte?.texto).toMatch(/^\d{1,2} [a-z]{3} · hace \d+ días · L-\d{4}-\d+, \d+ piezas$/);
		expect(leida.proximo_corte?.piezas_por_talla.reduce((suma, talla) => suma + talla.piezas, 0)).toBe(
			leida.proximo_corte?.piezas,
		);
		expect(leida.desperdicio).toEqual({
			pct: "6.000",
			texto: "+6% estimado, sin medir en corte",
			para_cortar: "con 6% de desperdicio, estimado",
		});
		expect(leida.patron_contra_corte).toBeNull();
		expect(leida.versiones).toEqual([expect.objectContaining({ numero: 1, vigente: true, motivo: "Captura inicial" })]);
	});

	it("la verificada trae su patrón contra corte y los lotes cortados con su versión", async () => {
		const leida = await receta(await prenda("Pants marino liso"));
		expect(leida.estado.texto).toBe("Verificada");
		expect(leida.desperdicio.texto).toMatch(/^\+\d+% sobre el patrón, 1 lote$/);
		expect(leida.patron_contra_corte?.tallas.some((talla) => talla.lotes === 1)).toBe(true);
		expect(leida.versiones[0]?.lotes).toHaveLength(1);
	});

	it("sin receta: todavía no hay versión y empieza con su tela y el avío que llevan las demás", async () => {
		const leida = await receta(await prenda("Bata blanca de laboratorio con escudo"));
		expect(leida).toMatchObject({ vigente: null, versiones: [], estado: { texto: "Sin receta", color: "rojo" } });
		expect(leida.lineas.map((linea) => linea.papel)).toEqual(["tela_principal", "avio"]);
		const [tela, avio] = leida.lineas;
		expect(leida.materiales.find((material) => material.material_id === tela?.material_id)?.tipo).toBe("tela");
		expect(leida.materiales.find((material) => material.material_id === avio?.material_id)?.nombre).toBe(
			"Etiqueta tejida de talla",
		);
		expect(tela?.tallas).toEqual([]);
	});

	it("una versión vieja se ve tal como se guardó", async () => {
		const productoId = await prenda("Pantalón gris oxford");
		const antes = await receta(productoId);
		const lineas = antes.lineas.map((linea, orden) => ({
			papel: linea.papel,
			material_id: linea.material_id,
			modo: linea.modo,
			unidad_receta: linea.unidad_receta,
			...(linea.modo === "igual"
				? { cantidad: linea.cantidad ?? "" }
				: {
						tallas: linea.tallas.map((talla) => ({
							talla_id: talla.talla_id,
							cantidad: linea.papel === "tela_principal" ? "1.5" : talla.cantidad,
						})),
					}),
			orden,
		}));
		const guardada = await mandarAccion(
			servidor,
			"patronaje.guardar_receta",
			{
				datos: { producto_id: productoId, motivo: "Más tela en todas las tallas", medidas: [], lineas },
				version: antes.version,
			},
			"patronaje",
		);
		expect(guardada.estado, JSON.stringify(guardada.cuerpo)).toBe(200);
		const nueva = await receta(productoId);
		expect(nueva.vigente).toBe(2);
		expect(nueva.versiones.map((version) => [version.numero, version.vigente])).toEqual([
			[2, true],
			[1, false],
		]);
		expect(nueva.versiones[0]?.motivo).toBe("Más tela en todas las tallas");
		const vieja = await receta(productoId, 1);
		expect(vieja.viendo).toBe(1);
		expect(vieja.lineas).toEqual(antes.lineas);
		expect(
			(await pedirConsulta(servidor, "patronaje.receta", { producto_id: productoId, version_numero: "9" }, "patronaje"))
				.estado,
		).toBe(404);
	});

	it("solo Patronaje las pide; una prenda de Accesorios y servicios no tiene receta", async () => {
		expect((await pedirConsulta(servidor, "patronaje.recetas", {}, "ventas")).estado).toBe(403);
		const productoId = await prenda("Pantalón azul marino");
		expect((await pedirConsulta(servidor, "patronaje.receta", { producto_id: productoId }, "bodega")).estado).toBe(403);
		const servicio = await prenda("Bordado de nombre");
		expect((await pedirConsulta(servidor, "patronaje.receta", { producto_id: servicio }, "patronaje")).estado).toBe(
			404,
		);
	});
});
