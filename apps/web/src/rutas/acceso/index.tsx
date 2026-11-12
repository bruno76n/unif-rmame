/**
 * La pantalla de entrada: la marca, «Entrar con Google» y, abajo, que el taller entra con su PIN en la tablet. Sin
 * acceso, el candado, «Esta cuenta no tiene acceso» y «Usar otra cuenta»; si Google falló, su aviso.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Pantalla de acceso») y docs/modulos/admin/acceso-con-google.md
 */

import { createFileRoute } from "@tanstack/react-router";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Lock } from "lucide-react";
import { z } from "zod";

/** Lo que trae la dirección al volver de Google. */
const busqueda = z.object({
	regresar: z.string().optional(),
	error: z.enum(["sin_acceso", "google_fallo"]).optional(),
});

/** La dirección de la ida a Google para entrar. */
function entrar(regresar: string | undefined): void {
	const parametros = new URLSearchParams(regresar === undefined ? {} : { regresar });
	window.location.assign(`/v1/acceso/google?${parametros.toString()}`);
}

/** La pantalla de entrada. */
function Acceso() {
	const { regresar, error } = Route.useSearch();
	// El correo de la cuenta sin acceso llega en el fragmento, que no llega a ningún servidor.
	const correo = new URLSearchParams(window.location.hash.slice(1)).get("correo") ?? "Esta cuenta";
	return (
		<main className="grid min-h-dvh place-items-center bg-fondo px-4">
			<div className="flex w-full max-w-ventana flex-col items-center gap-5 rounded-grande bg-panel p-8 text-center shadow-panel">
				<span className="grid size-12 place-items-center rounded-grande bg-marca font-bold text-white">UA</span>
				<div>
					<h1 className="m-0 font-bold text-titulo-seccion">Uniformes Alameda</h1>
					<p className="m-0 text-tinta3">Sistema de fábrica</p>
				</div>
				{error === "sin_acceso" ? (
					<>
						<Lock aria-hidden="true" size={22} className="text-tinta2" />
						<div role="alert">
							<b className="block font-bold">Esta cuenta no tiene acceso</b>
							<span className="text-tinta2">{correo} no está dada de alta. Solo la dueña da acceso al sistema.</span>
						</div>
						<Boton variante="principal" onClick={() => entrar(regresar)}>
							Usar otra cuenta
						</Boton>
					</>
				) : (
					<>
						{error === "google_fallo" ? (
							<p role="alert" className="m-0 font-semibold text-texto-error">
								No se pudo entrar con Google. Vuelve a intentar.
							</p>
						) : null}
						<Boton variante="principal" onClick={() => entrar(regresar)}>
							Entrar con Google
						</Boton>
					</>
				)}
				<p className="m-0 text-etiqueta text-tinta3">
					El taller entra con su PIN en la tablet registrada, sin cuenta de Google
				</p>
			</div>
		</main>
	);
}

export const Route = createFileRoute("/acceso/")({ component: Acceso, validateSearch: busqueda });
