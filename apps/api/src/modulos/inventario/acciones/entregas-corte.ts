/**
 * `inventario.entregar_al_corte` e `inventario.recibir_del_corte`: Bodega entrega al Taller los rollos completos de
 * las telas de la receta de un lote y, la primera vez, sus avíos; y recibe lo que regresa del corte.
 * Fase 12 · docs/modulos/inventario/entregas-a-corte.md (reglas 3 a 6, 8 y 11, «Acciones»)
 *
 * Los rollos se bloquean en orden de id antes de revisarlos: dos entregas no toman el mismo rollo. Un avío que no
 * alcanza se entrega igual y Bodega queda en negativo, con su DF- `material_corte`.
 * Fase 14 · docs/modulos/inventario/diferencias-ajustes-y-mermas.md (regla 2)
 */

import { aMilesimosConSigno, cantidadEnTexto, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { entregarAlCorte, recibirDelCorte } from "@uniformame/compartido/contratos/inventario/corte";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import {
	avisoDeMezcla,
	datosDe,
	loteConReceta,
	milesimosDeCuenta,
	rollosEnUso,
	suma,
	telasRecibidas,
} from "../dominio/corte.ts";
import { abrirDiferencia } from "../dominio/diferencias.ts";
import { escribirMovimiento, type RenglonDeMovimiento } from "../dominio/escribir-movimiento.ts";
import { ubicacionDeTipo } from "../dominio/recepciones.ts";
import {
	apartadosRollo,
	entregasCorte,
	existenciasMaterial,
	recepciones,
	recepcionLineas,
	retazos,
	rollos,
} from "../tablas.ts";

export const accionEntregarAlCorte = implementarAccion(entregarAlCorte, async (contexto, datos) => {
	const { transaccion } = contexto;
	const lote = await loteConReceta(contexto, datos.lote_id);
	if (lote.recetaVersionId !== datos.receta_version_id) {
		throw errorDeRegla("receta_cambio", `La receta de ${lote.prenda} cambió: vuelve a abrir la entrega`);
	}
	const bodega = await ubicacionDeTipo(transaccion, "bodega");
	const taller = await ubicacionDeTipo(transaccion, "taller");
	const telas = lote.materiales.filter((material) => material.tipo === "tela");
	const rollosPedidos = await rollosEnUso(contexto, [...new Set(datos.rollo_ids)], bodega);
	for (const id of new Set(datos.rollo_ids)) {
		const rollo = rollosPedidos.find((suyo) => suyo.rolloId === id);
		if (rollo?.entregadoA != null && rollo.entregadoA.loteId !== lote.loteId) {
			throw errorDeRegla("rollo_no_disponible", `${rollo.folio} ya está entregado a ${rollo.entregadoA.folio}`);
		}
		if (
			rollo === undefined ||
			!telas.some((tela) => tela.materialId === rollo.materialId) ||
			rollo.estado !== "disponible" ||
			rollo.milesimos <= 0n
		) {
			throw errorDeRegla("rollo_no_disponible", `${rollo?.folio ?? "Ese rollo"} no está disponible para ${lote.folio}`);
		}
	}
	// La primera entrega del lote lleva también los avíos de la receta.
	const [anterior] = await transaccion
		.select({ id: entregasCorte.id })
		.from(entregasCorte)
		.where(and(eq(entregasCorte.loteId, lote.loteId), inArray(entregasCorte.estado, ["entregada", "cerrada"])))
		.limit(1);
	const avios =
		anterior === undefined
			? lote.materiales.filter((material) => material.tipo !== "tela" && (material.cantidad ?? 0) > 0)
			: [];
	const yaRecibidas = await telasRecibidas(contexto, [lote.loteId]);
	const entregaId = uuidv7();
	const renglones: RenglonDeMovimiento[] = [
		...rollosPedidos.map((rollo) => ({
			origen: bodega,
			destino: taller,
			materialId: rollo.materialId,
			rolloId: rollo.rolloId,
			cantidad: deMilesimos(rollo.milesimos),
		})),
		...avios.map((avio) => ({
			origen: bodega,
			destino: taller,
			materialId: avio.materialId,
			cantidad: deMilesimos(milesimosDeCuenta(avio.cantidad ?? 0)),
		})),
	];
	const movimiento = await escribirMovimiento(contexto, {
		tipo: "entrega_corte",
		documento: { tipo: "entrega_corte", id: entregaId, folio: lote.folio },
		renglones,
	});
	// Lo que quedó de cada avío en Bodega después de entregar: el movimiento ya bloqueó su renglón, así que dos entregas
	// a la vez del mismo avío ven, cada una, lo que dejó la otra.
	const quedo =
		avios.length === 0
			? []
			: await transaccion
					.select({ materialId: existenciasMaterial.materialId, cantidad: existenciasMaterial.cantidad })
					.from(existenciasMaterial)
					.where(
						and(
							eq(existenciasMaterial.ubicacionId, bodega),
							isNull(existenciasMaterial.rolloId),
							inArray(
								existenciasMaterial.materialId,
								avios.map((avio) => avio.materialId),
							),
						),
					);
	const quien = quienCambia(contexto);
	if (quien === null) throw new Error("una entrega al corte la hace una cuenta de Bodega");
	await transaccion.insert(entregasCorte).values({
		id: entregaId,
		loteId: lote.loteId,
		recetaVersionId: lote.recetaVersionId,
		estado: "entregada",
		entregadaEn: contexto.ahora.toString(),
		entregadaPor: quien,
		recibioPersonaId: datos.recibio_persona_id ?? null,
		movimientoId: movimiento.movimientoId,
		creadoPor: quien,
	});
	// Los apartados: los sugeridos del lote y los de estos rollos con otro lote se liberan; los entregados nacen.
	const ids = rollosPedidos.map((rollo) => rollo.rolloId);
	await transaccion
		.update(apartadosRollo)
		.set({ estado: "liberado" })
		.where(
			and(
				eq(apartadosRollo.estado, "sugerido"),
				or(eq(apartadosRollo.loteId, lote.loteId), inArray(apartadosRollo.rolloId, ids)),
			),
		);
	await transaccion.insert(apartadosRollo).values(
		ids.map((rolloId) => ({
			id: uuidv7(),
			rolloId,
			loteId: lote.loteId,
			fechaCorte: lote.fechaCorte,
			estado: "entregado" as const,
			entregaCorteId: entregaId,
			creadoPor: quien,
		})),
	);
	await transaccion.update(rollos).set({ estado: "entregado" }).where(inArray(rollos.id, ids));
	await contexto.interna("inventario.recalcular_rollos_sugeridos", {});
	// Los avisos: la mezcla de partidas y la tela que no alcanza (o no hay) para el corte completo. Una tela que el
	// lote ya recibió en otra entrega no avisa.
	const avisos: string[] = [];
	for (const tela of telas) {
		if (yaRecibidas.some((suya) => suya.materialId === tela.materialId)) continue;
		const suyos = rollosPedidos.filter((rollo) => rollo.materialId === tela.materialId);
		const mezcla = avisoDeMezcla(suyos.map((rollo) => rollo.partida));
		if (mezcla !== undefined) avisos.push(mezcla);
		const pide = milesimosDeCuenta(tela.cantidad ?? 0);
		const tiene = suma(suyos.map((rollo) => rollo.milesimos));
		if (tiene < pide)
			avisos.push(`Faltan ${cantidadEnTexto(pide - tiene)} m de ${tela.nombre} para el corte completo.`);
	}
	// El avío que no alcanzó se entregó igual: Bodega queda en negativo y nace su DF-, a cargo de Bodega (regla 6).
	const noAlcanzo: string[] = [];
	for (const avio of avios) {
		const despues = aMilesimosConSigno(quedo.find((suyo) => suyo.materialId === avio.materialId)?.cantidad ?? "0");
		if (despues >= 0n) continue;
		// Faltó lo que la entrega dejó en negativo, hasta lo que pidió (lo de antes ya tenía su DF-).
		const pide = milesimosDeCuenta(avio.cantidad ?? 0);
		const falta = -despues < pide ? -despues : pide;
		const texto = `${cantidadEnTexto(falta)} ${avio.unidad} de ${avio.nombre}`;
		noAlcanzo.push(texto);
		await abrirDiferencia(contexto, {
			origen: "material_corte",
			ubicacionId: bodega,
			aCargoUbicacionId: bodega,
			hueco: { materialId: avio.materialId, rolloId: null, cantidad: deMilesimos(-falta) },
			descripcion: `Se entregaron ${texto} a ${lote.folio} sin existencia en Bodega`,
			loteId: lote.loteId,
			entregaCorteId: entregaId,
			movimientoId: movimiento.movimientoId,
		});
	}
	contexto.bitacora({
		descripcion: `Entregó al corte ${lote.folio}`,
		entidad: "entregas_corte",
		entidadId: entregaId,
		entidadFolio: lote.folio,
		despues: {
			rollos: rollosPedidos.map((rollo) => ({ rollo: rollo.folio, metros: deMilesimos(rollo.milesimos) })),
			avios: avios.map((avio) => ({ material: avio.nombre, cantidad: avio.cantidad })),
		},
	});
	contexto.guardarEvento({
		tipo: "entrega_corte.entregada",
		datos: { entrega_corte_id: entregaId, lote_id: lote.loteId },
		tablas: ["entregas_corte", "apartados_rollo", "rollos", "existencias_material", "diferencias"],
		entidad: "entregas_corte",
		entidadId: entregaId,
		entidadFolio: lote.folio,
	});
	return {
		resultado: {
			entrega_corte_id: entregaId,
			mensaje: `${lote.folio}: ${rollosPedidos.length} rollos pasan al taller${
				noAlcanzo.length === 0 ? "" : `. No cuadró ${noAlcanzo.join(", ")}: queda en diferencias`
			}`,
		},
		avisos,
		entidad: { nombre: "entregas_corte", id: entregaId },
	};
});

export const accionRecibirDelCorte = implementarAccion(recibirDelCorte, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const taller = await ubicacionDeTipo(transaccion, "taller");
	const bodega = await ubicacionDeTipo(transaccion, "bodega");
	const [rollo] = await rollosEnUso(contexto, [datos.rollo_id], taller);
	if (rollo === undefined) throw noExiste();
	await tomarVersion(contexto, rollos, rollo.rolloId, version, async () => ({
		rollo_id: rollo.rolloId,
		estado: rollo.estado,
	}));
	if (rollo.estado !== "por_recibir" || rollo.milesimos <= 0n) {
		throw errorDeRegla("no_por_recibir", `${rollo.folio} ya está en bodega`);
	}
	const [retazo] = await transaccion.select().from(retazos).where(eq(retazos.rolloId, rollo.rolloId));
	// El lote del corte de donde regresa: el de su último apartado.
	const [ultimo] = await transaccion
		.select({ loteId: apartadosRollo.loteId })
		.from(apartadosRollo)
		.where(eq(apartadosRollo.rolloId, rollo.rolloId))
		.orderBy(desc(apartadosRollo.creadoEn))
		.limit(1);
	const loteId = retazo?.loteId ?? ultimo?.loteId;
	if (loteId === undefined) throw new Error(`${rollo.folio} está por recibir sin haber ido al corte`);
	const recepcionId = uuidv7();
	const quien = quienCambia(contexto);
	await transaccion.insert(recepciones).values({
		id: recepcionId,
		tipo: "bodega_regreso_corte",
		ubicacionId: bodega,
		modo: "completo",
		loteId,
		recibidoEn: contexto.ahora.toString(),
		recibidoPor: quien,
		huboDiferencia: false,
		creadoPor: quien,
	});
	const metros = deMilesimos(rollo.milesimos);
	const movimiento = await escribirMovimiento(contexto, {
		tipo: retazo === undefined ? "regreso_rollo" : "regreso_retazo",
		documento: { tipo: "recepcion", id: recepcionId, folio: retazo?.folio ?? rollo.folio },
		renglones: [
			{ origen: taller, destino: bodega, materialId: rollo.materialId, rolloId: rollo.rolloId, cantidad: metros },
		],
	});
	await transaccion
		.update(recepciones)
		.set({ movimientoId: movimiento.movimientoId })
		.where(eq(recepciones.id, recepcionId));
	await transaccion.insert(recepcionLineas).values({
		id: uuidv7(),
		recepcionId,
		renglon: 1,
		materialId: rollo.materialId,
		rolloId: rollo.rolloId,
		cantidadEsperada: metros,
		cantidadContada: metros,
		creadoPor: quien,
	});
	await transaccion.update(rollos).set({ estado: "disponible" }).where(eq(rollos.id, rollo.rolloId));
	if (retazo !== undefined) {
		await transaccion.update(retazos).set({ estado: "recibido", recepcionId }).where(eq(retazos.id, retazo.id));
	}
	await contexto.interna("inventario.recalcular_rollos_sugeridos", { material_id: rollo.materialId });
	const [tela] = Object.values(await datosDe(contexto, [rollo.materialId]));
	const folio = retazo?.folio ?? rollo.folio;
	contexto.bitacora({
		descripcion: `Recibió ${folio} del corte`,
		entidad: "rollos",
		entidadId: rollo.rolloId,
		entidadFolio: folio,
		despues: { metros },
	});
	contexto.guardarEvento({
		tipo: "rollo.regreso",
		datos: { rollo_id: rollo.rolloId },
		tablas: ["rollos", "retazos", "recepciones", "recepcion_lineas", "existencias_material"],
		entidad: "rollos",
		entidadId: rollo.rolloId,
		entidadFolio: folio,
	});
	return {
		resultado: {
			recepcion_id: recepcionId,
			mensaje: `${folio} recibido en bodega: ${cantidadEnTexto(rollo.milesimos)} m de ${tela?.nombre ?? "tela"}`,
			version: await versionActual(transaccion, rollos, rollo.rolloId),
		},
		entidad: { nombre: "rollos", id: rollo.rolloId },
	};
});
