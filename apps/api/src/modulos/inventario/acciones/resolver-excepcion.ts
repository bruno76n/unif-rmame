/**
 * `inventario.resolver_excepcion`: Bodega (o Producción las del taller, o Contaduría las de su bandeja) dice qué se
 * hizo con una excepción. No mueve nada.
 * Fase 9 · docs/modulos/inventario/excepciones.md («`inventario.resolver_excepcion`», reglas 2 y 3)
 */

import { resolverExcepcion } from "@uniformame/compartido/contratos/inventario/excepciones";
import { eq } from "drizzle-orm";
import { nombreDeCuenta } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { ErrorDeApi, errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { excepciones } from "../tablas.ts";

/** Los tipos del taller: también los resuelve Producción. */
const tiposDelTaller: readonly string[] = ["pasa_tope_bulto", "lote_no_en_proceso"];

/**
 * Revisa que quien resuelve tenga esa bandeja: Bodega lo de Bodega; Producción lo del taller; Contaduría lo de
 * dinero. La dueña, todo. A quien no tiene esa bandeja se le contesta como si no existiera: no sabe ni que está.
 * @throws `404` si no es de su bandeja.
 */
function revisarBandeja(contexto: ContextoDeAccion, excepcion: { tipo: string; area: string }): void {
	const { quien } = contexto;
	if (quien.tipo !== "cuenta") throw new ErrorDeApi("sin_permiso", "fuera_de_alcance");
	if (quien.esDuena) return;
	const tiene = (departamento: string) => quien.departamentos.includes(departamento);
	const puede =
		excepcion.area === "contaduria"
			? tiene("contaduria")
			: tiene("bodega") || (tiposDelTaller.includes(excepcion.tipo) && tiene("produccion"));
	if (!puede) throw noExiste();
}

export const accionResolverExcepcion = implementarAccion(resolverExcepcion, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const [excepcion] = await transaccion
		.select()
		.from(excepciones)
		.where(eq(excepciones.id, datos.excepcion_id))
		.for("update");
	if (excepcion === undefined) throw noExiste();
	revisarBandeja(contexto, excepcion);
	if (excepcion.estado === "resuelta") {
		throw errorDeRegla("ya_resuelta", `Ya la resolvió ${await nombreDeCuenta(contexto, excepcion.resueltaPor)}`);
	}
	const minimo = Number(await contexto.lectura("admin.parametro", { clave: "general.largo_minimo_motivo" }));
	if (datos.resolucion.length < minimo) throw errorDeCampo("resolucion", "Escribe qué se hizo");
	await tomarVersion(contexto, excepciones, excepcion.id, version, async () => excepcion);
	await transaccion
		.update(excepciones)
		.set({
			estado: "resuelta",
			resueltaEn: contexto.ahora.toString(),
			resueltaPor: contexto.quien.tipo === "cuenta" ? contexto.quien.usuarioId : null,
			resolucion: datos.resolucion,
		})
		.where(eq(excepciones.id, excepcion.id));
	contexto.bitacora({
		descripcion: `Resolvió la excepción ${excepcion.tipo}`,
		entidad: "excepciones",
		entidadId: excepcion.id,
		antes: { estado: "por_revisar", descripcion: excepcion.descripcion },
		despues: { estado: "resuelta", resolucion: datos.resolucion },
	});
	contexto.guardarEvento({
		tipo: "excepcion.resuelta",
		datos: { excepcion_id: excepcion.id },
		tablas: ["excepciones"],
		entidad: "excepciones",
		entidadId: excepcion.id,
	});
	return {
		resultado: { mensaje: "Excepción resuelta: queda en Resueltas" },
		entidad: { nombre: "excepciones", id: excepcion.id },
	};
});
