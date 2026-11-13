/**
 * `produccion.lote`: el cajón del lote. Su estado y sus avisos, su hilo (si no es de un pedido; el de un pedido lo da
 * `produccion.hilo_pedido`), sus cifras y sus datos, cada operación con quién la hizo, los registros de la tablet por
 * páginas, sus bultos y los rollos que usó. El precio por metro solo viaja con Compras o Contaduría, y la tarifa de
 * cada registro, con «ven sueldos y tarifas» (el recorte común de los campos de sueldo).
 * Fase 19 · docs/interfaz/fabrica/produccion.md («Cajones · Lote (ancho)»)
 */

import { aMilesimos, cantidadEnTexto } from "@uniformame/compartido/calculos/cuenta-material";
import { diasHasta, textoDeDiaCorto, textoEnDias } from "@uniformame/compartido/calculos/fechas";
import { loteDeProduccion } from "@uniformame/compartido/contratos/produccion/lotes";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { leerCursor, paginar } from "../../../nucleo/http/consultas.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import {
	datosDelEstado,
	deCalcularMaterial,
	escribirParaQuien,
	estadoDelLote,
	hiloDelLote,
	type LoteLeido,
	leerLotes,
	loHechoPorOperacion,
	operacionAtorada,
	parametroNumero,
	piezasPorTallaDelLote,
	saludDeLosLotes,
	tieneDepartamento,
	tiraDelLote,
	ultimaSincronizacion,
} from "./comun.ts";

/** Cuántos registros de la tablet salen por página («Los últimos {n}»). */
const registrosPorPagina = 10;

/** Un registro de la tablet como sale de la base. */
const deRegistro = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	hecho_en: z.string(),
	cuando: z.string(),
	bulto: z.string(),
	persona: z.string(),
	operacion: z.string(),
	buenas: z.number(),
	danadas: z.number(),
	origen: z.enum(["tablet", "corte"]),
	estado: z.enum(["vigente", "cancelado"]),
	motivo: z.string().nullable(),
	tarifa_centavos: z.coerce.number().nullable(),
});

/** Un rollo usado en el corte, como sale de la base. */
const deRollo = z.object({
	rollo: z.string(),
	partida: z.string().nullable(),
	tela: z.string(),
	papel: z.string(),
	metros: z.string(),
	costo_metro_centavos: z.coerce.number(),
});

/**
 * Los registros de la tablet de un lote, del más nuevo al más viejo, por páginas.
 * @param contexto El contexto de la consulta.
 * @param lote El lote.
 * @param cursor La página que se pide.
 */
async function registrosDelLote(contexto: ContextoDeConsulta, lote: LoteLeido, cursor: string | undefined) {
	const desde = leerCursor(cursor);
	const despuesDe =
		desde === undefined
			? sql`true`
			: sql`(r.hecho_en, r.id) < (${String(desde.hecho_en)}::timestamptz, ${String(desde.id)}::uuid)`;
	const { rows } = await contexto.base.execute(sql`
		SELECT r.id, r.version, r.hecho_en::text AS hecho_en,
			to_char(r.hecho_en AT TIME ZONE 'America/Mexico_City', 'DD/MM HH24:MI') AS cuando,
			b.folio AS bulto, p.nombre AS persona, o.nombre AS operacion, r.piezas_buenas AS buenas,
			r.piezas_danadas AS danadas, r.origen, r.estado, r.motivo_cancelacion AS motivo, r.tarifa_centavos
		FROM registros_operacion r JOIN bultos b ON b.id = r.bulto_id JOIN personas p ON p.id = r.persona_id
		JOIN flujo_operaciones f ON f.id = r.flujo_operacion_id JOIN operaciones o ON o.id = f.operacion_id
		WHERE r.lote_id = ${lote.id} AND ${despuesDe}
		ORDER BY r.hecho_en DESC, r.id DESC LIMIT ${registrosPorPagina + 1}`);
	const { rows: cuantos } = await contexto.base.execute(
		sql`SELECT count(*)::int AS total FROM registros_operacion WHERE lote_id = ${lote.id}`,
	);
	const pagina = paginar(z.array(deRegistro).parse(rows), registrosPorPagina, (registro) => ({
		hecho_en: registro.hecho_en,
		id: registro.id,
	}));
	// Desde que Calidad lo revisa, ninguno se cancela; los del corte, nunca.
	const sigueEnElTaller = lote.estado === "en_proceso" || lote.estado === "terminado";
	return {
		renglones: pagina.renglones.map((registro) => ({
			registro_id: registro.id,
			version: registro.version,
			cuando: `${registro.cuando} · ${registro.bulto}`,
			bulto: registro.bulto,
			persona: registro.persona,
			operacion: registro.operacion,
			buenas: registro.buenas,
			danadas: registro.danadas,
			del_corte: registro.origen === "corte",
			cancelado: registro.estado === "cancelado",
			motivo: registro.motivo,
			cancelable: sigueEnElTaller && registro.origen === "tablet" && registro.estado === "vigente",
			tarifa_centavos: registro.tarifa_centavos,
		})),
		total: z.object({ total: z.number() }).parse(cuantos[0]).total,
		cursor: pagina.cursor,
		hay_mas: pagina.hay_mas,
	};
}

/**
 * Cada operación del flujo del lote ya cortado: lo hecho, lo que puede reportar, su merma, quién la hizo y su línea.
 * @param contexto El contexto de la consulta.
 * @param lote El lote.
 * @param atoradaEn La operación atorada, si lo está.
 */
async function operacionesDelLote(contexto: ContextoDeConsulta, lote: LoteLeido, atoradaEn: string | null) {
	const hecho = await loHechoPorOperacion(contexto, sql`l.id = ${lote.id}`);
	const { rows } = await contexto.base.execute(sql`
		SELECT o.nombre AS operacion, p.nombre AS persona, sum(r.piezas_buenas)::int AS piezas
		FROM registros_operacion r JOIN personas p ON p.id = r.persona_id
		JOIN flujo_operaciones f ON f.id = r.flujo_operacion_id JOIN operaciones o ON o.id = f.operacion_id
		WHERE r.lote_id = ${lote.id} AND r.estado = 'vigente'
		GROUP BY o.nombre, p.nombre ORDER BY sum(r.piezas_buenas) DESC`);
	const quienes = z.array(z.object({ operacion: z.string(), persona: z.string(), piezas: z.number() })).parse(rows);
	const tira = tiraDelLote(hecho, lote.cortadas, atoradaEn);
	const desde = lote.avance === null ? "" : textoDeDiaCorto(lote.avance);
	return [...hecho]
		.sort((una, otra) => una.orden - otra.orden)
		.map((operacion) => {
			const casilla = tira.find((una) => una.operacion === operacion.operacion);
			const puedeHasta = casilla?.puede_hasta ?? lote.cortadas;
			const esperando = puedeHasta - operacion.buenas - operacion.danadas;
			return {
				operacion: operacion.operacion,
				hechas: operacion.buenas,
				puede_hasta: puedeHasta,
				merma: operacion.danadas,
				quien: quienes
					.filter((una) => una.operacion === operacion.operacion)
					.map(({ persona, piezas }) => ({ persona, piezas })),
				linea:
					casilla?.marca === "atorado"
						? `Atorado desde el ${desde}`
						: casilla?.marca === "se_junta"
							? `Se junta trabajo: ${esperando} esperando`
							: "",
				marca: casilla?.marca ?? null,
			};
		});
}

/**
 * Los rollos que usó el corte del lote, con sus metros, su rendimiento contra el patrón y, para quien ve costos, su
 * precio por metro.
 * @param contexto El contexto de la consulta.
 * @param lote El lote ya cortado.
 * @param verCosto Si quien llama ve el precio por metro.
 */
async function rollosDelLote(contexto: ContextoDeConsulta, lote: LoteLeido, verCosto: boolean) {
	const { rows } = await contexto.base.execute(sql`
		SELECT r.folio AS rollo, pt.folio AS partida, m.nombre AS tela, ct.papel, cr.metros_usados::text AS metros,
			coalesce(r.costo_metro_centavos, 0) AS costo_metro_centavos
		FROM cortes c JOIN corte_telas ct ON ct.corte_id = c.id JOIN corte_rollos cr ON cr.corte_tela_id = ct.id
		JOIN rollos r ON r.id = cr.rollo_id JOIN materiales m ON m.id = ct.material_id
		LEFT JOIN partidas_tela pt ON pt.id = r.partida_tela_id
		WHERE c.lote_id = ${lote.id}
		ORDER BY ct.papel DESC, cr.orden`);
	const rollos = z.array(deRollo).parse(rows);
	if (rollos.length === 0 || lote.cortadas === 0) return null;
	const partidas = [...new Set(rollos.flatMap((rollo) => (rollo.partida === null ? [] : [rollo.partida])))];
	// El rendimiento de la tela principal contra el piso del patrón de la versión con que se cortó.
	const usados = rollos
		.filter((rollo) => rollo.papel === "tela_principal")
		.reduce((suma, rollo) => suma + aMilesimos(rollo.metros), 0n);
	const material = deCalcularMaterial.parse(
		await contexto.lectura("patronaje.calcular_material", {
			producto_id: lote.producto_id,
			piezas_por_talla: await piezasPorTallaDelLote(contexto, lote.id, "cortadas"),
			...(lote.receta_version_id === null ? {} : { receta_version_id: lote.receta_version_id }),
		}),
	);
	const piso = aMilesimos(material.materiales.find((uno) => uno.papel === "tela_principal")?.piso ?? "0");
	const cortadas = BigInt(lote.cortadas);
	const sobre = piso === 0n ? 0 : Math.round(Number(((usados - piso) * 100_000n) / piso) / 1000);
	const rojo = await parametroNumero(contexto, "produccion.rendimiento_rojo_porcentaje");
	return {
		partidas: partidas.length > 1 ? `${partidas.length} partidas` : `Partida ${partidas[0] ?? "—"}`,
		mezcladas: partidas.length > 1,
		renglones: rollos.map((rollo) => ({
			rollo: rollo.rollo,
			partida: rollo.partida ?? "—",
			tela: rollo.tela,
			metros: cantidadEnTexto(aMilesimos(rollo.metros)),
			...(verCosto ? { costo_metro_centavos: rollo.costo_metro_centavos } : {}),
		})),
		por_pieza: cantidadEnTexto(usados / cortadas),
		patron: cantidadEnTexto(piso / cortadas),
		rendimiento: `${sobre >= 0 ? "+" : "−"}${Math.abs(sobre)}% sobre el patrón`,
		rendimiento_rojo: sobre > rojo,
	};
}

/**
 * Cómo dice el cajón la receta del lote: su versión y si está verificada, o «Sin receta».
 * @param contexto El contexto de la consulta.
 * @param lote El lote.
 */
async function textoDeLaReceta(contexto: ContextoDeConsulta, lote: LoteLeido): Promise<string> {
	if (lote.receta_version_id === null) return "Sin receta";
	const { rows } = await contexto.base.execute(
		sql`SELECT numero FROM receta_versiones WHERE id = ${lote.receta_version_id}`,
	);
	const numero = z.object({ numero: z.number() }).parse(rows[0]).numero;
	return `Versión ${numero} · ${lote.receta === "verificada" ? "verificada contra corte" : "sin verificar"}`;
}

/**
 * Lo que dice el cajón de un lote sin cortar: «Se corta el {fecha}. {n} piezas en {m} tallas.».
 * @param contexto El contexto de la consulta.
 * @param lote El lote.
 */
async function textoSinCortar(contexto: ContextoDeConsulta, lote: LoteLeido): Promise<string> {
	const tallas = (await piezasPorTallaDelLote(contexto, lote.id, "planeadas")).filter((talla) => talla.piezas > 0);
	const enTallas = `${tallas.length} ${tallas.length === 1 ? "talla" : "tallas"}`;
	return `Se corta el ${textoDeDiaCorto(lote.fecha_corte)}. ${lote.planeadas} piezas en ${enTallas}.`;
}

export const consultaLote = implementarConsulta(loteDeProduccion, async (contexto, parametros) => {
	const [lote] = await leerLotes(contexto, sql`l.id = ${parametros.lote_id}`);
	if (lote === undefined) throw noExiste();
	const hoy = contexto.diaDeNegocio;
	const salud = await saludDeLosLotes(contexto);
	const suSalud = salud.salud.get(lote.id);
	const atorado = salud.atorados.get(lote.id);
	const sinCortar = lote.estado === "por_cortar" || lote.estado === "cancelado";
	const verCosto = tieneDepartamento(contexto.quien, "compras", "contaduria");
	const avisos = [
		...(atorado?.maquina == null ? [] : [`${atorado.maquina} está parada. Mantenimiento la está revisando.`]),
		...(lote.estado === "por_cortar" && lote.receta === "sin_receta"
			? ["Falta la receta: no se puede cortar hasta que Patronaje la capture"]
			: []),
	];
	const rollos = sinCortar ? null : await rollosDelLote(contexto, lote, verCosto);
	const { rows: bultos } = await contexto.base.execute(sql`
		SELECT b.id AS bulto_id, b.folio, t.nombre AS talla, b.piezas FROM bultos b
		JOIN variantes v ON v.id = b.variante_id JOIN tallas t ON t.id = v.talla_id
		WHERE b.lote_id = ${lote.id} ORDER BY b.numero`);
	const conPedido = lote.destino === "pedido" ? lote.pedido_id : null;
	return {
		resultado: {
			lote_id: lote.id,
			folio: lote.folio,
			orden: lote.orden,
			prenda: lote.prenda,
			producto_id: lote.producto_id,
			etapa: lote.estado,
			estado: estadoDelLote(datosDelEstado(lote, salud, await ultimaSincronizacion(contexto)), hoy),
			avisos,
			pedido_id: conPedido,
			hilo: conPedido === null ? hiloDelLote(lote, suSalud, hoy) : [],
			cifras: {
				planeadas: lote.planeadas,
				cortadas: sinCortar ? null : lote.cortadas,
				listas: lote.listas,
				merma: sinCortar ? null : lote.merma,
			},
			para: escribirParaQuien(lote),
			entrega: `${textoDeDiaCorto(lote.fecha_entrega)} · ${textoEnDias(diasHasta(hoy, lote.fecha_entrega))}`,
			corte: `${textoDeDiaCorto(lote.fecha_corte)}${sinCortar ? " · programado" : ""}`,
			receta: await textoDeLaReceta(contexto, lote),
			con_receta: lote.receta !== "sin_receta",
			operaciones: sinCortar ? [] : await operacionesDelLote(contexto, lote, operacionAtorada(suSalud)),
			sin_cortar: sinCortar ? await textoSinCortar(contexto, lote) : null,
			registros: await registrosDelLote(contexto, lote, parametros.cursor),
			bultos: z
				.array(z.object({ bulto_id: z.uuid(), folio: z.string(), talla: z.string(), piezas: z.number() }))
				.parse(bultos),
			rollos,
			ver_costo: verCosto && !sinCortar,
		},
		recortado: verCosto || rollos === null ? [] : ["costo_metro_centavos"],
	};
});
