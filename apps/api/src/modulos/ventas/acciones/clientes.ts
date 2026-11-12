/**
 * `ventas.crear_cliente`, `ventas.editar_cliente`, `ventas.dar_baja_cliente` y `ventas.reactivar_cliente`: el cliente
 * externo, ligado a su tercero, con su crédito, su lista de precios y, si es escuela, su escuela.
 * Fase 16 · docs/modulos/ventas/clientes.md (reglas 1 a 6, «Acciones»)
 *
 * El nombre y el RFC viven en el tercero (`contaduria.crear_tercero` y `contaduria.renombrar_tercero`); el crédito,
 * en Contaduría; la lista y la escuela, en Catálogo. Todo nace y cambia en la misma transacción que el cliente.
 */

import { centavosATexto } from "@uniformame/compartido/calculos/dinero";
import {
	crearCliente,
	darBajaCliente,
	editarCliente,
	reactivarCliente,
} from "@uniformame/compartido/contratos/ventas/clientes";
import { centavos } from "@uniformame/compartido/tipos/base";
import { and, count, eq, inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { quienCambia, revisarMotivo } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { ErrorDeApi, errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { escuelas } from "../../catalogo/tablas.ts";
import { creditoClientes, terceros } from "../../contaduria/tablas.ts";
import { type ClienteConNombre, eventoDeCliente, leerCliente, nombreDelTipo } from "../dominio/clientes.ts";
import { clientes, pedidos } from "../tablas.ts";

/** Lo que regresa `contaduria.crear_tercero`. */
const terceroCreado = z.object({ tercero_id: z.uuid(), ya_existia: z.boolean(), avisos: z.array(z.string()) });

/** Lo que regresa `contaduria.renombrar_tercero`. */
const terceroRenombrado = z.object({ avisos: z.array(z.string()) });

/** El nombre ya es de otro cliente. */
const clienteRepetido = () => errorDeRegla("cliente_repetido", "Ya hay un cliente con ese nombre.");

/**
 * Cambia el error de nombre repetido de Contaduría por el de Ventas.
 * @param codigos Los códigos de Contaduría que quieren decir «ya es cliente».
 */
function comoRepetido(codigos: readonly string[]) {
	return (error: unknown): never => {
		if (error instanceof ErrorDeApi && error.codigo !== null && codigos.includes(error.codigo)) throw clienteRepetido();
		throw error;
	};
}

/**
 * Los 10 dígitos de un teléfono.
 * @param telefono El teléfono como se escribió.
 */
function digitos(telefono: string): string {
	return telefono.replace(/\D/g, "");
}

/**
 * La escuela que se escogió para un cliente escuela, bloqueada: que exista, esté activa y no sea ya cliente.
 * @throws `400` en `escuela_id`; `422 escuela_ya_es_cliente`.
 */
async function escuelaEscogida(transaccion: Parameters<typeof leerCliente>[0], escuelaId: string) {
	const [escuela] = await transaccion
		.select({ id: escuelas.id, nombre: escuelas.nombre, bajaEn: escuelas.bajaEn })
		.from(escuelas)
		.where(eq(escuelas.id, escuelaId))
		.for("update");
	if (escuela === undefined || escuela.bajaEn !== null) throw errorDeCampo("escuela_id", "Escoge la escuela.");
	const [yaCliente] = await transaccion
		.select({ nombre: terceros.nombre })
		.from(clientes)
		.innerJoin(terceros, eq(terceros.id, clientes.terceroId))
		.where(eq(clientes.escuelaId, escuelaId));
	if (yaCliente !== undefined) {
		throw errorDeRegla("escuela_ya_es_cliente", `${escuela.nombre} ya es cliente: ${yaCliente.nombre}.`);
	}
	return escuela.id;
}

export const accionCrearCliente = implementarAccion(crearCliente, async (contexto, datos) => {
	const { transaccion } = contexto;
	if (datos.tipo !== "escuela" && datos.escuela_id !== undefined) {
		throw errorDeCampo("escuela_id", "Solo un cliente escuela lleva escuela.");
	}
	// La escuela que nace lleva el nombre del cliente, y una escuela lleva al menos 4 letras (decisión 676).
	if (datos.tipo === "escuela" && datos.escuela_id === undefined && datos.nombre.length < 4) {
		throw errorDeCampo("nombre", "El nombre de la escuela lleva al menos 4 letras.");
	}
	const escogida = datos.escuela_id === undefined ? undefined : await escuelaEscogida(transaccion, datos.escuela_id);
	// El tercero nace, o se liga si el nombre ya es un proveedor o un acreedor; si ya es cliente, es repetido.
	const tercero = terceroCreado.parse(
		await contexto
			.interna("contaduria.crear_tercero", {
				nombre: datos.nombre,
				rol: "cliente",
				...(datos.rfc === undefined ? {} : { rfc: datos.rfc }),
				ligar_si_existe: true,
			})
			.catch(comoRepetido(["rol_ya_existe"])),
	);
	const escuelaId =
		datos.tipo !== "escuela"
			? null
			: (escogida ??
				z.object({ escuela_id: z.uuid() }).parse(
					await contexto.interna("catalogo.crear_escuela_para_cliente", {
						nombre: datos.nombre,
						municipio: datos.municipio,
					}),
				).escuela_id);
	const id = uuidv7();
	const ficha = {
		tipo: datos.tipo,
		municipio: datos.municipio,
		direccionEntrega: datos.direccion_entrega,
		contacto: datos.contacto ?? null,
		telefono: digitos(datos.telefono),
		correo: datos.correo ?? null,
	};
	await transaccion.insert(clientes).values({
		id,
		terceroId: tercero.tercero_id,
		escuelaId,
		...ficha,
		creadoPor: quienCambia(contexto),
	});
	await contexto.interna("contaduria.abrir_credito_cliente", {
		cliente_id: id,
		tercero_id: tercero.tercero_id,
		tipo_cliente: datos.tipo,
	});
	const { lista_id: listaId } = z
		.object({ lista_id: z.uuid() })
		.parse(await contexto.interna("catalogo.crear_lista_cliente", { cliente_id: id, nombre: datos.nombre }));
	const [credito] = await transaccion
		.select({ dias: creditoClientes.diasCredito })
		.from(creditoClientes)
		.where(eq(creditoClientes.clienteId, id));
	eventoDeCliente(contexto, "cliente.creado", id);
	contexto.bitacora({
		descripcion: `Cliente nuevo: ${datos.nombre}, ${nombreDelTipo[datos.tipo]} en ${datos.municipio}; sin crédito, ${credito?.dias ?? 0} días`,
		entidad: "clientes",
		entidadId: id,
		despues: {
			nombre: datos.nombre,
			rfc: datos.rfc ?? null,
			tipo: datos.tipo,
			municipio: datos.municipio,
			direccion_entrega: datos.direccion_entrega,
			contacto: ficha.contacto,
			telefono: ficha.telefono,
			correo: ficha.correo,
			escuela_id: escuelaId,
			ligado: tercero.ya_existia,
		},
	});
	return {
		resultado: {
			mensaje:
				datos.desde_pedido === true
					? `${datos.nombre} dado de alta y escogido para el pedido`
					: `${datos.nombre} dado de alta. Compra con precios de mayoreo hasta que Catálogo le ponga su lista`,
			cliente_id: id,
			lista_id: listaId,
			escuela_id: escuelaId,
		},
		avisos: [
			...(tercero.ya_existia ? [`Se ligó a la ficha de ${datos.nombre} que ya existía en Contaduría.`] : []),
			...tercero.avisos,
		],
		entidad: { nombre: "clientes", id },
	};
});

/** Cómo se llama cada campo de la ficha en la bitácora. */
const nombresDeCampos = {
	nombre: "nombre",
	rfc: "RFC",
	municipio: "municipio",
	direccion_entrega: "dirección de entrega",
	contacto: "contacto",
	telefono: "teléfono",
	correo: "correo",
} as const;

/** Un campo de la ficha. */
type Campo = keyof typeof nombresDeCampos;

/**
 * La ficha de un cliente como la compara la edición.
 * @param cliente El cliente con su tercero.
 */
function fichaDe(cliente: ClienteConNombre): Record<Campo, string | null> {
	return {
		nombre: cliente.nombre,
		rfc: cliente.rfc,
		municipio: cliente.municipio,
		direccion_entrega: cliente.direccionEntrega,
		contacto: cliente.contacto,
		telefono: cliente.telefono,
		correo: cliente.correo,
	};
}

export const accionEditarCliente = implementarAccion(editarCliente, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const cliente = await leerCliente(transaccion, datos.cliente_id, true);
	await tomarVersion(contexto, clientes, cliente.id, version, async () => ({
		cliente_id: cliente.id,
		...fichaDe(cliente),
	}));
	const antes = fichaDe(cliente);
	const pedido: Record<Campo, string | null | undefined> = {
		nombre: datos.nombre,
		rfc: datos.rfc === undefined || datos.rfc === null ? datos.rfc : datos.rfc.toUpperCase(),
		municipio: datos.municipio,
		direccion_entrega: datos.direccion_entrega,
		contacto: datos.contacto,
		telefono: datos.telefono === undefined ? undefined : digitos(datos.telefono),
		correo: datos.correo,
	};
	// Solo lo que llegó y es distinto de lo guardado.
	const cambios = (Object.keys(nombresDeCampos) as Campo[]).filter(
		(campo) => pedido[campo] !== undefined && pedido[campo] !== antes[campo],
	);
	if (cambios.length === 0) throw errorDeRegla("sin_cambios", "Sin cambios");
	const nombre = pedido.nombre ?? cliente.nombre;
	const avisos: string[] = [];
	if (cambios.includes("nombre") || cambios.includes("rfc")) {
		const renombrado = terceroRenombrado.parse(
			await contexto
				.interna("contaduria.renombrar_tercero", {
					tercero_id: cliente.terceroId,
					nombre,
					...(cambios.includes("rfc") ? { rfc: pedido.rfc } : {}),
				})
				.catch(comoRepetido(["nombre_repetido"])),
		);
		avisos.push(...renombrado.avisos);
	}
	// Con el nombre se renombran su lista y su escuela, si se llamaban igual (regla 5).
	if (cambios.includes("nombre")) {
		await contexto.interna("catalogo.sincronizar_nombre_cliente", {
			cliente_id: cliente.id,
			nombre_anterior: cliente.nombre,
			nombre,
			escuela_id: cliente.escuelaId,
		});
	}
	await transaccion
		.update(clientes)
		.set({
			...(pedido.municipio === undefined ? {} : { municipio: pedido.municipio ?? cliente.municipio }),
			...(pedido.direccion_entrega === undefined
				? {}
				: { direccionEntrega: pedido.direccion_entrega ?? cliente.direccionEntrega }),
			...(pedido.contacto === undefined ? {} : { contacto: pedido.contacto }),
			...(pedido.telefono === undefined ? {} : { telefono: pedido.telefono ?? cliente.telefono }),
			...(pedido.correo === undefined ? {} : { correo: pedido.correo }),
		})
		.where(eq(clientes.id, cliente.id));
	for (const campo of cambios) {
		contexto.bitacora({
			descripcion: `${nombre}: ${nombresDeCampos[campo]} ${antes[campo] ?? "—"} → ${pedido[campo] ?? "—"}`,
			entidad: "clientes",
			entidadId: cliente.id,
			antes: { [campo]: antes[campo] },
			despues: { [campo]: pedido[campo] },
		});
	}
	eventoDeCliente(contexto, "cliente.cambiado", cliente.id);
	return {
		resultado: {
			mensaje: `Datos de ${nombre} guardados`,
			cliente_id: cliente.id,
			version: await versionActual(transaccion, clientes, cliente.id),
		},
		avisos,
		entidad: { nombre: "clientes", id: cliente.id },
	};
});

/** Lo que regresa `contaduria.saldo_por_cobrar_de_cliente`: el monto, solo a quien tiene Contaduría. */
const saldoDelCliente = z.object({ con_saldo: z.boolean(), saldo_centavos: z.number().int().optional() });

export const accionDarBajaCliente = implementarAccion(darBajaCliente, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	await revisarMotivo(contexto, datos.motivo);
	const cliente = await leerCliente(transaccion, datos.cliente_id, true);
	await tomarVersion(contexto, clientes, cliente.id, version, async () => ({
		cliente_id: cliente.id,
		baja_en: cliente.bajaEn,
	}));
	if (cliente.bajaEn !== null) {
		throw errorDeRegla("cliente_dado_de_baja", `${cliente.nombre} ya está dado de baja.`);
	}
	// Sin pedidos abiertos: en borrador o confirmados.
	const [abiertos] = await transaccion
		.select({ n: count() })
		.from(pedidos)
		.where(and(eq(pedidos.clienteId, cliente.id), inArray(pedidos.estado, ["borrador", "confirmado"])));
	if ((abiertos?.n ?? 0) > 0) {
		throw errorDeRegla(
			"cliente_con_pedidos",
			`${cliente.nombre} tiene ${abiertos?.n} pedido(s) abierto(s): no se puede dar de baja.`,
		);
	}
	// Sin saldo por cobrar; el monto solo lo ve quien también tiene Contaduría.
	const saldo = saldoDelCliente.parse(
		await contexto.lectura("contaduria.saldo_por_cobrar_de_cliente", { cliente_id: cliente.id }),
	);
	if (saldo.con_saldo) {
		throw errorDeRegla(
			"cliente_con_saldo",
			saldo.saldo_centavos === undefined
				? `${cliente.nombre} tiene saldo por cobrar: no se puede dar de baja hasta que pague.`
				: `${cliente.nombre} nos debe ${centavosATexto(centavos(saldo.saldo_centavos), { conCentavos: saldo.saldo_centavos % 100 !== 0 })}: no se puede dar de baja hasta que pague.`,
		);
	}
	const motivo = datos.motivo.trim();
	await transaccion
		.update(clientes)
		.set({ bajaEn: contexto.ahora.toString(), bajaPor: quienCambia(contexto), motivoBaja: motivo })
		.where(eq(clientes.id, cliente.id));
	await contexto.interna("catalogo.dar_baja_lista_cliente", { cliente_id: cliente.id, motivo });
	eventoDeCliente(contexto, "cliente.cambiado", cliente.id);
	contexto.bitacora({
		descripcion: `Dio de baja a ${cliente.nombre}: ${motivo}`,
		entidad: "clientes",
		entidadId: cliente.id,
		antes: { activo: true },
		despues: { activo: false, motivo },
	});
	return {
		resultado: {
			mensaje: `${cliente.nombre} dado de baja. Su historial se conserva`,
			cliente_id: cliente.id,
			version: await versionActual(transaccion, clientes, cliente.id),
		},
		entidad: { nombre: "clientes", id: cliente.id },
	};
});

export const accionReactivarCliente = implementarAccion(reactivarCliente, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const cliente = await leerCliente(transaccion, datos.cliente_id, true);
	await tomarVersion(contexto, clientes, cliente.id, version, async () => ({
		cliente_id: cliente.id,
		baja_en: cliente.bajaEn,
	}));
	if (cliente.bajaEn === null) throw errorDeRegla("cliente_activo", `${cliente.nombre} ya está activo.`);
	await transaccion
		.update(clientes)
		.set({ bajaEn: null, bajaPor: null, motivoBaja: null, reactivadoEn: contexto.ahora.toString() })
		.where(eq(clientes.id, cliente.id));
	await contexto.interna("catalogo.reactivar_lista_cliente", { cliente_id: cliente.id });
	eventoDeCliente(contexto, "cliente.cambiado", cliente.id);
	contexto.bitacora({
		descripcion: `${cliente.nombre} vuelve a estar activo`,
		entidad: "clientes",
		entidadId: cliente.id,
		antes: { activo: false, motivo: cliente.motivoBaja },
		despues: { activo: true },
	});
	return {
		resultado: {
			mensaje: `${cliente.nombre} vuelve a estar activo`,
			cliente_id: cliente.id,
			version: await versionActual(transaccion, clientes, cliente.id),
		},
		entidad: { nombre: "clientes", id: cliente.id },
	};
});
