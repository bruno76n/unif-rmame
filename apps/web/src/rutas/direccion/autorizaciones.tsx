/**
 * Autorizaciones de Dirección (`/direccion/autorizaciones`): lee `direccion.autorizaciones` con el filtro de la
 * dirección (`?tipo=nota_credito`) y decide con `direccion.decidir_autorizacion` desde Dirección. «Autorizar» manda la
 * decisión tal cual (el cliente pide «Confirmar con Google» si hace falta y la repite con su misma clave); «Rechazar»
 * abre la ventana del motivo.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Autorizaciones», ventana «Rechazar») y .claude/rules/react.md
 *
 * Un filtro que se quedó sin tarjetas regresa a «Todas». Si la autorización cambió mientras se veía, se dice y se
 * vuelve a leer.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	autorizaciones,
	decidirAutorizacion,
	tiposDeAutorizacion,
} from "@uniformame/compartido/contratos/direccion/autorizaciones";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useEffect, useState } from "react";
import { z } from "zod";
import { leerFalla, useAccion, useConsulta } from "../../comun/api.tsx";
import { useConConexion } from "../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../comun/segun-consulta.tsx";
import { PaginaDeDireccion } from "../../departamentos/direccion/pagina-de-direccion.tsx";
import { PestanaAutorizaciones, type PorAutorizar } from "../../departamentos/direccion/pestanas/autorizaciones.tsx";
import { VentanaRechazar } from "../../departamentos/direccion/ventanas/rechazar.tsx";

/** El filtro de las tarjetas en la dirección; sin él, «Todas». */
const busqueda = z.object({ tipo: z.enum(tiposDeAutorizacion).optional() });

/** Las consultas que cambian al decidir: esta, Pendientes y la pastilla del menú. */
const cambianAlDecidir = ["direccion.autorizaciones", "direccion.pendientes", "admin.armazon"] as const;

/** La ruta de Autorizaciones. */
function Autorizaciones() {
	const { tipo } = Route.useSearch();
	const navegar = useNavigate({ from: "/direccion/autorizaciones" });
	const leida = useConsulta(autorizaciones, tipo === undefined ? {} : { tipo });
	const decidir = useAccion(decidirAutorizacion, cambianAlDecidir);
	const conConexion = useConConexion();
	const [aRechazar, setARechazar] = useState<PorAutorizar | null>(null);
	const [choque, setChoque] = useState<string | null>(null);
	const [errorDelMotivo, setErrorDelMotivo] = useState<string | undefined>(undefined);
	// Un filtro que se quedó sin tarjetas regresa a «Todas».
	const filtros = leida.data?.filtros;
	useEffect(() => {
		if (tipo !== undefined && filtros !== undefined && !filtros.some((filtro) => filtro.tipo === tipo)) {
			void navegar({ search: {}, replace: true });
		}
	}, [tipo, filtros, navegar]);

	/**
	 * Manda la decisión desde Dirección; si chocó la versión, lo dice y vuelve a leer.
	 * @param autorizacion La autorización.
	 * @param decision Autorizar o rechazar, con su motivo.
	 */
	function mandar(
		autorizacion: PorAutorizar,
		decision: { decision: "autorizar" } | { decision: "rechazar"; motivo: string },
	) {
		setChoque(null);
		setErrorDelMotivo(undefined);
		decidir.mutate(
			{ datos: { autorizacion_id: autorizacion.id, desde: "direccion", ...decision }, version: autorizacion.version },
			{
				onSuccess: () => setARechazar(null),
				onError: (error) => {
					const falla = leerFalla(error);
					if (falla.tipo === "choque") {
						setARechazar(null);
						setChoque(autorizacion.folio);
						void leida.refetch();
					}
					if (falla.tipo === "regla" && falla.campos.motivo !== undefined) setErrorDelMotivo(falla.campos.motivo);
				},
			},
		);
	}

	const puede = conConexion && !decidir.isPending;
	return (
		<PaginaDeDireccion activa="autorizaciones">
			{choque === null ? null : <EstadoDePantalla tipo="choque" documento={choque} />}
			<SegunConsulta consulta={leida}>
				{(datos) => (
					<PestanaAutorizaciones
						datos={datos}
						filtro={tipo ?? "todas"}
						alEscogerFiltro={(filtro) =>
							navegar({ search: { tipo: busqueda.shape.tipo.catch(undefined).parse(filtro) } })
						}
						puede={puede}
						alAutorizar={(autorizacion) => mandar(autorizacion, { decision: "autorizar" })}
						alRechazar={setARechazar}
					/>
				)}
			</SegunConsulta>
			<VentanaRechazar
				resumen={aRechazar?.resumen ?? null}
				puede={puede}
				errorDeLaApi={errorDelMotivo}
				alCerrar={() => setARechazar(null)}
				alRechazar={(motivo) => {
					if (aRechazar !== null) mandar(aRechazar, { decision: "rechazar", motivo });
				}}
			/>
		</PaginaDeDireccion>
	);
}

export const Route = createFileRoute("/direccion/autorizaciones")({
	validateSearch: busqueda,
	component: Autorizaciones,
});
