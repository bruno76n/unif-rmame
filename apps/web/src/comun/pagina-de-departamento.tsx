/**
 * La página de un departamento conectada a la web: su título y su conteo de Pendientes salen de `admin.armazon`, y
 * cada pestaña es una ruta (`/bodega` es Pendientes, `/bodega/existencias` otra), así un enlace abre la pantalla tal
 * como estaba.
 * Fase 19 · docs/interfaz/comunes.md («La página de un departamento») y .claude/rules/react.md (regla 5)
 *
 * Uso, en la ruta de cada pestaña: `<PaginaDeDepartamento departamento="bodega" pestanas={pestanasDeBodega}
 * activa="existencias">…</PaginaDeDepartamento>`.
 */

import { useRouter } from "@tanstack/react-router";
import { armazon } from "@uniformame/compartido/contratos/admin/armazon";
import { PaginaDepartamento, type Pestana } from "@uniformame/interfaz/pagina/pagina-departamento";
import type { ReactNode } from "react";
import { useConsulta } from "./api.tsx";

/** Lo que recibe la página de un departamento. */
export interface PropsDePaginaDeDepartamento {
	/** La clave del departamento (su carpeta y su ruta). */
	departamento: string;
	/** Sus pestañas; la primera es «pendientes». Su clave es la ruta de la pestaña. */
	pestanas: readonly Pestana[];
	activa: string;
	children?: ReactNode;
}

/**
 * La ruta de una pestaña: Pendientes es la del departamento.
 * @param departamento La clave del departamento.
 * @param pestana La clave de la pestaña.
 */
export function rutaDePestana(departamento: string, pestana: string): string {
	return pestana === "pendientes" ? `/${departamento}` : `/${departamento}/${pestana}`;
}

/**
 * La página de un departamento, con su título y sus pestañas en la dirección.
 * @param props El departamento, sus pestañas, la activa y el contenido.
 */
export function PaginaDeDepartamento({ departamento, pestanas, activa, children }: PropsDePaginaDeDepartamento) {
	const router = useRouter();
	const delArmazon = useConsulta(armazon, {});
	const suyo = delArmazon.data?.departamentos.find((uno) => uno.clave === departamento);
	// Pendientes lleva el conteo de su pastilla si su pantalla no da otro.
	const conConteo = pestanas.map((pestana) =>
		pestana.clave === "pendientes" && pestana.conteo === undefined && suyo?.conteo != null
			? { ...pestana, conteo: suyo.conteo, rojo: suyo.rojo }
			: pestana,
	);
	return (
		<PaginaDepartamento
			titulo={suyo?.nombre ?? ""}
			pestanas={conConteo}
			activa={activa}
			alEscoger={(pestana) => router.history.push(rutaDePestana(departamento, pestana))}
		>
			{children}
		</PaginaDepartamento>
	);
}
