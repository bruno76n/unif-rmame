/**
 * El armazón de la web con lo que da `admin.armazon`: el menú con los departamentos de la cuenta y sus pastillas, las
 * migas, «¿Dónde está?» (solo Aduana, Bodega y Dirección), la campana, la cuenta, la acción principal del departamento
 * y las franjas de sin conexión y de versión vieja. Una dirección de un departamento que la cuenta no tiene lleva a
 * «No tienes acceso a esta pantalla»; sin sesión, a la pantalla de entrada.
 * Fase 19 · docs/interfaz/comunes.md («El armazón», «Los estados de una pantalla»)
 */

import { Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { armazon, gruposDelMenu } from "@uniformame/compartido/contratos/admin/armazon";
import { compararVersiones } from "@uniformame/compartido/contratos/versiones";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Armazon, type GrupoDelMenu } from "@uniformame/interfaz/pagina/armazon";
import { useEffect } from "react";
import { LugarDeLaAccion } from "./accion-principal.tsx";
import { leerFalla, useConsulta } from "./api.tsx";
import { Campana } from "./campana.tsx";
import { Cuenta } from "./cuenta.tsx";
import { DondeEsta } from "./donde-esta.tsx";
import { useConConexion, useVersionVieja, versionDeLaWeb } from "./estado-de-la-app.ts";
import { iconoDe } from "./menu.ts";

/** El nombre de cada grupo del menú. */
const nombreDelGrupo: Readonly<Record<(typeof gruposDelMenu)[number], string>> = {
	operacion: "Operación",
	taller: "Taller",
	almacen: "Almacén",
	administracion: "Administración",
};

/** Los departamentos que tienen «¿Dónde está?». */
const conDondeEsta = ["aduana", "bodega", "direccion"];

/** El armazón de la web. */
export function ArmazonDeLaWeb() {
	const router = useRouter();
	const ruta = useRouterState({ select: (estado) => estado.location.pathname });
	const datos = useConsulta(armazon, {});
	const conConexion = useConConexion();
	const vieja = useVersionVieja();
	const falla = datos.isError ? leerFalla(datos.error) : undefined;
	const sinSesion = falla?.tipo === "regla" && falla.codigo === "sin_sesion";
	// Sin sesión, a la pantalla de entrada, para volver aquí después.
	useEffect(() => {
		if (sinSesion) window.location.assign(`/acceso?${new URLSearchParams({ regresar: ruta }).toString()}`);
	}, [sinSesion, ruta]);
	if (datos.data === undefined) {
		return (
			<div className="grid h-dvh place-items-center bg-fondo px-8">
				{datos.isError ? (
					<EstadoDePantalla tipo="error" alReintentar={() => datos.refetch()} />
				) : (
					<div className="w-full max-w-[720px]">
						<EstadoDePantalla tipo="cargando" />
					</div>
				)}
			</div>
		);
	}
	const { cuenta, departamentos } = datos.data;
	const primeraParte = ruta.split("/")[1] ?? "";
	const activo = departamentos.find((departamento) => departamento.clave === primeraParte);
	// Una dirección de un departamento que la cuenta no tiene: el departamento no aparece y la pantalla lo dice.
	const sinAcceso = primeraParte !== "" && activo === undefined;
	const grupos: GrupoDelMenu[] = [null, ...gruposDelMenu].flatMap((grupo) => {
		const suyos = departamentos.filter((departamento) => departamento.grupo === grupo);
		return suyos.length === 0
			? []
			: [
					{
						nombre: grupo === null ? null : nombreDelGrupo[grupo],
						departamentos: suyos.map((departamento) => ({
							clave: departamento.clave,
							nombre: departamento.nombre,
							icono: iconoDe(departamento.clave),
							conteo: departamento.conteo,
							rojo: departamento.rojo,
							activo: departamento.clave === activo?.clave,
							alTocar: () => router.history.push(`/${departamento.clave}`),
						})),
					},
				];
	});
	const versionVieja = vieja || (compararVersiones(versionDeLaWeb, datos.data.version_minima_web) ?? 0) < 0;
	return (
		<Armazon
			grupos={grupos}
			migas={
				activo === undefined
					? []
					: [activo.grupo === null ? null : nombreDelGrupo[activo.grupo], activo.nombre].filter((miga) => miga !== null)
			}
			cuenta={<Cuenta cuenta={cuenta} />}
			busqueda={
				cuenta.es_duena || departamentos.some((departamento) => conDondeEsta.includes(departamento.clave)) ? (
					<DondeEsta />
				) : undefined
			}
			campana={<Campana sinLeer={datos.data.avisos_sin_leer} />}
			accion={<LugarDeLaAccion />}
			franja={
				versionVieja ? (
					<EstadoDePantalla tipo="version_vieja" alActualizar={() => window.location.reload()} />
				) : conConexion ? undefined : (
					<EstadoDePantalla tipo="sin_conexion" />
				)
			}
		>
			{sinAcceso ? <EstadoDePantalla tipo="sin_permiso" /> : <Outlet />}
		</Armazon>
	);
}
