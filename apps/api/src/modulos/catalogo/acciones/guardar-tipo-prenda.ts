/**
 * `catalogo.guardar_tipo_prenda`: Catálogo agrega o cambia un tipo de prenda con sus medidas iniciales.
 * Fase 8 · docs/modulos/catalogo/tallas-y-tipos-de-prenda.md (reglas 11 y 12, «`catalogo.guardar_tipo_prenda`»)
 *
 * Es de una sección que lleva receta. Sus medidas van en centímetros, entre `patronaje.medida_cm_min` y
 * `patronaje.medida_cm_max`, con un número por talla que puede quedar vacío. Se mandan todas: una medida que
 * ya no viene queda con baja. Fase 12: su flujo por omisión, que tiene que estar vigente.
 */

import { guardarTipoPrenda } from "@uniformame/compartido/contratos/catalogo/tallas";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { flujoEscogido } from "../dominio/productos.ts";
import { secciones, tallas, tipoPrendaMedidas, tiposPrenda } from "../tablas.ts";

/** Una medida como se manda: su nombre, su orden y sus valores por talla. */
type MedidaPedida = {
	medida: string;
	orden: number;
	valores: { talla_id: string; valor_cm: number | null }[];
};

/**
 * Revisa las medidas: que no se repitan, que sus tallas existan y que cada número esté en el rango.
 * @throws `422 medida_repetida`, `400` en `medidas`.
 */
async function revisarMedidas(contexto: ContextoDeAccion, medidas: readonly MedidaPedida[]): Promise<void> {
	const vistas = new Set<string>();
	for (const { medida } of medidas) {
		if (vistas.has(medida.toLowerCase())) throw errorDeRegla("medida_repetida", `${medida} ya está en las medidas`);
		vistas.add(medida.toLowerCase());
	}
	const tallaIds = [...new Set(medidas.flatMap((medida) => medida.valores.map((valor) => valor.talla_id)))];
	const deLasTallas =
		tallaIds.length === 0
			? []
			: await contexto.transaccion
					.select({ id: tallas.id, nombre: tallas.nombre })
					.from(tallas)
					.where(inArray(tallas.id, tallaIds));
	const nombreDe = new Map(deLasTallas.map((talla) => [talla.id, talla.nombre]));
	if (nombreDe.size !== tallaIds.length) throw errorDeCampo("medidas", "Escoge tallas que existan.");
	const minimo = Number(await contexto.lectura("admin.parametro", { clave: "patronaje.medida_cm_min" }));
	const maximo = Number(await contexto.lectura("admin.parametro", { clave: "patronaje.medida_cm_max" }));
	for (const { medida, valores } of medidas) {
		for (const { talla_id, valor_cm } of valores) {
			if (valor_cm !== null && (valor_cm < minimo || valor_cm > maximo)) {
				throw errorDeCampo(
					"medidas",
					`${medida}, talla ${nombreDe.get(talla_id)}: ${valor_cm} cm no parece medida de la prenda. Va en centímetros`,
				);
			}
		}
	}
}

/**
 * El tipo que se guarda: el que existe, con su versión tomada, o uno nuevo. Revisa que el nombre no se repita.
 * @returns Su id, si es nuevo y cómo estaba.
 */
async function tipoQueSeGuarda(
	contexto: ContextoDeAccion,
	datos: {
		tipo_prenda_id?: string | undefined;
		nombre: string;
		seccion_id: string;
		flujo_defecto_id?: string | null | undefined;
		version?: number | undefined;
	},
) {
	const { transaccion } = contexto;
	const repetido = errorDeRegla("tipo_repetido", "Ese tipo de prenda ya existe.");
	if (datos.tipo_prenda_id === undefined) {
		const id = uuidv7();
		const [creado] = await transaccion
			.insert(tiposPrenda)
			.values({
				id,
				nombre: datos.nombre,
				seccionId: datos.seccion_id,
				flujoDefectoId: datos.flujo_defecto_id ?? null,
				orden: sql`(SELECT coalesce(max(orden), 0) + 1 FROM tipos_prenda)`,
				creadoPor: quienCambia(contexto),
			})
			.onConflictDoNothing()
			.returning({ id: tiposPrenda.id });
		if (creado === undefined) throw repetido;
		return { id, antes: undefined };
	}
	const [tipo] = await transaccion.select().from(tiposPrenda).where(eq(tiposPrenda.id, datos.tipo_prenda_id));
	if (tipo === undefined) throw noExiste();
	await tomarVersion(contexto, tiposPrenda, tipo.id, datos.version, async () => ({
		tipo_prenda_id: tipo.id,
		nombre: tipo.nombre,
	}));
	const [otro] = await transaccion
		.select({ id: tiposPrenda.id })
		.from(tiposPrenda)
		.where(sql`lower(${tiposPrenda.nombre}) = lower(${datos.nombre}) and ${tiposPrenda.id} <> ${tipo.id}`);
	if (otro !== undefined) throw repetido;
	await transaccion
		.update(tiposPrenda)
		.set({
			nombre: datos.nombre,
			seccionId: datos.seccion_id,
			...(datos.flujo_defecto_id === undefined ? {} : { flujoDefectoId: datos.flujo_defecto_id }),
		})
		.where(eq(tiposPrenda.id, tipo.id));
	return { id: tipo.id, antes: tipo };
}

/**
 * Las medidas vigentes de un tipo, como van en la bitácora.
 * @returns Por medida, sus valores por talla.
 */
async function medidasDe(contexto: ContextoDeAccion, tipoId: string) {
	return contexto.transaccion
		.select({
			medida: tipoPrendaMedidas.medida,
			talla_id: tipoPrendaMedidas.tallaId,
			valor_cm: tipoPrendaMedidas.valorCm,
		})
		.from(tipoPrendaMedidas)
		.where(and(eq(tipoPrendaMedidas.tipoPrendaId, tipoId), isNull(tipoPrendaMedidas.bajaEn)))
		.orderBy(tipoPrendaMedidas.orden, tipoPrendaMedidas.tallaId);
}

export const accionGuardarTipoPrenda = implementarAccion(guardarTipoPrenda, async (contexto, datos) => {
	const { transaccion } = contexto;
	const [seccion] = await transaccion.select().from(secciones).where(eq(secciones.id, datos.seccion_id));
	if (seccion === undefined) throw errorDeCampo("seccion_id", "Escoge la sección.");
	if (!seccion.llevaReceta) {
		throw errorDeRegla("seccion_sin_receta", `${seccion.nombre} no lleva receta: sus productos no tienen medidas.`);
	}
	await revisarMedidas(contexto, datos.medidas);
	if (datos.flujo_defecto_id != null) await flujoEscogido(contexto, datos.flujo_defecto_id, "flujo_defecto_id");
	const tipo = await tipoQueSeGuarda(contexto, datos);
	const medidasAntes = tipo.antes === undefined ? [] : await medidasDe(contexto, tipo.id);
	const vigentes = await transaccion
		.select()
		.from(tipoPrendaMedidas)
		.where(and(eq(tipoPrendaMedidas.tipoPrendaId, tipo.id), isNull(tipoPrendaMedidas.bajaEn)));
	const llave = (medida: string, tallaId: string) => `${medida.toLowerCase()}|${tallaId}`;
	const pedidas = new Map(
		datos.medidas.flatMap((medida) =>
			medida.valores.map((valor) => [llave(medida.medida, valor.talla_id), { ...valor, ...medida }] as const),
		),
	);
	const quien = quienCambia(contexto);
	for (const vigente of vigentes) {
		const pedida = pedidas.get(llave(vigente.medida, vigente.tallaId));
		if (pedida === undefined) {
			// Una medida que ya no viene queda con baja.
			await transaccion
				.update(tipoPrendaMedidas)
				.set({ bajaEn: contexto.ahora.toString(), bajaPor: quien, motivoBaja: "Se quitó del tipo de prenda" })
				.where(eq(tipoPrendaMedidas.id, vigente.id));
			continue;
		}
		pedidas.delete(llave(vigente.medida, vigente.tallaId));
		const valor = pedida.valor_cm === null ? null : String(pedida.valor_cm);
		if (
			vigente.medida !== pedida.medida ||
			vigente.orden !== pedida.orden ||
			Number(vigente.valorCm) !== Number(valor)
		) {
			await transaccion
				.update(tipoPrendaMedidas)
				.set({ medida: pedida.medida, orden: pedida.orden, valorCm: valor })
				.where(eq(tipoPrendaMedidas.id, vigente.id));
		}
	}
	const nuevas = [...pedidas.values()].map((pedida) => ({
		id: uuidv7(),
		tipoPrendaId: tipo.id,
		medida: pedida.medida,
		orden: pedida.orden,
		tallaId: pedida.talla_id,
		valorCm: pedida.valor_cm === null ? null : String(pedida.valor_cm),
		creadoPor: quien,
	}));
	if (nuevas.length > 0) await transaccion.insert(tipoPrendaMedidas).values(nuevas);
	const medidasDespues = await medidasDe(contexto, tipo.id);
	const cambios = [
		...(tipo.antes === undefined ? ["nuevo"] : []),
		...(tipo.antes !== undefined && tipo.antes.nombre !== datos.nombre ? ["nombre"] : []),
		...(tipo.antes !== undefined && tipo.antes.seccionId !== datos.seccion_id ? ["sección"] : []),
		...(tipo.antes !== undefined &&
		datos.flujo_defecto_id !== undefined &&
		tipo.antes.flujoDefectoId !== datos.flujo_defecto_id
			? ["flujo"]
			: []),
		...(JSON.stringify(medidasAntes) !== JSON.stringify(medidasDespues) ? ["medidas"] : []),
	];
	contexto.bitacora({
		descripcion: `Tipo de prenda ${datos.nombre}: ${cambios.length === 0 ? "sin cambios" : cambios.join(", ")}`,
		entidad: "tipos_prenda",
		entidadId: tipo.id,
		...(tipo.antes === undefined
			? {}
			: {
					antes: {
						nombre: tipo.antes.nombre,
						seccion_id: tipo.antes.seccionId,
						flujo_defecto_id: tipo.antes.flujoDefectoId,
						medidas: medidasAntes,
					},
				}),
		despues: {
			nombre: datos.nombre,
			seccion_id: datos.seccion_id,
			flujo_defecto_id: datos.flujo_defecto_id ?? tipo.antes?.flujoDefectoId ?? null,
			medidas: medidasDespues,
		},
	});
	contexto.guardarEvento({
		tipo: "tipo_prenda.guardado",
		datos: { tipo_prenda_id: tipo.id },
		tablas: ["tipos_prenda", "tipo_prenda_medidas"],
		entidad: "tipos_prenda",
		entidadId: tipo.id,
	});
	return {
		resultado: {
			tipo_prenda_id: tipo.id,
			version: await versionActual(transaccion, tiposPrenda, tipo.id),
			mensaje: `Tipo de prenda ${datos.nombre} guardado`,
		},
		entidad: { nombre: "tipos_prenda", id: tipo.id },
	};
});
