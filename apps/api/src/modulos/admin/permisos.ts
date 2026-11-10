/**
 * Qué departamentos leen cada tabla de `admin`, para los avisos en vivo.
 * Fase 4 · docs/cimientos/EVENTOS-Y-TRABAJOS.md («Recorte») y docs/modulos/admin/permisos.md
 *
 * La dueña recibe todas. Las tablas técnicas (`eventos`, `comandos_recibidos`) no avisan a nadie.
 */

import { todosLosDepartamentos } from "../../nucleo/acceso/departamentos.ts";

/** Los departamentos que usan alguna lista: gastos y cuentas, unidades de material, motivos de ajuste, áreas. */
const leenListas = ["admin", "compras", "contaduria", "aduana", "bodega", "mantenimiento"];

/** Por tabla, los departamentos que la leen. Los parámetros cambian lo que muestra cualquier pantalla. */
export const lectoresDeAdmin: Record<string, readonly string[]> = {
	parametros: todosLosDepartamentos,
	listas: leenListas,
	lista_valores: leenListas,
	empresa: ["admin"],
};
