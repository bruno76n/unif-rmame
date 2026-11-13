/**
 * Lo que comparten las pestañas, los cajones y las ventanas de Aduana: las consultas que cambian con sus acciones (y
 * `useEnvio` con ellas), el color de cada destino y la orilla de su carril, el destino con su punto, lo que abre una tarjeta o un renglón, y el
 * botón y el renglón de lo que está en aduana.
 * Fase 19 · docs/interfaz/fabrica/aduana.md y docs/interfaz/comunes.md («Los estados de una pantalla»: choque de versión)
 */

import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import type { loQueAbre, partidaEnAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { type ColorDeEstado, puntoDelEstado } from "@uniformame/interfaz/estados/colores";
import { useCallback } from "react";
import type { z } from "zod";
import { useEnvio as useEnvioComun } from "../../comun/envio.ts";
import { useDireccionDeAduana } from "./direccion.ts";

/** Todas las consultas que cambian con una acción de Aduana. */
export const consultasDeAduana = [
	"inventario.anden",
	"inventario.aduana_recepcion",
	"inventario.en_camino_aduana",
	"inventario.aduana_despacho",
	"inventario.inventario_en_aduana",
	"inventario.en_transito",
	"inventario.aduana_historial",
	"inventario.detalle_recibir_taller",
	"inventario.detalle_recibir_material",
	"inventario.detalle_recibir_en_camino",
	"inventario.detalle_despachar",
	"inventario.pastillas_menu",
	"linea.pedidos",
	"admin.armazon",
] as const;

/**
 * Una acción de Aduana lista para un botón, un cajón o una ventana.
 * @param contrato Su contrato.
 * @returns Lo de `useEnvio` de lo común.
 */
export function useEnvio<Contrato extends ContratoDeAccion>(contrato: Contrato) {
	return useEnvioComun(contrato, consultasDeAduana);
}

/** El color de cada destino, como en la muestra: el punto de «Va a» y la orilla de su carril. */
const coloresDeDestino: Readonly<Record<string, ColorDeEstado>> = {
	T1: "azul",
	T2: "morado",
	linea: "verde-azulado",
	externos: "naranja",
	calidad: "rojo",
	BOD: "gris",
};

/**
 * El color de un destino; uno que no tiene el suyo, en gris.
 * @param carril El destino.
 */
export function colorDeDestino(carril: string): ColorDeEstado {
	return coloresDeDestino[carril] ?? "gris";
}

/** La orilla de arriba de un carril, del color de su destino (clases completas, para que Tailwind las vea). */
const orillaDelColor: Readonly<Record<ColorDeEstado, string>> = {
	rojo: "border-t-estado-rojo",
	ambar: "border-t-estado-ambar",
	azul: "border-t-estado-azul",
	verde: "border-t-estado-verde",
	gris: "border-t-estado-gris",
	morado: "border-t-estado-morado",
	"verde-azulado": "border-t-estado-verde-azulado",
	naranja: "border-t-estado-naranja",
};

/**
 * La clase de la orilla de un carril del andén: «Entra» en tinta, como en la muestra; los demás, del color de su
 * destino.
 * @param carril `entra` o el destino.
 */
export function orillaDelCarril(carril: string): string {
	return carril === "entra" ? "border-t-tinta" : orillaDelColor[colorDeDestino(carril)];
}

/**
 * Un destino con su punto de color: «● Tienda 1».
 * @param props El destino y su nombre.
 */
export function DestinoConPunto({ carril, nombre }: { carril: string; nombre: string }) {
	return (
		<span className="inline-flex items-center gap-2">
			<span aria-hidden className={`size-2.5 shrink-0 rounded-full ${puntoDelEstado[colorDeDestino(carril)]}`} />
			{nombre}
		</span>
	);
}

/** Lo que abre una tarjeta o un renglón. */
export type LoQueAbre = z.infer<typeof loQueAbre>;

/**
 * Cómo abrir lo que dice una tarjeta o un renglón: su cajón por la dirección, o la pestaña Empaque en línea.
 * @returns La función que lo abre.
 */
export function useAbrir() {
	const { navegar } = useDireccionDeAduana();
	return useCallback(
		(abre: LoQueAbre) => (abre.a === "empaque" ? navegar({}, "empaque") : navegar({ cajon: abre.a, id: abre.id })),
		[navegar],
	);
}

/** Lo que está en aduana. */
export type PartidaEnAduana = z.infer<typeof partidaEnAduana>;

/** El texto del botón de lo que está en aduana. */
export const textosDelBoton: Readonly<Record<PartidaEnAduana["boton"], string>> = {
	despachar: "Despachar",
	sin_nota: "Sin nota",
	ver_pedido: "Ver pedido",
	ver: "Ver",
	devolver: "Devolver al proveedor",
};
