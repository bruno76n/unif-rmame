/**
 * Prueba de las consultas del armazón de la web: el menú con solo los departamentos de la cuenta (sin la Puerta del
 * taller) y sus pastillas, la cuenta y su puesto; «Mis sesiones»; la campana por páginas; y el historial de un
 * documento solo para quien lee su tabla, sin montos para Aduana y Bodega y con los sueldos tapados.
 * Fase 19 · docs/fases/19-web-principal.md (criterios «El menú solo muestra los departamentos de la cuenta, cada
 * pastilla cuenta lo que dice su archivo…» y «Cada consulta revisa el departamento y el permiso fino en el servidor y
 * no manda lo que la cuenta no debe ver»)
 */

import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { quienesDePrueba } from "../../../nucleo/pruebas/cuentas-de-prueba.ts";
import { pedirConsulta } from "../../../nucleo/pruebas/llamadas.ts";
import { crearServidorDePrueba, type ServidorDePrueba } from "../../../nucleo/pruebas/servidor-de-prueba.ts";

/** El id de cuenta de una cuenta de prueba. */
function usuarioDe(nombre: string): string {
	const quien = quienesDePrueba[nombre];
	if (quien?.tipo !== "cuenta") throw new Error(`no hay cuenta de prueba ${nombre}`);
	return quien.usuarioId;
}

describe("El armazón: el menú de la cuenta, sus sesiones, su campana y el historial de un documento", () => {
	let servidor: ServidorDePrueba;
	beforeAll(async () => {
		servidor = await crearServidorDePrueba();
	});
	afterAll(async () => {
		await servidor.cerrar();
	});

	/** Una consulta con el rol dueño. */
	async function consultar(texto: string, valores: unknown[] = []) {
		return (await servidor.base.dueno.query(texto, valores)).rows;
	}

	it("el menú solo trae los departamentos de la cuenta, sin la Puerta del taller, con su pastilla y su puesto", async () => {
		const bodega = await pedirConsulta(servidor, "admin.armazon", {}, "bodega");
		expect(bodega.estado, JSON.stringify(bodega.cuerpo)).toBe(200);
		const resultado = bodega.cuerpo.resultado as {
			cuenta: { puesto: string; iniciales: string; es_duena: boolean };
			departamentos: { clave: string; conteo: number | null; rojo: boolean; grupo: string | null }[];
			version_minima_web: string;
		};
		expect(resultado.departamentos.map((departamento) => departamento.clave)).toEqual(["bodega"]);
		expect(resultado.departamentos[0]).toMatchObject({ grupo: "almacen" });
		expect(resultado.cuenta).toMatchObject({ puesto: "Bodega", es_duena: false });
		expect(resultado.cuenta.iniciales).toMatch(/^[A-ZÁÉÍÓÚÑ]{1,2}$/);
		expect(resultado.version_minima_web).toBe("1.0.0");
		// La pastilla de Bodega es la misma que da Inventario.
		const pastillas = await pedirConsulta(servidor, "inventario.pastillas_menu", {}, "bodega");
		const deBodega = (pastillas.cuerpo.resultado as { bodega: { conteo: number; rojo: boolean } }).bodega;
		expect(resultado.departamentos[0]).toMatchObject({
			conteo: deBodega.conteo === 0 ? null : deBodega.conteo,
			rojo: deBodega.rojo,
		});
		// La dueña ve todos, en el orden del menú, menos la Puerta del taller.
		const duena = await pedirConsulta(servidor, "admin.armazon", {}, "duena");
		const deLaDuena = duena.cuerpo.resultado as { cuenta: { puesto: string }; departamentos: { clave: string }[] };
		expect(deLaDuena.cuenta.puesto).toBe("Administradora principal");
		expect(deLaDuena.departamentos.map((departamento) => departamento.clave)).toEqual([
			"direccion",
			"compras",
			"catalogo",
			"patronaje",
			"ventas",
			"linea",
			"produccion",
			"calidad",
			"mantenimiento",
			"aduana",
			"bodega",
			"contaduria",
			"personal",
			"admin",
		]);
		// Un aparato no tiene menú.
		const tablet = await servidor.app.inject({
			method: "GET",
			url: "/v1/consultas/admin.armazon",
			headers: { "x-prueba-quien": "tablet", "x-app-version": "1.0.0" },
		});
		expect(tablet.statusCode).toBe(403);
	});

	it("los avisos sin leer de la campana son solo los suyos, por páginas, el más nuevo arriba", async () => {
		const usuario = usuarioDe("calidad");
		for (const [texto, leido, segundos] of [
			["Primero", false, 1],
			["Segundo", true, 2],
			["Tercero", false, 3],
		] as const) {
			await consultar(
				`INSERT INTO avisos (id, usuario_id, tipo, texto, leido_en, creado_en, por_correo) VALUES ($1, $2, 'alerta_direccion', $3, $4, now() + $5::interval, false)`,
				[uuidv7(), usuario, texto, leido ? new Date().toISOString() : null, `${segundos} seconds`],
			);
		}
		const primera = await pedirConsulta(servidor, "admin.mis_avisos", { limite: "2" }, "calidad");
		const pagina = primera.cuerpo.resultado as {
			renglones: { texto: string; leido: boolean }[];
			cursor: string | null;
			hay_mas: boolean;
			sin_leer: number;
		};
		expect(pagina.renglones.map((aviso) => aviso.texto)).toEqual(["Tercero", "Segundo"]);
		expect(pagina).toMatchObject({ hay_mas: true, sin_leer: 2 });
		const segunda = await pedirConsulta(
			servidor,
			"admin.mis_avisos",
			{ limite: "2", cursor: pagina.cursor ?? "" },
			"calidad",
		);
		expect(
			(segunda.cuerpo.resultado as { renglones: { texto: string }[] }).renglones.map((aviso) => aviso.texto),
		).toEqual(["Primero"]);
		const sinLeer = await pedirConsulta(servidor, "admin.mis_avisos", { solo_sin_leer: "si" }, "calidad");
		expect(
			(sinLeer.cuerpo.resultado as { renglones: { leido: boolean }[] }).renglones.every((aviso) => !aviso.leido),
		).toBe(true);
		const armazon = await pedirConsulta(servidor, "admin.armazon", {}, "calidad");
		expect(armazon.cuerpo.resultado).toMatchObject({ avisos_sin_leer: 2 });
		// Otra cuenta no los ve.
		const otra = await pedirConsulta(servidor, "admin.mis_avisos", {}, "mantenimiento");
		expect((otra.cuerpo.resultado as { renglones: unknown[] }).renglones).toEqual([]);
	});

	it("«Mis sesiones» trae las sesiones abiertas de la cuenta y dice cuál es esta", async () => {
		const usuario = usuarioDe("compras");
		await consultar(
			`INSERT INTO sesiones (id, usuario_id, token_hash, ultima_actividad_en, vence_en, aparato, ciudad_aproximada)
			 VALUES ($1, $2, 'otra-sesion-de-compras', now(), now() + interval '1 day', 'Chrome en Android', 'Zamora')`,
			[uuidv7(), usuario],
		);
		await consultar(
			`INSERT INTO sesiones (id, usuario_id, token_hash, ultima_actividad_en, vence_en, cerrada_en, motivo_cierre)
			 VALUES ($1, $2, 'cerrada-de-compras', now(), now() + interval '1 day', now(), 'salio')`,
			[uuidv7(), usuario],
		);
		const respuesta = await pedirConsulta(servidor, "admin.mis_sesiones", {}, "compras");
		const sesiones = (respuesta.cuerpo.resultado as { sesiones: { es_esta: boolean; ciudad: string | null }[] })
			.sesiones;
		expect(sesiones).toHaveLength(2);
		expect(sesiones.filter((sesion) => sesion.es_esta)).toHaveLength(1);
		expect(sesiones.map((sesion) => sesion.ciudad)).toContain("Zamora");
	});

	it("el historial de un documento: solo quien lee su tabla; sin montos para Bodega; los sueldos tapados", async () => {
		const traspaso = uuidv7();
		const escribir = (descripcion: string, despues: Record<string, unknown>, recortada: string | null = null) =>
			consultar(
				`INSERT INTO bitacora (id, tipo, modulo, origen, accion, descripcion, descripcion_recortada, sensible_sueldos,
					entidad, entidad_id, despues, usuario_id)
				 VALUES ($1, 'cambio', 'inventario', 'fabrica', 'inventario.prueba', $2, $3, $4, 'traspasos', $5, $6, $7)`,
				[uuidv7(), descripcion, recortada, recortada !== null, traspaso, JSON.stringify(despues), usuarioDe("bodega")],
			);
		await escribir("Surtió T-0001", { piezas: 3, costo_centavos: 12_000 });
		await escribir("Pagó a Ana $500", { pago_dia_centavos: 50_000 }, "Pagó a Ana ••••");
		const deBodega = await pedirConsulta(
			servidor,
			"admin.historial_entidad",
			{ entidad: "traspasos", entidad_id: traspaso },
			"bodega",
		);
		expect(deBodega.estado, JSON.stringify(deBodega.cuerpo)).toBe(200);
		const renglones = (deBodega.cuerpo.resultado as { renglones: { descripcion: string; despues: unknown }[] })
			.renglones;
		expect(renglones.map((renglon) => renglon.descripcion)).toEqual(["Pagó a Ana ••••", "Surtió T-0001"]);
		expect(renglones[1]?.despues).toEqual({ piezas: 3 });
		expect(renglones[0]?.despues).toEqual({});
		// La dueña lo ve todo.
		const deLaDuena = await pedirConsulta(
			servidor,
			"admin.historial_entidad",
			{ entidad: "traspasos", entidad_id: traspaso },
			"duena",
		);
		const suyos = (deLaDuena.cuerpo.resultado as { renglones: { descripcion: string; despues: unknown }[] }).renglones;
		expect(suyos[0]?.descripcion).toBe("Pagó a Ana $500");
		expect(suyos[1]?.despues).toEqual({ piezas: 3, costo_centavos: 12_000 });
		// Quien no lee traspasos no lo ve; una tabla que no existe, tampoco.
		expect(
			(
				await pedirConsulta(
					servidor,
					"admin.historial_entidad",
					{ entidad: "traspasos", entidad_id: traspaso },
					"ventas",
				)
			).estado,
		).toBe(403);
		expect(
			(
				await pedirConsulta(
					servidor,
					"admin.historial_entidad",
					{ entidad: "no_existe", entidad_id: traspaso },
					"duena",
				)
			).estado,
		).toBe(404);
	});
});
