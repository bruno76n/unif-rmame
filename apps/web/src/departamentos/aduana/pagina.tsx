/**
 * La página de Aduana que comparten sus ocho pestañas: el título con las pestañas (Andén primero; Recepción, En camino
 * a aduana, Inventario en aduana —en rojo—, En tránsito y Empaque en línea con su pastilla), la acción principal
 * «Recibir» en la barra (abre Recepción) y el cajón que diga la dirección.
 * Fase 19 · docs/interfaz/fabrica/aduana.md («Quién entra») y docs/interfaz/comunes.md («La página de un departamento»)
 */

import { andenDeAduana } from "@uniformame/compartido/contratos/inventario/aduana";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { PackageCheck } from "lucide-react";
import type { ReactNode } from "react";
import { AccionPrincipal } from "../../comun/accion-principal.tsx";
import { useConsulta } from "../../comun/api.tsx";
import { PaginaDeDepartamento } from "../../comun/pagina-de-departamento.tsx";
import { CajonesDeAduana } from "./cajones/cajones.tsx";
import { type PestanaDeAduana, useDireccionDeAduana } from "./direccion.ts";

/** Las pestañas de Aduana; su clave es su ruta. */
export const pestanasDeAduana = [
	{ clave: "pendientes", texto: "Andén" },
	{ clave: "recepcion", texto: "Recepción" },
	{ clave: "en-camino", texto: "En camino a aduana" },
	{ clave: "despacho", texto: "Despacho" },
	{ clave: "inventario", texto: "Inventario en aduana" },
	{ clave: "transito", texto: "En tránsito" },
	{ clave: "empaque", texto: "Empaque en línea" },
	{ clave: "historial", texto: "Historial" },
] as const satisfies readonly { clave: PestanaDeAduana; texto: string }[];

/**
 * La página de Aduana con una pestaña activa.
 * @param props La pestaña activa y su contenido.
 */
export function PaginaDeAduana({ activa, children }: { activa: PestanaDeAduana; children: ReactNode }) {
	const { navegar } = useDireccionDeAduana();
	const conteos = useConsulta(andenDeAduana, {}).data?.pestanas;
	// La pastilla de cada pestaña, de `inventario.anden`; el Andén lleva la del menú.
	const pastillas: Partial<Record<PestanaDeAduana, { conteo: number; rojo: boolean }>> =
		conteos === undefined
			? {}
			: {
					recepcion: { conteo: conteos.recepcion, rojo: false },
					"en-camino": { conteo: conteos.en_camino, rojo: false },
					inventario: { conteo: conteos.parados, rojo: true },
					transito: { conteo: conteos.en_transito, rojo: false },
					empaque: { conteo: conteos.empaque, rojo: false },
				};
	const pestanas = pestanasDeAduana.map((pestana) => {
		const pastilla = pastillas[pestana.clave];
		return pastilla === undefined || pastilla.conteo === 0 ? pestana : { ...pestana, ...pastilla };
	});
	return (
		<PaginaDeDepartamento departamento="aduana" pestanas={pestanas} activa={activa}>
			<AccionPrincipal>
				<Boton variante="principal" icono={PackageCheck} onClick={() => navegar({}, "recepcion")}>
					Recibir
				</Boton>
			</AccionPrincipal>
			{children}
			<CajonesDeAduana />
		</PaginaDeDepartamento>
	);
}
