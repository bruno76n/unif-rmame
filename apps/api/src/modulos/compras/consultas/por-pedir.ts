/**
 * `compras.por_pedir`: cada material activo con lo que pide su línea de tiempo: su estado y su línea, cuándo se acaba,
 * cuándo llegaría un pedido de hoy, lo que ya viene y su pedido sugerido; los meses del horizonte con su factor de
 * consumo; y la lista de proveedores.
 * Fase 19 · docs/interfaz/fabrica/compras.md («Por pedir») y docs/modulos/compras/proyeccion-de-material.md
 *
 * Todo sale de `compras.cuenta_material`: la pantalla no recalcula nada. El horizonte corto es
 * `compras.horizonte_corto_semanas`; el largo llega al fin del mes de `compras.fecha_regreso_clases`.
 */

import { cantidadConUnidad } from "@uniformame/compartido/calculos/compras";
import { plural } from "@uniformame/compartido/calculos/textos";
import { porPedir } from "@uniformame/compartido/contratos/compras/consultas-pestanas";
import { Temporal } from "temporal-polyfill";
import type { z } from "zod";
import { type ContextoDeAccion, implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import type { CuentaDeMaterial } from "../lecturas/cuenta-material.ts";
import { cuentas, cumpleBusqueda, datosDeMateriales, surtidores } from "./comun.ts";

/** Lo que regresa la consulta. */
type Resultado = z.infer<typeof porPedir.resultado>;

/** Los meses, en el orden de sus factores. */
const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** El lugar de cada estado: de lo más urgente a lo menos. */
const urgencia: Readonly<Record<CuentaDeMaterial["estado"], number>> = {
	sin_tiempo_de_entrega: 0,
	pedir_esta_semana: 1,
	alcanza: 2,
};

/**
 * Ordena de lo más urgente a lo menos: por estado y, dentro, por la fecha límite (sin consumo al final).
 * @param una Una cuenta.
 * @param otra Otra.
 */
export function porUrgencia(una: CuentaDeMaterial, otra: CuentaDeMaterial): number {
	return (
		urgencia[una.estado] - urgencia[otra.estado] ||
		otra.dias_sin_material - una.dias_sin_material ||
		(una.fecha_limite ?? "9999").localeCompare(otra.fecha_limite ?? "9999")
	);
}

/**
 * Cuánto alcanza lo libre: «Alcanza {n} días», «Ya no alcanza» o «Sin consumo».
 * @param cuenta La cuenta del material.
 * @param hoy Hoy.
 */
function alcanza(cuenta: CuentaDeMaterial, hoy: Temporal.PlainDate): string {
	if (cuenta.se_acaba === null) return "Sin consumo";
	const dias = hoy.until(Temporal.PlainDate.from(cuenta.se_acaba)).days;
	return dias <= 0 ? "Ya no alcanza" : `Alcanza ${plural(dias, "día", "días")}`;
}

/**
 * El horizonte de la línea de tiempo y sus meses con su factor.
 * @param accion El contexto de la lectura.
 * @param tipo Corto o hasta el regreso a clases.
 */
async function horizonteDe(accion: ContextoDeAccion, tipo: "corto" | "regreso_clases") {
	const hoy = accion.diaDeNegocio;
	const semanas = await parametroNumero(accion, "compras.horizonte_corto_semanas");
	const regreso = Temporal.PlainDate.from(
		String(await accion.lectura("admin.parametro", { clave: "compras.fecha_regreso_clases" })),
	);
	const finDelRegreso = regreso.with({ day: regreso.daysInMonth });
	const hasta = tipo === "corto" ? hoy.add({ weeks: semanas }) : finDelRegreso;
	const deLosMeses: Resultado["meses"] = [];
	for (let mes = hoy.with({ day: 1 }); Temporal.PlainDate.compare(mes, hasta) <= 0; mes = mes.add({ months: 1 })) {
		// Los factores se guardan en por ciento de un mes normal: 320 es 3.2 veces.
		const porciento = await parametroNumero(accion, `compras.factor_consumo_${meses[mes.month - 1]}`);
		deLosMeses.push({
			inicio: (Temporal.PlainDate.compare(mes, hoy) < 0 ? hoy : mes).toString(),
			nombre: mes.toLocaleString("es-MX", { month: "long" }),
			factor: String(porciento / 100),
		});
	}
	return {
		horizonte: {
			tipo,
			hasta: hasta.toString(),
			semanas,
			regreso_clases: regreso.toString(),
			mes_regreso: regreso.toLocaleString("es-MX", { month: "long" }),
		},
		meses: deLosMeses,
	};
}

export const consultaPorPedir = implementarConsulta(porPedir, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const hoy = accion.diaDeNegocio;
		const deMateriales = await cuentas(accion);
		const datos = await datosDeMateriales(accion, {});
		const pares = await surtidores(accion);
		const conProveedor = new Map<string, { proveedor_id: string; nombre: string }>();
		for (const par of pares) {
			if (par.activo) conProveedor.set(par.proveedorId, { proveedor_id: par.proveedorId, nombre: par.nombre });
		}
		const elegidos = datos.filter(
			(material) =>
				cumpleBusqueda(parametros.buscar, [material.nombre, material.proveedor]) &&
				(parametros.proveedor_id === undefined ||
					pares.some((par) => par.materialId === material.id && par.proveedorId === parametros.proveedor_id)),
		);
		const conCuenta = elegidos.flatMap((material) => {
			const cuenta = deMateriales[material.id];
			return cuenta === undefined ? [] : [{ material, cuenta }];
		});
		conCuenta.sort((uno, otro) => porUrgencia(uno.cuenta, otro.cuenta));
		return {
			hoy: hoy.toString(),
			...(await horizonteDe(accion, parametros.horizonte ?? "corto")),
			proveedores: [...conProveedor.values()].sort((uno, otro) => uno.nombre.localeCompare(otro.nombre, "es-MX")),
			materiales: conCuenta.map(({ material, cuenta }) => ({
				material_id: material.id,
				nombre: material.nombre,
				color: material.color,
				unidad: material.unidad,
				proveedor: material.proveedor,
				plazo: cuenta.plazo,
				estado: cuenta.estado,
				linea: cuenta.linea,
				alcanza: alcanza(cuenta, hoy),
				se_acaba: cuenta.se_acaba,
				llegaria_hoy: hoy.add({ days: cuenta.plazo }).toString(),
				dias_sin_material: cuenta.dias_sin_material,
				por_pedir: cuenta.por_pedir,
				por_pedir_texto: cantidadConUnidad(cuenta.por_pedir, material.unidad),
				llegadas: cuenta.en_camino.map((viene) => ({
					orden_compra_id: viene.orden_compra_id,
					folio: viene.folio,
					dia: viene.llegada_esperada,
					cantidad: viene.cantidad,
					atrasada: viene.atrasada,
				})),
				en_borrador: cuenta.en_borrador,
			})),
		};
	}),
}));
