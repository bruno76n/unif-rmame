/**
 * El trabajo «Alertas de Dirección»: cada `direccion.minutos_revisar_alertas` y al terminar el cuadre de inventario,
 * calcula las alertas de este momento leyendo a cada dueño, las compara con su memoria (`alertas_direccion_vistas`) y
 * avisa a las cuentas con Dirección solo las nuevas.
 * Fase 18 · docs/modulos/direccion/alertas-e-indicadores.md (reglas 3 y 4, «El trabajo «Alertas de Dirección»»)
 *
 * Es repetible: una corrida sin alertas nuevas no avisa nada. Una alerta que desaparece y vuelve a salir es nueva.
 */

import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { ContextoDeAccion, Trabajo } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { type AlertaDeDireccion, alertasDeDireccion, type DatosDeLasAlertas } from "../dominio/alertas.ts";
import { alertasDireccionVistas } from "../tablas.ts";

/** Lo que regresa `produccion.lotes_atorados`. */
const deLotes = z.object({
	lotes: z.array(
		z.object({
			lote_id: z.uuid(),
			folio: z.string(),
			operacion: z.string(),
			dias: z.number(),
			falla: z.string().nullable(),
		}),
	),
});
/** Lo que regresa `patronaje.desperdicio_prenda`. */
const deDesperdicios = z.object({
	prendas: z.array(z.object({ producto_id: z.uuid(), desperdicio_pct: z.coerce.number(), alto: z.boolean() })),
});
/** Lo que regresa `catalogo.nombres_de_productos`. */
const deNombres = z.object({ nombres: z.record(z.string(), z.string()) });
/** Lo que regresa `contaduria.resumen_direccion`. */
const deResumen = z.object({
	cliente_que_mas_debe: z
		.object({ cliente_id: z.uuid(), nombre: z.string(), parte_milesimas: z.number(), vencido_centavos: z.number() })
		.nullable(),
});
/** Lo que regresa `catalogo.productos_descontinuados`. */
const deDescontinuados = z.object({
	productos: z.array(z.object({ producto_id: z.uuid(), nombre: z.string(), variante_ids: z.array(z.uuid()) })),
});
/** Lo que regresa `inventario.existencia_de_variantes`. */
const deExistencia = z.object({ piezas: z.record(z.string(), z.number()) });
/** Lo que regresa `compras.cuenta_material`. */
const deCuentas = z.record(z.string(), z.object({ estado: z.string(), se_acaba: z.string().nullable() }));
/** Lo que regresa `compras.datos_materiales`. */
const deMateriales = z.record(z.string(), z.object({ nombre: z.string() }));
/** Lo que regresa `admin.aparatos_sin_sincronizar`. */
const deAparatos = z.object({
	aparatos: z.array(
		z.object({
			dispositivo_id: z.uuid(),
			nombre: z.string(),
			ubicacion: z.string().nullable(),
			sin_sincronizar: z.string(),
		}),
	),
});
/** Lo que regresa `inventario.ultimo_cuadre`. */
const deCuadre = z.object({
	cuadre: z
		.object({
			cuadre_id: z.uuid(),
			fecha: z.string(),
			estado: z.string(),
			diferencias_creadas: z.number(),
			excepciones_creadas: z.number(),
		})
		.nullable(),
});

/**
 * Un parámetro numérico de Dirección.
 * @param contexto El contexto de la transacción.
 * @param clave La clave completa.
 */
async function numero(contexto: ContextoDeAccion, clave: string): Promise<number> {
	return Number(await leerParametro(contexto.transaccion, { clave }));
}

/**
 * Lee a cada dueño con sus lecturas lo que necesitan las reglas de las alertas (regla 3: Dirección no lee las tablas
 * de otros).
 * @param contexto El contexto de la transacción del trabajo.
 * @param vencidoDias Desde cuántos días vencido cuenta para la concentración.
 */
async function leerDatos(contexto: ContextoDeAccion, vencidoDias: number): Promise<DatosDeLasAlertas> {
	const leer = async <T>(esquema: z.ZodType<T>, lectura: string, datos: unknown = {}) =>
		esquema.parse(await contexto.lectura(lectura, datos));
	// El desperdicio de todas las prendas cortadas, con su nombre.
	const { prendas } = await leer(deDesperdicios, "patronaje.desperdicio_prenda");
	const { nombres } = await leer(deNombres, "catalogo.nombres_de_productos", {
		producto_ids: prendas.filter((prenda) => prenda.alto).map((prenda) => prenda.producto_id),
	});
	// Los descontinuados, con las piezas de todas sus variantes.
	const { productos } = await leer(deDescontinuados, "catalogo.productos_descontinuados");
	const { piezas } = await leer(deExistencia, "inventario.existencia_de_variantes", {
		variante_ids: productos.flatMap((producto) => producto.variante_ids),
	});
	// La cuenta de cada material activo; el nombre, solo de los que no tienen tiempo de entrega.
	const cuentas = await leer(deCuentas, "compras.cuenta_material");
	const sinTiempo = Object.entries(cuentas).filter(([, cuenta]) => cuenta.estado === "sin_tiempo_de_entrega");
	const datosDeMateriales = await leer(deMateriales, "compras.datos_materiales", {
		material_ids: sinTiempo.map(([id]) => id),
	});
	const { cuadre } = await leer(deCuadre, "inventario.ultimo_cuadre");
	return {
		lotesAtorados: (await leer(deLotes, "produccion.lotes_atorados")).lotes,
		desperdicios: prendas.flatMap((prenda) => {
			const producto = nombres[prenda.producto_id];
			return producto === undefined ? [] : [{ ...prenda, producto }];
		}),
		clienteQueMasDebe: (await leer(deResumen, "contaduria.resumen_direccion", { dias_vencido: vencidoDias }))
			.cliente_que_mas_debe,
		descontinuados: productos.map((producto) => ({
			producto_id: producto.producto_id,
			nombre: producto.nombre,
			piezas: producto.variante_ids.reduce((suma, id) => suma + (piezas[id] ?? 0), 0),
		})),
		materiales: sinTiempo.flatMap(([id, cuenta]) => {
			const material = datosDeMateriales[id];
			return material === undefined ? [] : [{ material_id: id, nombre: material.nombre, ...cuenta }];
		}),
		aparatos: (await leer(deAparatos, "admin.aparatos_sin_sincronizar")).aparatos,
		cuadre:
			cuadre === null
				? null
				: {
						cuadre_id: cuadre.cuadre_id,
						fecha: cuadre.fecha,
						estado: cuadre.estado,
						por_revisar: cuadre.diferencias_creadas + cuadre.excepciones_creadas,
					},
	};
}

/**
 * Calcula las alertas de este momento, con la misma función que la consulta de Alertas cruzadas.
 * @param contexto El contexto de la transacción.
 */
export async function alertasDeAhora(contexto: ContextoDeAccion): Promise<AlertaDeDireccion[]> {
	const concentracionVencidoDias = await numero(contexto, "direccion.alerta_concentracion_vencido_dias");
	return alertasDeDireccion(await leerDatos(contexto, concentracionVencidoDias), {
		consumoTelaMax: await numero(contexto, "direccion.alerta_consumo_tela_max"),
		concentracionPct: await numero(contexto, "direccion.alerta_concentracion_cliente_pct"),
		concentracionVencidoDias,
		reposicionMax: await numero(contexto, "direccion.alerta_reposicion_max"),
	});
}

/**
 * Compara las alertas de ahora con la memoria: guarda las nuevas y las avisa, pone al día las que siguen y marca las
 * que dejaron de salir (regla 4).
 * @param contexto El contexto de la transacción del trabajo.
 * @returns Cuántas alertas nuevas avisó.
 */
export async function revisarAlertas(contexto: ContextoDeAccion): Promise<number> {
	const { transaccion } = contexto;
	const ahora = contexto.ahora.toString();
	const alertas = await alertasDeAhora(contexto);
	const vistas = await transaccion
		.select({ id: alertasDireccionVistas.id, clave: alertasDireccionVistas.clave })
		.from(alertasDireccionVistas)
		.where(isNull(alertasDireccionVistas.desaparecioEn))
		.for("update");
	const vistaDe = new Map(vistas.map((vista) => [vista.clave, vista.id]));
	const deAhora = new Set(alertas.map((alerta) => alerta.clave));
	let nuevas = 0;
	for (const alerta of alertas) {
		const id = vistaDe.get(alerta.clave);
		// La que ya estaba: su última vez, su título y su color.
		if (id !== undefined) {
			await transaccion
				.update(alertasDireccionVistas)
				.set({ ultimaVezEn: ahora, titulo: alerta.titulo, color: alerta.color })
				.where(eq(alertasDireccionVistas.id, id));
			continue;
		}
		// La nueva (o la que reaparece): nace en la memoria, avisada.
		await transaccion.insert(alertasDireccionVistas).values({
			id: uuidv7(),
			clave: alerta.clave,
			regla: alerta.regla,
			entidadId: alerta.entidadId,
			titulo: alerta.titulo,
			color: alerta.color,
			primeraVezEn: ahora,
			ultimaVezEn: ahora,
			avisadaEn: ahora,
		});
		await contexto.interna("admin.crear_aviso", {
			tipo: "alerta_direccion",
			destinatarios: { regla: "departamento:direccion" },
			// El aviso llega a toda cuenta de Dirección, la de soporte también: va sin montos.
			texto: alerta.tituloSinMontos ?? alerta.titulo,
			enlace: alerta.ver,
			entidad: alerta.entidad,
			entidadId: alerta.entidadId,
		});
		nuevas++;
	}
	// Las que dejaron de salir: desaparecen de la memoria; si vuelven, son nuevas.
	const desaparecidas = vistas.filter((vista) => !deAhora.has(vista.clave));
	for (const vista of desaparecidas) {
		await transaccion
			.update(alertasDireccionVistas)
			.set({ desaparecioEn: ahora })
			.where(and(eq(alertasDireccionVistas.id, vista.id), isNull(alertasDireccionVistas.desaparecioEn)));
	}
	if (nuevas > 0 || desaparecidas.length > 0) {
		contexto.guardarEvento({
			tipo: "alertas_direccion.cambiaron",
			datos: { nuevas, desaparecieron: desaparecidas.length },
			tablas: ["alertas_direccion_vistas"],
			entidad: "alertas_direccion_vistas",
		});
		contexto.bitacora({
			descripcion: `Alertas de Dirección: ${nuevas} nuevas y ${desaparecidas.length} que dejaron de salir`,
			entidad: "alertas_direccion_vistas",
			despues: { nuevas, desaparecieron: desaparecidas.length },
		});
	}
	return nuevas;
}

export const alertasDireccion: Trabajo = {
	nombre: "direccion.alertas_direccion",
	horario: async (contexto) => ({
		cada: "minutos",
		minutos: Number(await leerParametro(contexto.base, { clave: "direccion.minutos_revisar_alertas" })),
	}),
	trasEventos: ["cuadre.terminado"],
	correr: async (contexto) => {
		await contexto.enTransaccion(revisarAlertas);
	},
};
