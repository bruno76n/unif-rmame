/**
 * `inventario.guardar_conteo`: Bodega (en Bodega o en Aduana) o Aduana (en Aduana) guardan un conteo ciego, por
 * sección o de una DF- por contar.
 * Fase 14 · docs/modulos/inventario/conteos.md (reglas 1 a 5, «`inventario.guardar_conteo`»)
 *
 * Lo que decía el sistema sale del libro hasta la hora del conteo (`ocurrido_en`): lo que pasó mientras se contaba no
 * se pisa. Si no cuadra, nace un AJ- con un renglón por variante; la existencia no cambia hasta que Dirección lo
 * autoriza. El conteo cierra las DF- por contar de esa ubicación y esas variantes: las que cuadran quedan resueltas y
 * las demás esperan con el AJ-.
 */

import { guardarConteo } from "@uniformame/compartido/contratos/inventario/diferencias";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { ErrorDeApi, errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { productos, secciones, variantes } from "../../catalogo/tablas.ts";
import { pedirAjuste, revisarMotivoDeAjuste } from "../dominio/ajustes.ts";
import { candadoDeVariantes } from "../dominio/candados.ts";
import { type Diferencia, diferenciaBloqueada, diferenciasBloqueadas } from "../dominio/diferencias.ts";
import { nombreDeVariante } from "../dominio/reservas.ts";
import { conteoLineas, conteos, diferencias, ubicaciones } from "../tablas.ts";

/**
 * Lo que decía el libro de unas variantes en una ubicación a una hora: la suma de sus renglones con `ocurrido_en`
 * hasta esa hora (docs/modulos/inventario/libro-de-movimientos.md, regla 8).
 * @returns Por variante, sus piezas; la que no tiene renglones no viene (es 0).
 */
async function sistemaALaHora(
	contexto: ContextoDeAccion,
	ubicacionId: string,
	varianteIds: readonly string[],
	hora: string,
): Promise<Map<string, number>> {
	const ids = sql.join(
		varianteIds.map((id) => sql`${id}::uuid`),
		sql`, `,
	);
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT l.variante_id,
			sum(CASE WHEN l.destino_ubicacion_id = ${ubicacionId} THEN l.piezas ELSE -l.piezas END)::int AS piezas
		FROM movimiento_lineas l JOIN movimientos m ON m.id = l.movimiento_id
		WHERE l.variante_id IN (${ids}) AND ${ubicacionId} IN (l.origen_ubicacion_id, l.destino_ubicacion_id)
			AND m.ocurrido_en <= ${hora}::timestamptz
		GROUP BY l.variante_id`);
	const filas = z.array(z.object({ variante_id: z.uuid(), piezas: z.number() })).parse(rows);
	return new Map(filas.map((fila) => [fila.variante_id, fila.piezas]));
}

/**
 * La ubicación donde se cuenta: Bodega o Aduana; y quien la cuenta: Bodega en las dos, Aduana solo en Aduana.
 * @throws `422 ubicacion_no_contable`; `403 sin_departamento` si Aduana cuenta en Bodega.
 */
async function ubicacionContable(contexto: ContextoDeAccion, ubicacionId: string) {
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
async function revisarVariantes(
	contexto: ContextoDeAccion,
	varianteIds: readonly string[],
	de: { seccionId: string } | { diferencia: Diferencia },
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
	const ajena = varianteIds.find((id) => !deLaSeccion.some((suya) => suya.id === id));
	if (ajena !== undefined) {
		const { prenda, talla } = await nombreDeVariante(transaccion, ajena);
		throw errorDeRegla("variante_ajena", `${prenda} talla ${talla} no es de ${seccion.nombre}.`);
	}
	return seccion.nombre;
}

export const accionGuardarConteo = implementarAccion(guardarConteo, async (contexto, datos) => {
	const { transaccion } = contexto;
	const ubicacion = await ubicacionContable(contexto, datos.ubicacion_id);
	const contadoEn = datos.contado_en === undefined ? contexto.ahora : Temporal.Instant.from(datos.contado_en);
	if (Temporal.Instant.compare(contadoEn, contexto.ahora) > 0) {
		throw errorDeCampo("contado_en", "La hora del conteo no puede ser después de ahora.");
	}
	const varianteIds = datos.renglones.map((renglon) => renglon.variante_id);
	if (new Set(varianteIds).size !== varianteIds.length) {
		throw errorDeCampo("renglones", "Cada prenda y talla va una sola vez.");
	}
	// Los candados en el orden fijo: las variantes, luego las DF- (la del conteo y las por contar de rule 4).
	await candadoDeVariantes(transaccion, varianteIds);
	let deLaDiferencia: Diferencia | undefined;
	if (datos.diferencia_id !== undefined) {
		// Un conteo es un documento nuevo: no lleva versión. La DF- la cuida su candado, y su estado dice si alguien
		// ya la contó o la aclaró mientras tanto.
		deLaDiferencia = await diferenciaBloqueada(contexto, datos.diferencia_id);
		const suya = deLaDiferencia;
		if (suya.estado !== "por_contar") {
			throw errorDeRegla("diferencia_no_por_contar", `${suya.folio} ya no está por contar.`);
		}
		if (suya.ubicacionId !== ubicacion.id) {
			throw errorDeRegla("ubicacion_no_contable", "Aquí solo se cuenta en Bodega o en Aduana.");
		}
	} else {
		if (datos.seccion_id === undefined) throw errorDeCampo("seccion_id", "Elige la sección que vas a contar.");
	}
	const que = await revisarVariantes(
		contexto,
		varianteIds,
		deLaDiferencia === undefined ? { seccionId: datos.seccion_id ?? "" } : { diferencia: deLaDiferencia },
	);
	const sistema = await sistemaALaHora(contexto, ubicacion.id, varianteIds, contadoEn.toString());
	const renglones = datos.renglones.map((renglon) => ({
		id: uuidv7(),
		varianteId: renglon.variante_id,
		piezasSistema: sistema.get(renglon.variante_id) ?? 0,
		piezasContadas: renglon.piezas,
	}));
	const noCuadran = renglones.filter((renglon) => renglon.piezasContadas !== renglon.piezasSistema);
	const motivoId =
		noCuadran.length === 0 ? undefined : await revisarMotivoDeAjuste(contexto, datos.motivo_id, "motivo_id");
	// El conteo y lo que decía el sistema a su hora.
	const { folio } = z
		.object({ folio: z.string() })
		.parse(await contexto.interna("admin.tomar_folio", { tipo: "conteo" }));
	const conteoId = uuidv7();
	const quien = quienCambia(contexto);
	await transaccion.insert(conteos).values({
		id: conteoId,
		folio,
		tipo: deLaDiferencia === undefined ? "nuevo" : "diferencia",
		ubicacionId: ubicacion.id,
		seccionId: deLaDiferencia === undefined ? (datos.seccion_id ?? null) : null,
		diferenciaId: deLaDiferencia?.id ?? null,
		estado: "contado",
		contadoEn: contadoEn.toString(),
		contadoPor: quien,
		creadoPor: quien,
	});
	await transaccion
		.insert(conteoLineas)
		.values(renglones.map((renglon) => ({ ...renglon, conteoId, creadoPor: quien })));
	const ajuste =
		motivoId === undefined
			? undefined
			: await pedirAjuste(contexto, {
					ubicacionId: ubicacion.id,
					origen: "conteo",
					conteoId,
					motivoId,
					motivoTexto: datos.motivo_texto,
					departamento: ubicacion.departamento,
					renglones: noCuadran.map((renglon) => ({
						varianteId: renglon.varianteId,
						piezas: renglon.piezasContadas - renglon.piezasSistema,
						piezasSistema: renglon.piezasSistema,
						piezasContadas: renglon.piezasContadas,
						conteoLineaId: renglon.id,
					})),
				});
	// Regla 4: las DF- por contar de esa ubicación y esas variantes, sean del conteo o no.
	const porContar = await transaccion
		.select({ id: diferencias.id })
		.from(diferencias)
		.where(
			and(
				eq(diferencias.ubicacionId, ubicacion.id),
				inArray(diferencias.varianteId, varianteIds),
				eq(diferencias.estado, "por_contar"),
			),
		);
	const cerradas = await diferenciasBloqueadas(
		contexto,
		porContar.map((suya) => suya.id),
	);
	const resueltas: string[] = [];
	for (const diferencia of cerradas.filter((suya) => suya.estado === "por_contar")) {
		const cuadro = !noCuadran.some((renglon) => renglon.varianteId === diferencia.varianteId);
		await transaccion
			.update(diferencias)
			.set(
				cuadro
					? {
							estado: "resuelta",
							resolucion: "cuadro",
							conteoId,
							resueltaEn: contexto.ahora.toString(),
							resueltaPor: quien,
						}
					: { estado: "esperando_autorizacion", conteoId, ajusteId: ajuste?.ajusteId ?? null },
			)
			.where(eq(diferencias.id, diferencia.id));
		if (!cuadro) continue;
		resueltas.push(diferencia.folio);
		contexto.guardarEvento({
			tipo: "diferencia.resuelta",
			datos: { diferencia_id: diferencia.id },
			tablas: ["diferencias"],
			entidad: "diferencias",
			entidadId: diferencia.id,
			entidadFolio: diferencia.folio,
		});
	}
	contexto.guardarEvento({
		tipo: "conteo.guardado",
		datos: { conteo_id: conteoId },
		tablas: ["conteos", "conteo_lineas", "diferencias"],
		entidad: "conteos",
		entidadId: conteoId,
		entidadFolio: folio,
	});
	contexto.bitacora({
		descripcion: deLaDiferencia === undefined ? `Contó ${que} en ${ubicacion.nombre}` : `Contó ${que}`,
		entidad: "conteos",
		entidadId: conteoId,
		entidadFolio: folio,
		despues: {
			renglones: renglones.map((renglon) => ({
				variante_id: renglon.varianteId,
				sistema: renglon.piezasSistema,
				contado: renglon.piezasContadas,
			})),
			...(ajuste === undefined ? {} : { ajuste: ajuste.folio }),
			...(resueltas.length === 0 ? {} : { resueltas }),
		},
	});
	const n = renglones.length;
	const mensaje =
		ajuste !== undefined
			? ajuste.mensaje
			: deLaDiferencia !== undefined
				? `${deLaDiferencia.folio} aclarada: el conteo cuadra con el sistema`
				: `${folio}: ${n} ${n === 1 ? "prenda contada" : "prendas contadas"}, todo cuadra`;
	return {
		resultado: {
			mensaje,
			conteo_id: conteoId,
			folio,
			...(ajuste === undefined ? {} : { ajuste_id: ajuste.ajusteId }),
		},
		entidad: { nombre: "conteos", id: conteoId },
	};
});
