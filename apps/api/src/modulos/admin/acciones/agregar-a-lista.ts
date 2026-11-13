/**
 * `admin.agregar_a_lista`: agrega un valor al final de una lista sencilla.
 * Fase 4 · docs/modulos/admin/configuracion.md («`admin.agregar_a_lista`»)
 *
 * El mismo nombre sin mayúsculas ni acentos responde `422 ya_esta`. En «Unidades de material» el nombre va
 * de 1 a 20, pide `se_cuenta_entera` y su clave es el nombre en minúsculas y sin acentos; en las demás
 * listas va de 3 a 40. Una lista que dice `solo_duena_agrega` solo la agrega la dueña.
 */

import { agregarALista } from "@uniformame/compartido/contratos/admin/configuracion";
import { eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { esLaDuena } from "../../../nucleo/acceso/quien.ts";
import { ErrorDeApi, errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { listas, listaValores } from "../tablas.ts";

/** La lista de las unidades de material, que tiene sus propias reglas. */
const unidadesDeMaterial = "unidades_material";

export const accionAgregarALista = implementarAccion(agregarALista, async (contexto, datos) => {
	const [lista] = await contexto.transaccion.select().from(listas).where(eq(listas.clave, datos.lista));
	if (lista === undefined) throw noExiste();
	const { quien } = contexto;
	if (lista.soloDuenaAgrega && !esLaDuena(quien)) {
		throw new ErrorDeApi("sin_permiso", "solo_duena", "Solo la dueña puede agregar");
	}
	const esUnidad = lista.clave === unidadesDeMaterial;
	const [minimo, maximo] = esUnidad ? [1, 20] : [3, 40];
	if (datos.nombre.length < minimo || datos.nombre.length > maximo) {
		throw errorDeCampo("nombre", `Escribe de ${minimo} a ${maximo} letras.`);
	}
	if (esUnidad && datos.se_cuenta_entera === undefined) {
		throw errorDeCampo("se_cuenta_entera", "Escoge si se cuenta entera.");
	}
	const id = uuidv7();
	const [agregado] = await contexto.transaccion
		.insert(listaValores)
		.values({
			id,
			listaId: lista.id,
			nombre: datos.nombre,
			nombreNormalizado: sql`sin_acentos(${datos.nombre})`,
			clave: esUnidad ? sql`sin_acentos(${datos.nombre})` : null,
			seCuentaEntera: esUnidad ? (datos.se_cuenta_entera ?? null) : null,
			orden: sql`(SELECT coalesce(max(orden), 0) + 1 FROM lista_valores WHERE lista_id = ${lista.id})`,
		})
		.onConflictDoNothing()
		.returning({ id: listaValores.id });
	if (agregado === undefined) throw errorDeRegla("ya_esta", "Ya está en la lista.");
	contexto.bitacora({
		descripcion: `Agregó «${datos.nombre}» a ${lista.nombre}`,
		entidad: "lista_valores",
		entidadId: id,
	});
	contexto.guardarEvento({
		tipo: "lista.valor_agregado",
		datos: { lista: lista.clave },
		tablas: ["lista_valores"],
		entidad: "lista_valores",
		entidadId: id,
	});
	return {
		resultado: { mensaje: `«${datos.nombre}» agregada a ${lista.nombre}`, id },
		entidad: { nombre: "lista_valores", id },
	};
});
