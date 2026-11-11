/**
 * `compras.crear_proveedor`, `compras.guardar_proveedor`, `compras.dar_baja_proveedor` y
 * `compras.reactivar_proveedor`: la ficha del proveedor, ligada a su tercero.
 * Fase 10 · docs/modulos/compras/proveedores-y-precios.md (reglas 1 a 4 y 11, «Acciones»)
 *
 * El nombre y el RFC viven en la ficha del tercero (`contaduria.crear_tercero` y `contaduria.renombrar_tercero`);
 * aquí, su ciudad, su teléfono, su condición, lo que dice que tarda y lo que surte.
 */

import {
	crearProveedor,
	darBajaProveedor,
	guardarProveedor,
	reactivarProveedor,
} from "@uniformame/compartido/contratos/compras/proveedores";
import { and, asc, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { ErrorDeApi, errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { eventoDeProveedor, leerProveedor, parametroNumero, revisarProveedorActivo } from "../dominio/comunes.ts";
import { materiales, proveedores } from "../tablas.ts";

/** Lo que regresa `contaduria.crear_tercero`. */
const terceroCreado = z.object({ tercero_id: z.uuid(), ya_existia: z.boolean(), avisos: z.array(z.string()) });

/** Lo que regresa `contaduria.renombrar_tercero`. */
const terceroRenombrado = z.object({ avisos: z.array(z.string()) });

/** Por qué no se pudo: el tercero ya es proveedor, con el código y el mensaje de Compras. */
const proveedorRepetido = () => errorDeRegla("proveedor_repetido", "Ya existe un proveedor con ese nombre");

/**
 * Cambia el error de nombre repetido de Contaduría por el de Compras.
 * @param error Lo que lanzó la interna.
 * @param codigos Los códigos de Contaduría que quieren decir «ya es proveedor».
 */
function comoRepetido(error: unknown, codigos: readonly string[]): never {
	if (error instanceof ErrorDeApi && error.codigo !== null && codigos.includes(error.codigo)) throw proveedorRepetido();
	throw error;
}

/**
 * Revisa lo que dice que tarda contra `compras.dias_dice_tardar_maximo`.
 * @throws `400` en `dias_dice_tardar`: «Entre 1 y {máximo} días».
 */
async function revisarDiasDiceTardar(contexto: ContextoDeAccion, dias: number): Promise<void> {
	const maximo = await parametroNumero(contexto, "compras.dias_dice_tardar_maximo");
	if (dias < 1 || dias > maximo) throw errorDeCampo("dias_dice_tardar", `Entre 1 y ${maximo} días`);
}

/**
 * Los 10 dígitos de un teléfono.
 * @param telefono El teléfono como se escribió.
 */
function digitos(telefono: string): string {
	return telefono.replace(/\D/g, "");
}

export const accionCrearProveedor = implementarAccion(crearProveedor, async (contexto, datos) => {
	await revisarDiasDiceTardar(contexto, datos.dias_dice_tardar);
	// El tercero nace, o se liga si el nombre ya es un cliente o un acreedor; si ya es proveedor, es repetido.
	const tercero = terceroCreado.parse(
		await contexto
			.interna("contaduria.crear_tercero", {
				nombre: datos.nombre,
				rol: "proveedor",
				...(datos.rfc === undefined ? {} : { rfc: datos.rfc }),
				ligar_si_existe: true,
			})
			.catch((error: unknown) => comoRepetido(error, ["rol_ya_existe"])),
	);
	const id = uuidv7();
	await contexto.transaccion.insert(proveedores).values({
		id,
		terceroId: tercero.tercero_id,
		ciudad: datos.ciudad,
		telefono: digitos(datos.telefono),
		diasCredito: datos.dias_credito,
		diasDiceTardar: datos.dias_dice_tardar,
		surte: datos.surte ?? null,
		creadoPor: quienCambia(contexto),
	});
	eventoDeProveedor(contexto, "proveedor.creado", id);
	contexto.bitacora({
		descripcion: `Proveedor nuevo: ${datos.nombre}, ${datos.ciudad}`,
		entidad: "proveedores",
		entidadId: id,
		despues: { nombre: datos.nombre, ciudad: datos.ciudad, ligado: tercero.ya_existia },
	});
	return {
		resultado: { proveedor_id: id, mensaje: `${datos.nombre} ya está en Proveedores` },
		avisos: [
			...(tercero.ya_existia ? [`Se ligó a la ficha de ${datos.nombre} que ya existía en Contaduría.`] : []),
			...tercero.avisos,
		],
		entidad: { nombre: "proveedores", id },
	};
});

/** Cómo se llama cada campo de la ficha en la bitácora. */
const nombresDeCampos = {
	nombre: "nombre",
	rfc: "RFC",
	ciudad: "ciudad",
	telefono: "teléfono",
	dias_credito: "días de crédito",
	dias_dice_tardar: "dice que tarda",
	surte: "qué surte",
} as const;

export const accionGuardarProveedor = implementarAccion(guardarProveedor, async (contexto, datos, version) => {
	const proveedor = await leerProveedor(contexto, datos.proveedor_id, "update");
	await tomarVersion(contexto, proveedores, proveedor.id, version, async () => ({
		proveedor_id: proveedor.id,
		nombre: proveedor.nombre,
		ciudad: proveedor.ciudad,
	}));
	if (datos.dias_dice_tardar !== undefined) await revisarDiasDiceTardar(contexto, datos.dias_dice_tardar);
	const antes = {
		nombre: proveedor.nombre,
		rfc: proveedor.rfc,
		ciudad: proveedor.ciudad,
		telefono: proveedor.telefono,
		dias_credito: proveedor.diasCredito,
		dias_dice_tardar: proveedor.diasDiceTardar,
		surte: proveedor.surte,
	};
	const pedido = {
		nombre: datos.nombre,
		rfc: datos.rfc === undefined || datos.rfc === null ? datos.rfc : datos.rfc.toUpperCase(),
		ciudad: datos.ciudad,
		telefono: datos.telefono === undefined ? undefined : digitos(datos.telefono),
		dias_credito: datos.dias_credito,
		dias_dice_tardar: datos.dias_dice_tardar,
		surte: datos.surte,
	};
	// Solo lo que llegó y es distinto de lo guardado.
	const cambios = (Object.keys(nombresDeCampos) as (keyof typeof nombresDeCampos)[]).filter(
		(campo) => pedido[campo] !== undefined && pedido[campo] !== antes[campo],
	);
	if (cambios.length === 0) throw errorDeRegla("sin_cambios", "Sin cambios");
	const nombre = pedido.nombre ?? proveedor.nombre;
	const avisos: string[] = [];
	if (cambios.includes("nombre") || cambios.includes("rfc")) {
		const renombrado = terceroRenombrado.parse(
			await contexto
				.interna("contaduria.renombrar_tercero", {
					tercero_id: proveedor.terceroId,
					nombre,
					...(cambios.includes("rfc") ? { rfc: pedido.rfc } : {}),
				})
				.catch((error: unknown) => comoRepetido(error, ["nombre_repetido"])),
		);
		avisos.push(...renombrado.avisos);
	}
	await contexto.transaccion
		.update(proveedores)
		.set({
			...(pedido.ciudad === undefined ? {} : { ciudad: pedido.ciudad }),
			...(pedido.telefono === undefined ? {} : { telefono: pedido.telefono }),
			...(pedido.dias_credito === undefined ? {} : { diasCredito: pedido.dias_credito }),
			...(pedido.dias_dice_tardar === undefined ? {} : { diasDiceTardar: pedido.dias_dice_tardar }),
			...(pedido.surte === undefined ? {} : { surte: pedido.surte }),
		})
		.where(eq(proveedores.id, proveedor.id));
	for (const campo of cambios) {
		contexto.bitacora({
			descripcion: `${nombre}: ${nombresDeCampos[campo]} ${antes[campo] ?? "—"} → ${pedido[campo] ?? "—"}`,
			entidad: "proveedores",
			entidadId: proveedor.id,
			antes: { [campo]: antes[campo] },
			despues: { [campo]: pedido[campo] },
		});
	}
	eventoDeProveedor(contexto, "proveedor.cambiado", proveedor.id);
	return {
		resultado: {
			mensaje:
				cambios.includes("dias_dice_tardar") && cambios.length === 1
					? `${nombre}: ahora dice que tarda ${pedido.dias_dice_tardar} días`
					: `Cambios guardados en ${nombre}`,
			version: await versionActual(contexto.transaccion, proveedores, proveedor.id),
		},
		avisos,
		entidad: { nombre: "proveedores", id: proveedor.id },
	};
});

export const accionDarBajaProveedor = implementarAccion(darBajaProveedor, async (contexto, datos, version) => {
	await revisarMotivo(contexto, datos.motivo);
	const proveedor = await leerProveedor(contexto, datos.proveedor_id, "update");
	await tomarVersion(contexto, proveedores, proveedor.id, version, async () => ({
		proveedor_id: proveedor.id,
		baja_en: proveedor.bajaEn,
	}));
	revisarProveedorActivo(proveedor);
	// No es el habitual de ningún material activo (el candado del proveedor espera a quien lo hace habitual).
	const habitualDe = await contexto.transaccion
		.select({ nombre: materiales.nombre })
		.from(materiales)
		.where(and(eq(materiales.proveedorHabitualId, proveedor.id), isNull(materiales.bajaEn)))
		.orderBy(asc(materiales.nombre));
	const [primero] = habitualDe;
	if (primero !== undefined) {
		const mas = habitualDe.length > 1 ? ` y ${habitualDe.length - 1} más` : "";
		throw errorDeRegla(
			"proveedor_habitual_de",
			`${proveedor.nombre} es el habitual de ${primero.nombre}${mas}: haz habitual a otro antes.`,
		);
	}
	await contexto.transaccion
		.update(proveedores)
		.set({ bajaEn: contexto.ahora.toString(), bajaPor: quienCambia(contexto), motivoBaja: datos.motivo })
		.where(eq(proveedores.id, proveedor.id));
	contexto.bitacora({
		descripcion: `Dio de baja ${proveedor.nombre}: ${datos.motivo}`,
		entidad: "proveedores",
		entidadId: proveedor.id,
		antes: { activo: true },
		despues: { activo: false, motivo: datos.motivo },
	});
	eventoDeProveedor(contexto, "proveedor.cambiado", proveedor.id);
	return {
		resultado: {
			mensaje: `${proveedor.nombre} dado de baja`,
			version: await versionActual(contexto.transaccion, proveedores, proveedor.id),
		},
		entidad: { nombre: "proveedores", id: proveedor.id },
	};
});

export const accionReactivarProveedor = implementarAccion(reactivarProveedor, async (contexto, datos, version) => {
	const proveedor = await leerProveedor(contexto, datos.proveedor_id, "update");
	await tomarVersion(contexto, proveedores, proveedor.id, version, async () => ({
		proveedor_id: proveedor.id,
		baja_en: proveedor.bajaEn,
	}));
	if (proveedor.bajaEn === null) throw errorDeRegla("proveedor_activo", `${proveedor.nombre} ya está activo.`);
	await contexto.transaccion
		.update(proveedores)
		.set({ bajaEn: null, bajaPor: null, motivoBaja: null, reactivadoEn: contexto.ahora.toString() })
		.where(eq(proveedores.id, proveedor.id));
	contexto.bitacora({
		descripcion: `${proveedor.nombre} vuelve a estar activo`,
		entidad: "proveedores",
		entidadId: proveedor.id,
		antes: { activo: false, motivo: proveedor.motivoBaja },
		despues: { activo: true },
	});
	eventoDeProveedor(contexto, "proveedor.cambiado", proveedor.id);
	return {
		resultado: {
			mensaje: `${proveedor.nombre} vuelve a estar activo`,
			version: await versionActual(contexto.transaccion, proveedores, proveedor.id),
		},
		entidad: { nombre: "proveedores", id: proveedor.id },
	};
});
