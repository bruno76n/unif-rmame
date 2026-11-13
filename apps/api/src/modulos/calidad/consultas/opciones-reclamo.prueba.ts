/**
 * Prueba de `calidad.opciones_reclamo`: lo que ofrece la ventana «Reclamo nuevo» según lo que se va escribiendo: los
 * clientes, la prenda del código con sus lotes revisados, los defectos, las operaciones del flujo del lote que suelen
 * causar el defecto con la persona que se propone (regla 3 de docs/modulos/calidad/reclamos-y-devoluciones.md) y lo
 * menos que lleva «Qué dice el cliente»; y que solo Calidad la pide.
 * Fase 19 · docs/fases/19-web-principal.md (criterio «Cada consulta revisa el departamento y el permiso fino en el
 * servidor y no manda lo que la cuenta no debe ver») y docs/interfaz/fabrica/calidad.md («Ventanas»: «Reclamo nuevo»)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SiembraDelCatalogo, siembraDelCatalogo } from "../../../nucleo/pruebas/catalogo-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";
import { renglonDeClienteDePrueba } from "../../../nucleo/pruebas/ventas-de-prueba.ts";
import { revisadoConReproceso } from "./de-prueba.ts";

/** Una opción. */
interface Opcion {
	id: string;
	nombre: string;
}

/** Lo que regresa la consulta. */
interface Opciones {
	clientes: Opcion[];
	prenda: { variante_id: string; titulo: string } | null;
	lotes: Opcion[];
	notas: Opcion[];
	defectos: Opcion[];
	operaciones: (Opcion & { persona_id: string | null })[];
	personas: Opcion[];
	min_letras: number;
}

describe("calidad.opciones_reclamo: lo que ofrece «Reclamo nuevo»", () => {
	let servidor: ServidorDePrueba;
	let siembra: SiembraDelCatalogo;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
		siembra = await siembraDelCatalogo(servidor);
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Pide las opciones como Calidad, sin dinero. */
	async function opciones(parametros: Record<string, string>): Promise<Opciones> {
		const respuesta = await pedirConsulta(servidor, "calidad.opciones_reclamo", parametros, "calidad");
		expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
		expect(JSON.stringify(respuesta.cuerpo)).not.toMatch(/centavos|precio|importe|saldo|tarifa|sueldo/);
		return respuesta.cuerpo.resultado as Opciones;
	}

	it("del cliente y el código a la prenda y sus lotes revisados; del defecto a las operaciones con quién la hizo", async () => {
		const lote = await revisadoConReproceso(servidor, siembra);
		const cliente = await renglonDeClienteDePrueba(servidor);
		const { rows } = await servidor.base.dueno.query("SELECT codigo FROM variantes WHERE id = $1", [
			lote.prenda.variantes["4"],
		]);
		const codigo = String(rows[0]?.codigo);
		const leido = await opciones({
			cliente_texto: cliente.nombre.slice(0, 12),
			codigo,
			defecto_id: lote.defectoId,
			lote_id: lote.loteId,
		});
		expect(leido.clientes).toContainEqual({ id: cliente.clienteId, nombre: cliente.nombre });
		expect(leido.prenda).toEqual({
			variante_id: lote.prenda.variantes["4"],
			titulo: `${lote.prenda.nombre} · talla 4`,
		});
		expect(leido.lotes).toHaveLength(1);
		expect(leido.lotes[0]?.id).toBe(lote.loteId);
		expect(leido.lotes[0]?.nombre).toMatch(new RegExp(`^${lote.folio} · cortado el \\d+ \\w+$`));
		expect(leido.defectos).toContainEqual({ id: lote.defectoId, nombre: lote.defecto });
		expect(leido.operaciones).toEqual([
			{
				id: lote.prenda.flujo.operaciones[1]?.flujoOperacionId,
				nombre: lote.prenda.flujo.operaciones[1]?.nombre,
				persona_id: lote.personaId,
			},
		]);
		expect(leido.personas.some((persona) => persona.id === lote.personaId)).toBe(true);
		expect(leido.notas).toEqual([]);
		expect(leido.min_letras).toBe(10);
	});

	it("un código que no es de ninguna prenda no trae prenda ni lotes", async () => {
		const leido = await opciones({ codigo: "000000" });
		expect(leido).toMatchObject({ prenda: null, lotes: [], operaciones: [] });
	});

	it("solo Calidad la pide", async () => {
		expect((await pedirConsulta(servidor, "calidad.opciones_reclamo", {}, "ventas")).estado).toBe(403);
	});
});
