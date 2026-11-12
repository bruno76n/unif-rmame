/**
 * Lo que comparten el conteo y la carga inicial: dónde se cuenta, quién, y que lo contado sea de lo que se cuenta.
 * Fase 14 · docs/modulos/inventario/conteos.md (reglas 1 y 6, «Permisos»)
 */

import { and, eq, inArray } from "drizzle-orm";
import { ErrorDeApi, errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { productos, secciones, variantes } from "../../catalogo/tablas.ts";
import { ubicaciones } from "../tablas.ts";
import type { Diferencia } from "./diferencias.ts";
import { nombreDeVariante } from "./reservas.ts";

/**
 * La ubicación donde se cuenta: Bodega o Aduana; y quien la cuenta: Bodega en las dos, Aduana solo en Aduana.
 * @throws `422 ubicacion_no_contable`; `403 sin_departamento` si Aduana cuenta en Bodega.
 */
export async function ubicacionContable(contexto: ContextoDeAccion, ubicacionId: string) {
	const [ubicacion] = await contexto.transaccion
		.select({ id: ubicaciones.id, nombre: ubicaciones.nombre, tipo: ubicaciones.tipo })
		.from(ubicaciones)
		.where(eq(ubicaciones.id, ubicacionId));
	if (ubicacion === undefined || (ubicacion.tipo !== "bodega" && ubicacion.tipo !== "aduana")) {
		throw errorDeRegla("ubicacion_no_contable", "Aquí solo se cuenta en Bodega o en Aduana.");
	}
	const { quien } = contexto;
	const deBodega = quien.tipo === "cuenta" && (quien.esDuena || quien.departamentos.includes("bodega"));
	if (ubicacion.tipo === "bodega" && !deBodega) throw new ErrorDeApi("sin_permiso", "sin_departamento");
	return { ...ubicacion, departamento: deBodega ? ("bodega" as const) : ("aduana" as const) };
}

/**
 * Las variantes contadas tienen que ser de lo que se cuenta: de la sección, o la de la diferencia.
 * @throws `422 variante_ajena`: «{prenda} talla {t} no es de {sección}.».
 */
export async function revisarVariantes(
	contexto: ContextoDeAccion,
	varianteIds: readonly string[],
	de: { seccionId: string } | { productoId: string } | { toda: true } | { diferencia: Diferencia },
): Promise<string> {
	const { transaccion } = contexto;
	if ("diferencia" in de) {
		const ajena = varianteIds.find((id) => id !== de.diferencia.varianteId);
		if (ajena !== undefined) {
			const { prenda, talla } = await nombreDeVariante(transaccion, ajena);
			throw errorDeRegla("variante_ajena", `${prenda} talla ${talla} no es de ${de.diferencia.folio}.`);
		}
		return de.diferencia.folio;
	}
	if ("toda" in de) return "todo";
	if ("productoId" in de) {
		const [producto] = await transaccion
			.select({ nombre: productos.nombre })
			.from(productos)
			.where(eq(productos.id, de.productoId));
		if (producto === undefined) throw errorDeCampo("producto_id", "Elige la prenda que vas a contar.");
		const suyas = await transaccion
			.select({ id: variantes.id })
			.from(variantes)
			.where(and(inArray(variantes.id, [...varianteIds]), eq(variantes.productoId, de.productoId)));
		await sinAjenas(contexto, varianteIds, suyas, producto.nombre);
		return producto.nombre;
	}
	const [seccion] = await transaccion
		.select({ nombre: secciones.nombre })
		.from(secciones)
		.where(eq(secciones.id, de.seccionId));
	if (seccion === undefined) throw errorDeCampo("seccion_id", "Elige la sección que vas a contar.");
	const deLaSeccion = await transaccion
		.select({ id: variantes.id })
		.from(variantes)
		.innerJoin(productos, eq(productos.id, variantes.productoId))
		.where(and(inArray(variantes.id, [...varianteIds]), eq(productos.seccionId, de.seccionId)));
	await sinAjenas(contexto, varianteIds, deLaSeccion, seccion.nombre);
	return seccion.nombre;
}

/**
 * Revisa que todas las variantes estén entre las de lo que se cuenta.
 * @throws `422 variante_ajena`: «{prenda} talla {t} no es de {lo que se cuenta}.».
 */
async function sinAjenas(
	contexto: ContextoDeAccion,
	varianteIds: readonly string[],
	suyas: readonly { id: string }[],
	nombre: string,
): Promise<void> {
	const ajena = varianteIds.find((id) => !suyas.some((suya) => suya.id === id));
	if (ajena === undefined) return;
	const { prenda, talla } = await nombreDeVariante(contexto.transaccion, ajena);
	throw errorDeRegla("variante_ajena", `${prenda} talla ${talla} no es de ${nombre}.`);
}
