/**
 * `admin.armazon`: el menú, la cuenta y las pastillas de la web.
 * Fase 19 · docs/interfaz/comunes.md («El menú lateral», «`admin.armazon`»)
 *
 * Solo viaja lo que la cuenta tiene: sus departamentos (sin la Puerta del taller, que vive en la tablet), cada uno
 * con la pastilla que calcula el módulo dueño; sus permisos finos; sus avisos sin leer; hasta cuándo vale su
 * «Confirmar con Google»; la versión mínima de la web y la hora del servidor.
 */

import { armazon } from "@uniformame/compartido/contratos/admin/armazon";
import { claveDeDepartamento } from "@uniformame/compartido/contratos/admin/cuentas";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { parametroEntero } from "../../../nucleo/acceso/sesion.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { personas } from "../../personal/tablas.ts";
import { avisos, departamentos, usuarios } from "../tablas.ts";

/** Los grupos del menú, como los guarda la tabla. */
const grupo = z.enum(["operacion", "taller", "almacen", "administracion"]).nullable();

/**
 * Las iniciales de un nombre: la primera letra de sus dos primeras palabras.
 * @param nombre El nombre.
 */
export function inicialesDe(nombre: string): string {
	return nombre
		.split(/\s+/)
		.filter((palabra) => palabra.length > 0)
		.slice(0, 2)
		.map((palabra) => palabra.charAt(0).toLocaleUpperCase("es-MX"))
		.join("");
}

export const consultaArmazon = implementarConsulta(armazon, async (contexto) => {
	const { base, quien, ahora, registro } = contexto;
	if (quien.tipo !== "cuenta") throw noExiste();
	const [cuenta] = await base
		.select({ nombre: usuarios.nombre, correo: usuarios.correo, persona: personas.nombre })
		.from(usuarios)
		.leftJoin(personas, eq(personas.id, usuarios.personaId))
		.where(eq(usuarios.id, quien.usuarioId));
	if (cuenta === undefined) throw noExiste();
	const nombre = cuenta.persona ?? cuenta.nombre ?? cuenta.correo;
	// Sus departamentos, en el orden del menú; la Puerta del taller nunca sale en el menú.
	const todos = await base
		.select({
			clave: departamentos.clave,
			nombre: departamentos.nombre,
			grupo: departamentos.grupo,
			orden: departamentos.orden,
		})
		.from(departamentos)
		.orderBy(asc(departamentos.orden));
	const suyos = todos.filter(
		(departamento) =>
			departamento.clave !== "puerta_taller" && (quien.esDuena || quien.departamentos.includes(departamento.clave)),
	);
	const conPastilla = await Promise.all(
		suyos.map(async (departamento) => {
			const pastilla = registro.pastillas.get(departamento.clave);
			const cuenta = pastilla === undefined ? undefined : await pastilla(contexto);
			return {
				clave: claveDeDepartamento.parse(departamento.clave),
				nombre: departamento.nombre,
				grupo: grupo.parse(departamento.grupo),
				orden: departamento.orden,
				conteo: cuenta === undefined || cuenta.conteo === 0 ? null : cuenta.conteo,
				rojo: cuenta?.rojo ?? false,
			};
		}),
	);
	const [sinLeer] = await base
		.select({ cuantos: count() })
		.from(avisos)
		.where(and(eq(avisos.usuarioId, quien.usuarioId), isNull(avisos.leidoEn)));
	const minutos = await parametroEntero(base, "admin.reautenticacion_minutos");
	const puesto = quien.esDuena
		? "Administradora principal"
		: quien.esSoporte
			? "Soporte técnico"
			: suyos.length === 1
				? (suyos[0]?.nombre ?? "")
				: "Varios";
	return {
		resultado: {
			cuenta: {
				nombre,
				iniciales: inicialesDe(nombre),
				correo: cuenta.correo,
				puesto,
				es_duena: quien.esDuena,
				es_soporte: quien.esSoporte,
			},
			departamentos: conPastilla,
			permisos_finos: [...quien.permisosFinos],
			avisos_sin_leer: sinLeer?.cuantos ?? 0,
			confirmado_hasta:
				quien.confirmadoConGoogleEn === undefined
					? null
					: quien.confirmadoConGoogleEn.add({ minutes: minutos }).toString(),
			version_minima_web: String(await leerParametro(base, { clave: "admin.version_minima_web" })),
			largo_minimo_motivo: await parametroEntero(base, "general.largo_minimo_motivo"),
			servidor_en: ahora.toString(),
		},
	};
});
