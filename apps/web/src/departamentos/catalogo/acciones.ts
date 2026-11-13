/**
 * Cómo llaman las pantallas de Catálogo a sus acciones: con `useAccion` de lo común (la clave, el aviso de abajo y
 * «Confirmar con Google»), volviendo a leer las consultas de Catálogo y la pastilla del menú, y leyendo la falla como la
 * necesita la ventana o el cajón (el error junto al campo o el choque de versión).
 * Fase 19 · docs/interfaz/fabrica/catalogo.md y docs/interfaz/comunes.md («El aviso de abajo», «Los estados»)
 */

import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import { type FallaDeAccion, leerFalla, useAccion } from "../../comun/api.tsx";

/** Las consultas que cambian con cualquier acción de Catálogo, y el armazón por la pastilla. */
export const consultasDeCatalogo = [
	"admin.armazon",
	"catalogo.pendientes",
	"catalogo.productos",
	"catalogo.listas_precios",
	"catalogo.etiquetas",
	"catalogo.escuelas_y_tallas",
	"catalogo.bitacora",
	"catalogo.ficha_producto",
	"catalogo.alta_producto",
	"catalogo.cambio_en_bloque_previo",
] as const;

/**
 * Una acción de Catálogo.
 * @param contrato Su contrato.
 */
export function useAccionDeCatalogo<Contrato extends ContratoDeAccion>(contrato: Contrato) {
	return useAccion(contrato, consultasDeCatalogo);
}

/** Lo que sale de mandar una acción: su resultado o su falla. */
export type Salida<Resultado> = { bien: true; resultado: Resultado } | { bien: false; falla: FallaDeAccion };

/**
 * Espera una acción y regresa su resultado o su falla, sin lanzar: el aviso ámbar ya lo puso `useAccion`.
 * @param promesa La acción mandada (`mutateAsync`).
 */
export async function esperar<Resultado>(promesa: Promise<Resultado>): Promise<Salida<Resultado>> {
	try {
		return { bien: true, resultado: await promesa };
	} catch (error) {
		return { bien: false, falla: leerFalla(error) };
	}
}

/**
 * El error de un campo, si la falla lo trae.
 * @param salida Lo que salió.
 * @param campo El campo.
 */
export function errorDeCampo(salida: Salida<unknown> | undefined, campo: string): string | undefined {
	return salida !== undefined && !salida.bien && salida.falla.tipo === "regla" ? salida.falla.campos[campo] : undefined;
}
