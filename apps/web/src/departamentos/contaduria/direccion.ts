/**
 * La dirección de las pantallas de Contaduría: los filtros de cada pestaña, el cajón abierto (`?cajon=cliente&id=…`) y
 * la ventana «Capturar nota o factura» que abre Compras con su orden
 * (`/contaduria/cuentas-por-pagar?ventana=capturar_factura&orden_compra_id=…`). Así un enlace abre la pantalla tal como
 * estaba y otro departamento abre un cajón o la ventana sin importar su componente.
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento», regla 2) y .claude/rules/react.md (regla 5)
 */

import { gruposDePendientesDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-pendientes";
import { rolesDeTercero } from "@uniformame/compartido/contratos/contaduria/consultas-terceros";
import { useCallback } from "react";
import { z } from "zod";
import { useBusquedaDeDepartamento } from "../../comun/direccion.ts";
import { rutaDePestana } from "../../comun/pagina-de-departamento.tsx";

/** Las pestañas de Contaduría; su clave es su ruta. */
export const pestanasDeContaduria = [
	{ clave: "pendientes", texto: "Pendientes" },
	{ clave: "cuentas-por-cobrar", texto: "Cuentas por cobrar" },
	{ clave: "cuentas-por-pagar", texto: "Cuentas por pagar" },
	{ clave: "terceros", texto: "Terceros" },
	{ clave: "gastos", texto: "Gastos" },
	{ clave: "nomina", texto: "Nómina" },
	{ clave: "contador-externo", texto: "Contador externo" },
] as const;

/** Una pestaña de Contaduría. */
export type PestanaDeContaduria = (typeof pestanasDeContaduria)[number]["clave"];

/** Los cajones de Contaduría que se abren por la dirección. */
export const cajonesDeContaduria = ["cliente", "registrar_pago", "tercero"] as const;

/** Un cajón de Contaduría. */
export type CajonDeContaduria = (typeof cajonesDeContaduria)[number];

/** La búsqueda de todas las pantallas de Contaduría. */
export const busquedaDeContaduria = z.object({
	grupo: z
		.enum(["todos", ...gruposDePendientesDeContaduria])
		.optional()
		.catch(undefined),
	cancelados: z.enum(["si"]).optional().catch(undefined),
	buscar: z.string().optional().catch(undefined),
	rol: z.enum(rolesDeTercero).optional().catch(undefined),
	mes: z.iso.date().optional().catch(undefined),
	semana: z.uuid().optional().catch(undefined),
	cajon: z.enum(cajonesDeContaduria).optional().catch(undefined),
	/** El documento del cajón: el cliente o el tercero; en Registrar pago, su cliente. */
	id: z.uuid().optional().catch(undefined),
	ventana: z.enum(["capturar_factura"]).optional().catch(undefined),
	/** La orden con que se abre «Capturar nota o factura». */
	orden_compra_id: z.uuid().optional().catch(undefined),
});

/** La búsqueda de las pantallas de Contaduría. */
export type BusquedaDeContaduria = z.infer<typeof busquedaDeContaduria>;

/**
 * La ruta de una pestaña de Contaduría.
 * @param pestana La pestaña.
 */
export function rutaDeContaduria(pestana: PestanaDeContaduria): string {
	return rutaDePestana("contaduria", pestana);
}

/**
 * Lee la búsqueda de Contaduría de la dirección y da cómo cambiarla: los cambios se juntan con lo que ya hay (en la
 * misma pestaña), y lo que se pone sin valor se quita.
 * Lo común está en `useBusquedaDeDepartamento`; aquí van sus cajones.
 * @returns La búsqueda, `navegar(cambios, pestana?)`, `abrir(cajon, id?)` y `cerrar()`.
 */
export function useDireccionDeContaduria() {
	const { busqueda, navegar } = useBusquedaDeDepartamento(busquedaDeContaduria, rutaDeContaduria);
	/** Abre un cajón, sin tocar la pestaña ni sus filtros. */
	const abrir = useCallback((cajon: CajonDeContaduria, id?: string) => navegar({ cajon, id }), [navegar]);
	/** Cierra el cajón abierto. */
	const cerrar = useCallback(() => navegar({ cajon: undefined, id: undefined }), [navegar]);
	return { busqueda, navegar, abrir, cerrar };
}
