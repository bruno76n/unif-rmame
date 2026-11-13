/**
 * Lo que las pruebas de pantalla necesitan para tener una autorización por decidir: un ajuste pedido como lo pide
 * Bodega. Lo usan la prueba de Dirección y la de «Confirmar con Google».
 * Fase 19 · docs/cimientos/PRUEBAS.md («Los niveles»: pantallas)
 */

import { expect } from "vitest";
import { mandarAccion } from "../../../../api/src/nucleo/pruebas/llamadas.ts";
import type { PantallaDePrueba } from "./pantalla-de-prueba.ts";

/** Una autorización de prueba: la autorización, su resumen, su folio y el folio de su AJ-. */
export interface AjusteDePrueba {
	id: string;
	resumen: string;
	folio: string;
	ajuste: string;
}

/**
 * Pide un ajuste en Bodega como lo hace Bodega: cuenta una playera con una pieza de más.
 * @param pantalla El arnés, con su API y su base.
 * @param cual Cuál de las playeras con existencia (0, 1…), para que cada ajuste sea de otra variante.
 * @returns La autorización que nació.
 */
export async function pedirAjusteDePrueba(pantalla: PantallaDePrueba, cual: number): Promise<AjusteDePrueba> {
	const consultar = async (texto: string, valores: unknown[] = []) =>
		(await pantalla.servidor.base.dueno.query(texto, valores)).rows;
	const [variante] = await consultar(
		`SELECT v.id, p.seccion_id, e.piezas::int AS piezas, e.ubicacion_id FROM existencias e
		 JOIN ubicaciones u ON u.id = e.ubicacion_id AND u.tipo = 'bodega'
		 JOIN variantes v ON v.id = e.variante_id JOIN productos p ON p.id = v.producto_id
		 JOIN secciones s ON s.id = p.seccion_id AND s.nombre = 'Playeras'
		 WHERE e.piezas > 0 ORDER BY v.id OFFSET $1 LIMIT 1`,
		[cual],
	);
	const [motivo] = await consultar(
		`SELECT lv.id FROM lista_valores lv JOIN listas l ON l.id = lv.lista_id
		 WHERE l.clave = 'motivos_ajuste' ORDER BY lv.orden LIMIT 1`,
	);
	const respuesta = await mandarAccion(
		pantalla.servidor,
		"inventario.guardar_conteo",
		{
			datos: {
				ubicacion_id: variante?.ubicacion_id,
				seccion_id: variante?.seccion_id,
				renglones: [{ variante_id: variante?.id, piezas: Number(variante?.piezas) + 1 }],
				motivo_id: motivo?.id,
			},
		},
		"bodega",
	);
	expect(respuesta.estado, JSON.stringify(respuesta.cuerpo)).toBe(200);
	const ajuste = (respuesta.cuerpo.resultado as { ajuste_id: string }).ajuste_id;
	const [autorizacion] = await consultar(
		`SELECT a.id, a.resumen, a.folio, j.folio AS ajuste FROM autorizaciones a JOIN ajustes j ON j.id = a.ajuste_id
		 WHERE a.ajuste_id = $1`,
		[ajuste],
	);
	return {
		id: String(autorizacion?.id),
		resumen: String(autorizacion?.resumen),
		folio: String(autorizacion?.folio),
		ajuste: String(autorizacion?.ajuste),
	};
}
