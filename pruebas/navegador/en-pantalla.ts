/**
 * Lo que se espera ver en una pantalla de prueba: el `expect` de Playwright con 15 segundos de espera. Las pruebas de
 * pantalla corren con Vitest, fuera del corredor de Playwright, y su espera de 5 segundos no alcanza cuando la
 * revisión completa corre todas las pruebas a la vez: una acción con su transacción y su aviso tarda más en una
 * máquina ocupada. Lo que se espera es lo mismo; solo cambia cuánto se espera a que aparezca.
 * Fase 19 · docs/cimientos/PRUEBAS.md («Los niveles»: pantallas)
 */

import { expect } from "@playwright/test";

/** `enPantalla(localizador).toHaveText(…)`: espera hasta 15 segundos a que la pantalla lo muestre. */
export const enPantalla = expect.configure({ timeout: 15_000 });
