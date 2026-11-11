/**
 * `contaduria.crear_tercero` y `contaduria.renombrar_tercero`: la ficha común nace o se liga, nunca se duplica.
 * Fase 10 · docs/modulos/contaduria/terceros-y-deudas.md (reglas 1 a 3, «Acciones internas») y
 * docs/fases/10-patronaje-y-compras.md («Excepciones permitidas»)
 *
 * El nombre es único sin importar acentos, mayúsculas ni espacios dobles: lo cuida un índice único sobre
 * `nombre_busqueda`. Dos altas del mismo nombre a la vez esperan una a la otra (un candado por nombre), así que la
 * segunda ve a la primera y liga o responde repetido.
 */

import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { Transaccion } from "../../../nucleo/base/transacciones.ts";
import { ErrorDeApi, errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import type { ContextoDeAccion } from "../../../nucleo/modulos.ts";
import { clasesDeTercero, terceros } from "../tablas.ts";

/** Los roles de un tercero. */
const roles = ["cliente", "proveedor", "acreedor"] as const;

/** Un rol de un tercero. */
type Rol = (typeof roles)[number];

/** La columna de cada rol. */
const columnaDelRol = { cliente: "esCliente", proveedor: "esProveedor", acreedor: "esAcreedor" } as const;

/** El RFC: 12 o 13 letras y números; se guarda en mayúsculas. */
const rfc = z
	.string()
	.trim()
	.transform((texto) => texto.toUpperCase())
	.refine((texto) => /^[A-ZÑ&0-9]{12,13}$/.test(texto));

/** Lo que recibe `contaduria.crear_tercero`. */
const pedidoDeCrear = z
	.object({
		nombre: z.string().trim().min(3).max(120),
		rol: z.enum(roles),
		rfc: z.string().optional(),
		clase: z.enum(clasesDeTercero).optional(),
		telefono: z.string().optional(),
		ligar_si_existe: z.boolean().optional(),
		ligar_a_tercero_id: z.uuid().optional(),
	})
	.strict();

/** Lo que recibe `contaduria.renombrar_tercero`. */
const pedidoDeRenombrar = z
	.object({ tercero_id: z.uuid(), nombre: z.string().trim().min(3).max(120), rfc: z.string().nullable().optional() })
	.strict();

/** Un tercero como se guarda. */
type Tercero = typeof terceros.$inferSelect;

/**
 * El nombre de búsqueda de un nombre: en minúsculas, sin acentos y sin espacios dobles.
 * @param nombre El nombre como se escribió.
 */
function nombreDeBusqueda(nombre: string) {
	return sql`regexp_replace(sin_acentos(btrim(${nombre})), '\\s+', ' ', 'g')`;
}

/**
 * Revisa el RFC que llegó y lo regresa en mayúsculas.
 * @throws `400` en `rfc`: «El RFC lleva 12 o 13 letras y números».
 */
function rfcRevisado(texto: string | null | undefined): string | null | undefined {
	if (texto === null || texto === undefined) return texto;
	const revisado = rfc.safeParse(texto);
	if (!revisado.success) throw errorDeCampo("rfc", "El RFC lleva 12 o 13 letras y números");
	return revisado.data;
}

/**
 * Los roles prendidos de un tercero, para sus mensajes: «proveedor, cliente».
 * @param tercero El tercero.
 */
export function rolesDe(tercero: Pick<Tercero, "esCliente" | "esProveedor" | "esAcreedor">): Rol[] {
	return roles.filter((rol) => tercero[columnaDelRol[rol]]);
}

/**
 * Bloquea un tercero por su id.
 * @throws `404` si no existe.
 */
async function bloquearTercero(transaccion: Transaccion, id: string): Promise<Tercero> {
	const [tercero] = await transaccion.select().from(terceros).where(eq(terceros.id, id)).for("update");
	if (tercero === undefined) throw noExiste();
	return tercero;
}

/**
 * Toma el candado de un nombre de búsqueda y lee el tercero que ya lo tiene, bloqueado.
 * @param transaccion La transacción.
 * @param nombre El nombre como se escribió.
 */
async function terceroDelNombre(transaccion: Transaccion, nombre: string): Promise<Tercero | undefined> {
	await transaccion.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended('tercero:' || ${nombreDeBusqueda(nombre)}, 0))`,
	);
	const [tercero] = await transaccion
		.select()
		.from(terceros)
		.where(eq(terceros.nombreBusqueda, nombreDeBusqueda(nombre)))
		.for("update");
	return tercero;
}

/**
 * Prende el rol en una ficha que ya existe y guarda `tercero.ligado`.
 * @throws `422 rol_ya_existe` si ya lo tenía.
 */
async function ligar(contexto: ContextoDeAccion, tercero: Tercero, rol: Rol): Promise<void> {
	if (tercero[columnaDelRol[rol]]) throw errorDeRegla("rol_ya_existe", "Ya está en la lista.");
	await contexto.transaccion
		.update(terceros)
		.set({ [columnaDelRol[rol]]: true })
		.where(eq(terceros.id, tercero.id));
	contexto.guardarEvento({
		tipo: "tercero.ligado",
		datos: { tercero_id: tercero.id, rol },
		tablas: ["terceros"],
		entidad: "terceros",
		entidadId: tercero.id,
	});
}

/**
 * El aviso que no detiene: otro tercero ya tiene ese RFC.
 * @returns El aviso, o ninguno.
 */
async function avisoDeRfc(transaccion: Transaccion, rfcNuevo: string | null | undefined, terceroId: string) {
	if (rfcNuevo === null || rfcNuevo === undefined) return [];
	const [otro] = await transaccion
		.select({ nombre: terceros.nombre })
		.from(terceros)
		.where(sql`${terceros.rfc} = ${rfcNuevo} and ${terceros.id} <> ${terceroId}`)
		.limit(1);
	return otro === undefined ? [] : [`Ese RFC ya lo tiene ${otro.nombre}`];
}

/**
 * `contaduria.crear_tercero`: la ficha nueva con su rol, o el rol prendido en la que ya existía.
 * @param contexto El contexto de la acción que da de alta (Compras, Ventas o Contaduría).
 * @param datos El nombre, el rol, lo opcional y cómo ligar.
 * @returns `tercero_id`, `ya_existia` y los avisos que no detienen.
 * @throws `400` en `rfc`; `422 rol_ya_existe` («Ya está en la lista.»); `422 tercero_ya_existe` («Ya hay un tercero
 * con ese nombre: {nombre} ({roles}). ¿Es el mismo?», con su id, nombre y roles en `datos`).
 */
export async function crearTercero(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ tercero_id: string; ya_existia: boolean; avisos: string[] }> {
	const pedido = pedidoDeCrear.parse(datos);
	const { transaccion } = contexto;
	const rfcNuevo = rfcRevisado(pedido.rfc);
	// Con «Es el mismo»: el rol se prende en esa ficha.
	if (pedido.ligar_a_tercero_id !== undefined) {
		const tercero = await bloquearTercero(transaccion, pedido.ligar_a_tercero_id);
		await ligar(contexto, tercero, pedido.rol);
		return { tercero_id: tercero.id, ya_existia: true, avisos: [] };
	}
	const existente = await terceroDelNombre(transaccion, pedido.nombre);
	if (existente !== undefined) {
		if (pedido.ligar_si_existe !== true) {
			const suyos = rolesDe(existente);
			throw new ErrorDeApi(
				"regla",
				"tercero_ya_existe",
				`Ya hay un tercero con ese nombre: ${existente.nombre} (${suyos.join(", ")}). ¿Es el mismo?`,
				{ datos: { tercero_id: existente.id, nombre: existente.nombre, roles: suyos } },
			);
		}
		await ligar(contexto, existente, pedido.rol);
		return { tercero_id: existente.id, ya_existia: true, avisos: [] };
	}
	const id = uuidv7();
	await transaccion.insert(terceros).values({
		id,
		nombre: pedido.nombre,
		nombreBusqueda: nombreDeBusqueda(pedido.nombre),
		clase: pedido.clase ?? null,
		[columnaDelRol[pedido.rol]]: true,
		rfc: rfcNuevo ?? null,
		// El teléfono vive en el cliente o en el proveedor; aquí, solo el del acreedor.
		telefono: pedido.rol === "acreedor" ? (pedido.telefono ?? null) : null,
	});
	contexto.guardarEvento({
		tipo: "tercero.creado",
		datos: { tercero_id: id, rol: pedido.rol },
		tablas: ["terceros"],
		entidad: "terceros",
		entidadId: id,
	});
	return { tercero_id: id, ya_existia: false, avisos: await avisoDeRfc(transaccion, rfcNuevo, id) };
}

/**
 * `contaduria.renombrar_tercero`: cambia el nombre y, si viene, el RFC de una ficha.
 * @param contexto El contexto de la acción que renombra (Compras o Ventas).
 * @param datos El tercero, el nombre nuevo y el RFC, si viene.
 * @returns Lo de antes, para la bitácora de quien llama, y los avisos que no detienen.
 * @throws `400` en `rfc`; `422 nombre_repetido` («Ya está en la lista.») si otro tercero ya tiene ese nombre.
 */
export async function renombrarTercero(
	contexto: ContextoDeAccion,
	datos: unknown,
): Promise<{ antes: { nombre: string; rfc: string | null }; avisos: string[] }> {
	const pedido = pedidoDeRenombrar.parse(datos);
	const { transaccion } = contexto;
	const rfcNuevo = rfcRevisado(pedido.rfc);
	const tercero = await bloquearTercero(transaccion, pedido.tercero_id);
	const otro = await terceroDelNombre(transaccion, pedido.nombre);
	if (otro !== undefined && otro.id !== tercero.id) throw errorDeRegla("nombre_repetido", "Ya está en la lista.");
	await transaccion
		.update(terceros)
		.set({
			nombre: pedido.nombre,
			nombreBusqueda: nombreDeBusqueda(pedido.nombre),
			...(rfcNuevo === undefined ? {} : { rfc: rfcNuevo }),
		})
		.where(eq(terceros.id, tercero.id));
	contexto.guardarEvento({
		tipo: "tercero.renombrado",
		datos: { tercero_id: tercero.id },
		tablas: ["terceros"],
		entidad: "terceros",
		entidadId: tercero.id,
	});
	return {
		antes: { nombre: tercero.nombre, rfc: tercero.rfc },
		avisos: await avisoDeRfc(transaccion, rfcNuevo, tercero.id),
	};
}
