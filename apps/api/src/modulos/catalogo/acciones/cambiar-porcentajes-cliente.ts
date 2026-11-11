/**
 * `catalogo.cambiar_porcentajes_cliente`: Catálogo pone el % de básicos y el de especiales de la lista de un
 * cliente.
 * Fase 8 · docs/modulos/catalogo/listas-de-precios.md (regla 4, «`catalogo.cambiar_porcentajes_cliente`»)
 *
 * El porcentaje vive solo en la lista del cliente. Un pedido confirmado no cambia: congeló su precio.
 */

import { cambiarPorcentajesCliente } from "@uniformame/compartido/contratos/catalogo/listas";
import { eq } from "drizzle-orm";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { listasPrecios } from "../tablas.ts";

/**
 * Un porcentaje como va en la bitácora: «12 %» o «sin %».
 * @param valor El porcentaje guardado o nuevo.
 */
function textoDePorcentaje(valor: string | number | null): string {
	return valor === null ? "sin %" : `${Number(valor)} %`;
}

export const accionCambiarPorcentajesCliente = implementarAccion(
	cambiarPorcentajesCliente,
	async (contexto, datos, version) => {
		const { transaccion } = contexto;
		const [lista] = await transaccion.select().from(listasPrecios).where(eq(listasPrecios.id, datos.lista_id));
		if (lista === undefined) throw noExiste();
		await tomarVersion(contexto, listasPrecios, lista.id, version, async () => ({
			lista_id: lista.id,
			pct_basicos: lista.pctBasicos,
			pct_especiales: lista.pctEspeciales,
		}));
		if (lista.tipo !== "cliente") {
			throw errorDeRegla("lista_no_es_de_cliente", `${lista.nombre} no es lista de un cliente.`);
		}
		if (lista.bajaEn !== null) {
			throw errorDeRegla("lista_dada_de_baja", `${lista.nombre} está dada de baja con su cliente.`);
		}
		const aTexto = (valor: number | null) => (valor === null ? null : String(valor));
		await transaccion
			.update(listasPrecios)
			.set({ pctBasicos: aTexto(datos.pct_basicos), pctEspeciales: aTexto(datos.pct_especiales) })
			.where(eq(listasPrecios.id, lista.id));
		contexto.bitacora({
			descripcion: `% de ${lista.nombre}: básicos ${textoDePorcentaje(lista.pctBasicos)} → ${textoDePorcentaje(datos.pct_basicos)}; especiales ${textoDePorcentaje(lista.pctEspeciales)} → ${textoDePorcentaje(datos.pct_especiales)}`,
			entidad: "listas_precios",
			entidadId: lista.id,
			antes: { pct_basicos: lista.pctBasicos, pct_especiales: lista.pctEspeciales },
			despues: { pct_basicos: datos.pct_basicos, pct_especiales: datos.pct_especiales },
		});
		contexto.guardarEvento({
			tipo: "lista_precios.cambiada",
			datos: { lista_id: lista.id },
			tablas: ["listas_precios"],
			entidad: "listas_precios",
			entidadId: lista.id,
		});
		return {
			resultado: {
				mensaje: `Porcentajes de ${lista.nombre} guardados. Ventas a externos ya los usa`,
				version: await versionActual(transaccion, listasPrecios, lista.id),
			},
			entidad: { nombre: "listas_precios", id: lista.id },
		};
	},
);
