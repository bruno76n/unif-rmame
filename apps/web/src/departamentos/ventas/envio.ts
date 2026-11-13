/**
 * Cómo mandan sus acciones los cajones y las ventanas de Ventas: la acción por su contrato (con su clave, su aviso de
 * abajo y lo que vuelve a leer, de `useAccion`), los errores de cada campo para su formulario y el choque de versión,
 * que vuelve a leer lo nuevo y lo avisa en el cajón sin perder lo capturado.
 * Fase 19 · docs/interfaz/comunes.md («Los estados de una pantalla»: choque de versión) y docs/cimientos/API.md
 */

import { useQueryClient } from "@tanstack/react-query";
import type { ContratoDeAccion } from "@uniformame/compartido/contratos/definir";
import { useState } from "react";
import type { z } from "zod";
import { leerFalla, useAccion, volverALeer } from "../../comun/api.tsx";

/** Todas las consultas de Ventas: una acción de Ventas puede cambiar cualquiera. */
export const consultasDeVentas = [
	"ventas.pendientes",
	"ventas.pedidos",
	"ventas.pedido",
	"ventas.editor_pedido",
	"ventas.revision_mandar",
	"ventas.notas_entrega",
	"ventas.nota_entrega",
	"ventas.armar_nota",
	"ventas.clientes",
	"ventas.cliente",
	"contaduria.estado_pago_notas",
	"produccion.hilo_pedido",
	"admin.historial_entidad",
	"admin.armazon",
] as const;

/**
 * Una acción de Ventas lista para un cajón o una ventana.
 * @param contrato Su contrato.
 * @returns `enviar(peticion, alCampos)` (regresa el resultado o nada si no salió), si va en camino y si chocó.
 */
export function useEnvio<Contrato extends ContratoDeAccion>(contrato: Contrato) {
	const accion = useAccion(contrato, consultasDeVentas);
	const consultas = useQueryClient();
	const [choco, setChoco] = useState(false);
	const enviar = async (
		peticion: { datos: z.input<Contrato["entrada"]>; version?: number },
		alCampos?: (campos: Record<string, string>) => void,
	): Promise<z.output<Contrato["resultado"]> | undefined> => {
		setChoco(false);
		try {
			return await accion.mutateAsync(peticion);
		} catch (error) {
			const falla = leerFalla(error);
			if (falla.tipo === "regla" && Object.keys(falla.campos).length > 0) alCampos?.(falla.campos);
			if (falla.tipo === "choque") {
				setChoco(true);
				await volverALeer(consultas, consultasDeVentas);
			}
			return undefined;
		}
	};
	return { enviar, enviando: accion.isPending, choco };
}
