/**
 * `patronaje.guardar_receta`: guarda la receta de una prenda como versión nueva, con sus medidas y sus materiales.
 * Fase 10 · docs/modulos/patronaje/recetas.md (reglas 2 a 8 y 11, «`patronaje.guardar_receta`»)
 *
 * Una versión guardada no cambia. La conversión de cada material se congela en su línea. Si la receta estaba
 * verificada, sigue así solo si no cambian la tela ni los avíos.
 */

import { aMilesimos, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { cantidad, guardarReceta } from "@uniformame/compartido/contratos/patronaje/recetas";
import { eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { ErrorDeApi, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { tallas as tablaDeTallas } from "../../catalogo/tablas.ts";
import { materiales } from "../../compras/tablas.ts";
import {
	bloquearReceta,
	type ContenidoDeVersion,
	contenidoComparable,
	contenidoDeVersion,
	escribirVersion,
	guardarEventoDeReceta,
	type LineaDeVersion,
	leerPrenda,
	type MedidaDeVersion,
	materialesComparables,
	type Prenda,
} from "../dominio/recetas.ts";
import { conversionDeCaptura, type UnidadesDelMaterial, unidadesQueAcepta } from "../dominio/unidades.ts";
import { recetas, recetaVersiones } from "../tablas.ts";

/** Lo que llega a la acción, ya validado por su contrato. */
type Pedido = z.output<typeof guardarReceta.entrada>;

/** Un material de la receta como lo lee la acción. */
type Material = Pick<
	typeof materiales.$inferSelect,
	"id" | "nombre" | "tipo" | "unidad" | "unidadReceta" | "factorReceta" | "bajaEn"
>;

/** Cómo se dice cada unidad en los mensajes. */
const unidadEnPalabras = { m: "metros", cm: "centímetros", pza: "piezas" } as const;

/**
 * Las unidades de un material como las lee la regla de `dominio/unidades.ts`.
 * @param material El material leído.
 */
function unidadesDe(material: Material): UnidadesDelMaterial {
	return { unidad: material.unidad, unidadReceta: material.unidadReceta, factorReceta: material.factorReceta };
}

/** Los mensajes de los campos que no se pueden guardar, por campo; el primero de cada uno. */
class Problemas {
	readonly campos: Record<string, string> = {};

	/** Anota un problema de un campo, si ese campo no tiene ya uno. */
	anotar(campo: string, mensaje: string): void {
		this.campos[campo] ??= mensaje;
	}

	/** Si hay problemas, `400` con todos. */
	revisar(): void {
		const primero = Object.values(this.campos)[0];
		if (primero !== undefined) throw new ErrorDeApi("validacion", null, primero, { campos: this.campos });
	}
}

/**
 * Revisa que toda talla que llega sea de la prenda.
 * @throws `422 talla_ajena`: «La talla {t} no es de {producto}.».
 */
async function revisarTallas(contexto: ContextoDeAccion, prenda: Prenda, pedido: Pedido): Promise<void> {
	const suyas = new Set(prenda.tallas.map((talla) => talla.id));
	const llegaron = [
		...pedido.medidas.flatMap((medida) => medida.valores.map((valor) => valor.talla_id)),
		...pedido.lineas.flatMap((linea) => (linea.tallas ?? []).map((talla) => talla.talla_id)),
	];
	const ajenas = [...new Set(llegaron.filter((id) => !suyas.has(id)))];
	if (ajenas.length === 0) return;
	const [ajena] = await contexto.transaccion
		.select({ nombre: tablaDeTallas.nombre })
		.from(tablaDeTallas)
		.where(inArray(tablaDeTallas.id, ajenas));
	throw errorDeRegla("talla_ajena", `La talla ${ajena?.nombre ?? "escogida"} no es de ${prenda.nombre}.`);
}

/**
 * Lee los materiales de la receta y revisa cada línea contra el suyo.
 * @throws `404` si un material no existe; `422 material_dado_de_baja`, `material_tipo_no_cuadra`,
 * `material_repetido`, `tela_en_metros` o `unidad_sin_conversion`.
 */
async function revisarMateriales(contexto: ContextoDeAccion, pedido: Pedido): Promise<Map<string, Material>> {
	const ids = pedido.lineas.map((linea) => linea.material_id);
	const leidos =
		ids.length === 0
			? []
			: await contexto.transaccion
					.select({
						id: materiales.id,
						nombre: materiales.nombre,
						tipo: materiales.tipo,
						unidad: materiales.unidad,
						unidadReceta: materiales.unidadReceta,
						factorReceta: materiales.factorReceta,
						bajaEn: materiales.bajaEn,
					})
					.from(materiales)
					.where(inArray(materiales.id, ids))
					// Compartido: que nadie lo dé de baja mientras entra a la receta.
					.for("share");
	const porId = new Map(leidos.map((material) => [material.id, material]));
	const vistos = new Set<string>();
	for (const linea of pedido.lineas) {
		const material = porId.get(linea.material_id);
		if (material === undefined) throw noExiste();
		if (material.bajaEn !== null) {
			throw errorDeRegla("material_dado_de_baja", `${material.nombre} está dado de baja en Compras.`);
		}
		const esTela = linea.papel !== "avio";
		if (esTela && material.tipo !== "tela") {
			const tipo = material.tipo === "avio" ? "avío" : "consumible";
			throw errorDeRegla("material_tipo_no_cuadra", `${material.nombre} es ${tipo}: no va como tela.`);
		}
		if (!esTela && material.tipo === "tela") {
			throw errorDeRegla("material_tipo_no_cuadra", `${material.nombre} es tela: va en la tabla de tela.`);
		}
		if (vistos.has(material.id)) throw errorDeRegla("material_repetido", `${material.nombre} ya está en la receta.`);
		vistos.add(material.id);
		if (esTela && (linea.modo !== "por_talla" || linea.unidad_receta !== "m")) {
			throw errorDeRegla("tela_en_metros", `${material.nombre}: la tela va en metros por prenda, talla por talla.`);
		}
		if (conversionDeCaptura(unidadesDe(material), linea.unidad_receta) === undefined) {
			throw errorDeRegla(
				"unidad_sin_conversion",
				`${material.nombre} se guarda en ${material.unidad}: captúralo en ${unidadesQueAcepta(unidadesDe(material))
					.map((unidad) => unidadEnPalabras[unidad])
					.join(" o ")}.`,
			);
		}
	}
	return porId;
}

/**
 * Anota las tallas normales que le faltan a una medida o a un material.
 * @param problemas Donde se anotan.
 * @param campo El campo del renglón.
 * @param nombre Lo que falta («Cintura», «Gabardina azul marino»).
 * @param unidad La unidad, en palabras.
 * @param normales Las tallas normales de la prenda.
 * @param tiene Las tallas que sí trae.
 */
function anotarFaltantes(
	problemas: Problemas,
	campo: string,
	nombre: string,
	unidad: string,
	normales: readonly { id: string; nombre: string }[],
	tiene: ReadonlySet<string>,
): void {
	const faltan = normales.filter((talla) => !tiene.has(talla.id));
	const [primera] = faltan;
	if (primera === undefined) return;
	problemas.anotar(
		campo,
		faltan.length === 1
			? `${nombre}: falta la talla ${primera.nombre}, en ${unidad}`
			: `${nombre}: faltan ${faltan.length} tallas, en ${unidad}`,
	);
}

/**
 * Revisa las medidas y las regresa como se guardan.
 * @param contexto El contexto, para el rango de una medida.
 */
async function medidasRevisadas(
	contexto: ContextoDeAccion,
	prenda: Prenda,
	pedido: Pedido,
	problemas: Problemas,
): Promise<MedidaDeVersion[]> {
	const minimo =
		BigInt(Number(await contexto.lectura("admin.parametro", { clave: "patronaje.medida_cm_min" }))) * 1000n;
	const maximo =
		BigInt(Number(await contexto.lectura("admin.parametro", { clave: "patronaje.medida_cm_max" }))) * 1000n;
	const normales = prenda.tallas.filter((talla) => !talla.esPedidoEspecial);
	const nombreDe = new Map(prenda.tallas.map((talla) => [talla.id, talla.nombre]));
	const vistas = new Set<string>();
	return pedido.medidas.map((medida, i) => {
		const campo = `medidas.${i}`;
		if (vistas.has(medida.medida.toLowerCase())) problemas.anotar(campo, `${medida.medida} ya está en las medidas`);
		vistas.add(medida.medida.toLowerCase());
		anotarFaltantes(
			problemas,
			campo,
			medida.medida,
			"centímetros",
			normales,
			new Set(medida.valores.map((valor) => valor.talla_id)),
		);
		for (const valor of medida.valores) {
			const milesimos = aMilesimos(valor.valor_cm);
			if (milesimos < minimo || milesimos > maximo) {
				problemas.anotar(
					campo,
					`${medida.medida}, talla ${nombreDe.get(valor.talla_id)}: ${valor.valor_cm} cm no parece medida de la prenda. Va en centímetros`,
				);
			}
		}
		return {
			medida: medida.medida,
			orden: medida.orden,
			valores: medida.valores.map((valor) => ({
				tallaId: valor.talla_id,
				valorCm: deMilesimos(aMilesimos(valor.valor_cm)),
			})),
		};
	});
}

/**
 * Si el texto de una talla es un decimal con hasta tres decimales, como lo pide el contrato para las demás cantidades.
 * @param texto Lo que se escribió.
 */
function esCantidad(texto: string): boolean {
	return cantidad.safeParse(texto).success;
}

/**
 * Revisa los materiales y los regresa como se guardan, con su conversión congelada.
 * @param contexto El contexto, para lo más de tela por prenda.
 */
async function lineasRevisadas(
	contexto: ContextoDeAccion,
	prenda: Prenda,
	pedido: Pedido,
	porId: ReadonlyMap<string, Material>,
	problemas: Problemas,
): Promise<LineaDeVersion[]> {
	const telaMaxima =
		BigInt(Number(await contexto.lectura("admin.parametro", { clave: "patronaje.tela_max_m_por_prenda" }))) * 1000n;
	const normales = prenda.tallas.filter((talla) => !talla.esPedidoEspecial);
	const nombreDe = new Map(prenda.tallas.map((talla) => [talla.id, talla.nombre]));
	const principales = pedido.lineas.filter((linea) => linea.papel === "tela_principal").length;
	if (principales === 0) problemas.anotar("lineas", "Falta la tela");
	if (principales > 1) problemas.anotar("lineas", "Va una sola tela principal");
	return pedido.lineas.map((linea, i) => {
		const campo = `lineas.${i}`;
		const material = porId.get(linea.material_id);
		const nombre = material?.nombre ?? "";
		const unidad = unidadEnPalabras[linea.unidad_receta];
		// Una talla vacía es una talla que falta.
		const tallasDeLaLinea =
			linea.modo === "por_talla" ? (linea.tallas ?? []).filter((talla) => talla.cantidad !== "") : [];
		if (linea.modo === "igual" && linea.cantidad === undefined) {
			problemas.anotar(campo, `${nombre}: escribe cuánto lleva cada prenda, en ${unidad}`);
		}
		if (linea.modo === "por_talla") {
			anotarFaltantes(
				problemas,
				campo,
				nombre,
				unidad,
				normales,
				new Set(tallasDeLaLinea.map((talla) => talla.talla_id)),
			);
		}
		for (const talla of tallasDeLaLinea) {
			if (!esCantidad(talla.cantidad))
				problemas.anotar(campo, `${nombre}: revisa la talla ${nombreDe.get(talla.talla_id)}`);
		}
		if (linea.papel !== "avio") {
			for (const talla of tallasDeLaLinea.filter((suya) => esCantidad(suya.cantidad))) {
				if (aMilesimos(talla.cantidad) > telaMaxima) {
					problemas.anotar(
						campo,
						`${nombre}, talla ${nombreDe.get(talla.talla_id)}: ${talla.cantidad} m por prenda es demasiado. La tela va en metros, por ejemplo 1.06`,
					);
				}
			}
		}
		return {
			papel: linea.papel,
			materialId: linea.material_id,
			modo: linea.modo,
			unidadReceta: linea.unidad_receta,
			cantidad: linea.modo === "igual" && linea.cantidad !== undefined ? deMilesimos(aMilesimos(linea.cantidad)) : null,
			recetaPorUnidadInventario:
				material === undefined ? "1.000" : (conversionDeCaptura(unidadesDe(material), linea.unidad_receta) ?? "1.000"),
			orden: linea.orden,
			tallas: tallasDeLaLinea.map((talla) => ({
				tallaId: talla.talla_id,
				// Con una talla que no es número la acción ya no escribe: los problemas se lanzan antes.
				cantidad: esCantidad(talla.cantidad) ? deMilesimos(aMilesimos(talla.cantidad)) : "0.000",
			})),
		};
	});
}

export const accionGuardarReceta = implementarAccion(guardarReceta, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const prenda = await leerPrenda(transaccion, datos.producto_id);
	if (!prenda.llevaReceta) throw errorDeRegla("seccion_sin_receta", `${prenda.seccion} no lleva receta.`);
	const receta = await bloquearReceta(transaccion, prenda.id);
	if (receta === undefined) throw new Error(`la prenda ${prenda.id} no tiene su receta`);
	await tomarVersion(contexto, recetas, receta.id, version, async () => ({
		receta_id: receta.id,
		estado: receta.estado,
		version_vigente_id: receta.versionVigenteId,
	}));
	await revisarTallas(contexto, prenda, datos);
	const porId = await revisarMateriales(contexto, datos);
	const problemas = new Problemas();
	const anterior =
		receta.versionVigenteId === null
			? undefined
			: (
					await transaccion
						.select({ numero: recetaVersiones.numero })
						.from(recetaVersiones)
						.where(eq(recetaVersiones.id, receta.versionVigenteId))
				)[0];
	const motivo = datos.motivo ?? "";
	if (anterior !== undefined && motivo.length < 5) problemas.anotar("motivo", "Escribe el motivo del cambio");
	const contenido: ContenidoDeVersion = {
		medidas: await medidasRevisadas(contexto, prenda, datos, problemas),
		lineas: await lineasRevisadas(contexto, prenda, datos, porId, problemas),
	};
	problemas.revisar();
	const antes =
		receta.versionVigenteId === null ? undefined : await contenidoDeVersion(transaccion, receta.versionVigenteId);
	if (antes !== undefined && contenidoComparable(antes) === contenidoComparable(contenido)) {
		throw errorDeRegla("sin_cambios", "Sin cambios");
	}
	// Sigue verificada solo si no cambian la tela ni los avíos (regla 8).
	const estabaVerificada = receta.estado === "verificada";
	const sigueVerificada =
		estabaVerificada &&
		antes !== undefined &&
		materialesComparables(antes.lineas) === materialesComparables(contenido.lineas);
	const numero = (anterior?.numero ?? 0) + 1;
	const versionId = await escribirVersion(
		contexto,
		receta,
		{ numero, motivo: anterior === undefined ? "Captura inicial" : motivo },
		contenido,
		sigueVerificada ? "verificada" : "sin_verificar",
	);
	guardarEventoDeReceta(contexto, "receta.guardada", receta, numero);
	contexto.bitacora({
		descripcion: `Receta de ${prenda.nombre}: versión ${numero}. ${anterior === undefined ? "Captura inicial" : motivo}`,
		entidad: "recetas",
		entidadId: receta.id,
		antes: antes === undefined ? null : { ...antes },
		despues: { ...contenido },
	});
	const perdio = estabaVerificada && !sigueVerificada;
	return {
		resultado: {
			receta_version_id: versionId,
			numero,
			estado: sigueVerificada ? ("verificada" as const) : ("sin_verificar" as const),
			perdio_verificacion: perdio,
			mensaje:
				numero === 1
					? "Receta guardada como versión 1. Compras ya puede proyectar su tela"
					: `Versión ${numero} guardada. Los lotes ya cortados conservan la versión ${numero - 1}`,
			version: await versionActual(transaccion, recetas, receta.id),
		},
		avisos: perdio ? ["Queda sin verificar hasta que se mida en el próximo corte"] : [],
		entidad: { nombre: "recetas", id: receta.id },
	};
});
