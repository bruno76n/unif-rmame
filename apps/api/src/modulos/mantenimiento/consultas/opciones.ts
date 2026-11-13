/**
 * `mantenimiento.opciones`: las listas de las ventanas de Mantenimiento. Los tipos de máquina, las áreas del taller, la
 * gente activa del Taller (quién la trae), los técnicos vigentes, los motivos de falla en su orden y las máquinas
 * activas con su versión y si tienen falla abierta.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Ventanas») y
 * docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md (reglas 2, 4 y 8)
 */

import { opcionesDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { listaDeAreas } from "../siembra.ts";
import { leerMaquinas } from "./comun.ts";

/** Algo de una lista, como sale de la base. */
const deLaLista = z.array(z.object({ id: z.uuid(), nombre: z.string() }));

export const consultaOpcionesDeMantenimiento = implementarConsulta(opcionesDeMantenimiento, async (contexto) => ({
	resultado: await contexto.comoAccion(async (accion) => {
		/** Lee una lista de ids y nombres. */
		const lista = async (consulta: ReturnType<typeof sql>) =>
			deLaLista.parse((await accion.transaccion.execute(consulta)).rows);
		const { rows: motivos } = await accion.transaccion.execute(sql`
			SELECT id, nombre, detiene_maquina AS detiene FROM motivos_falla WHERE baja_en IS NULL ORDER BY orden`);
		const maquinas = (await leerMaquinas(accion)).filter((maquina) => maquina.baja_el_dia === null);
		return {
			tipos: await lista(sql`SELECT id, nombre FROM tipos_maquina WHERE baja_en IS NULL ORDER BY nombre`),
			areas: await lista(sql`
				SELECT v.id, v.nombre FROM lista_valores v JOIN listas l ON l.id = v.lista_id
				WHERE l.clave = ${listaDeAreas} AND v.baja_en IS NULL ORDER BY v.orden, v.nombre`),
			personas: await lista(sql`
				SELECT id, nombre FROM personas WHERE area = 'taller' AND baja_en IS NULL ORDER BY nombre`),
			tecnicos: await lista(sql`SELECT id, nombre FROM tecnicos WHERE baja_en IS NULL ORDER BY nombre`),
			motivos: z.array(z.object({ id: z.uuid(), nombre: z.string(), detiene: z.boolean() })).parse(motivos),
			maquinas: maquinas
				.map((maquina) => ({
					id: maquina.id,
					nombre: maquina.nombre,
					folio: maquina.folio,
					version: maquina.version,
					con_falla_abierta: maquina.falla_id !== null,
				}))
				.sort((una, otra) => una.nombre.localeCompare(otra.nombre, "es-MX", { numeric: true })),
		};
	}),
}));
