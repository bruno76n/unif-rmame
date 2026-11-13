/**
 * Las direcciones de lo que Tienda en línea abre en otro departamento: los botones con cifra del cajón y «Ver en aduana»
 * solo llevan ahí si la cuenta tiene ese departamento (`useTieneDepartamento`, de lo común).
 * Fase 19 · docs/interfaz/fabrica/tienda-en-linea.md («Quién entra») y docs/interfaz/comunes.md («El cajón», regla 2)
 */

/** Las direcciones de lo que Tienda en línea abre en otro departamento. */
export const enOtroDepartamento = {
	/** Empaque en línea, en Aduana: donde el W- espera para empacar. */
	aduana: "/aduana/empaque",
	/** Pendientes de Bodega, donde surte los W-. */
	bodega: "/bodega",
};
