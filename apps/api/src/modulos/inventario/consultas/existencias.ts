/**
 * `inventario.existencias`: la pestaña Existencias de Bodega. Por producto y variante, las piezas de Aduana, Bodega,
 * Tienda 1, Tienda 2 y el Taller (cada celda con su mínimo, su color y lo que tiene en diferencia), Tránsito, En camino
 * a aduana, el total, lo comprometido y lo libre; con la búsqueda, la sección, la escuela y los filtros, por páginas de
 * productos.
 * Fase 19 · docs/interfaz/fabrica/bodega.md («Existencias») y docs/modulos/inventario/existencias-y-cuadre.md (regla 3)
 *
 * El color de una celda con mínimo sale de la cuenta del reabasto (en cero o bajo mínimo, regla 8 de mínimos y
 * reabasto); sin mínimo, en cero va en gris. La búsqueda: cada palabra tiene que coincidir; 4 dígitos o más buscan el
 * código que empieza así, un número corto es la talla y lo demás el nombre o la talla, sin acentos.
 */

import {
	columnasDeExistencias,
	existenciasDeBodega,
	type varianteDeExistencias,
} from "@uniformame/compartido/contratos/inventario/bodega";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { cursorDe, leerCursor } from "../../../nucleo/http/consultas.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { de, leerReabasto, type ReabastoLeido } from "./bodega-comun.ts";

/** Una variante de la tabla. */
type VarianteDeExistencias = z.infer<typeof varianteDeExistencias>;

/** Cuántos productos van en una página, si no se dice. */
const limitePorOmision = 50;

/**
 * Un texto sin acentos y en minúsculas, para buscar.
 * @param texto El texto.
 */
function normal(texto: string): string {
	return texto
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLocaleLowerCase("es-MX");
}

/**
 * Si una variante coincide con lo que se busca: cada palabra tiene que coincidir.
 * @param texto Lo que se escribió.
 * @param variante La prenda, la talla y el código.
 */
function coincide(texto: string, variante: { prenda: string; talla: string; codigo: string | null }): boolean {
	const prenda = normal(variante.prenda);
	const talla = normal(variante.talla);
	return normal(texto)
		.split(/\s+/)
		.filter((palabra) => palabra.length > 0)
		.every((palabra) => {
			if (/^\d{4,}$/.test(palabra)) return (variante.codigo ?? "").startsWith(palabra);
			if (/^\d{1,3}$/.test(palabra)) return talla === palabra;
			return prenda.includes(palabra) || talla === palabra;
		});
}

/**
 * Las celdas y las cuentas de una variante.
 * @param leido La cuenta del reabasto con sus datos.
 * @param varianteId La variante.
 * @param enDiferencia Las piezas en diferencia por ubicación y variante.
 */
function cuentasDeVariante(
	leido: ReabastoLeido,
	varianteId: string,
	enDiferencia: Record<string, Record<string, number>>,
): Omit<VarianteDeExistencias, "variante_id" | "prenda" | "talla" | "escuela" | "codigo"> {
	const porCodigo = new Map(leido.ubicaciones.map((ubicacion) => [ubicacion.codigo, ubicacion]));
	const piezasEn = (codigo: string) => {
		const ubicacion = porCodigo.get(codigo);
		return ubicacion === undefined ? 0 : de(leido.existencia, ubicacion.id, varianteId);
	};
	const celdas = columnasDeExistencias.map((codigo) => {
		const ubicacion = porCodigo.get(codigo);
		const piezas = piezasEn(codigo);
		const renglon = leido.cuenta.find((suyo) => suyo.ubicacionId === ubicacion?.id && suyo.varianteId === varianteId);
		const tono = renglon?.enCero
			? "rojo"
			: renglon?.bajoMinimo
				? "ambar"
				: renglon === undefined && piezas === 0
					? "gris"
					: null;
		return {
			codigo,
			piezas,
			minimo: renglon?.minimo ?? null,
			tono,
			en_diferencia: ubicacion === undefined ? 0 : de(enDiferencia, ubicacion.id, varianteId),
		} as const;
	});
	const total = leido.ubicaciones.reduce((suma, ubicacion) => suma + de(leido.existencia, ubicacion.id, varianteId), 0);
	const comprometido = leido.ubicaciones.reduce(
		(suma, ubicacion) => suma + de(leido.reservado, ubicacion.id, varianteId),
		0,
	);
	return {
		celdas,
		transito: piezasEn("TRA"),
		en_camino: piezasEn("ECA"),
		total,
		comprometido,
		libre: total - comprometido,
	};
}

/** El producto, la sección y la escuela de cada variante. */
const deLaPrenda = z.object({
	variante_id: z.uuid(),
	producto_id: z.uuid(),
	seccion_id: z.uuid(),
	escuela_id: z.uuid().nullable(),
});

export const consultaExistencias = implementarConsulta(existenciasDeBodega, async (contexto, parametros) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		const leido = await leerReabasto(accion);
		const { rows: filasDePrendas } = await accion.transaccion.execute(sql`
			SELECT v.id AS variante_id, p.id AS producto_id, p.seccion_id, p.escuela_id
			FROM variantes v JOIN productos p ON p.id = v.producto_id`);
		const prendas = new Map(
			z
				.array(deLaPrenda)
				.parse(filasDePrendas)
				.map((fila) => [fila.variante_id, fila]),
		);
		const { rows: filasDeDiferencias } = await accion.transaccion.execute(sql`
			SELECT ubicacion_id, variante_id, sum(abs(piezas)) AS n FROM diferencias
			WHERE estado <> 'resuelta' AND variante_id IS NOT NULL GROUP BY 1, 2`);
		const enDiferencia: Record<string, Record<string, number>> = {};
		for (const fila of z
			.array(z.object({ ubicacion_id: z.uuid(), variante_id: z.uuid(), n: z.coerce.number() }))
			.parse(filasDeDiferencias)) {
			enDiferencia[fila.ubicacion_id] = { ...enDiferencia[fila.ubicacion_id], [fila.variante_id]: fila.n };
		}
		// Cada variante, con sus cuentas, en el orden de la prenda y la talla; luego lo que pide el filtro.
		const variantes = [...leido.variantes.values()]
			.sort((una, otra) => una.orden - otra.orden)
			.filter((variante) => {
				const prenda = prendas.get(variante.variante_id);
				if (parametros.texto !== undefined && parametros.texto !== "" && !coincide(parametros.texto, variante))
					return false;
				if (parametros.seccion_id !== undefined && prenda?.seccion_id !== parametros.seccion_id) return false;
				if (parametros.escuela === "basicos") return prenda?.escuela_id === null;
				return parametros.escuela === undefined || prenda?.escuela_id === parametros.escuela;
			})
			.map((variante) => ({
				variante,
				cuentas: cuentasDeVariante(leido, variante.variante_id, enDiferencia),
			}))
			.filter(({ cuentas }) => {
				switch (parametros.filtro ?? "todas") {
					case "bajo_minimo":
						return cuentas.celdas.some((celda) => celda.tono === "ambar");
					case "en_cero":
						return cuentas.celdas.some((celda) => celda.tono === "rojo");
					case "con_comprometido":
						return cuentas.comprometido > 0;
					case "con_diferencia":
						return cuentas.celdas.some((celda) => celda.en_diferencia > 0);
					default:
						return true;
				}
			});
		// Por producto, en el orden en que vienen sus variantes.
		const productos = new Map<
			string,
			{ producto_id: string; prenda: string; escuela: string; variantes: VarianteDeExistencias[] }
		>();
		for (const { variante, cuentas } of variantes) {
			const productoId = prendas.get(variante.variante_id)?.producto_id ?? variante.variante_id;
			const producto = productos.get(productoId) ?? {
				producto_id: productoId,
				prenda: variante.prenda,
				escuela: variante.escuela,
				variantes: [],
			};
			producto.variantes.push({
				variante_id: variante.variante_id,
				prenda: variante.prenda,
				talla: variante.talla,
				escuela: variante.escuela,
				codigo: variante.codigo,
				...cuentas,
			});
			productos.set(productoId, producto);
		}
		const todos = [...productos.values()];
		const desde = Number(leerCursor(parametros.cursor)?.desde ?? 0);
		const limite = parametros.limite ?? limitePorOmision;
		const hasta = desde + limite;
		const { rows: secciones } = await accion.transaccion.execute(sql`SELECT id, nombre FROM secciones ORDER BY orden`);
		const { rows: escuelas } = await accion.transaccion.execute(sql`
			SELECT DISTINCT es.id, es.nombre FROM escuelas es JOIN productos p ON p.escuela_id = es.id ORDER BY es.nombre`);
		const deNombre = z.array(z.object({ id: z.uuid(), nombre: z.string() }));
		return {
			secciones: deNombre.parse(secciones),
			escuelas: deNombre.parse(escuelas),
			resumen: {
				variantes: variantes.length,
				piezas: variantes.reduce((suma, { cuentas }) => suma + cuentas.total, 0),
			},
			renglones: todos.slice(desde, hasta),
			cursor: hasta < todos.length ? cursorDe({ desde: hasta }) : null,
			hay_mas: hasta < todos.length,
		};
	}),
}));
