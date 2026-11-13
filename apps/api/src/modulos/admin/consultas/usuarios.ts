/**
 * Las consultas de las cuentas en Administración del sistema: `admin.usuarios`, `admin.cuenta_nueva`,
 * `admin.alta_usuario` y `admin.pantalla_acceso`.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Usuarios y accesos», «Pantalla de acceso», «Alta de usuario» y
 * «Ventanas») y docs/modulos/admin/cuentas.md
 *
 * Las cuentas activas, con la dueña primero; soporte va aparte, en su renglón fijo. La dueña tiene todos los
 * departamentos sin renglones (docs/modulos/admin/permisos.md, regla 3). La Puerta del taller no se da en un alta.
 */

import {
	altaUsuarioDeAdmin,
	cuentaNuevaDeAdmin,
	pantallaAccesoDeAdmin,
	usuariosDeAdmin,
} from "@uniformame/compartido/contratos/admin/consultas-usuarios";
import { claveDeDepartamento } from "@uniformame/compartido/contratos/admin/cuentas";
import { and, asc, desc, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import { esLaDuena } from "../../../nucleo/acceso/quien.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { autorizaciones } from "../../direccion/tablas.ts";
import { personas } from "../../personal/tablas.ts";
import { estadosVivos } from "../dominio/cuentas.ts";
import { departamentos, empresa, sesiones, usuarioDepartamentos, usuarios } from "../tablas.ts";
import { inicialesDe } from "./armazon.ts";
import { altasPorConfirmar, areaParaLeer, personaQuePidio, quienLaPidio, quienPidio, ultimaEntrada } from "./comun.ts";

/** La clave de la Puerta del taller: entra con PIN, nunca se da en un alta ni sale en el menú. */
const puertaDelTaller = "puerta_taller";

/**
 * Los departamentos que se dan a una cuenta, en el orden del menú, sin la Puerta del taller.
 * @param contexto El contexto de la consulta.
 */
async function departamentosQueSeDan(contexto: ContextoDeConsulta) {
	const todos = await contexto.base
		.select({ clave: departamentos.clave, nombre: departamentos.nombre, grupo: departamentos.grupo })
		.from(departamentos)
		.where(eq(departamentos.asignableEnAlta, true))
		.orderBy(asc(departamentos.orden));
	return todos.map((departamento) => ({ ...departamento, clave: claveDeDepartamento.parse(departamento.clave) }));
}

/** El nombre de una cuenta: el de su persona; en soporte, el de la cuenta; si no, su correo. */
const nombreDeLaCuenta = sql<string>`coalesce(${personas.nombre}, ${usuarios.nombre}, ${usuarios.correo})`;

/**
 * Las cuentas activas con su persona, la dueña primero y luego por nombre.
 * @param contexto El contexto de la consulta.
 */
async function cuentasActivas(contexto: ContextoDeConsulta) {
	const ahora = contexto.ahora.toString();
	return contexto.base
		.select({
			id: usuarios.id,
			version: usuarios.version,
			nombre: nombreDeLaCuenta,
			correo: usuarios.correo,
			esDuena: usuarios.esDuena,
			esSoporte: usuarios.esSoporte,
			area: personas.area,
			ultimaEntrada: sql<
				string | null
			>`(select max(${sesiones.creadoEn}) from ${sesiones} where ${sesiones.usuarioId} = ${usuarios.id})`,
			abiertas: sql<number>`(select count(*)::int from ${sesiones} where ${sesiones.usuarioId} = ${usuarios.id}
				and ${sesiones.cerradaEn} is null and ${sesiones.venceEn} > ${ahora})`,
		})
		.from(usuarios)
		.leftJoin(personas, eq(personas.id, usuarios.personaId))
		.where(eq(usuarios.estado, "activa"))
		.orderBy(desc(usuarios.esDuena), asc(nombreDeLaCuenta));
}

export const consultaUsuarios = implementarConsulta(usuariosDeAdmin, async (contexto) => {
	const { base, quien, diaDeNegocio } = contexto;
	const esDuena = esLaDuena(quien);
	const cuentas = await cuentasActivas(contexto);
	const asignables = await departamentosQueSeDan(contexto);
	const vigentes = await base
		.select({ usuarioId: usuarioDepartamentos.usuarioId, clave: departamentos.clave })
		.from(usuarioDepartamentos)
		.innerJoin(departamentos, eq(departamentos.id, usuarioDepartamentos.departamentoId))
		.where(isNull(usuarioDepartamentos.bajaEn))
		.orderBy(asc(departamentos.orden));
	const soporte = cuentas.find((cuenta) => cuenta.esSoporte);
	const altas = await altasPorConfirmar(base);
	return {
		resultado: {
			es_duena: esDuena,
			cuentas: cuentas
				.filter((cuenta) => !cuenta.esSoporte)
				.map((cuenta) => ({
					usuario_id: cuenta.id,
					version: cuenta.version,
					iniciales: inicialesDe(cuenta.nombre),
					nombre: cuenta.nombre,
					correo: cuenta.correo,
					es_duena: cuenta.esDuena,
					ubicacion: cuenta.esDuena ? "Todas" : areaParaLeer(cuenta.area),
					ultima_entrada: ultimaEntrada(cuenta.ultimaEntrada, diaDeNegocio),
					sesiones_abiertas: cuenta.abiertas,
					puede_cerrar_sesiones: !cuenta.esDuena || esDuena,
					// La dueña los tiene todos, sin renglones.
					departamentos: cuenta.esDuena
						? asignables.map((departamento) => departamento.clave)
						: vigentes
								.filter((vigente) => vigente.usuarioId === cuenta.id && vigente.clave !== puertaDelTaller)
								.map((vigente) => claveDeDepartamento.parse(vigente.clave)),
				})),
			soporte:
				soporte === undefined
					? null
					: {
							nombre: soporte.nombre,
							correo: soporte.correo,
							ultima_entrada: ultimaEntrada(soporte.ultimaEntrada, diaDeNegocio),
						},
			altas_pendientes: altas.map((alta) => ({
				autorizacion_id: alta.autorizacionId,
				texto: `${alta.pidio} pidió: ${alta.resumen}.`,
			})),
			departamentos: asignables,
		},
	};
});

export const consultaCuentaNueva = implementarConsulta(cuentaNuevaDeAdmin, async (contexto) => {
	const { base, quien } = contexto;
	// Las personas activas que no son de tienda y no tienen una cuenta viva (cuentas.md, reglas 2 y 3).
	const libres = await base
		.select({ id: personas.id, folio: personas.folio, nombre: personas.nombre, puesto: personas.puesto })
		.from(personas)
		.where(
			and(
				isNull(personas.bajaEn),
				sql`${personas.area} <> 'tienda'`,
				notExists(
					base
						.select({ id: usuarios.id })
						.from(usuarios)
						.where(and(eq(usuarios.personaId, personas.id), inArray(usuarios.estado, estadosVivos))),
				),
			),
		)
		.orderBy(asc(personas.folio));
	return {
		resultado: {
			es_duena: esLaDuena(quien),
			personas: libres.map((persona) => ({
				persona_id: persona.id,
				texto: `${persona.folio} · ${persona.nombre} · ${persona.puesto}`,
			})),
			departamentos: await departamentosQueSeDan(contexto),
		},
	};
});

export const consultaAltaUsuario = implementarConsulta(altaUsuarioDeAdmin, async (contexto, parametros) => {
	const { base } = contexto;
	const [alta] = await altaDeUsuario(contexto, parametros.autorizacion_id);
	if (alta === undefined) throw noExiste();
	const pedidos = await base
		.select({ nombre: departamentos.nombre })
		.from(usuarioDepartamentos)
		.innerJoin(departamentos, eq(departamentos.id, usuarioDepartamentos.departamentoId))
		.where(and(eq(usuarioDepartamentos.usuarioId, alta.usuarioId), isNull(usuarioDepartamentos.bajaEn)))
		.orderBy(asc(departamentos.orden));
	return {
		resultado: {
			autorizacion_id: alta.autorizacionId,
			folio: alta.folio,
			version: alta.version,
			por_autorizar: alta.estado === "por_autorizar",
			pidio: alta.pidio,
			persona: alta.persona,
			correo: alta.correo,
			departamentos: pedidos.map((pedido) => pedido.nombre).join(", "),
			ubicacion: areaParaLeer(alta.area),
			para_que: alta.resumen,
			liga: `Se liga a ${alta.folioPersona} · ${alta.persona}, ${alta.puesto}.`,
		},
	};
});

/**
 * Una autorización de alta de usuario con su cuenta solicitada y su persona, esté o no por autorizar.
 * @param contexto El contexto de la consulta.
 * @param autorizacionId La AU-.
 */
async function altaDeUsuario(contexto: ContextoDeConsulta, autorizacionId: string) {
	return contexto.base
		.select({
			autorizacionId: autorizaciones.id,
			folio: autorizaciones.folio,
			version: autorizaciones.version,
			estado: autorizaciones.estado,
			resumen: autorizaciones.resumen,
			usuarioId: usuarios.id,
			correo: usuarios.correo,
			persona: personas.nombre,
			folioPersona: personas.folio,
			puesto: personas.puesto,
			area: personas.area,
			pidio: quienLaPidio,
		})
		.from(autorizaciones)
		.innerJoin(usuarios, eq(usuarios.autorizacionId, autorizaciones.id))
		.leftJoin(quienPidio, eq(quienPidio.id, autorizaciones.creadoPor))
		.leftJoin(personaQuePidio, eq(personaQuePidio.id, quienPidio.personaId))
		.innerJoin(personas, eq(personas.id, usuarios.personaId))
		.where(and(eq(autorizaciones.id, autorizacionId), eq(autorizaciones.tipo, "alta_usuario")));
}

export const consultaPantallaAcceso = implementarConsulta(pantallaAccesoDeAdmin, async (contexto) => {
	const { base, quien } = contexto;
	if (quien.tipo !== "cuenta") throw noExiste();
	const cuentas = await cuentasActivas(contexto);
	const [marca] = await base.select({ nombre: empresa.nombreComercial }).from(empresa);
	const minutos = await parametroNumero(contexto, "admin.sesion_inactividad_min");
	return {
		resultado: {
			marca: marca?.nombre ?? "",
			inactividad_min: minutos,
			cuentas: cuentas.map((cuenta) => ({
				usuario_id: cuenta.id,
				iniciales: inicialesDe(cuenta.nombre),
				nombre: cuenta.nombre,
				correo: cuenta.correo,
			})),
		},
	};
});
