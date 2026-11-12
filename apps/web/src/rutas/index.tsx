/**
 * La entrada a `/`: lleva a la primera pestaña del primer departamento de la cuenta.
 * Fase 19 · docs/modulos/admin/acceso-con-google.md («Regresa»)
 */

import { createFileRoute, useRouter } from "@tanstack/react-router";
import { armazon } from "@uniformame/compartido/contratos/admin/armazon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useEffect } from "react";
import { useConsulta } from "../comun/api.tsx";

/** Lleva al primer departamento. */
function AlPrimerDepartamento() {
	const router = useRouter();
	const datos = useConsulta(armazon, {});
	const primero = datos.data?.departamentos[0]?.clave;
	useEffect(() => {
		if (primero !== undefined) router.history.replace(`/${primero}`);
	}, [primero, router]);
	return <EstadoDePantalla tipo="cargando" />;
}

export const Route = createFileRoute("/")({ component: AlPrimerDepartamento });
