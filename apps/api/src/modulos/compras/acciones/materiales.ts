/**
 * `compras.crear_material`, `compras.guardar_material`, `compras.dar_baja_material` y
 * `compras.reactivar_material`: el material con su unidad, su conversión, cómo se pide, su baja y su reactivación.
 * Fase 10 · docs/modulos/compras/materiales.md (reglas 1 a 10, «Acciones»)
 *
 * El alta deja en una transacción el material sin existencia, su proveedor habitual con su último precio y el
 * primer precio del historial. La baja mira la existencia, las órdenes abiertas y las recetas vigentes.
 */

import {
	crearMaterial,
	darBajaMaterial,
	guardarMaterial,
	reactivarMaterial,
} from "@uniformame/compartido/contratos/compras/materiales";
import { and, eq, isNull, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { listas, listaValores } from "../../admin/tablas.ts";
import {
	eventoDeMaterial,
	leerMaterial,
	leerProveedor,
	type Material,
	parametroNumero,
	precioATexto,
	registrarPrecio,
	revisarPrecio,
	revisarProveedorActivo,
} from "../dominio/comunes.ts";
import { foliosDeOrdenesAbiertas } from "../dominio/ordenes.ts";
import { listaDeUnidades } from "../siembra.ts";
import { materiales } from "../tablas.ts";

/** El mensaje del costo del alta. */
const mensajeDelCosto = "Escribe el costo, por ejemplo 78 o 6.50";

/**
 * Lee una unidad activa de «Unidades de material».
 * @param contexto El contexto de la acción.
 * @param clave La clave de la unidad.
 * @returns Su nombre, o nada si no está.
 */
async function unidadDeLaLista(contexto: ContextoDeAccion, clave: string): Promise<string | undefined> {
	const [unidad] = await contexto.transaccion
		.select({ nombre: listaValores.nombre })
		.from(listaValores)
		.innerJoin(listas, eq(listas.id, listaValores.listaId))
		.where(and(eq(listas.clave, listaDeUnidades), eq(listaValores.clave, clave), isNull(listaValores.bajaEn)));
	return unidad?.nombre;
}

/**
 * Revisa los días que cubre un pedido contra `compras.dias_cubre_maximo`.
 * @throws `400` en `dias_cubre`: «Entre 1 y {máximo} días».
 */
async function revisarDiasCubre(contexto: ContextoDeAccion, dias: number): Promise<void> {
	const maximo = await parametroNumero(contexto, "compras.dias_cubre_maximo");
	if (dias < 1 || dias > maximo) throw errorDeCampo("dias_cubre", `Entre 1 y ${maximo} días`);
}

/** La conversión de un material: a la receta y a la tablet. */
interface Conversion {
	tipo: string;
	unidad: string;
	unidadReceta: string | null;
	factorReceta: string | null;
	unidadTablet: string | null;
	factorTablet: string | null;
}

/**
 * Revisa la conversión de un material: cada unidad con su factor, y la de la tablet solo en un consumible.
 * @throws `422 falta_conversion` («Escribe cuántas {unidad de receta} trae un {unidad}.» o «Escribe cuántas {unidad
 * de la tablet} hacen un {unidad}.»); `422 solo_consumible_en_tablet`.
 */
function revisarConversion(conversion: Conversion): void {
	if ((conversion.unidadReceta === null) !== (conversion.factorReceta === null)) {
		throw errorDeRegla(
			"falta_conversion",
			`Escribe cuántas ${conversion.unidadReceta ?? "unidades de receta"} trae un ${conversion.unidad}.`,
		);
	}
	if (conversion.unidadTablet !== null && conversion.tipo !== "consumible") {
		throw errorDeRegla("solo_consumible_en_tablet", "Solo un consumible se toma en la tablet.");
	}
	if ((conversion.unidadTablet === null) !== (conversion.factorTablet === null)) {
		throw errorDeRegla(
			"falta_conversion",
			`Escribe cuántas ${conversion.unidadTablet ?? "unidades de la tablet"} hacen un ${conversion.unidad}.`,
		);
	}
}

export const accionCrearMaterial = implementarAccion(crearMaterial, async (contexto, datos) => {
	const { transaccion } = contexto;
	await revisarPrecio(contexto, "costo_centavos", mensajeDelCosto, datos.costo_centavos);
	await revisarDiasCubre(contexto, datos.dias_cubre);
	const unidad = await unidadDeLaLista(contexto, datos.unidad);
	if (unidad === undefined) throw errorDeRegla("unidad_no_existe", "Escoge cómo se mide.");
	if (datos.tipo === "tela" && datos.unidad !== "m") throw errorDeRegla("tela_en_metros", "La tela se mide en metros.");
	const conversion: Conversion = {
		tipo: datos.tipo,
		unidad,
		unidadReceta: datos.unidad_receta ?? null,
		factorReceta: datos.factor_receta ?? null,
		unidadTablet: datos.unidad_tablet ?? null,
		factorTablet: datos.factor_tablet ?? null,
	};
	revisarConversion(conversion);
	// El proveedor, compartido: que nadie lo dé de baja mientras se vuelve habitual.
	const proveedor = await leerProveedor(contexto, datos.proveedor_id, "share");
	revisarProveedorActivo(proveedor);
	const id = uuidv7();
	const [creado] = await transaccion
		.insert(materiales)
		.values({
			id,
			nombre: datos.nombre,
			nombreNormalizado: sql`sin_acentos(${datos.nombre})`,
			tipo: datos.tipo,
			unidad: datos.unidad,
			presentacion: datos.presentacion ?? null,
			unidadReceta: conversion.unidadReceta,
			factorReceta: conversion.factorReceta,
			unidadTablet: conversion.unidadTablet,
			factorTablet: conversion.factorTablet,
			color: datos.color ?? null,
			minimo: String(datos.minimo),
			multiploCompra: String(datos.multiplo_compra),
			diasCubre: datos.dias_cubre,
			consumoDiarioInicial: datos.consumo_diario_inicial ?? null,
			proveedorHabitualId: proveedor.id,
			creadoPor: quienCambia(contexto),
		})
		.onConflictDoNothing()
		.returning({ id: materiales.id });
	if (creado === undefined) throw errorDeRegla("nombre_repetido", "Ya existe un material con ese nombre");
	await registrarPrecio(contexto, {
		materialId: id,
		proveedorId: proveedor.id,
		precioCentavos: datos.costo_centavos,
		origen: "alta",
	});
	eventoDeMaterial(contexto, "material.creado", id);
	contexto.bitacora({
		descripcion: `Material nuevo: ${datos.nombre}, ${unidad}, con ${proveedor.nombre} a ${precioATexto(datos.costo_centavos)}`,
		entidad: "materiales",
		entidadId: id,
		despues: {
			nombre: datos.nombre,
			tipo: datos.tipo,
			unidad: datos.unidad,
			proveedor_id: proveedor.id,
			costo_centavos: datos.costo_centavos,
		},
	});
	return {
		resultado: {
			material_id: id,
			mensaje: `${datos.nombre} ya está en Materiales. Lo que haya hoy lo registra Bodega como carga inicial`,
		},
		entidad: { nombre: "materiales", id },
	};
});

/** Cómo se llama cada campo de «Cómo se pide» en la bitácora, y su columna. */
const camposDeComoSePide = {
	minimo: ["mínimo", "minimo"],
	multiplo_compra: ["múltiplo de compra", "multiploCompra"],
	dias_cubre: ["cada pedido cubre", "diasCubre"],
	consumo_diario_inicial: ["consumo por día", "consumoDiarioInicial"],
	presentacion: ["presentación", "presentacion"],
	color: ["color", "color"],
	unidad_tablet: ["unidad de la tablet", "unidadTablet"],
	factor_tablet: ["factor de la tablet", "factorTablet"],
} as const satisfies Record<string, readonly [string, keyof Material]>;

/** Un campo de «Cómo se pide». */
type CampoDeComoSePide = keyof typeof camposDeComoSePide;

/**
 * Un decimal de «Cómo se pide» como lo regresa la base, con tres decimales, para compararlo con lo guardado.
 * @param valor Lo que llegó, o nada para vaciarlo.
 */
function comoSeGuarda(valor: string | null): string | null {
	return valor === null ? null : Number(valor).toFixed(3);
}

export const accionGuardarMaterial = implementarAccion(guardarMaterial, async (contexto, datos, version) => {
	const material = await leerMaterial(contexto, datos.material_id);
	await tomarVersion(contexto, materiales, material.id, version, async () => ({
		material_id: material.id,
		nombre: material.nombre,
	}));
	if (datos.dias_cubre !== undefined) await revisarDiasCubre(contexto, datos.dias_cubre);
	// Los enteros se guardan en `numeric(12,3)`: se comparan como se guardan.
	const pedido: Partial<Record<CampoDeComoSePide, string | number | null>> = {
		...(datos.minimo === undefined ? {} : { minimo: datos.minimo.toFixed(3) }),
		...(datos.multiplo_compra === undefined ? {} : { multiplo_compra: datos.multiplo_compra.toFixed(3) }),
		...(datos.dias_cubre === undefined ? {} : { dias_cubre: datos.dias_cubre }),
		...(datos.consumo_diario_inicial === undefined
			? {}
			: { consumo_diario_inicial: comoSeGuarda(datos.consumo_diario_inicial) }),
		...(datos.presentacion === undefined ? {} : { presentacion: datos.presentacion }),
		...(datos.color === undefined ? {} : { color: datos.color }),
		...(datos.unidad_tablet === undefined ? {} : { unidad_tablet: datos.unidad_tablet }),
		...(datos.factor_tablet === undefined ? {} : { factor_tablet: comoSeGuarda(datos.factor_tablet) }),
	};
	const cambios = (Object.keys(pedido) as CampoDeComoSePide[]).filter(
		(campo) => pedido[campo] !== material[camposDeComoSePide[campo][1]],
	);
	if (cambios.length === 0) throw errorDeRegla("sin_cambios", "Sin cambios");
	const conversion: Conversion = {
		tipo: material.tipo,
		unidad: material.unidad,
		unidadReceta: material.unidadReceta,
		factorReceta: material.factorReceta,
		unidadTablet: pedido.unidad_tablet === undefined ? material.unidadTablet : (pedido.unidad_tablet as string | null),
		factorTablet: pedido.factor_tablet === undefined ? material.factorTablet : (pedido.factor_tablet as string | null),
	};
	revisarConversion(conversion);
	await contexto.transaccion
		.update(materiales)
		.set(Object.fromEntries(cambios.map((campo) => [camposDeComoSePide[campo][1], pedido[campo]])))
		.where(eq(materiales.id, material.id));
	for (const campo of cambios) {
		const [nombreDelCampo, columna] = camposDeComoSePide[campo];
		contexto.bitacora({
			descripcion: `${material.nombre}: ${nombreDelCampo} ${material[columna] ?? "—"} → ${pedido[campo] ?? "—"}`,
			entidad: "materiales",
			entidadId: material.id,
			antes: { [campo]: material[columna] },
			despues: { [campo]: pedido[campo] },
		});
	}
	eventoDeMaterial(contexto, "material.cambiado", material.id);
	return {
		resultado: {
			mensaje: `Cambios guardados en ${material.nombre}. El pedido sugerido ya los usa`,
			version: await versionActual(contexto.transaccion, materiales, material.id),
		},
		entidad: { nombre: "materiales", id: material.id },
	};
});

/** Lo que regresa `inventario.existencia_material`. */
const existencia = z.object({
	cantidad: z.string(),
	por_ubicacion: z.array(z.object({ ubicacion: z.string(), cantidad: z.string() })),
});

/** Lo que regresa `patronaje.recetas_con_material`. */
const conMaterial = z.object({ prendas: z.array(z.object({ producto_id: z.uuid(), nombre: z.string() })) });

export const accionDarBajaMaterial = implementarAccion(darBajaMaterial, async (contexto, datos, version) => {
	await revisarMotivo(contexto, datos.motivo);
	// El candado del material espera a un movimiento a medias que lo usa: la existencia que se lee ya lo trae.
	const material = await leerMaterial(contexto, datos.material_id);
	await tomarVersion(contexto, materiales, material.id, version, async () => ({
		material_id: material.id,
		baja_en: material.bajaEn,
	}));
	if (material.bajaEn !== null) throw errorDeRegla("material_dado_de_baja", `${material.nombre} ya está dado de baja.`);
	const hay = existencia.parse(await contexto.lectura("inventario.existencia_material", { material_id: material.id }));
	if (hay.por_ubicacion.length > 0) {
		const donde = hay.por_ubicacion.map((suya) => `${suya.ubicacion} (${Number(suya.cantidad)})`).join(", ");
		throw errorDeRegla(
			"material_con_existencia",
			`Todavía hay ${Number(hay.cantidad)} ${material.unidad} de ${material.nombre} en ${donde}.`,
		);
	}
	// En ninguna orden abierta (en borrador, enviada o recibida en parte).
	const [orden] = await foliosDeOrdenesAbiertas(contexto, { materialId: material.id });
	if (orden !== undefined) {
		throw errorDeRegla("material_en_orden", `${material.nombre} está en ${orden}: termina o cancela la orden antes.`);
	}
	// Ninguna receta vigente lo lleva.
	const { prendas } = conMaterial.parse(
		await contexto.lectura("patronaje.recetas_con_material", { material_id: material.id }),
	);
	const [primera] = prendas;
	if (primera !== undefined) {
		const mas = prendas.length > 1 ? ` y ${prendas.length - 1} más` : "";
		throw errorDeRegla(
			"material_en_receta",
			`${material.nombre} está en la receta vigente de ${primera.nombre}${mas}: cámbiala en Patronaje antes.`,
		);
	}
	await contexto.transaccion
		.update(materiales)
		.set({ bajaEn: contexto.ahora.toString(), bajaPor: quienCambia(contexto), motivoBaja: datos.motivo })
		.where(eq(materiales.id, material.id));
	contexto.bitacora({
		descripcion: `Dio de baja ${material.nombre}: ${datos.motivo}`,
		entidad: "materiales",
		entidadId: material.id,
		antes: { activo: true },
		despues: { activo: false, motivo: datos.motivo },
	});
	eventoDeMaterial(contexto, "material.cambiado", material.id);
	return {
		resultado: {
			mensaje: `${material.nombre} dado de baja`,
			version: await versionActual(contexto.transaccion, materiales, material.id),
		},
		entidad: { nombre: "materiales", id: material.id },
	};
});

export const accionReactivarMaterial = implementarAccion(reactivarMaterial, async (contexto, datos, version) => {
	const material = await leerMaterial(contexto, datos.material_id);
	await tomarVersion(contexto, materiales, material.id, version, async () => ({
		material_id: material.id,
		baja_en: material.bajaEn,
	}));
	if (material.bajaEn === null) throw errorDeRegla("material_activo", `${material.nombre} ya está activo.`);
	const habitual = await leerProveedor(contexto, material.proveedorHabitualId, "share");
	if (habitual.bajaEn !== null) {
		throw errorDeRegla(
			"habitual_dado_de_baja",
			`Su proveedor habitual, ${habitual.nombre}, está dado de baja: reactívalo o haz habitual a otro.`,
		);
	}
	await contexto.transaccion
		.update(materiales)
		.set({ bajaEn: null, bajaPor: null, motivoBaja: null, reactivadoEn: contexto.ahora.toString() })
		.where(eq(materiales.id, material.id));
	contexto.bitacora({
		descripcion: `${material.nombre} vuelve a estar activo`,
		entidad: "materiales",
		entidadId: material.id,
		antes: { activo: false, motivo: material.motivoBaja },
		despues: { activo: true },
	});
	eventoDeMaterial(contexto, "material.cambiado", material.id);
	return {
		resultado: {
			mensaje: `${material.nombre} vuelve a estar activo`,
			version: await versionActual(contexto.transaccion, materiales, material.id),
		},
		entidad: { nombre: "materiales", id: material.id },
	};
});
