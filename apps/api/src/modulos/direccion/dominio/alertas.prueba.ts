/**
 * Prueba de las reglas de las alertas de Dirección: cada una sale cuando se cumple su regla, con su título, su color,
 * los departamentos que cruza y su «Ver», y desaparece cuando deja de cumplirse; todas salen en el orden de la tabla.
 * Fase 18 · docs/fases/18-tienda-en-linea-direccion-y-contador.md (criterio «Cada alerta sale cuando se cumple su
 * regla y desaparece cuando deja de cumplirse»)
 */

import { describe, expect, it } from "vitest";
import { alertasDeDireccion, type DatosDeLasAlertas, type ParametrosDeLasAlertas } from "./alertas.ts";

/** Sin nada fuera de lo normal. */
const tranquilo: DatosDeLasAlertas = {
	lotesAtorados: [],
	desperdicios: [],
	clienteQueMasDebe: null,
	descontinuados: [],
	materiales: [],
	aparatos: [],
	cuadre: { cuadre_id: "q1", fecha: "2026-11-11", estado: "cuadro", por_revisar: 0 },
};

/** Los valores iniciales de los parámetros. */
const parametros: ParametrosDeLasAlertas = {
	consumoTelaMax: 2,
	concentracionPct: 35,
	concentracionVencidoDias: 30,
	reposicionMax: 2,
};

/** Las alertas con unos datos cambiados. */
const con = (cambio: Partial<DatosDeLasAlertas>) => alertasDeDireccion({ ...tranquilo, ...cambio }, parametros);

describe("Cada alerta sale cuando se cumple su regla y desaparece cuando deja de cumplirse", () => {
	it("sin nada fuera de lo normal no sale ninguna", () => {
		expect(con({})).toEqual([]);
		expect(con({ cuadre: null })).toEqual([]);
	});

	it("lote detenido: por falta de avance, con sus días; por máquina, con la máquina parada; sin atorados, nada", () => {
		const lote = "0190a000-0000-7000-8000-000000000001";
		expect(
			con({ lotesAtorados: [{ lote_id: lote, folio: "L-2026-118", operacion: "Costados", dias: 3, falla: null }] }),
		).toEqual([
			{
				clave: `lote_detenido:${lote}`,
				regla: "lote_detenido",
				entidad: "lotes",
				entidadId: lote,
				titulo: "L-2026-118 detenido en Costados desde hace 3 días",
				color: "rojo",
				departamentos: ["produccion"],
				ver: `produccion/lotes?cajon=lote&id=${lote}`,
			},
		]);
		const [porMaquina] = con({
			lotesAtorados: [
				{ lote_id: lote, folio: "L-2026-118", operacion: "Costados", dias: 0, falla: "Recta 04 parada (FM-0007)" },
			],
		});
		expect(porMaquina).toMatchObject({
			titulo: "L-2026-118 detenido en Costados · Recta 04 parada (FM-0007)",
			departamentos: ["produccion", "mantenimiento"],
		});
	});

	it("consumo de tela: solo los altos, los de más desperdicio primero y hasta el máximo", () => {
		const prenda = (n: number, pct: number, alto: boolean) => ({
			producto_id: `p${n}`,
			producto: `Prenda ${n}`,
			desperdicio_pct: pct,
			alto,
		});
		const alertas = con({
			desperdicios: [prenda(1, 12.4, true), prenda(2, 9, false), prenda(3, 18, true), prenda(4, 14, true)],
		});
		expect(alertas.map((alerta) => alerta.titulo)).toEqual([
			"Prenda 3: consumo de tela 18% sobre patrón",
			"Prenda 4: consumo de tela 14% sobre patrón",
		]);
		expect(alertas[0]).toMatchObject({
			color: "ambar",
			clave: "consumo_tela:p3",
			departamentos: ["patronaje", "compras"],
		});
		expect(con({ desperdicios: [prenda(2, 9, false)] })).toEqual([]);
	});

	it("concentración: pasa del por ciento; roja con vencido, ámbar sin él; en el límite, no sale", () => {
		const cliente = { cliente_id: "c1", nombre: "Colegio Americano", parte_milesimas: 420, vencido_centavos: 0 };
		expect(con({ clienteQueMasDebe: cliente })).toEqual([
			expect.objectContaining({
				clave: "concentracion:c1",
				titulo: "Colegio Americano concentra el 42% del saldo por cobrar",
				color: "ambar",
			}),
		]);
		expect(con({ clienteQueMasDebe: { ...cliente, vencido_centavos: 1_234_500 } })).toEqual([
			expect.objectContaining({
				titulo: "Colegio Americano concentra el 42% del saldo por cobrar, con $12,345 de más de 30 días",
				color: "rojo",
			}),
		]);
		expect(con({ clienteQueMasDebe: { ...cliente, parte_milesimas: 350 } })).toEqual([]);
	});

	it("descontinuado: con piezas sale, uno por producto; sin piezas, no", () => {
		expect(con({ descontinuados: [{ producto_id: "p1", nombre: "Falda tableada", piezas: 14 }] })).toEqual([
			expect.objectContaining({
				clave: "descontinuado:p1",
				titulo: "Falda tableada descontinuado con 14 piezas en existencia",
				color: "ambar",
				departamentos: ["catalogo", "bodega"],
			}),
		]);
		expect(con({ descontinuados: [{ producto_id: "p1", nombre: "Falda tableada", piezas: 0 }] })).toEqual([]);
	});

	it("sin tiempo de reposición: solo ese estado, los que se acaban primero y hasta el máximo", () => {
		const material = (n: number, estado: string, seAcaba: string | null) => ({
			material_id: `m${n}`,
			nombre: `Material ${n}`,
			estado,
			se_acaba: seAcaba,
		});
		const alertas = con({
			materiales: [
				material(1, "sin_tiempo_de_entrega", "2026-12-01"),
				material(2, "pedir_esta_semana", "2026-11-15"),
				material(3, "sin_tiempo_de_entrega", "2026-11-20"),
				material(4, "sin_tiempo_de_entrega", null),
			],
		});
		expect(alertas.map((alerta) => [alerta.clave, alerta.titulo, alerta.color])).toEqual([
			["sin_reposicion:m3", "Material 3 sin tiempo de reposición", "rojo"],
			["sin_reposicion:m1", "Material 1 sin tiempo de reposición", "rojo"],
		]);
		expect(con({ materiales: [material(2, "alcanza", null)] })).toEqual([]);
	});

	it("aparato sin sincronizar: sale con su ubicación y su tiempo", () => {
		expect(
			con({
				aparatos: [{ dispositivo_id: "d1", nombre: "Tablet 2", ubicacion: "Taller", sin_sincronizar: "5 horas" }],
			}),
		).toEqual([
			expect.objectContaining({
				clave: "sin_sincronizar:d1",
				titulo: "Tablet 2 de Taller sin sincronizar desde hace 5 horas",
				color: "rojo",
				departamentos: ["admin"],
			}),
		]);
	});

	it("cuadre con residuo: sale solo con ese estado", () => {
		expect(con({ cuadre: { cuadre_id: "q1", fecha: "2026-11-11", estado: "con_residuo", por_revisar: 3 } })).toEqual([
			expect.objectContaining({
				clave: "cuadre_residuo:2026-11-11",
				entidad: "cuadres",
				entidadId: "q1",
				titulo: "El cuadre del 11 de noviembre dejó 3 cosas por revisar",
				color: "rojo",
			}),
		]);
		expect(con({ cuadre: { cuadre_id: "q1", fecha: "2026-11-11", estado: "fallo", por_revisar: 0 } })).toEqual([]);
	});

	it("todas a la vez salen en el orden de la tabla", () => {
		const alertas = con({
			cuadre: { cuadre_id: "q1", fecha: "2026-11-11", estado: "con_residuo", por_revisar: 1 },
			aparatos: [{ dispositivo_id: "d1", nombre: "Tablet 2", ubicacion: null, sin_sincronizar: "2 días" }],
			materiales: [{ material_id: "m1", nombre: "Gabardina", estado: "sin_tiempo_de_entrega", se_acaba: null }],
			descontinuados: [{ producto_id: "p9", nombre: "Falda", piezas: 1 }],
			clienteQueMasDebe: { cliente_id: "c1", nombre: "Colegio", parte_milesimas: 500, vencido_centavos: 0 },
			desperdicios: [{ producto_id: "p1", producto: "Camisa", desperdicio_pct: 11, alto: true }],
			lotesAtorados: [{ lote_id: "l1", folio: "L-1", operacion: "Corte", dias: 1, falla: null }],
		});
		expect(alertas.map((alerta) => alerta.regla)).toEqual([
			"lote_detenido",
			"consumo_tela",
			"concentracion",
			"descontinuado",
			"sin_reposicion",
			"sin_sincronizar",
			"cuadre_residuo",
		]);
		expect(alertas[5]?.titulo).toBe("Tablet 2 de sin ubicación sin sincronizar desde hace 2 días");
	});
});
