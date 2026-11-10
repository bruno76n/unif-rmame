/**
 * El módulo de prueba de la fase 3: una acción que crea, dos que editan, una interna, una lectura y dos
 * consultas. Solo lo registran las pruebas (`cargarModulos` de esta carpeta), nunca la API.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md («Cómo se construye»)
 */

import { asc, eq, gt, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { tomarVersion, versionActual } from "../../../acciones/pisadas.ts";
import { leerCursor, paginar, recortar } from "../../../http/consultas.ts";
import { ErrorDeApi, errorDeRegla, noExiste } from "../../../http/errores.ts";
import {
	type ContextoDeAccion,
	definirModulo,
	type Horario,
	implementarAccion,
	implementarConsulta,
} from "../../../modulos.ts";
import {
	adjuntar,
	agregarRenglon,
	confirmar,
	crearNota,
	editarNota,
	editarSinVersion,
	fechar,
	ficha,
	imprimir,
	listarNotas,
	marcarDos,
	provocar,
	trampa,
	verMontos,
	verNota,
} from "./contratos.ts";
import { semillasDePrueba } from "./siembra.ts";
import { conteos, notas, renglones } from "./tablas.ts";

/** El horario del trabajo de prueba y cuántas veces corrió; las pruebas del reloj lo cambian. */
export const trabajoDePrueba: { horario: Horario | undefined; vueltas: string[]; fallar: boolean } = {
	horario: undefined,
	vueltas: [],
	fallar: false,
};

/** Los textos que ya chocaron una vez (`fallar: "con_choque_una_vez"`). */
const chocados = new Set<string>();

/**
 * Lo que la cuenta ve de una nota, como lo daría su consulta: las «privadas» solo la dueña, y el monto
 * solo quien tiene `ven_montos`. `undefined` si no la puede ver o no existe.
 */
async function notaVisible(contexto: ContextoDeAccion, id: string): Promise<Record<string, unknown> | undefined> {
	const [nota] = await contexto.transaccion
		.select({ texto: notas.texto, monto_centavos: notas.montoCentavos })
		.from(notas)
		.where(eq(notas.id, id));
	const { quien } = contexto;
	const esDuena = quien.tipo === "cuenta" && quien.esDuena;
	if (nota === undefined || (nota.texto.startsWith("privada") && !esDuena)) return undefined;
	const veMontos = quien.tipo === "cuenta" && (quien.esDuena || quien.permisosFinos.includes("ven_montos"));
	return recortar(nota, veMontos ? [] : ["monto_centavos"]).objeto;
}

export default definirModulo({
	nombre: "prueba",
	lectores: { prueba_notas: ["ventas"] },
	semillas: semillasDePrueba,
	// Como lo hará Personal con el pago por día: un campo de sueldo que hace sensible la bitácora.
	camposDeSueldo: ["pago_dia_centavos"],
	// La etiqueta de prueba: la piden Ventas o un puente con su trabajo; dice las notas y las copias.
	tiposDeEtiqueta: [
		{
			tipo: "prueba",
			departamentos: ["ventas"],
			dibujar: async (_contexto, pedido) =>
				pedido.formato === "zpl"
					? `^XA^FD${pedido.ids.join(",")}^FS^PQ${pedido.copias}^XZ`
					: new TextEncoder().encode(`%PDF-prueba ${pedido.ids.join(",")}`),
		},
	],
	trabajos: [
		{
			nombre: "prueba.resumen",
			horario: async () => trabajoDePrueba.horario,
			correr: async (contexto) => {
				if (trabajoDePrueba.fallar) throw new Error("falla de prueba del trabajo");
				trabajoDePrueba.vueltas.push(contexto.periodo ?? "");
			},
		},
	],
	acciones: [
		implementarAccion(crearNota, async (contexto, datos) => {
			if (datos.fallar === "con_regla") throw errorDeRegla("texto_prohibido", "Ese texto no se puede guardar");
			const id = uuidv7();
			await contexto.transaccion.insert(notas).values({ id, texto: datos.texto, montoCentavos: datos.monto_centavos });
			await contexto.interna("prueba.contar", { notaId: id });
			if (datos.fallar === "despues_de_la_interna") throw new Error("falla de prueba después de la interna");
			// Choca una vez por texto, como lo haría Postgres con dos transacciones, y a la segunda pasa.
			if (datos.fallar === "con_choque_una_vez" && !chocados.has(datos.texto)) {
				chocados.add(datos.texto);
				await contexto.transaccion.execute(
					sql`DO $$ BEGIN RAISE EXCEPTION 'choque de prueba' USING ERRCODE = '40001'; END $$`,
				);
			}
			if (datos.fallar !== "sin_bitacora") {
				contexto.bitacora({ descripcion: `Creó la nota ${datos.texto}`, entidad: "prueba_notas", entidadId: id });
			}
			contexto.guardarEvento({
				tipo: "nota.creada",
				// Un evento con un monto es un error del programa: `admin.guardar_evento` lo rechaza.
				datos: datos.fallar === "evento_con_monto" ? { nota_id: id, monto_centavos: 1 } : { nota_id: id },
				tablas: ["prueba_notas"],
				entidad: "prueba_notas",
				entidadId: id,
			});
			const pin = datos.con_pin === true ? { pin: "4821" } : {};
			// Formas de equivocarse que el corredor tiene que atrapar antes de guardar.
			const deMas = datos.fallar === "campo_de_mas" ? { pin_temporal: "SECRETO-DE-MAS" } : {};
			const avisos = datos.fallar === "secreto_en_aviso" && "pin" in pin ? [`Tu PIN es ${pin.pin}`] : [];
			return {
				resultado: { mensaje: `Nota ${datos.texto} creada`, id, ...pin, ...deMas },
				avisos,
				entidad: { nombre: "prueba_notas", id },
			};
		}),
		implementarAccion(editarNota, async (contexto, datos, version) => {
			await tomarVersion(contexto, notas, datos.id, version, () => notaVisible(contexto, datos.id));
			await contexto.transaccion.update(notas).set({ texto: datos.texto }).where(eq(notas.id, datos.id));
			contexto.bitacora({
				descripcion: `Cambió la nota a ${datos.texto}`,
				entidad: "prueba_notas",
				entidadId: datos.id,
			});
			return {
				resultado: { mensaje: "Nota guardada", version: await versionActual(contexto.transaccion, notas, datos.id) },
			};
		}),
		implementarAccion(agregarRenglon, async (contexto, datos, version) => {
			await tomarVersion(contexto, notas, datos.nota_id, version, () => notaVisible(contexto, datos.nota_id));
			await contexto.transaccion
				.insert(renglones)
				.values({ id: uuidv7(), notaId: datos.nota_id, cantidad: datos.cantidad });
			contexto.bitacora({ descripcion: `Agregó ${datos.cantidad} piezas` });
			return {
				resultado: {
					mensaje: "Renglón agregado",
					version: await versionActual(contexto.transaccion, notas, datos.nota_id),
				},
			};
		}),
		implementarAccion(adjuntar, async (contexto, datos) => {
			await contexto.interna("admin.ligar_archivo", {
				archivo_id: datos.archivo_id,
				proposito: "comprobante",
				modulo: "prueba",
				entidad: "prueba_notas",
				entidad_id: datos.nota_id,
			});
			contexto.bitacora({ descripcion: "Adjuntó un comprobante", entidad: "prueba_notas", entidadId: datos.nota_id });
			return { resultado: { mensaje: "Comprobante adjunto" } };
		}),
		implementarAccion(imprimir, async (contexto, datos) => {
			const { trabajo_id } = (await contexto.interna("admin.mandar_a_imprimir", { ...datos, tipo: "prueba" })) as {
				trabajo_id: string;
			};
			contexto.bitacora({ descripcion: `Mandó a imprimir ${datos.ids.length} etiquetas` });
			return { resultado: { mensaje: "Etiquetas mandadas", trabajo_id } };
		}),
		implementarAccion(marcarDos, async (contexto, datos) => {
			for (const id of datos.ids)
				contexto.bitacora({ descripcion: "Marcó la nota", entidad: "prueba_notas", entidadId: id });
			return { resultado: { mensaje: "Notas marcadas" } };
		}),
		implementarAccion(confirmar, async (contexto) => {
			contexto.bitacora({ descripcion: "Confirmó" });
			return { resultado: { mensaje: "Confirmado" } };
		}),
		implementarAccion(editarSinVersion, async (contexto, datos) => {
			await contexto.transaccion.update(notas).set({ texto: "sin versión" }).where(eq(notas.id, datos.id));
			return { resultado: { mensaje: "Guardada sin versión" } };
		}),
		implementarAccion(verMontos, async (contexto) => {
			contexto.bitacora({ descripcion: "Vio los montos" });
			return { resultado: { mensaje: "Montos" } };
		}),
		implementarAccion(fechar, async (contexto, datos) => {
			contexto.bitacora({ descripcion: `Fechó el ${datos.dia.toString()}` });
			return { resultado: { mensaje: "Fechado", dia_siguiente: datos.dia.add({ days: 1 }).toString() } };
		}),
		implementarAccion(provocar, async (contexto, datos) => {
			if (datos.error === "demasiados_intentos") {
				throw new ErrorDeApi("demasiados_intentos", null, "Demasiados intentos. Vuelve a intentar a las 10:35.", {
					reintentar_en: "2026-11-10T16:35:00Z",
				});
			}
			if (datos.error === "base") await contexto.transaccion.execute(sql`SELECT ${datos.valor ?? ""}::integer`);
			if (datos.error === "no_disponible")
				throw new ErrorDeApi("no_disponible", null, undefined, { reintentar_en: "2026-11-10T17:00:00Z" });
			throw new Error("la causa secreta: SELECT * FROM comandos_recibidos");
		}),
	],
	consultas: [
		implementarConsulta(trampa, async () => ({
			resultado: { monto_centavos: 125_000 },
			recortado: ["monto_centavos"],
		})),
		implementarConsulta(listarNotas, async (contexto, parametros) => {
			const limite = parametros.limite ?? 2;
			const desde = leerCursor(parametros.cursor);
			const leidas = await contexto.base
				.select({ id: notas.id, texto: notas.texto, monto_centavos: notas.montoCentavos })
				.from(notas)
				.where(desde === undefined ? undefined : gt(notas.id, String(desde.id)))
				.orderBy(asc(notas.id))
				.limit(limite + 1);
			const pagina = paginar(leidas, limite, (nota) => ({ id: nota.id }));
			const veMontos =
				contexto.quien.tipo === "cuenta" &&
				(contexto.quien.esDuena || contexto.quien.permisosFinos.includes("ven_montos"));
			const recortadas = pagina.renglones.map((nota) => recortar(nota, veMontos ? [] : ["monto_centavos"]));
			return {
				resultado: {
					...pagina,
					renglones: recortadas.map((r) => ({
						id: String(r.objeto.id),
						texto: String(r.objeto.texto),
						...(typeof r.objeto.monto_centavos === "number" ? { monto_centavos: r.objeto.monto_centavos } : {}),
					})),
				},
				recortado: [...new Set(recortadas.flatMap((r) => r.recortado))],
			};
		}),
		implementarConsulta(ficha, async (contexto, parametros) => {
			const [nota] = await contexto.base.select({ texto: notas.texto }).from(notas).where(eq(notas.id, parametros.id));
			if (nota === undefined) throw noExiste();
			await contexto.apuntarConsultaSensible({
				descripcion: `Consultó la ficha de la nota ${nota.texto}`,
				entidad: "prueba_notas",
				entidadId: parametros.id,
			});
			return { resultado: nota };
		}),
		implementarConsulta(verNota, async (contexto, parametros) => {
			const [nota] = await contexto.base
				.select({ id: notas.id, texto: notas.texto, version: notas.version })
				.from(notas)
				.where(eq(notas.id, parametros.id));
			const esDuena = contexto.quien.tipo === "cuenta" && contexto.quien.esDuena;
			if (nota === undefined || (nota.texto.startsWith("privada") && !esDuena)) throw noExiste();
			return { resultado: nota };
		}),
	],
	internas: {
		contar: async (contexto, datos) => {
			const notaId = typeof datos === "object" && datos !== null && "notaId" in datos ? String(datos.notaId) : "";
			await contexto.transaccion.insert(conteos).values({ id: uuidv7(), notaId });
			return undefined;
		},
	},
	lecturas: {
		// Quién ve una nota, para abrir sus archivos: lo mismo que su consulta.
		ve_documento: async (contexto, datos) => {
			const id = typeof datos === "object" && datos !== null && "entidad_id" in datos ? String(datos.entidad_id) : "";
			return (await notaVisible(contexto, id)) !== undefined;
		},
		texto: async (contexto, datos) => {
			const id = typeof datos === "object" && datos !== null && "id" in datos ? String(datos.id) : "";
			const [nota] = await contexto.transaccion.select({ texto: notas.texto }).from(notas).where(eq(notas.id, id));
			return nota?.texto;
		},
	},
});
