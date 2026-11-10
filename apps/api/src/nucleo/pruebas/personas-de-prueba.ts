/**
 * Una persona nueva para las pruebas: las cuentas y lo que llega de un aparato apuntan a una persona que existe.
 * Fase 7 · docs/modulos/personal/personas.md
 */

import type pg from "pg";
import { v7 as uuidv7 } from "uuid";

/**
 * Da de alta, directo en la base y con el rol dueño, una persona activa de la oficina (o del área que se diga).
 * @param dueno La conexión con el rol dueño.
 * @param area Su área; en una tienda, Tienda 1 y cajera.
 * @returns Su id.
 */
export async function nuevaPersona(
	dueno: pg.Pool,
	area: "taller" | "oficina" | "aduana_bodega" | "tienda" = "oficina",
): Promise<string> {
	const id = uuidv7();
	await dueno.query(
		`INSERT INTO personas (id, folio, nombre, area, ubicacion_id, rol_tienda, puesto, forma_pago, pago_dia_centavos, fecha_ingreso)
		 SELECT $1, $2, 'Persona de prueba', $3, ${area === "tienda" ? "id" : "NULL"}, $4, 'Prueba', 'tiempo', 50000, '2020-01-06'
		 FROM ubicaciones WHERE codigo = 'T1'`,
		[id, `E-P${id.slice(-8)}`, area, area === "tienda" ? "cajera" : null],
	);
	return id;
}
