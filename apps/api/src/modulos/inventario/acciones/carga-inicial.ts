/**
 * `inventario.registrar_carga_inicial` e `inventario.registrar_carga_inicial_material`: la existencia de arranque de
 * las prendas y del material, sin ajuste y solo donde todavía no hay movimientos.
 * Fase 14 · docs/modulos/inventario/conteos.md (reglas 6 y 7, «Acciones»)
 *
 * La de prendas es un conteo `inicial` con 0 en el sistema y su movimiento `carga_inicial`. La de material crea, en
 * tela, sus rollos con el costo de la tela y la partida del proveedor habitual, y vuelve a calcular los sugeridos;
 * los avíos van por cantidad a Bodega y los consumibles a `inventario.ubicacion_consumibles`.
 */

import { aMilesimos, cantidadEnTexto, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import {
	registrarCargaInicial,
	registrarCargaInicialMaterial,
} from "@uniformame/compartido/contratos/inventario/diferencias";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { candadoDeVariantes } from "../dominio/candados.ts";
import { revisarVariantes, ubicacionContable } from "../dominio/conteos.ts";
import { escribirMovimiento, type RenglonDeMovimiento } from "../dominio/escribir-movimiento.ts";
import { partidasDe } from "../dominio/partidas.ts";
import { ubicacionDeTipo } from "../dominio/recepciones.ts";
import { nombreDeVariante } from "../dominio/reservas.ts";
import { conteoLineas, conteos, movimientoLineas, rollos, ubicaciones } from "../tablas.ts";

/** Lo que regresa `admin.tomar_folio`. */
const folioTomado = z.object({ folio: z.string() });

export const accionRegistrarCargaInicial = implementarAccion(registrarCargaInicial, async (contexto, datos) => {
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
	if (datos.alcance === "prenda" && datos.producto_id === undefined) {
		throw errorDeCampo("producto_id", "Elige la prenda que vas a contar.");
	}
	if (datos.alcance === "seccion" && datos.seccion_id === undefined) {
		throw errorDeCampo("seccion_id", "Elige la sección que vas a contar.");
	}
	const que = await revisarVariantes(
		contexto,
		varianteIds,
		datos.alcance === "prenda"
			? { productoId: datos.producto_id ?? "" }
			: datos.alcance === "seccion"
				? { seccionId: datos.seccion_id ?? "" }
				: { toda: true },
	);
	// Solo donde esa variante no tiene movimientos todavía (regla 6): con su candado, nadie mueve mientras tanto.
	await candadoDeVariantes(transaccion, varianteIds);
	const [conMovimientos] = await transaccion
		.select({ varianteId: movimientoLineas.varianteId })
		.from(movimientoLineas)
		.where(
			and(
				inArray(movimientoLineas.varianteId, varianteIds),
				or(eq(movimientoLineas.origenUbicacionId, ubicacion.id), eq(movimientoLineas.destinoUbicacionId, ubicacion.id)),
			),
		)
		.limit(1);
	// Una carga inicial en 0 no deja movimiento, pero ya es su carga: tampoco entra otra (decisión 649).
	const [yaCargada] =
		conMovimientos === undefined
			? await transaccion
					.select({ varianteId: conteoLineas.varianteId })
					.from(conteoLineas)
					.innerJoin(conteos, eq(conteos.id, conteoLineas.conteoId))
					.where(
						and(
							eq(conteos.tipo, "inicial"),
							eq(conteos.ubicacionId, ubicacion.id),
							inArray(conteoLineas.varianteId, varianteIds),
						),
					)
					.limit(1)
			: [conMovimientos];
	if (yaCargada?.varianteId != null) {
		const { prenda, talla } = await nombreDeVariante(transaccion, yaCargada.varianteId);
		throw errorDeRegla(
			"ya_tiene_movimientos",
			`${prenda} talla ${talla} ya tiene movimientos en ${ubicacion.nombre}: usa un conteo.`,
		);
	}
	const { folio } = folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "conteo" }));
	const conteoId = uuidv7();
	const quien = quienCambia(contexto);
	await transaccion.insert(conteos).values({
		id: conteoId,
		folio,
		tipo: "inicial",
		ubicacionId: ubicacion.id,
		alcance: datos.alcance,
		productoId: datos.alcance === "prenda" ? (datos.producto_id ?? null) : null,
		seccionId: datos.alcance === "seccion" ? (datos.seccion_id ?? null) : null,
		estado: "contado",
		contadoEn: contadoEn.toString(),
		contadoPor: quien,
		creadoPor: quien,
	});
	await transaccion.insert(conteoLineas).values(
		datos.renglones.map((renglon) => ({
			id: uuidv7(),
			conteoId,
			varianteId: renglon.variante_id,
			piezasSistema: 0,
			piezasContadas: renglon.piezas,
			creadoPor: quien,
		})),
	);
	const conPiezas = datos.renglones.filter((renglon) => renglon.piezas > 0);
	if (conPiezas.length > 0) {
		await escribirMovimiento(contexto, {
			tipo: "carga_inicial",
			documento: { tipo: "conteo", id: conteoId, folio },
			renglones: conPiezas.map((renglon) => ({
				origen: null,
				destino: ubicacion.id,
				varianteId: renglon.variante_id,
				piezas: renglon.piezas,
			})),
			ocurridoEn: contadoEn,
		});
	}
	const piezas = conPiezas.reduce((suma, renglon) => suma + renglon.piezas, 0);
	contexto.guardarEvento({
		tipo: "conteo.guardado",
		datos: { conteo_id: conteoId },
		tablas: ["conteos", "conteo_lineas", "existencias"],
		entidad: "conteos",
		entidadId: conteoId,
		entidadFolio: folio,
	});
	contexto.bitacora({
		descripcion: `Carga inicial en ${ubicacion.nombre}`,
		entidad: "conteos",
		entidadId: conteoId,
		entidadFolio: folio,
		despues: { de: que, renglones: datos.renglones },
	});
	return {
		resultado: {
			mensaje: `${folio}: carga inicial de ${piezas} piezas en ${ubicacion.nombre}`,
			conteo_id: conteoId,
			folio,
		},
		entidad: { nombre: "conteos", id: conteoId },
	};
});

/** Lo que regresa `compras.datos_materiales`, en lo que usa la carga inicial. */
const datosDeMaterial = z.record(
	z.string(),
	z
		.object({
			nombre: z.string(),
			tipo: z.string(),
			unidad: z.string(),
			se_cuenta_entera: z.boolean(),
			proveedor_habitual_id: z.uuid().nullable(),
		})
		.passthrough(),
);

export const accionRegistrarCargaInicialMaterial = implementarAccion(
	registrarCargaInicialMaterial,
	async (contexto, datos) => {
		const { transaccion } = contexto;
		const material = datosDeMaterial.parse(
			await contexto.lectura("compras.datos_materiales", { material_ids: [datos.material_id] }),
		)[datos.material_id];
		if (material === undefined) throw errorDeCampo("material_id", "Escoge el material.");
		const esTela = material.tipo === "tela";
		const cantidad = aMilesimos(datos.cantidad);
		if (material.se_cuenta_entera && cantidad % 1000n !== 0n) throw errorDeCampo("cantidad", "Número entero");
		if (!esTela && datos.rollos !== undefined) throw errorDeCampo("rollos", "Solo la tela lleva rollos.");
		const suman = (datos.rollos ?? []).reduce((suma, rollo) => suma + aMilesimos(rollo.metros), 0n);
		if (datos.rollos !== undefined && datos.rollos.length > 0 && suman !== cantidad) {
			throw errorDeCampo(
				"rollos",
				`Los rollos suman ${cantidadEnTexto(suman)} m y escribiste ${cantidadEnTexto(cantidad)} m.`,
			);
		}
		const conPartida = (datos.rollos ?? []).some((rollo) => rollo.partida !== undefined);
		if (conPartida && material.proveedor_habitual_id === null) {
			throw errorDeCampo("rollos", `${material.nombre} no tiene proveedor habitual: carga sus rollos sin partida.`);
		}
		// Una sola carga por material, y solo si no tiene movimientos: dos a la vez se ponen en fila.
		await transaccion.execute(
			sql`SELECT pg_advisory_xact_lock(hashtextextended(${`carga_inicial_material:${datos.material_id}`}, 0))`,
		);
		const [conMovimientos] = await transaccion
			.select({ id: movimientoLineas.id })
			.from(movimientoLineas)
			.where(eq(movimientoLineas.materialId, datos.material_id))
			.limit(1);
		if (conMovimientos !== undefined) {
			throw errorDeRegla("ya_tiene_carga_inicial", `${material.nombre} ya tiene carga inicial o movimientos.`);
		}
		// Dónde queda: la tela y los avíos en Bodega; los consumibles donde los toma el taller.
		const tipoDeUbicacion =
			material.tipo === "consumible"
				? z
						.enum(["bodega", "taller", "aduana"])
						.parse(await contexto.lectura("admin.parametro", { clave: "inventario.ubicacion_consumibles" }))
				: "bodega";
		const destino = await ubicacionDeTipo(transaccion, tipoDeUbicacion);
		const [lugar] = await transaccion
			.select({ nombre: ubicaciones.nombre })
			.from(ubicaciones)
			.where(eq(ubicaciones.id, destino));
		const texto = `${cantidadEnTexto(cantidad)} ${material.unidad}`;
		const mensaje = `${material.nombre}: carga inicial de ${texto} en ${lugar?.nombre ?? ""}`;
		if (cantidad === 0n) {
			contexto.bitacora({
				descripcion: `Carga inicial de ${material.nombre}`,
				entidad: "materiales",
				entidadId: datos.material_id,
				despues: { cantidad: datos.cantidad },
			});
			return { resultado: { mensaje, rollos: [] }, entidad: { nombre: "materiales", id: datos.material_id } };
		}
		const movimientoId = uuidv7();
		const quien = quienCambia(contexto);
		// En tela, sus rollos: los que se dieron, o uno solo con toda la cantidad.
		const nuevos: { rolloId: string; folio: string; milesimos: bigint }[] = [];
		if (esTela) {
			const costo = z
				.record(z.string(), z.number())
				.parse(await contexto.lectura("compras.costo_material", { material_ids: [datos.material_id] }))[
				datos.material_id
			];
			const dados = datos.rollos !== undefined && datos.rollos.length > 0 ? datos.rollos : [{ metros: datos.cantidad }];
			const codigos = dados.flatMap((rollo) =>
				"partida" in rollo && rollo.partida !== undefined ? [rollo.partida.toUpperCase()] : [],
			);
			const partidas =
				codigos.length === 0 || material.proveedor_habitual_id === null
					? new Map<string, string>()
					: await partidasDe(contexto, material.proveedor_habitual_id, datos.material_id, codigos, null);
			for (const rollo of dados) {
				const rolloId = uuidv7();
				const { folio } = folioTomado.parse(await contexto.interna("admin.tomar_folio", { tipo: "rollo" }));
				const partida = "partida" in rollo && rollo.partida !== undefined ? rollo.partida.toUpperCase() : undefined;
				await transaccion.insert(rollos).values({
					id: rolloId,
					folio,
					materialId: datos.material_id,
					partidaTelaId: partida === undefined ? null : (partidas.get(partida) ?? null),
					proveedorId: material.proveedor_habitual_id,
					metrosIniciales: rollo.metros,
					costoMetroCentavos: costo !== undefined && costo > 0 ? costo : null,
					estado: "disponible",
					esCargaInicial: true,
					creadoPor: quien,
				});
				nuevos.push({ rolloId, folio, milesimos: aMilesimos(rollo.metros) });
			}
		}
		const renglones: RenglonDeMovimiento[] = esTela
			? nuevos.map((nuevo) => ({
					origen: null,
					destino,
					materialId: datos.material_id,
					rolloId: nuevo.rolloId,
					cantidad: deMilesimos(nuevo.milesimos),
				}))
			: [{ origen: null, destino, materialId: datos.material_id, cantidad: deMilesimos(cantidad) }];
		// Su documento es el propio movimiento: no tiene tabla.
		await escribirMovimiento(contexto, {
			id: movimientoId,
			tipo: "carga_inicial",
			documento: { tipo: "carga_inicial", id: movimientoId, folio: material.nombre },
			renglones,
		});
		if (esTela) await contexto.interna("inventario.recalcular_rollos_sugeridos", { material_id: datos.material_id });
		contexto.guardarEvento({
			tipo: "carga_inicial.material",
			datos: { material_id: datos.material_id, movimiento_id: movimientoId },
			tablas: ["existencias_material", "rollos", "partidas_tela"],
			entidad: "movimientos",
			entidadId: movimientoId,
		});
		for (const nuevo of nuevos) {
			contexto.guardarEvento({
				tipo: "rollo.recibido",
				datos: { rollo_id: nuevo.rolloId },
				tablas: ["rollos"],
				entidad: "rollos",
				entidadId: nuevo.rolloId,
				entidadFolio: nuevo.folio,
			});
		}
		contexto.bitacora({
			descripcion: `Carga inicial de ${material.nombre}`,
			entidad: "movimientos",
			entidadId: movimientoId,
			despues: {
				cantidad: datos.cantidad,
				rollos: nuevos.map((nuevo) => ({ rollo: nuevo.folio, metros: deMilesimos(nuevo.milesimos) })),
			},
		});
		return {
			resultado: {
				mensaje,
				movimiento_id: movimientoId,
				rollos: nuevos.map((nuevo) => ({ rollo_id: nuevo.rolloId, folio: nuevo.folio })),
			},
			entidad: { nombre: "movimientos", id: movimientoId },
		};
	},
);
