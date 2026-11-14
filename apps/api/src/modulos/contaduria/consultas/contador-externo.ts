/**
 * `contaduria.contador_externo` y `contaduria.paquete_mes`: la pestaña Contador externo y la ventana «Paquete de {mes}».
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Contador externo», «Paquete de {mes}») y
 * docs/modulos/contaduria/contador-y-cuadres.md (reglas 1 a 4, «Lo que lleva el paquete»)
 *
 * Mientras no se manda, la cuenta del mes es `cuentaDelPaquete` del dominio, sobre `lecturaDelPaquete` sin candado, la
 * misma que congela «Marcar como enviado»; mandado, son sus renglones congelados. La nómina viaja en `total_nomina_centavos`, un campo de sueldo.
 */

import { textoDeDia, textoDeDiaCorto, textoDeMes, zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { contadorExterno, paqueteMes } from "@uniformame/compartido/contratos/contaduria/consultas-gastos-contador";
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import { veSueldosYTarifas } from "../../../nucleo/acceso/quien.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeConsulta } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { cuentaDelPaquete, lecturaDelPaquete, type RenglonDelPaquete } from "../dominio/paquete-mes.ts";
import { type ConceptoDelPaquete, conceptosDelPaquete } from "../tablas.ts";
import { paginar } from "./comun.ts";

/** Cómo se lee cada concepto y si entra, sale o solo informa. */
const conceptos: Readonly<Record<ConceptoDelPaquete, { texto: string; signo: "ingreso" | "egreso" | "informativo" }>> =
	{
		cobranza_clientes: { texto: "Cobranza a clientes", signo: "ingreso" },
		anticipos_recibidos: { texto: "Anticipos recibidos", signo: "ingreso" },
		anticipos_aplicados: { texto: "Anticipos aplicados a notas", signo: "informativo" },
		ventas_tiendas: { texto: "Ventas de las tiendas", signo: "ingreso" },
		anticipos_tiendas: { texto: "Anticipos de las tiendas", signo: "ingreso" },
		ventas_en_linea: { texto: "Ventas en línea", signo: "ingreso" },
		comisiones_pasarela: { texto: "Comisiones de la pasarela", signo: "egreso" },
		reembolsos_en_linea: { texto: "Reembolsos en línea", signo: "egreso" },
		devoluciones_saldo_favor: { texto: "Devoluciones de saldo a favor", signo: "egreso" },
		pagos_proveedores_acreedores: { texto: "Pagos a proveedores y acreedores", signo: "egreso" },
		nomina: { texto: "Nómina", signo: "egreso" },
		gasto: { texto: "Gasto", signo: "egreso" },
	};

/** Cómo se lee cada tipo de documento del contador. */
const tiposDeDocumento: Readonly<Record<string, string>> = {
	declaracion: "Declaración",
	acuse: "Acuse",
	facturas: "Facturas",
	documento: "Documento",
};

/**
 * El mes como se lee: «octubre 2026».
 * @param mes Su primer día.
 */
function mesEnTexto(mes: string): string {
	return textoDeMes(mes).replace(" de ", " ");
}

/** Un paquete, como lo lee la consulta. */
const paqueteLeido = z.object({
	id: z.uuid(),
	version: z.coerce.number(),
	mes: z.string(),
	fecha_limite: z.string(),
	estado: z.enum(["por_enviar", "enviado"]),
	enviado: z.string().nullable(),
	archivo_id: z.uuid().nullable(),
});

/**
 * Los paquetes, el más nuevo arriba; o uno, si se dice.
 * @param contexto El contexto de la consulta.
 * @param id El paquete.
 */
async function paquetes(contexto: ContextoDeConsulta, id?: string) {
	const { rows } = await contexto.base.execute(sql`SELECT id, version, mes::text, fecha_limite::text, estado,
			(enviado_en AT TIME ZONE ${zonaDelNegocio}::text)::date::text AS enviado, archivo_id
		FROM paquetes_contador WHERE (${id ?? null}::uuid IS NULL OR id = ${id ?? null}::uuid) ORDER BY mes DESC`);
	return z.array(paqueteLeido).parse(rows);
}

/** Un documento del contador. */
const documentoLeido = z.object({
	id: z.uuid(),
	archivo_id: z.uuid(),
	nombre: z.string(),
	tipo: z.string(),
	mes: z.string().nullable(),
	llego: z.string(),
});

export const consultaContadorExterno = implementarConsulta(contadorExterno, async (contexto, parametros) => {
	const todos = await paquetes(contexto);
	const porEnviar = todos.filter((paquete) => paquete.estado === "por_enviar").at(-1);
	const { rows } =
		await contexto.base.execute(sql`SELECT id, archivo_id, nombre, tipo, mes::text, llego_en::text AS llego
		FROM documentos_contador ORDER BY llego_en DESC, id DESC`);
	const pagina = paginar(z.array(documentoLeido).parse(rows), parametros.cursor);
	return {
		resultado: {
			por_enviar:
				porEnviar === undefined
					? null
					: {
							paquete_contador_id: porEnviar.id,
							mes_texto: mesEnTexto(porEnviar.mes),
							fecha_limite: textoDeDia(porEnviar.fecha_limite),
							vencido: contexto.diaDeNegocio.until(porEnviar.fecha_limite, { largestUnit: "days" }).days < 0,
						},
			paquetes: todos.map((paquete) => ({
				paquete_contador_id: paquete.id,
				mes_texto: mesEnTexto(paquete.mes),
				enviado: paquete.enviado === null ? null : textoDeDiaCorto(paquete.enviado),
				estado:
					paquete.estado === "enviado"
						? { texto: "Enviado", color: "verde" as const, abajo: null }
						: { texto: "Por enviar", color: "ambar" as const, abajo: null },
				// El ZIP lleva la nómina del mes: sin «ven sueldos y tarifas» no se puede abrir, y no se manda su id.
				archivo_id: veSueldosYTarifas(contexto.quien) ? paquete.archivo_id : null,
			})),
			documentos: pagina.renglones.map((documento) => ({
				documento_contador_id: documento.id,
				archivo_id: documento.archivo_id,
				nombre: documento.nombre,
				tipo: tiposDeDocumento[documento.tipo] ?? documento.tipo,
				mes: documento.mes === null ? null : mesEnTexto(documento.mes),
				llego: textoDeDiaCorto(documento.llego),
			})),
			cursor: pagina.cursor,
			hay_mas: pagina.hay_mas,
		},
	};
});

/**
 * Los renglones congelados de un paquete mandado.
 * @param contexto El contexto de la consulta.
 * @param paqueteId El paquete.
 */
async function renglonesCongelados(contexto: ContextoDeConsulta, paqueteId: string): Promise<RenglonDelPaquete[]> {
	const { rows } = await contexto.base.execute(sql`SELECT concepto, categoria_id, de_meses_anteriores,
			monto_centavos AS monto, documentos
		FROM paquete_contador_renglones WHERE paquete_contador_id = ${paqueteId}::uuid ORDER BY id`);
	return z
		.array(
			z.object({
				concepto: z.enum(conceptosDelPaquete),
				categoria_id: z.uuid().nullable(),
				de_meses_anteriores: z.boolean(),
				monto: z.coerce.number(),
				documentos: z.number().int(),
			}),
		)
		.parse(rows)
		.map((fila) => ({
			concepto: fila.concepto,
			categoriaId: fila.categoria_id,
			deMesesAnteriores: fila.de_meses_anteriores,
			montoCentavos: fila.monto,
			documentos: fila.documentos,
		}));
}

/**
 * Los nombres de las categorías de gasto.
 * @param contexto El contexto de la consulta.
 */
async function nombresDeCategorias(contexto: ContextoDeConsulta): Promise<Map<string, string>> {
	const { rows } = await contexto.base.execute(sql`SELECT v.id, v.nombre FROM lista_valores v
		JOIN listas l ON l.id = v.lista_id WHERE l.clave = 'categorias_gasto'`);
	return new Map(
		z
			.array(z.object({ id: z.uuid(), nombre: z.string() }))
			.parse(rows)
			.map((fila) => [fila.id, fila.nombre]),
	);
}

export const consultaPaqueteMes = implementarConsulta(paqueteMes, async (contexto, parametros) => {
	const [paquete] = await paquetes(contexto, parametros.paquete_contador_id);
	if (paquete === undefined) throw noExiste();
	const enviado = paquete.estado === "enviado";
	const renglones = enviado
		? await renglonesCongelados(contexto, paquete.id)
		: await (async () => {
				const lectura = await contexto.comoAccion((accion) =>
					lecturaDelPaquete(accion.transaccion, paquete.mes, { conCandado: false }),
				);
				return cuentaDelPaquete(paquete.mes, lectura.movimientos, lectura.gastos, lectura.mesesEnviados).renglones;
			})();
	const categorias = await nombresDeCategorias(contexto);
	const conSueldos = veSueldosYTarifas(contexto.quien);
	return {
		resultado: {
			paquete_contador_id: paquete.id,
			version: paquete.version,
			mes_texto: Temporal.PlainDate.from(paquete.mes).toLocaleString("es-MX", { month: "long" }),
			enviado,
			renglones: renglones.map((renglon) => {
				const { texto, signo } = conceptos[renglon.concepto];
				const esNomina = renglon.concepto === "nomina";
				const deGasto =
					renglon.concepto === "gasto" ? ` · ${categorias.get(renglon.categoriaId ?? "") ?? "Sin categoría"}` : "";
				return {
					concepto: `${texto}${deGasto}`,
					signo,
					...(esNomina ? {} : { monto_centavos: renglon.montoCentavos }),
					...(esNomina && conSueldos ? { total_nomina_centavos: renglon.montoCentavos } : {}),
					es_nomina: esNomina,
					documentos: renglon.documentos,
					de_meses_anteriores: renglon.deMesesAnteriores,
				};
			}),
		},
		...(conSueldos ? {} : { recortado: ["total_nomina_centavos"] }),
	};
});
