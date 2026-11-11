/**
 * El módulo `inventario`: las ubicaciones, el libro de movimientos y las existencias.
 * Fase 4 · docs/modulos/inventario/libro-de-movimientos.md («La tabla `ubicaciones`»)
 * Fase 9 · docs/modulos/inventario/libro-de-movimientos.md y existencias-y-cuadre.md
 *
 * Las ubicaciones nacen en la fase 4 porque las usan antes los parámetros, las impresoras, las cuentas,
 * los aparatos y las personas; sus responsables nacen vacíos. El libro no tiene acciones propias: lo escribe
 * `escribirMovimiento` (`dominio/`), que usan las internas y las acciones de cada caso.
 */

import { v7 as uuidv7 } from "uuid";
import { todosLosDepartamentos } from "../../nucleo/acceso/departamentos.ts";
import { definirModulo } from "../../nucleo/modulos.ts";
import { existenciaMaterial, piezasDeVariante } from "./lecturas/existencias.ts";
import { semillaDeParametrosDeInventario } from "./parametros.ts";
import { ubicaciones } from "./tablas.ts";

/** Los departamentos que leen el libro y el material. */
const lectoresDelLibro = ["aduana", "bodega", "direccion"];

/** Las ubicaciones de la siembra, en su orden. */
const ubicacionesDeLaSiembra = [
	{ orden: 1, codigo: "ADU", nombre: "Aduana", tipo: "aduana", prefijoFolio: null, surteEnLinea: false },
	{ orden: 2, codigo: "BOD", nombre: "Bodega", tipo: "bodega", prefijoFolio: null, surteEnLinea: true },
	{ orden: 3, codigo: "T1", nombre: "Tienda 1", tipo: "tienda", prefijoFolio: "T1", surteEnLinea: true },
	{ orden: 4, codigo: "T2", nombre: "Tienda 2", tipo: "tienda", prefijoFolio: "T2", surteEnLinea: true },
	{ orden: 5, codigo: "TAL", nombre: "Taller", tipo: "taller", prefijoFolio: null, surteEnLinea: false },
	{ orden: 6, codigo: "TRA", nombre: "Tránsito", tipo: "transito", prefijoFolio: null, surteEnLinea: false },
	{
		orden: 7,
		codigo: "ECA",
		nombre: "En camino a aduana",
		tipo: "en_camino_aduana",
		prefijoFolio: null,
		surteEnLinea: false,
	},
];

export default definirModulo({
	nombre: "inventario",
	// Las ubicaciones salen en las pantallas de todos los departamentos.
	lectores: {
		ubicaciones: todosLosDepartamentos,
		// El libro lo leen las consultas de Aduana, Bodega y Dirección; las existencias, además, Catálogo (la ficha)
		// y Tienda en línea (la disponibilidad). Nunca con precios ni costos: no los tienen.
		movimientos: lectoresDelLibro,
		movimiento_lineas: lectoresDelLibro,
		existencias: [...lectoresDelLibro, "catalogo", "linea"],
		existencias_material: lectoresDelLibro,
		// Los traspasos los leen las pantallas de Aduana, Bodega y Tienda en línea, y «¿Dónde está?».
		traspasos: [...lectoresDelLibro, "linea"],
		traspaso_lineas: [...lectoresDelLibro, "linea"],
	},
	lecturas: { existencia_material: existenciaMaterial, piezas_de_variante: piezasDeVariante },
	semillas: [
		{ tabla: ubicaciones, filas: ubicacionesDeLaSiembra.map((ubicacion) => ({ id: uuidv7(), ...ubicacion })) },
		semillaDeParametrosDeInventario,
	],
});
