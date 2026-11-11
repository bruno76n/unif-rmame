/**
 * `produccion.cerrar_corte`: la oficina captura el corte ya hecho, de una vez; nadie mide tela: de cada tela se usa lo
 * que pide la receta, salvo que se escriba que quedó otra cosa. Al cerrar, el lote pasa a en proceso con su flujo y
 * su receta congelados, el inventario mueve la tela y las piezas, y el servidor arma los bultos.
 * Fase 12 · docs/modulos/produccion/corte-y-bultos.md (reglas 1 a 13, «`produccion.cerrar_corte`»)
 *
 * Las cuentas de la tela son las del paquete compartido (`usoDeLaTela`), con lo que pide la receta y el piso del
 * patrón de `patronaje.calcular_material`. Los rollos se bloquean con `inventario.rollos_para_corte` antes de contar.
 * Al cerrar nace un registro por bulto en la operación de corte, a nombre de quien cortó.
 */

import { usoDeLaTela } from "@uniformame/compartido/calculos/corte";
import { aMilesimos, cantidadEnTexto, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { cerrarCorte, imprimirEtiquetasBulto } from "@uniformame/compartido/contratos/produccion/corte";
import { and, asc, eq, inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { ErrorDeApi, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { productos, tallas, variantes } from "../../catalogo/tablas.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { personas } from "../../personal/tablas.ts";
import { armarBultos, folioDeBulto } from "../dominio/bultos.ts";
import { prendaQueSeFabrica } from "../dominio/lotes.ts";
import { registrosDelCorte } from "../dominio/registros.ts";
import { bultos, corteRollos, cortes, corteTelas, flujos, lotes, loteTallas } from "../tablas.ts";

/** Lo que pide la receta de cada material, con sus decimales. */
const deLaReceta = z.object({
	receta_version_id: z.uuid().nullable(),
	materiales: z.array(
		z.object({ material_id: z.uuid(), papel: z.string(), pide: z.string().nullable(), piso: z.string().nullable() }),
	),
});

/** Los rollos bloqueados, como los da `inventario.rollos_para_corte`. */
const deLosRollos = z.object({
	rollos: z.array(
		z.object({
			rollo_id: z.uuid(),
			folio: z.string(),
			material_id: z.uuid(),
			partida: z.string().nullable(),
			metros: z.string().nullable(),
			entregado_a: z.string().nullable(),
		}),
	),
});

/** Lo que regresa `inventario.registrar_corte`. */
const registrado = z.object({
	rollos: z.array(
		z.object({ rollo_id: z.uuid(), apartado_rollo_id: z.uuid().nullable(), metros_al_cortar: z.string() }),
	),
	retazos: z.array(z.object({ material_id: z.uuid(), retazo_id: z.uuid(), folio: z.string() })),
	avisos: z.array(z.string()),
});

/** Un `400` con su código y su campo. */
function errorDeLaCaptura(codigo: string, campo: string, mensaje: string) {
	return new ErrorDeApi("validacion", codigo, mensaje, { campos: { [campo]: mensaje } });
}

/**
 * Revisa quién cortó: una persona activa del Taller.
 * @throws `422 cortador_no_valido`: «¿Quién cortó?».
 */
async function revisarCortador(contexto: ContextoDeAccion, personaId: string): Promise<string> {
	const [persona] = await contexto.transaccion
		.select({ nombre: personas.nombre, area: personas.area, bajaEn: personas.bajaEn })
		.from(personas)
		.where(eq(personas.id, personaId))
		.for("share");
	if (persona === undefined || persona.area !== "taller" || persona.bajaEn !== null) {
		throw errorDeRegla("cortador_no_valido", "¿Quién cortó?");
	}
	return persona.nombre;
}

export const accionCerrarCorte = implementarAccion(cerrarCorte, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const [lote] = await transaccion.select().from(lotes).where(eq(lotes.id, datos.lote_id));
	if (lote === undefined) throw noExiste();
	await tomarVersion(contexto, lotes, lote.id, version, async () => ({ lote_id: lote.id, estado: lote.estado }));
	if (lote.estado !== "por_cortar") throw errorDeRegla("lote_no_por_cortar", `${lote.folio} ya está cortado.`);
	const cortador = await revisarCortador(contexto, datos.corto_persona_id);
	const prenda = await prendaQueSeFabrica(contexto, lote.productoId);
	// Las piezas por talla: tallas del lote, enteras, sin pasar de las planeadas y al menos una.
	const delLote = await transaccion
		.select({
			varianteId: loteTallas.varianteId,
			planeadas: loteTallas.piezasPlaneadas,
			tallaId: variantes.tallaId,
			orden: tallas.orden,
		})
		.from(loteTallas)
		.innerJoin(variantes, eq(variantes.id, loteTallas.varianteId))
		.innerJoin(tallas, eq(tallas.id, variantes.tallaId))
		.where(eq(loteTallas.loteId, lote.id))
		.orderBy(asc(tallas.orden));
	const piezasDe = new Map<string, number>();
	for (const talla of datos.tallas) {
		const suya = delLote.find((deEste) => deEste.varianteId === talla.variante_id);
		if (suya === undefined) throw errorDeLaCaptura("talla_ajena", "tallas", `Esa talla no es de ${lote.folio}.`);
		if (piezasDe.has(talla.variante_id)) {
			throw errorDeLaCaptura("talla_repetida", "tallas", "Esa talla ya está en la lista.");
		}
		if (talla.piezas > suya.planeadas) {
			throw errorDeRegla("piezas_mas_que_planeado", `Máximo ${suya.planeadas}`);
		}
		piezasDe.set(talla.variante_id, talla.piezas);
	}
	const cortadas = [...piezasDe.values()].reduce((suma, piezas) => suma + piezas, 0);
	if (cortadas === 0) throw errorDeRegla("sin_piezas", "Escribe cuántas piezas salieron");
	// La receta: la versión que mostró la captura sigue vigente; lo que pide para las piezas cortadas.
	const receta = deLaReceta.parse(
		await contexto.lectura("patronaje.calcular_material", {
			producto_id: lote.productoId,
			piezas_por_talla: delLote.map((talla) => ({
				talla_id: talla.tallaId,
				piezas: piezasDe.get(talla.varianteId) ?? 0,
			})),
		}),
	);
	if (receta.receta_version_id === null) {
		throw errorDeRegla("sin_receta", "Sin receta no se puede cortar: el sistema no sabe cuánta tela lleva cada talla.");
	}
	if (receta.receta_version_id !== datos.receta_version_id) {
		throw errorDeRegla(
			"receta_cambio",
			`La receta de ${prenda.nombre} cambió mientras capturabas: revisa la tela y vuelve a cerrar.`,
		);
	}
	const telasDeLaReceta = receta.materiales.filter((material) =>
		["tela_principal", "combinacion", "forro"].includes(material.papel),
	);
	const nombres = z.record(z.string(), z.object({ nombre: z.string() })).parse(
		await contexto.lectura("compras.datos_materiales", {
			material_ids: [
				...new Set([
					...telasDeLaReceta.map((tela) => tela.material_id),
					...datos.telas.map((tela) => tela.material_id),
				]),
			],
		}),
	);
	const nombreDe = (materialId: string) => nombres[materialId]?.nombre ?? "Esa tela";
	if (new Set(datos.telas.map((tela) => tela.material_id)).size !== datos.telas.length) {
		throw errorDeLaCaptura("tela_repetida", "telas", "Esa tela ya está en la lista.");
	}
	for (const tela of datos.telas) {
		if (!telasDeLaReceta.some((suya) => suya.material_id === tela.material_id)) {
			throw errorDeRegla(
				"tela_fuera_de_receta",
				`${nombreDe(tela.material_id)} no está en la receta de ${prenda.nombre}.`,
			);
		}
	}
	for (const tela of telasDeLaReceta) {
		if (!datos.telas.some((suya) => suya.material_id === tela.material_id)) {
			throw errorDeRegla("falta_tela", `La receta lleva ${nombreDe(tela.material_id)}: agrega sus rollos.`);
		}
	}
	const rolloIds = datos.telas.flatMap((tela) => tela.rollos.map((rollo) => rollo.rollo_id));
	if (new Set(rolloIds).size !== rolloIds.length) {
		throw errorDeLaCaptura("rollo_repetido", "telas", "Ese rollo ya está en la lista.");
	}
	const losRollos = deLosRollos.parse(
		await contexto.lectura("inventario.rollos_para_corte", { lote_id: lote.id, rollo_ids: rolloIds }),
	);
	const frontera = aMilesimos(
		String(await contexto.lectura("admin.parametro", { clave: "inventario.metros_frontera_rollo" })),
	);
	// Cada tela: sus rollos, lo que se usa de cada uno, lo que quedó y a dónde va.
	const avisos: string[] = [];
	const telas = datos.telas.map((tela) => {
		const suyos = tela.rollos.map(({ rollo_id }) => {
			const rollo = losRollos.rollos.find((suyo) => suyo.rollo_id === rollo_id);
			if (rollo === undefined) throw noExiste();
			if (rollo.material_id !== tela.material_id) {
				throw errorDeRegla("rollo_otra_tela", `${rollo.folio} no es de ${nombreDe(tela.material_id)}.`);
			}
			if (rollo.entregado_a !== null) {
				throw errorDeRegla("rollo_de_otro_lote", `${rollo.folio} está entregado a ${rollo.entregado_a}`);
			}
			if (rollo.metros === null) {
				throw errorDeRegla("rollo_no_disponible", `${rollo.folio} ya no está disponible para este corte.`);
			}
			return { ...rollo, milesimos: aMilesimos(rollo.metros) };
		});
		const deReceta = telasDeLaReceta.find((suya) => suya.material_id === tela.material_id);
		const pide = aMilesimos(deReceta?.pide ?? "0");
		const piso = aMilesimos(deReceta?.piso ?? "0");
		const ultimo = suyos.at(-1);
		const quedaron = tela.metros_quedaron === undefined ? undefined : aMilesimos(tela.metros_quedaron);
		if (ultimo !== undefined && quedaron !== undefined && quedaron >= ultimo.milesimos) {
			throw errorDeRegla(
				"quedo_mas_que_rollo",
				`Del rollo ${ultimo.folio} no pueden quedar más de ${cantidadEnTexto(ultimo.milesimos - 1n)} m`,
			);
		}
		const uso = usoDeLaTela(
			suyos.map((rollo) => ({ rolloId: rollo.rollo_id, milesimos: rollo.milesimos })),
			pide,
			quedaron,
		);
		const sinUsar = uso.usados.find((usado) => usado.milesimos === 0n);
		if (sinUsar !== undefined) {
			const folio = suyos.find((rollo) => rollo.rollo_id === sinUsar.rolloId)?.folio ?? "";
			throw errorDeRegla("rollo_sin_usar", `Del rollo ${folio} no se usó nada: quítalo de la lista`);
		}
		const usado = uso.usados.reduce((suma, rollo) => suma + rollo.milesimos, 0n);
		const nombre = nombreDe(tela.material_id);
		const tienen = suyos.reduce((suma, rollo) => suma + rollo.milesimos, 0n);
		if (uso.faltan > 0n) {
			avisos.push(
				`Faltan ${cantidadEnTexto(uso.faltan)} m de ${nombre} · ${cortadas} piezas llevan ${cantidadEnTexto(pide)} m según la receta · los ${suyos.length} rollos tienen ${cantidadEnTexto(tienen)} m`,
			);
		}
		if (usado < piso) {
			avisos.push(
				`Con ${cantidadEnTexto(usado)} m de ${nombre} no salen ${cortadas} piezas según el patrón, que pide ${cantidadEnTexto(piso)} m: revisa lo que quedó.`,
			);
		}
		const partidas = [...new Set(suyos.flatMap((rollo) => (rollo.partida === null ? [] : [rollo.partida])))].sort();
		if (partidas.length > 1) {
			avisos.push(
				`Se mezclan las partidas ${partidas.slice(0, -1).join(", ")} y ${partidas.at(-1)}: el tono puede variar entre piezas.`,
			);
		}
		const destino =
			uso.quedan === 0n ? "ninguno" : uso.quedan >= frontera ? "rollo" : tela.ya_no_sirve === true ? "merma" : "retazo";
		return { tela, papel: deReceta?.papel ?? "tela_principal", pide, piso, uso, usado, suyos, destino } as const;
	});
	// El rendimiento de la tela principal contra el patrón.
	const principal = telas.find((tela) => tela.papel === "tela_principal");
	const rojo = Number(await contexto.lectura("admin.parametro", { clave: "produccion.rendimiento_rojo_porcentaje" }));
	if (principal !== undefined && principal.piso > 0n) {
		const sobre = Number(((principal.usado - principal.piso) * 100_000n) / principal.piso) / 1000;
		if (sobre > rojo) avisos.push(`+${Math.round(sobre)}% sobre el patrón`);
	}
	// El corte, lo que mueve en el inventario, sus telas y sus rollos.
	const verificar = z
		.object({ verifico: z.boolean() })
		.parse(await contexto.interna("patronaje.verificar_receta", { producto_id: lote.productoId, lote_id: lote.id }));
	const corteId = uuidv7();
	const quien = quienCambia(contexto);
	await transaccion.insert(cortes).values({
		id: corteId,
		loteId: lote.id,
		fecha: contexto.diaDeNegocio.toString(),
		cerradoEn: contexto.ahora.toString(),
		cortoPersonaId: datos.corto_persona_id,
		verificoReceta: verificar.verifico,
		creadoPor: quien,
	});
	const cortadasPorTalla = delLote.flatMap((talla) => {
		const piezas = piezasDe.get(talla.varianteId) ?? 0;
		return piezas > 0 ? [{ variante_id: talla.varianteId, piezas }] : [];
	});
	const enInventario = registrado.parse(
		await contexto.interna("inventario.registrar_corte", {
			corte_id: corteId,
			lote_id: lote.id,
			folio_lote: lote.folio,
			prenda: prenda.nombre,
			receta_version_id: receta.receta_version_id,
			telas: telas.map(({ tela, uso, destino }) => ({
				material_id: tela.material_id,
				rollos: uso.usados.map((usado, i) => ({
					rollo_id: usado.rolloId,
					orden: i + 1,
					metros_usados: deMilesimos(usado.milesimos),
					es_ultimo: i === uso.usados.length - 1,
				})),
				metros_quedaron: deMilesimos(uso.quedan),
				destino_sobrante: destino,
			})),
			tallas: cortadasPorTalla,
		}),
	);
	avisos.push(...enInventario.avisos);
	for (const { tela, papel, pide, uso, destino } of telas) {
		const corteTelaId = uuidv7();
		await transaccion.insert(corteTelas).values({
			id: corteTelaId,
			corteId,
			materialId: tela.material_id,
			papel: papel === "combinacion" || papel === "forro" ? papel : "tela_principal",
			metrosReceta: deMilesimos(pide),
			metrosQuedaron: deMilesimos(uso.quedan),
			quedaronCambiado: tela.metros_quedaron !== undefined,
			destinoSobrante: destino,
			retazoId: enInventario.retazos.find((retazo) => retazo.material_id === tela.material_id)?.retazo_id ?? null,
			creadoPor: quien,
		});
		await transaccion.insert(corteRollos).values(
			uso.usados.map((usado, i) => {
				const deInventario = enInventario.rollos.find((rollo) => rollo.rollo_id === usado.rolloId);
				return {
					id: uuidv7(),
					corteTelaId,
					rolloId: usado.rolloId,
					orden: i + 1,
					esUltimo: i === uso.usados.length - 1,
					apartadoRolloId: deInventario?.apartado_rollo_id ?? null,
					metrosAlCortar: deInventario?.metros_al_cortar ?? "0",
					metrosUsados: deMilesimos(usado.milesimos),
					creadoPor: quien,
				};
			}),
		);
	}
	// El lote: en proceso, con su flujo y su receta congelados, y las cortadas de cada talla.
	const [conFlujo] = await transaccion
		.select({ flujoId: productos.flujoId })
		.from(productos)
		.where(eq(productos.id, lote.productoId));
	// El flujo que congela, leído con `FOR SHARE`: nadie le agrega ni le quita operaciones mientras el lote lo toma.
	if (conFlujo?.flujoId != null) {
		await transaccion.select({ id: flujos.id }).from(flujos).where(eq(flujos.id, conFlujo.flujoId)).for("share");
	}
	await transaccion
		.update(lotes)
		.set({
			estado: "en_proceso",
			flujoId: conFlujo?.flujoId ?? null,
			recetaVersionId: receta.receta_version_id,
			cortadoEn: contexto.ahora.toString(),
			fechaCorte: contexto.diaDeNegocio.toString(),
		})
		.where(eq(lotes.id, lote.id));
	for (const talla of delLote) {
		await transaccion
			.update(loteTallas)
			.set({ piezasCortadas: piezasDe.get(talla.varianteId) ?? 0 })
			.where(and(eq(loteTallas.loteId, lote.id), eq(loteTallas.varianteId, talla.varianteId)));
	}
	// Los bultos, parejos y en el orden de las tallas.
	const maximo = Number(await contexto.lectura("admin.parametro", { clave: "produccion.bulto_max_piezas" }));
	const armados = armarBultos(
		cortadasPorTalla.map((talla) => ({ varianteId: talla.variante_id, piezas: talla.piezas })),
		maximo,
	);
	const nuevos = armados.map((bulto) => ({ id: uuidv7(), folio: folioDeBulto(lote.folio, bulto.numero), ...bulto }));
	await transaccion.insert(bultos).values(
		nuevos.map((bulto) => ({
			id: bulto.id,
			folio: bulto.folio,
			loteId: lote.id,
			varianteId: bulto.varianteId,
			numero: bulto.numero,
			piezas: bulto.piezas,
			creadoPor: quien,
		})),
	);
	// Un registro por bulto en la operación de corte, a nombre de quien cortó: cuenta para la nómina por pieza.
	await registrosDelCorte(contexto, {
		id: corteId,
		loteId: lote.id,
		flujoId: conFlujo?.flujoId ?? "",
		personaId: datos.corto_persona_id,
		bultos: nuevos,
	});
	const metrosPrincipal = principal === undefined ? 0n : principal.usado;
	const porPieza = cortadas === 0 ? 0n : metrosPrincipal / BigInt(cortadas);
	contexto.bitacora({
		descripcion: `Cerró el corte de ${lote.folio}: ${cortadas} piezas, ${cantidadEnTexto(metrosPrincipal)} m, cortó ${cortador}`,
		entidad: "lotes",
		entidadId: lote.id,
		entidadFolio: lote.folio,
		antes: {
			estado: lote.estado,
			planeadas: delLote.map((talla) => ({ variante_id: talla.varianteId, piezas: talla.planeadas })),
		},
		despues: {
			tallas: cortadasPorTalla,
			telas: telas.map(({ tela, uso, destino }) => ({
				material_id: tela.material_id,
				rollos: uso.usados.map((usado) => ({ rollo_id: usado.rolloId, metros: deMilesimos(usado.milesimos) })),
				quedaron: deMilesimos(uso.quedan),
				cambiado: tela.metros_quedaron !== undefined,
				destino,
			})),
			receta_version_id: receta.receta_version_id,
			flujo_id: conFlujo?.flujoId ?? null,
			bultos: nuevos.map((bulto) => bulto.folio),
		},
	});
	contexto.guardarEvento({
		tipo: "lote.cortado",
		datos: { lote_id: lote.id, piezas: cortadas, bultos: nuevos.length },
		tablas: ["lotes", "lote_tallas", "bultos", "cortes", "registros_operacion"],
		entidad: "lotes",
		entidadId: lote.id,
		entidadFolio: lote.folio,
	});
	contexto.guardarEvento({
		tipo: "corte.cerrado",
		datos: { corte_id: corteId, lote_id: lote.id },
		tablas: ["cortes", "corte_telas", "corte_rollos"],
		entidad: "cortes",
		entidadId: corteId,
		entidadFolio: lote.folio,
	});
	return {
		resultado: {
			corte_id: corteId,
			bultos: nuevos.map((bulto) => ({
				bulto_id: bulto.id,
				folio: bulto.folio,
				variante_id: bulto.varianteId,
				piezas: bulto.piezas,
			})),
			retazos: enInventario.retazos.map((retazo) => retazo.folio),
			metros_por_pieza: deMilesimos(porPieza),
			mensaje: verificar.verifico
				? `${lote.folio} cortado. La receta de ${prenda.nombre} queda verificada`
				: `${lote.folio} cortado: ${cortadas} piezas a ${cantidadEnTexto(porPieza)} m por pieza`,
			version: await versionActual(transaccion, lotes, lote.id),
		},
		avisos,
		entidad: { nombre: "lotes", id: lote.id },
	};
});

/** Los bultos de un lote, por número, con su folio; si se piden, solo esos. */
function bultosDelLote(contexto: ContextoDeAccion, loteId: string, ids?: readonly string[]) {
	return contexto.transaccion
		.select({ id: bultos.id, folio: bultos.folio, numero: bultos.numero })
		.from(bultos)
		.where(
			and(eq(bultos.loteId, loteId), ...(ids === undefined || ids.length === 0 ? [] : [inArray(bultos.id, [...ids])])),
		)
		.orderBy(asc(bultos.numero));
}

export const accionImprimirEtiquetasBulto = implementarAccion(imprimirEtiquetasBulto, async (contexto, datos) => {
	const [lote] = await contexto.transaccion.select().from(lotes).where(eq(lotes.id, datos.lote_id));
	if (lote === undefined) throw noExiste();
	// Sin bultos, o con la lista vacía: todos los del lote.
	const pedidos = datos.bulto_ids === undefined || datos.bulto_ids.length === 0 ? undefined : datos.bulto_ids;
	const deEste = await bultosDelLote(contexto, lote.id, pedidos);
	if (deEste.length === 0 && pedidos === undefined) {
		throw errorDeRegla("lote_sin_cortar", `${lote.folio} no tiene bultos: primero se cierra el corte.`);
	}
	if (deEste.length !== new Set(pedidos ?? deEste.map((bulto) => bulto.id)).size) {
		throw errorDeLaCaptura("bulto_ajeno", "bulto_ids", `Ese bulto no es de ${lote.folio}.`);
	}
	const taller = await contexto.transaccion
		.select({ id: ubicaciones.id })
		.from(ubicaciones)
		.where(eq(ubicaciones.tipo, "taller"));
	try {
		await contexto.interna("admin.mandar_a_imprimir", {
			ubicacion_id: taller[0]?.id,
			tipo: "bulto",
			ids: deEste.map((bulto) => bulto.id),
			copias: 1,
		});
	} catch (error) {
		// Sin impresora en el Taller (o sin su puente), las etiquetas salen en PDF.
		if (error instanceof ErrorDeApi && error.codigo === "impresora_sin_puente") {
			throw errorDeRegla("sin_impresora_taller", "No hay impresora del taller: descarga el PDF de las etiquetas.");
		}
		throw error;
	}
	const primero = deEste[0]?.folio ?? "";
	const ultimo = deEste.at(-1)?.folio ?? "";
	contexto.bitacora({
		descripcion: `Imprimió ${deEste.length} etiquetas de bulto de ${lote.folio}: ${primero} a ${ultimo}`,
		entidad: "lotes",
		entidadId: lote.id,
		entidadFolio: lote.folio,
		despues: { bultos: deEste.map((bulto) => bulto.folio) },
	});
	return {
		resultado: {
			cuantas: deEste.length,
			primero,
			ultimo,
			mensaje: `${deEste.length} etiquetas de bulto a la impresora del taller: ${primero} a ${ultimo}`,
		},
		entidad: { nombre: "lotes", id: lote.id },
	};
});
