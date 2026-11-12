/**
 * El color de cada estado, según la guía de textos: el mismo estado se pinta igual en todas las pantallas.
 * Fase 19 · docs/interfaz/TEXTOS.md («El color de cada estado», «Las etapas de pedidos, notas y lotes»)
 *
 * Los estados con datos («Atrasado 3 días», «Por autorizar · 2 días») se reconocen por su forma. Un estado nuevo entra
 * a la guía y a esta tabla antes de usarse; uno que no está aquí sale en gris, y su prueba lo encuentra.
 */

import { coloresDeEstado } from "@uniformame/compartido/contratos/estados";

export { coloresDeEstado };

/** Un color de estado. */
export type ColorDeEstado = (typeof coloresDeEstado)[number];

/** Los estados fijos, por color (la tabla de la guía, más las etapas). */
const fijos: Readonly<Record<ColorDeEstado, readonly string[]>> = {
	rojo: [
		"Vencido",
		"Vencido hace más de 30 días",
		"Detenido · no cuadra",
		"Parada",
		"En reparación",
		"Por entregar · corte hoy",
		"Sin precio",
		"Sin sincronizar",
		"Corte hoy",
		"Falta la receta",
		"Por revisar hoy",
		"Por resolver",
		"Por surtir · sale hoy",
		"Cancelado",
		"Cancelada",
		"Atrasado",
	],
	ambar: [
		"Vence hoy",
		"Corte mañana",
		"Por decidir",
		"Por aclarar",
		"Por entregar",
		"Reportada",
		"En tránsito",
		"Por aplicar",
		"Por pagar",
		"Por enviar",
		"Sin depósito",
		"Por recibir",
		"Por contar",
		"Por revisar",
		"Por autorizar",
		"Por confirmar entrega",
		"Por mandar a producción",
		"Por imprimir",
		"Por probar",
		"Sin foto",
		"Sin PIN",
		"Esperando autorización",
		"Trabaja con falla",
		"En riesgo de atraso",
		"En producción",
		"En camino",
		"Esperando prendas",
		"En camino a aduana",
		"Recibida con diferencias",
	],
	azul: [
		"Llega esta semana",
		"Esperando aprobación del cliente",
		"Esperando aprobación de Dirección",
		"En reproceso",
		"En tiempo",
		"Confirmado",
		"Por surtir",
	],
	verde: [
		"Cerrada",
		"Listo para entregar",
		"Alcanza",
		"Resuelto",
		"Resuelta",
		"Aprobado",
		"Trabajando",
		"Autorizado por Dirección",
		"Autorizado",
		"Entregado",
		"Entregada",
		"Recibida",
		"Recibida en aduana",
		"Terminado",
		"Revisado",
		"En aduana",
		"Verificada",
	],
	gris: [
		"Asistencia sin cerrar",
		"Borrador",
		"Por cortar",
		"Esperando receta",
		"Esperando pago",
		"Sin datos de la tablet",
		"Rechazado",
	],
	morado: ["Listo en aduana", "Por despachar"],
	"verde-azulado": ["Entrega parcial", "Listo para empacar"],
	naranja: [],
};

/** Los estados con datos, por su forma. */
const conDatos: readonly [RegExp, ColorDeEstado][] = [
	[/^Atrasad[oa] \d+ días?$/, "rojo"],
	[/^Faltará material \d+ días?$/, "rojo"],
	[/^Por autorizar · \d+ días?$/, "rojo"],
	[/^Sin confirmar · \d+ días?$/, "rojo"],
	[/^Atorado en /, "rojo"],
	[/^Vence en \d+ días?$/, "ambar"],
	[/^Corte en \d+ días?$/, "azul"],
	[/^Esperando a /, "gris"],
	[/^\d+ días? en aduana$/, "ambar"],
	[/^Pedir antes del /, "ambar"],
];

/**
 * El color de un estado, como lo dice la guía de textos.
 * @param estado El texto del estado, tal como sale en pantalla («Por surtir · sale hoy»).
 * @returns Su color; gris si la guía no lo tiene.
 */
export function colorDelEstado(estado: string): ColorDeEstado {
	for (const color of coloresDeEstado) {
		if (fijos[color].includes(estado)) return color;
	}
	return conDatos.find(([forma]) => forma.test(estado))?.[1] ?? "gris";
}

/**
 * Si la guía conoce un estado (para la prueba de cada pantalla: ninguno sale gris por no estar en la tabla).
 * @param estado El texto del estado.
 */
export function esEstadoConocido(estado: string): boolean {
	return (
		coloresDeEstado.some((color) => fijos[color].includes(estado)) || conDatos.some(([forma]) => forma.test(estado))
	);
}
