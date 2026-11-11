/**
 * `inventario.registrar_corte`: lo que el cierre de un corte mueve en el inventario: el consumo de cada rollo, lo que
 * quedó del último (rollo, retazo o merma), los rollos entregados que no se usaron y las piezas cortadas en el Taller.
 * Fase 12 · docs/modulos/inventario/entregas-a-corte.md (regla 7, «`inventario.registrar_corte`»)
 *
 * La llama `produccion.cerrar_corte` en su transacción, con el corte ya escrito. Un rollo que el corte usó y Bodega no
 * entregó se entrega en el mismo cierre. Cada movimiento de la acción lleva su número, para su clave derivada.
 */

import { aMilesimos, deMilesimos } from "@uniformame/compartido/calculos/cuenta-material";
import { and, eq, inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { rollosEnUso } from "../dominio/corte.ts";
import { escribirMovimiento, type RenglonDeMovimiento } from "../dominio/escribir-movimiento.ts";
import { ubicacionDeTipo } from "../dominio/recepciones.ts";
import { apartadosRollo, entregasCorte, retazos, rollos } from "../tablas.ts";

/** Una cantidad en metros con tres decimales. */
const metros = z.string().regex(/^\d{1,9}(\.\d{1,3})?$/);

/** Lo que recibe. */
const pedido = z.object({
	corte_id: z.uuid(),
	lote_id: z.uuid(),
	folio_lote: z.string(),
	receta_version_id: z.uuid(),
	telas: z.array(
		z.object({
			material_id: z.uuid(),
			rollos: z.array(
				z.object({ rollo_id: z.uuid(), orden: z.number().int(), metros_usados: metros, es_ultimo: z.boolean() }),
			),
			metros_quedaron: metros,
			destino_sobrante: z.enum(["ninguno", "rollo", "retazo", "merma"]),
		}),
	),
	tallas: z.array(z.object({ variante_id: z.uuid(), piezas: z.number().int().positive() })),
});

/** Lo que regresa: por rollo, su apartado y lo que tenía; los retazos que nacieron; los avisos. */
export interface CorteRegistrado {
	rollos: { rollo_id: string; apartado_rollo_id: string | null; metros_al_cortar: string }[];
	retazos: { material_id: string; retazo_id: string; folio: string }[];
	avisos: string[];
}

/**
 * Registra en el inventario el cierre de un corte.
 * @param contexto El contexto de `produccion.cerrar_corte`.
 * @param datos El corte, el lote, la receta, sus telas con sus rollos y lo que quedó, y las piezas cortadas por talla.
 * @throws `422 rollo_de_otro_lote` o `rollo_no_disponible`.
 */
export async function registrarCorte(contexto: ContextoDeAccion, datos: unknown): Promise<CorteRegistrado> {
	const corte = pedido.parse(datos);
	const { transaccion } = contexto;
	const quien = quienCambia(contexto);
	const bodega = await ubicacionDeTipo(transaccion, "bodega");
	const taller = await ubicacionDeTipo(transaccion, "taller");
	const todos = corte.telas.flatMap((tela) => tela.rollos.map((rollo) => rollo.rollo_id));
	const enTaller = await rollosEnUso(contexto, todos, taller);
	const enBodega = await rollosEnUso(contexto, todos, bodega);
	// Cada rollo: entregado a este lote y en el Taller, o disponible en Bodega (se entrega ahora).
	const porEntregar: typeof enBodega = [];
	for (const rollo of enTaller) {
		if (rollo.entregadoA !== null && rollo.entregadoA.loteId !== corte.lote_id) {
			throw errorDeRegla("rollo_de_otro_lote", `${rollo.folio} está entregado a ${rollo.entregadoA.folio}`);
		}
		if (rollo.entregadoA?.loteId === corte.lote_id && rollo.estado === "entregado" && rollo.milesimos > 0n) continue;
		const deBodega = enBodega.find((suyo) => suyo.rolloId === rollo.rolloId);
		if (deBodega === undefined || deBodega.estado !== "disponible" || deBodega.milesimos <= 0n) {
			throw errorDeRegla("rollo_no_disponible", `${rollo.folio} ya no está disponible para este corte.`);
		}
		porEntregar.push(deBodega);
	}
	// La entrega en el mismo cierre de lo que Bodega no entregó (nace cerrada, con el corte).
	const entregadoAhora = new Map<string, string>();
	if (porEntregar.length > 0) {
		const entregaId = uuidv7();
		const movimiento = await escribirMovimiento(contexto, {
			tipo: "entrega_corte",
			documento: { tipo: "entrega_corte", id: entregaId, folio: corte.folio_lote },
			numero: 1,
			renglones: porEntregar.map((rollo) => ({
				origen: bodega,
				destino: taller,
				materialId: rollo.materialId,
				rolloId: rollo.rolloId,
				cantidad: deMilesimos(rollo.milesimos),
			})),
		});
		if (quien === null) throw new Error("el corte lo cierra una cuenta de Producción");
		await transaccion.insert(entregasCorte).values({
			id: entregaId,
			loteId: corte.lote_id,
			recetaVersionId: corte.receta_version_id,
			estado: "entregada",
			entregadaEn: contexto.ahora.toString(),
			entregadaPor: quien,
			movimientoId: movimiento.movimientoId,
			creadoPor: quien,
		});
		const ids = porEntregar.map((rollo) => rollo.rolloId);
		await transaccion
			.update(apartadosRollo)
			.set({ estado: "liberado" })
			.where(and(eq(apartadosRollo.estado, "sugerido"), inArray(apartadosRollo.rolloId, ids)));
		for (const rollo of porEntregar) {
			const apartadoId = uuidv7();
			await transaccion.insert(apartadosRollo).values({
				id: apartadoId,
				rolloId: rollo.rolloId,
				loteId: corte.lote_id,
				fechaCorte: contexto.diaDeNegocio.toString(),
				estado: "entregado",
				entregaCorteId: entregaId,
				creadoPor: quien,
			});
			entregadoAhora.set(rollo.rolloId, apartadoId);
		}
	}
	// Lo que tenía cada rollo en el Taller al cortar.
	const alCortar = new Map(
		enTaller.map((rollo) => [
			rollo.rolloId,
			rollo.milesimos > 0n
				? rollo.milesimos
				: (porEntregar.find((suyo) => suyo.rolloId === rollo.rolloId)?.milesimos ?? 0n),
		]),
	);
	const apartados = await transaccion
		.select({ id: apartadosRollo.id, rolloId: apartadosRollo.rolloId, entregaCorteId: apartadosRollo.entregaCorteId })
		.from(apartadosRollo)
		.where(and(eq(apartadosRollo.loteId, corte.lote_id), eq(apartadosRollo.estado, "entregado")));
	// El consumo de cada rollo, la merma y lo que regresa.
	const consumo: RenglonDeMovimiento[] = [];
	const merma: RenglonDeMovimiento[] = [];
	const nacieron: CorteRegistrado["retazos"] = [];
	for (const tela of corte.telas) {
		for (const rollo of tela.rollos) {
			const usados = aMilesimos(rollo.metros_usados);
			consumo.push({
				origen: taller,
				destino: null,
				materialId: tela.material_id,
				rolloId: rollo.rollo_id,
				cantidad: deMilesimos(usados),
			});
			if (!rollo.es_ultimo) continue;
			const quedaron = aMilesimos(tela.metros_quedaron);
			if (tela.destino_sobrante === "merma") {
				merma.push({
					origen: taller,
					destino: null,
					materialId: tela.material_id,
					rolloId: rollo.rollo_id,
					cantidad: deMilesimos(quedaron),
				});
			}
			if (tela.destino_sobrante === "retazo") {
				const { folio } = z
					.object({ folio: z.string() })
					.parse(await contexto.interna("admin.tomar_folio", { tipo: "retazo" }));
				const retazoId = uuidv7();
				await transaccion.insert(retazos).values({
					id: retazoId,
					folio,
					rolloId: rollo.rollo_id,
					corteId: corte.corte_id,
					loteId: corte.lote_id,
					metros: deMilesimos(quedaron),
					estado: "por_recibir",
					creadoPor: quien,
				});
				nacieron.push({ material_id: tela.material_id, retazo_id: retazoId, folio });
			}
		}
	}
	await escribirMovimiento(contexto, {
		tipo: "consumo_corte",
		documento: { tipo: "corte", id: corte.corte_id, folio: corte.folio_lote },
		numero: 2,
		renglones: consumo,
	});
	if (merma.length > 0) {
		await escribirMovimiento(contexto, {
			tipo: "merma_corte",
			documento: { tipo: "corte", id: corte.corte_id, folio: corte.folio_lote },
			numero: 3,
			renglones: merma,
		});
	}
	await escribirMovimiento(contexto, {
		tipo: "piezas_cortadas",
		documento: { tipo: "corte", id: corte.corte_id, folio: corte.folio_lote },
		numero: 4,
		renglones: corte.tallas.map((talla) => ({
			origen: null,
			destino: taller,
			varianteId: talla.variante_id,
			piezas: talla.piezas,
			loteId: corte.lote_id,
		})),
	});
	// Los estados: el último que regresa (rollo o retazo) queda por recibir; los demás usados, agotados; los entregados
	// que no se usaron, por recibir con su apartado liberado.
	const usados = new Set(todos);
	const regresan = corte.telas.flatMap((tela) =>
		tela.destino_sobrante === "rollo" || tela.destino_sobrante === "retazo"
			? tela.rollos.filter((rollo) => rollo.es_ultimo).map((rollo) => rollo.rollo_id)
			: [],
	);
	const conRetazo = new Set(
		corte.telas.flatMap((tela) =>
			tela.destino_sobrante === "retazo"
				? tela.rollos.filter((rollo) => rollo.es_ultimo).map((rollo) => rollo.rollo_id)
				: [],
		),
	);
	const agotados = todos.filter((id) => !regresan.includes(id));
	if (agotados.length > 0)
		await transaccion.update(rollos).set({ estado: "agotado" }).where(inArray(rollos.id, agotados));
	for (const id of regresan) {
		await transaccion
			.update(rollos)
			.set({ estado: "por_recibir", ...(conRetazo.has(id) ? { esRetazo: true } : {}) })
			.where(eq(rollos.id, id));
	}
	const sinUsar = apartados.filter((apartado) => !usados.has(apartado.rolloId));
	if (sinUsar.length > 0) {
		await transaccion
			.update(apartadosRollo)
			.set({ estado: "liberado" })
			.where(
				inArray(
					apartadosRollo.id,
					sinUsar.map((apartado) => apartado.id),
				),
			);
		await transaccion
			.update(rollos)
			.set({ estado: "por_recibir" })
			.where(
				inArray(
					rollos.id,
					sinUsar.map((apartado) => apartado.rolloId),
				),
			);
	}
	await transaccion
		.update(apartadosRollo)
		.set({ estado: "usado", corteId: corte.corte_id })
		.where(
			and(
				eq(apartadosRollo.loteId, corte.lote_id),
				eq(apartadosRollo.estado, "entregado"),
				inArray(apartadosRollo.rolloId, todos),
			),
		);
	// Las entregas del lote se cierran con el corte; si alguna fue con otra receta, se avisa.
	const cerradas = await transaccion
		.update(entregasCorte)
		.set({ estado: "cerrada", corteId: corte.corte_id })
		.where(and(eq(entregasCorte.loteId, corte.lote_id), eq(entregasCorte.estado, "entregada")))
		.returning({ recetaVersionId: entregasCorte.recetaVersionId });
	const avisos = cerradas.some((entrega) => entrega.recetaVersionId !== corte.receta_version_id)
		? ["La receta cambió desde que bodega entregó la tela"]
		: [];
	contexto.guardarEvento({
		tipo: "corte.registrado",
		datos: { corte_id: corte.corte_id, lote_id: corte.lote_id },
		tablas: ["rollos", "retazos", "apartados_rollo", "entregas_corte", "existencias", "existencias_material"],
	});
	if (regresan.length > 0 || sinUsar.length > 0) {
		contexto.guardarEvento({
			tipo: "rollo.por_recibir",
			datos: { lote_id: corte.lote_id },
			tablas: ["rollos", "retazos"],
		});
	}
	return {
		rollos: todos.map((rolloId) => ({
			rollo_id: rolloId,
			apartado_rollo_id:
				entregadoAhora.get(rolloId) ?? apartados.find((apartado) => apartado.rolloId === rolloId)?.id ?? null,
			metros_al_cortar: deMilesimos(alCortar.get(rolloId) ?? 0n),
		})),
		retazos: nacieron,
		avisos,
	};
}
