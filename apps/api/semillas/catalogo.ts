/**
 * El catálogo de la muestra: sus seis escuelas, los tipos de prenda que usan sus productos, sus 32 productos con
 * sus tallas, y los precios de las listas generales.
 * Fase 8 · docs/fases/08-catalogo.md («Cómo se construye») y la muestra (`docs/interfaz/muestra/sistema-alameda.html`)
 *
 * Se carga con las mismas acciones del sistema, como Rosa Méndez (Catálogo), en una sesión que se cierra al
 * terminar. Lo que la muestra trae y el sistema no deja (un producto con escuela en línea) se ajusta a la
 * regla. Las etiquetas impresas no tienen acción hasta la fase 20 (el tipo `prenda`): se marcan directo. Los
 * precios de las listas de clientes llegan con Ventas (fase 16). Si las escuelas ya están, no hace nada.
 */

import { join } from "node:path";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import {
	categoriasMayoreo,
	escuelas,
	gruposTalla,
	listasPrecios,
	productos,
	secciones,
	tallas,
	variantes,
} from "../src/modulos/catalogo/tablas.ts";
import type { CuentaQueLlama } from "../src/nucleo/acceso/quien.ts";
import type { Base } from "../src/nucleo/base/conexion.ts";
import { cargarModulos } from "../src/nucleo/modulos.ts";
import { enSesionDeCarga, idDe } from "./correr.ts";

/** Rosa Méndez, la cuenta de la oficina que lleva Catálogo (`cuentas.ts`), en la sesión de la carga. */
const rosa: CuentaQueLlama = {
	tipo: "cuenta",
	usuarioId: "01936f2e-0000-7000-8000-000000000006",
	sesionId: "01936f2e-0000-7000-8000-0000000000f1",
	esDuena: false,
	esSoporte: false,
	departamentos: ["catalogo"],
	permisosFinos: [],
	confirmadoConGoogleEn: undefined,
};

/** Las escuelas de la muestra, por su clave corta. */
export const escuelasDeLaMuestra: Record<string, { nombre: string; municipio: string }> = {
	cm: { nombre: "Colegio Morelos", municipio: "Yurécuaro" },
	jp: { nombre: "Instituto Juan Pablo II", municipio: "La Piedad" },
	st: { nombre: "Secundaria Técnica 12", municipio: "Zamora" },
	gm: { nombre: "Jardín de Niños Gabriela Mistral", municipio: "Numarán" },
	bj: { nombre: "Primaria Benito Juárez", municipio: "La Piedad" },
	al: { nombre: "Colegio Allende", municipio: "Zamora" },
};

/** Los tipos de prenda que usan los productos, con su sección. */
const tiposDeLaMuestra: Record<string, string> = {
	Playera: "Playeras",
	Camisa: "Camisas y batas",
	Bata: "Camisas y batas",
	Suéter: "Suéteres y chalecos",
	Chaleco: "Suéteres y chalecos",
	Sudadera: "Pants y sudaderas",
	Pants: "Pants y sudaderas",
	Chamarra: "Pants y sudaderas",
	Short: "Pants y sudaderas",
	Jumper: "Faldas, jumpers y mandiles",
	Falda: "Faldas, jumpers y mandiles",
	Mandil: "Faldas, jumpers y mandiles",
	Pantalón: "Pantalones",
};

/** Las claves de los grupos de tallas de la muestra. */
const grupos: Record<string, string> = {
	inf: "Infantil",
	adu: "Juvenil y adulto",
	cin: "Pantalón por cintura",
	uni: "Talla única",
};

/** Las categorías de mayoreo de la muestra. */
const categorias: Record<string, string> = {
	basico: "Básico",
	especial: "Especial",
	accesorio: "Accesorio",
	sindesc: "Sin descuento",
};

/**
 * Un producto de la muestra, como lo escribe ella: canales (`m` mostrador, `l` en línea, `x` externos), tallas
 * normales y de pedido especial (`inf 4-16|adu CH-XG`, `inf 3,18`) y precios en pesos de Mostrador, Mayoreo
 * y En línea.
 */
export interface ProductoDeLaMuestra {
	nombre: string;
	seccion: string;
	escuela: string | null;
	tipo: string | null;
	categoria: string;
	canales: string;
	normales: string;
	especiales: string;
	precios: { mos?: number; may?: number; lin?: number };
	descontinuado?: true;
	nuevo?: true;
	servicio?: true;
}

/** Arma un producto de la muestra en el orden en que ella lo escribe. */
function p(
	nombre: string,
	seccion: string,
	escuela: string | null,
	tipo: string | null,
	categoria: string,
	canales: string,
	normales: string,
	especiales: string,
	precios: ProductoDeLaMuestra["precios"],
	extra: Pick<ProductoDeLaMuestra, "descontinuado" | "nuevo" | "servicio"> = {},
): ProductoDeLaMuestra {
	return { nombre, seccion, escuela, tipo, categoria, canales, normales, especiales, precios, ...extra };
}

/** Los productos de la muestra, uno por renglón como en ella. */
// biome-ignore format: una tabla se lee mejor con un producto por renglón
export const productosDeLaMuestra: readonly ProductoDeLaMuestra[] = [
	p("Playera polo blanca lisa", "Playeras", null, "Playera", "basico", "mlx", "inf 4-16|adu CH-XG", "inf 3,18|adu XXG", { mos: 175, may: 150, lin: 175 }),
	p("Playera polo blanca con escudo", "Playeras", "cm", "Playera", "especial", "mlx", "inf 4-16|adu CH-XG", "inf 3,18|adu XXG", { mos: 235, may: 220, lin: 235 }),
	p("Playera polo blanca con escudo", "Playeras", "jp", "Playera", "especial", "mlx", "inf 4-16|adu CH-XG", "inf 3,18|adu XXG", { mos: 230, may: 215, lin: 230 }),
	p("Playera polo blanca con escudo", "Playeras", "st", "Playera", "especial", "ml", "inf 8-16|adu CH-XG", "adu XXG", { mos: 235, may: 220, lin: 235 }, { nuevo: true }),
	p("Playera deportiva blanca", "Playeras", null, "Playera", "basico", "ml", "inf 6-16|adu CH-XG", "adu XXG", { mos: 130, may: 110, lin: 130 }),
	p("Playera polo gris lisa", "Playeras", null, "Playera", "basico", "ml", "inf 6-16", "", { mos: 165, may: 140, lin: 165 }, { descontinuado: true }),
	p("Camisa manga larga blanca", "Camisas y batas", null, "Camisa", "basico", "mlx", "inf 8-18|adu CH-XG", "adu XXG", { mos: 215, may: 185, lin: 215 }),
	p("Camisa manga larga con escudo", "Camisas y batas", "st", "Camisa", "especial", "mlx", "inf 8-18|adu CH-XG", "adu XXG", { mos: 285, may: 265, lin: 285 }),
	p("Camisa manga corta blanca", "Camisas y batas", null, "Camisa", "basico", "ml", "inf 6-18|adu CH-XG", "adu XXG", { mos: 185, may: 160, lin: 185 }),
	p("Bata blanca de laboratorio con escudo", "Camisas y batas", "st", "Bata", "especial", "x", "adu CH-XG", "adu XXG", {}),
	p("Suéter vino con escudo", "Suéteres y chalecos", "cm", "Suéter", "especial", "mlx", "inf 8-16|adu CH-G", "inf 6,18|adu XG", { mos: 430, may: 405, lin: 430 }),
	p("Chaleco vino", "Suéteres y chalecos", "cm", "Chaleco", "especial", "mlx", "inf 6-14", "inf 4,16", { mos: 370, may: 345, lin: 370 }),
	p("Suéter verde con escudo", "Suéteres y chalecos", "st", "Suéter", "especial", "mlx", "inf 8-16|adu CH-G", "adu XG", { mos: 420, may: 395, lin: 420 }, { nuevo: true }),
	p("Suéter marino liso", "Suéteres y chalecos", null, "Suéter", "basico", "ml", "inf 6-16|adu CH-G", "", { mos: 360, may: 330, lin: 360 }, { descontinuado: true }),
	p("Suéter azul con escudo", "Suéteres y chalecos", "bj", "Suéter", "especial", "ml", "inf 6-16", "inf 4,18", { mos: 410, may: 385, lin: 410 }),
	p("Chaleco gris con escudo", "Suéteres y chalecos", "al", "Chaleco", "especial", "ml", "inf 6-14", "", { mos: 350, may: 325, lin: 350 }),
	p("Sudadera marino lisa", "Pants y sudaderas", null, "Sudadera", "basico", "mlx", "inf 4-16|adu CH-XG", "inf 3,18|adu XXG", { mos: 330, may: 305, lin: 330 }),
	p("Pants marino liso", "Pants y sudaderas", null, "Pants", "basico", "mlx", "inf 4-16|adu CH-XG", "inf 3,18|adu XXG", { mos: 410, may: 380, lin: 410 }),
	p("Conjunto deportivo azul rey", "Pants y sudaderas", "jp", "Pants", "especial", "mlx", "inf 6-16|adu CH-XG", "adu XXG", { mos: 760, may: 720, lin: 760 }),
	p("Pants azul cielo", "Pants y sudaderas", "gm", "Pants", "especial", "x", "inf 3-8", "", {}),
	p("Chamarra azul cielo con escudo", "Pants y sudaderas", "gm", "Chamarra", "especial", "x", "inf 3-8", "", {}),
	p("Short deportivo vino", "Pants y sudaderas", "cm", "Short", "especial", "mx", "inf 6-16|adu CH-XG", "", { mos: 190, may: 175 }),
	p("Jumper cuadros", "Faldas, jumpers y mandiles", "cm", "Jumper", "especial", "mlx", "inf 4-14", "inf 3,16", { mos: 560, may: 530, lin: 560 }),
	p("Falda tableada azul", "Faldas, jumpers y mandiles", "jp", "Falda", "especial", "mlx", "inf 6-16|adu CH-G", "inf 4,18|adu XG", { mos: 340, may: 320, lin: 340 }),
	p("Mandil de cuadros", "Faldas, jumpers y mandiles", "gm", "Mandil", "especial", "x", "inf 3-6", "", {}),
	p("Jumper azul marino", "Faldas, jumpers y mandiles", "bj", "Jumper", "especial", "ml", "inf 4-14", "inf 3,16", { mos: 520, may: 490, lin: 520 }),
	p("Pantalón gris oxford", "Pantalones", "st", "Pantalón", "especial", "mlx", "cin 28-36", "cin 26,38", { mos: 360, may: 335, lin: 360 }),
	p("Pantalón azul marino", "Pantalones", null, "Pantalón", "basico", "ml", "cin 28-36", "cin 26,38", { mos: 340, may: 310, lin: 340 }),
	p("Escudo Colegio Morelos", "Accesorios y servicios", "cm", null, "sindesc", "ml", "uni Única", "", { mos: 45, may: 45, lin: 45 }),
	p("Calcetas blancas (par)", "Accesorios y servicios", null, null, "accesorio", "ml", "adu CH-G", "", { mos: 40, may: 35, lin: 40 }),
	p("Bordado de nombre", "Accesorios y servicios", null, null, "sindesc", "m", "uni Única", "", { mos: 30 }, { servicio: true }),
	p("Pegado de escudo", "Accesorios y servicios", null, null, "sindesc", "m", "uni Única", "", { mos: 25 }, { servicio: true }),
];

/** Las tallas dadas de baja en la muestra: producto (por nombre y escuela) y talla. */
const bajasDeLaMuestra = [
	{ producto: "Jumper cuadros", escuela: "cm", talla: "16" },
	{ producto: "Pants marino liso", escuela: null, talla: "3" },
] as const;

/**
 * Las tallas de un rango de la muestra, en el orden de su grupo: `inf 4-16|adu CH-XG` o `inf 3,18`.
 * @param texto El rango como lo escribe la muestra.
 * @param tallasPorGrupo Por grupo, sus tallas en orden con su id.
 */
function tallasDe(texto: string, tallasPorGrupo: Map<string, { id: string; nombre: string }[]>): string[] {
	return texto
		.split("|")
		.filter((parte) => parte.trim() !== "")
		.flatMap((parte) => {
			const [clave = "", rango = ""] = parte.trim().split(/\s+(.+)/);
			const delGrupo = tallasPorGrupo.get(grupos[clave] ?? "") ?? [];
			const nombres = delGrupo.map((talla) => talla.nombre);
			const elegidas = rango.includes("-")
				? (() => {
						const [desde = "", hasta = ""] = rango.split("-");
						return nombres.slice(nombres.indexOf(desde), nombres.indexOf(hasta) + 1);
					})()
				: rango.split(",").map((nombre) => nombre.trim());
			return delGrupo.filter((talla) => elegidas.includes(talla.nombre)).map((talla) => talla.id);
		});
}

/** La versión de un producto. */
async function versionDe(base: Base, productoId: string): Promise<number> {
	const [producto] = await base
		.select({ version: productos.version })
		.from(productos)
		.where(eq(productos.id, productoId));
	return Number(producto?.version);
}

/**
 * Carga el catálogo de la muestra con las acciones del sistema.
 * @param base La base, con el rol dueño.
 */
export async function cargarCatalogoDeLaMuestra(base: Base): Promise<void> {
	const [yaEsta] = await base.select({ id: escuelas.id }).from(escuelas).where(eq(escuelas.nombre, "Colegio Morelos"));
	if (yaEsta !== undefined) return;
	const registro = await cargarModulos(join(import.meta.dirname, "../src/modulos"));
	const ahora = Temporal.Now.instant().toString();
	await enSesionDeCarga(base, registro, rosa, async (hacer) => {
		const escuelaIds = new Map<string, string>();
		for (const [clave, escuela] of Object.entries(escuelasDeLaMuestra)) {
			escuelaIds.set(clave, idDe(await hacer("catalogo.agregar_escuela", escuela), "escuela_id"));
		}
		const seccionIds = new Map(
			(await base.select({ id: secciones.id, nombre: secciones.nombre }).from(secciones)).map((s) => [s.nombre, s.id]),
		);
		const tipoIds = new Map<string, string>();
		for (const [nombre, seccion] of Object.entries(tiposDeLaMuestra)) {
			const resultado = await hacer("catalogo.guardar_tipo_prenda", {
				nombre,
				seccion_id: seccionIds.get(seccion),
				medidas: [],
			});
			tipoIds.set(nombre, idDe(resultado, "tipo_prenda_id"));
		}
		const categoriaIds = new Map(
			(await base.select({ id: categoriasMayoreo.id, nombre: categoriasMayoreo.nombre }).from(categoriasMayoreo)).map(
				(c) => [c.nombre, c.id],
			),
		);
		const listaIds = new Map(
			(
				await base
					.select({ id: listasPrecios.id, tipo: listasPrecios.tipo })
					.from(listasPrecios)
					.where(isNull(listasPrecios.clienteId))
			).map((l) => [l.tipo, l.id]),
		);
		const tallasPorGrupo = new Map<string, { id: string; nombre: string }[]>();
		for (const talla of await base
			.select({ id: tallas.id, nombre: tallas.nombre, grupo: gruposTalla.nombre })
			.from(tallas)
			.innerJoin(gruposTalla, eq(gruposTalla.id, tallas.grupoTallaId))
			.orderBy(tallas.orden)) {
			tallasPorGrupo.set(talla.grupo, [...(tallasPorGrupo.get(talla.grupo) ?? []), talla]);
		}

		const descontinuar: string[] = [];
		const impresos: string[] = [];
		const productoIds = new Map<string, string>();
		for (const producto of productosDeLaMuestra) {
			// Solo un producto sin escuela se vende en línea: la muestra lo marca en algunos con escuela.
			const canales = [
				...(producto.canales.includes("m") ? ["mostrador"] : []),
				...(producto.canales.includes("l") && producto.escuela === null ? ["en_linea"] : []),
				...(producto.canales.includes("x") ? ["externos"] : []),
			];
			const precios = (
				[
					["mostrador", producto.precios.mos],
					["mayoreo", producto.precios.may],
					["en_linea", canales.includes("en_linea") ? producto.precios.lin : undefined],
				] as const
			).flatMap(([tipo, pesos]) =>
				pesos === undefined ? [] : [{ lista_id: listaIds.get(tipo), precio_centavos: pesos * 100 }],
			);
			const creado = await hacer("catalogo.crear_producto", {
				modo: "desde_cero",
				origen: "catalogo",
				nombre: producto.nombre,
				seccion_id: seccionIds.get(producto.seccion),
				escuela_id: producto.escuela === null ? null : escuelaIds.get(producto.escuela),
				...(producto.tipo === null ? {} : { tipo_prenda_id: tipoIds.get(producto.tipo) }),
				categoria_mayoreo_id: categoriaIds.get(categorias[producto.categoria] ?? ""),
				...(producto.servicio === true ? { es_servicio: true } : {}),
				tallas: tallasDe(producto.normales, tallasPorGrupo).map((talla_id) => ({
					talla_id,
					es_pedido_especial: false,
				})),
				canales,
				precios,
			});
			const productoId = idDe(creado, "producto_id");
			productoIds.set(`${producto.nombre}|${producto.escuela ?? ""}`, productoId);
			// Las de pedido especial se agregan en la ficha: un alta desde cero no las lleva.
			for (const talla_id of tallasDe(producto.especiales, tallasPorGrupo)) {
				await hacer(
					"catalogo.agregar_talla",
					{ producto_id: productoId, talla_id, es_pedido_especial: true },
					await versionDe(base, productoId),
				);
			}
			if (producto.descontinuado === true) descontinuar.push(productoId);
			if (producto.nuevo !== true) impresos.push(productoId);
		}

		for (const baja of bajasDeLaMuestra) {
			const productoId = productoIds.get(`${baja.producto}|${baja.escuela ?? ""}`) ?? "";
			const [variante] = await base
				.select({ id: variantes.id })
				.from(variantes)
				.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
				.where(and(eq(variantes.productoId, productoId), eq(tallas.nombre, baja.talla)));
			await hacer(
				"catalogo.dar_baja_talla",
				{ variante_id: variante?.id, motivo: "Talla fuera de rango que ya no se pide" },
				await versionDe(base, productoId),
			);
		}
		const versiones = await Promise.all(
			descontinuar.map(async (id) => ({ producto_id: id, version: await versionDe(base, id) })),
		);
		await hacer("catalogo.descontinuar_productos", { productos: versiones, motivo: "Ya no se surte" });

		// Las etiquetas de los que no son nuevos ya están impresas.
		await base
			.update(variantes)
			.set({ estadoEtiqueta: "impresa", etiquetaImpresaEn: ahora, etiquetaImpresaPor: rosa.usuarioId })
			.where(
				and(
					inArray(variantes.productoId, impresos),
					eq(variantes.estadoEtiqueta, "por_imprimir"),
					isNull(variantes.bajaEn),
				),
			);
	});
}
