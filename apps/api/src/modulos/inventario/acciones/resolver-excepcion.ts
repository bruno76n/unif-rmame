/**
 * `inventario.resolver_excepcion`: Bodega (o Producción las del taller, o Contaduría las de su bandeja) dice qué se
 * hizo con una excepción. No mueve nada.
 * Fase 9 · docs/modulos/inventario/excepciones.md («`inventario.resolver_excepcion`», reglas 2 y 3)
 */

import { resolverExcepcion } from "@uniformame/compartido/contratos/inventario/excepciones";
import { eq, sql } from "drizzle-orm";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { ErrorDeApi, errorDeCampo, errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { excepciones } from "../tablas.ts";

/** Los tipos del taller: también los resuelve Producción. */
const tiposDelTaller: readonly string[] = ["pasa_tope_bulto", "lote_no_en_proceso"];

/**
 * Revisa que quien resuelve tenga esa bandeja: Bodega lo de Bodega; Producción lo del taller; Contaduría lo de
 * dinero. La dueña, todo.
 * @throws `403 sin_departamento`.
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
	if (!puede) throw new ErrorDeApi("sin_permiso", "sin_departamento");
}

/**
 * El nombre de quien resolvió una excepción: el de su persona, o el de la cuenta.
 * @param contexto El contexto de la acción.
 * @param usuarioId La cuenta.
 */
async function nombreDeQuienResolvio(contexto: ContextoDeAccion, usuarioId: string | null): Promise<string> {
	if (usuarioId === null) return "el sistema";
	const { rows } = await contexto.transaccion.execute(sql`
		SELECT coalesce(p.nombre, u.nombre, u.correo) AS nombre FROM usuarios u LEFT JOIN personas p ON p.id = u.persona_id
		WHERE u.id = ${usuarioId}`);
	return String(rows[0]?.nombre ?? "otra cuenta");
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
		throw errorDeRegla("ya_resuelta", `Ya la resolvió ${await nombreDeQuienResolvio(contexto, excepcion.resueltaPor)}`);
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
