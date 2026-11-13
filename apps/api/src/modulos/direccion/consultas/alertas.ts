/**
 * `direccion.alertas`: las alertas cruzadas de este momento, cada una con el detalle de su tarjeta, los nombres de los
 * departamentos que cruza y su «Ver» solo si la cuenta tiene ese departamento.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Alertas cruzadas») y docs/modulos/direccion/alertas-e-indicadores.md
 * («Las alertas»)
 *
 * Qué alertas salen, su título, su color y su orden los da la misma función que usa el trabajo de alertas
 * (`alertasDeAhora`): la pantalla y el aviso dicen lo mismo. El detalle lo arma esta consulta leyendo a cada dueño con
 * sus lecturas (Producción, Mantenimiento, Patronaje, Contaduría, Compras e Inventario).
 */

import { enPesos } from "@uniformame/compartido/calculos/dinero";
import { textoDeDia } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { type alertaDeDireccion, alertas, reglasDeAlerta } from "@uniformame/compartido/contratos/direccion/alertas";
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { QuienLlama } from "../../../nucleo/acceso/quien.ts";
import { camposQueNoVe } from "../../../nucleo/acceso/recorte.ts";
import { ErrorDeApi } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import type { AlertaDeDireccion } from "../dominio/alertas.ts";
import { alertasDeAhora } from "../trabajos/alertas-direccion.ts";
import { formatoDeCantidad, formatoDePiezas } from "./cifras.ts";
import { rutaSiLaTiene } from "./departamentos-de-la-cuenta.ts";

/** Una alerta como la regresa la consulta. */
type AlertaConDetalle = z.infer<typeof alertaDeDireccion>;

/** Cómo se dice cada semáforo de crédito a media frase («Semáforo: detenido»), en minúsculas. */
const nombreDelSemaforo: Readonly<Record<string, string>> = {
	al_corriente: "al corriente",
	cerca_del_limite: "cerca del límite",
	detenido: "detenido",
};

/**
 * Lee una fila con SQL y la revisa con su forma.
 * @param contexto El contexto de la lectura.
 * @param esquema La forma de la fila.
 * @param consulta El SQL.
 * @returns La fila, o `undefined` si no hay.
 */
async function leerFila<T>(contexto: ContextoDeAccion, esquema: z.ZodType<T>, consulta: ReturnType<typeof sql>) {
	const { rows } = await contexto.transaccion.execute(consulta);
	return rows[0] === undefined ? undefined : esquema.parse(rows[0]);
}

/**
 * El detalle de un lote detenido: «{prenda} para {cliente o destino}, entrega comprometida el {fecha}», más la falla
 * de su máquina con sus horas de paro si es por máquina.
 * @param contexto El contexto de la lectura.
 * @param loteId El lote.
 */
async function detalleDeLote(contexto: ContextoDeAccion, loteId: string): Promise<string> {
	const lote = await leerFila(
		contexto,
		z.object({ prenda: z.string(), para: z.string(), entrega: z.string() }),
		sql`SELECT p.nombre AS prenda, coalesce(t.nombre, u.nombre, '') AS para, l.fecha_entrega::text AS entrega
			FROM lotes l JOIN productos p ON p.id = l.producto_id
			LEFT JOIN pedidos pe ON pe.id = l.pedido_id LEFT JOIN clientes c ON c.id = pe.cliente_id
			LEFT JOIN terceros t ON t.id = c.tercero_id LEFT JOIN ubicaciones u ON u.id = l.ubicacion_destino_id
			WHERE l.id = ${loteId}::uuid`,
	);
	if (lote === undefined) return "";
	const base = `${lote.prenda} para ${lote.para}, entrega comprometida el ${textoDeDia(lote.entrega)}`;
	// La falla de la máquina que lo detiene: la misma que nombra el título del lote atorado.
	const { lotes } = z
		.object({ lotes: z.array(z.object({ lote_id: z.string(), falla: z.string().nullable() })) })
		.parse(await contexto.lectura("produccion.lotes_atorados", {}));
	const nombreDeFalla = lotes.find((uno) => uno.lote_id === loteId)?.falla ?? null;
	if (nombreDeFalla === null) return `${base}.`;
	const { fallas } = z
		.object({ fallas: z.array(z.object({ folio: z.string(), motivo: z.string(), horas_paro: z.number() })) })
		.parse(await contexto.lectura("mantenimiento.fallas_que_detienen", {}));
	const falla = fallas.find((una) => nombreDeFalla.endsWith(`(${una.folio})`));
	if (falla === undefined) return `${base}.`;
	return `${base}. Falla ${falla.folio}: ${falla.motivo.toLocaleLowerCase("es-MX")}, ${plural(falla.horas_paro, "hora", "horas")} de paro.`;
}

/**
 * El detalle del consumo de tela de una prenda: «Patrón {n} m, real {n} m por pieza». Lo real sale de sus cortes y lo
 * del patrón, del desperdicio medido que da Patronaje.
 * @param contexto El contexto de la lectura.
 * @param productoId La prenda.
 */
async function detalleDeConsumo(contexto: ContextoDeAccion, productoId: string): Promise<string> {
	const { cortes } = z
		.object({
			cortes: z.array(
				z.object({ metros_usados: z.string().nullable(), tallas: z.array(z.object({ piezas: z.number() })) }),
			),
		})
		.parse(await contexto.lectura("produccion.cortes_de_prenda", { producto_id: productoId }));
	const medidos = cortes.filter((corte) => corte.metros_usados !== null);
	const metros = medidos.reduce((suma, corte) => suma + Number(corte.metros_usados), 0);
	const piezas = medidos.reduce(
		(suma, corte) => suma + corte.tallas.reduce((deTallas, talla) => deTallas + talla.piezas, 0),
		0,
	);
	const { prendas } = z
		.object({ prendas: z.array(z.object({ desperdicio_pct: z.coerce.number() })) })
		.parse(await contexto.lectura("patronaje.desperdicio_prenda", { producto_id: productoId }));
	const desperdicio = prendas[0]?.desperdicio_pct ?? 0;
	if (piezas === 0) return "";
	const real = metros / piezas;
	const patron = real / (1 + desperdicio / 100);
	return `Patrón ${formatoDeCantidad.format(patron)} m, real ${formatoDeCantidad.format(real)} m por pieza.`;
}

/**
 * El detalle de la concentración del saldo por cobrar: «{saldo del cliente} de {saldo total}», con su vencido de más
 * de los días del parámetro y su semáforo de crédito.
 * @param contexto El contexto de la lectura.
 * @param clienteId El cliente.
 */
async function detalleDeConcentracion(contexto: ContextoDeAccion, clienteId: string): Promise<string> {
	const dias = Number(
		await leerParametro(contexto.transaccion, { clave: "direccion.alerta_concentracion_vencido_dias" }),
	);
	const resumen = z
		.object({
			por_cobrar_centavos: z.number(),
			cliente_que_mas_debe: z.object({ saldo_centavos: z.number(), vencido_centavos: z.number() }).nullable(),
		})
		.parse(await contexto.lectura("contaduria.resumen_direccion", { dias_vencido: dias }));
	const cliente = resumen.cliente_que_mas_debe;
	if (cliente === null) return "";
	const vencido =
		cliente.vencido_centavos > 0 ? `, con ${enPesos(cliente.vencido_centavos)} de más de ${dias} días` : "";
	// El semáforo, solo si el cliente tiene crédito: sin crédito, la lectura responde que no existe.
	const credito = await contexto
		.lectura("contaduria.credito_de_cliente", { cliente_id: clienteId })
		.catch((error: unknown) => {
			if (error instanceof ErrorDeApi && error.error === "no_existe") return null;
			throw error;
		});
	const leido = z.object({ semaforo: z.string() }).safeParse(credito);
	const semaforo = leido.success ? `. Semáforo: ${nombreDelSemaforo[leido.data.semaforo] ?? ""}` : "";
	return `${enPesos(cliente.saldo_centavos)} de ${enPesos(resumen.por_cobrar_centavos)}${vencido}${semaforo}.`;
}

/**
 * El detalle de un producto descontinuado con existencia: «{n} en bodega y el resto en tiendas».
 * @param contexto El contexto de la lectura.
 * @param productoId El producto.
 */
async function detalleDeDescontinuado(contexto: ContextoDeAccion, productoId: string): Promise<string> {
	const fila = await leerFila(
		contexto,
		z.object({ piezas: z.coerce.number() }),
		sql`SELECT coalesce(sum(e.piezas), 0) AS piezas FROM existencias e
			JOIN variantes v ON v.id = e.variante_id JOIN ubicaciones u ON u.id = e.ubicacion_id
			WHERE v.producto_id = ${productoId}::uuid AND u.tipo = 'bodega'`,
	);
	return `${formatoDePiezas.format(fila?.piezas ?? 0)} en bodega y el resto en tiendas.`;
}

/**
 * El detalle de un material sin tiempo de reposición: su cobertura, el plazo de su proveedor, su existencia y lo
 * comprometido en producción, de la cuenta de Compras.
 * @param contexto El contexto de la lectura.
 * @param materialId El material.
 */
async function detalleDeMaterial(contexto: ContextoDeAccion, materialId: string): Promise<string> {
	const cuenta = z
		.record(
			z.string(),
			z.object({
				hay_bodega: z.coerce.number(),
				comprometido: z.coerce.number(),
				se_acaba: z.string().nullable(),
				plazo: z.number(),
			}),
		)
		.parse(await contexto.lectura("compras.cuenta_material", { material_ids: [materialId] }))[materialId];
	const material = z
		.record(z.string(), z.object({ unidad: z.string(), proveedor_habitual_id: z.uuid() }))
		.parse(await contexto.lectura("compras.datos_materiales", { material_ids: [materialId] }))[materialId];
	if (cuenta === undefined || material === undefined) return "";
	const proveedor = await leerFila(
		contexto,
		z.object({ nombre: z.string() }),
		sql`SELECT t.nombre FROM proveedores p JOIN terceros t ON t.id = p.tercero_id
			WHERE p.id = ${material.proveedor_habitual_id}::uuid`,
	);
	const cobertura =
		cuenta.se_acaba === null
			? 0
			: Math.max(0, contexto.diaDeNegocio.until(Temporal.PlainDate.from(cuenta.se_acaba)).days);
	return (
		`Cobertura de ${plural(cobertura, "día", "días")}; ${proveedor?.nombre ?? ""} entrega en ` +
		`${plural(cuenta.plazo, "día", "días")}. Existencia ${formatoDeCantidad.format(cuenta.hay_bodega)} ` +
		`${material.unidad} y ${formatoDeCantidad.format(cuenta.comprometido)} comprometidos en producción.`
	);
}

/**
 * El detalle de un cuadre con residuo: «{n} diferencias y {n} excepciones en Bodega», con la hora en que terminó.
 * @param contexto El contexto de la lectura.
 */
async function detalleDeCuadre(contexto: ContextoDeAccion): Promise<string> {
	const { cuadre } = z
		.object({
			cuadre: z
				.object({
					terminado_en: z.string().nullable(),
					diferencias_creadas: z.number(),
					excepciones_creadas: z.number(),
				})
				.nullable(),
		})
		.parse(await contexto.lectura("inventario.ultimo_cuadre", {}));
	if (cuadre === null) return "";
	const cuantas = `${plural(cuadre.diferencias_creadas, "diferencia", "diferencias")} y ${plural(cuadre.excepciones_creadas, "excepción", "excepciones")} en Bodega`;
	if (cuadre.terminado_en === null) return `${cuantas}.`;
	const hora = Temporal.Instant.from(new Date(cuadre.terminado_en).toISOString())
		.toZonedDateTimeISO("America/Mexico_City")
		.toPlainTime()
		.toLocaleString("es-MX", { hour: "numeric", minute: "2-digit", hourCycle: "h23" });
	return `${cuantas}. Terminó a las ${hora}.`;
}

/**
 * El detalle de la tarjeta de una alerta, según su regla.
 * @param contexto El contexto de la lectura.
 * @param alerta La alerta.
 * @param veMontos Si quien la ve recibe montos (la regla del recorte común).
 */
function detalleDe(contexto: ContextoDeAccion, alerta: AlertaDeDireccion, veMontos: boolean): Promise<string> {
	switch (alerta.regla) {
		case "lote_detenido":
			return detalleDeLote(contexto, alerta.entidadId);
		case "consumo_tela":
			return detalleDeConsumo(contexto, alerta.entidadId);
		case "concentracion":
			// El detalle lleva montos: quien no los ve (la cuenta de soporte) no lo recibe.
			return veMontos ? detalleDeConcentracion(contexto, alerta.entidadId) : Promise.resolve("");
		case "descontinuado":
			return detalleDeDescontinuado(contexto, alerta.entidadId);
		case "sin_reposicion":
			return detalleDeMaterial(contexto, alerta.entidadId);
		case "sin_sincronizar":
			return Promise.resolve("Ventas y corte sin recibir; su existencia no se ofrece en línea.");
		case "cuadre_residuo":
			return detalleDeCuadre(contexto);
		default:
			throw new Error(`la alerta ${alerta.clave} no tiene detalle`);
	}
}

/**
 * Las alertas de este momento, con su detalle, los nombres de los departamentos que cruzan y su «Ver» para quien las
 * ve.
 * @param contexto El contexto de la lectura (una transacción que solo lee).
 * @param quien Quien las ve: «Ver» no sale si no tiene ese departamento.
 */
export async function alertasConDetalle(contexto: ContextoDeAccion, quien: QuienLlama): Promise<AlertaConDetalle[]> {
	const deAhora = await alertasDeAhora(contexto);
	const veMontos = !camposQueNoVe(quien, contexto.camposDeSueldo)("saldo_centavos");
	const { rows } = await contexto.transaccion.execute(sql`SELECT clave, nombre FROM departamentos`);
	const nombres = new Map(
		z
			.array(z.object({ clave: z.string(), nombre: z.string() }))
			.parse(rows)
			.map((fila) => [fila.clave, fila.nombre]),
	);
	const conDetalle: AlertaConDetalle[] = [];
	for (const alerta of deAhora) {
		conDetalle.push({
			clave: alerta.clave,
			regla: z.enum(reglasDeAlerta).parse(alerta.regla),
			// Quien no ve montos (la cuenta de soporte) recibe el título sin ellos.
			titulo: veMontos ? alerta.titulo : (alerta.tituloSinMontos ?? alerta.titulo),
			detalle: await detalleDe(contexto, alerta, veMontos),
			cruza: alerta.departamentos.map((clave) => nombres.get(clave) ?? clave),
			color: alerta.color,
			ver: rutaSiLaTiene(quien, alerta.ver),
		});
	}
	return conDetalle;
}

export const consultaAlertas = implementarConsulta(alertas, async (contexto) => ({
	resultado: {
		alertas: await contexto.comoAccion((deLectura) => alertasConDetalle(deLectura, contexto.quien)),
	},
}));
