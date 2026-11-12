/**
 * La vuelta de «Confirmar con Google», en la ventana aparte: avisa a la pantalla que confirmó y se cierra; la pantalla
 * repite la acción pendiente con su misma clave.
 * Fase 19 · docs/modulos/admin/acceso-con-google.md («`admin.confirmar_con_google`», «Regresa»)
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { canalDeConfirmacion, mensajeDeConfirmado } from "../../comun/confirmar-con-google.ts";

/** Avisa y se cierra. */
function Confirmado() {
	useEffect(() => {
		const canal = new BroadcastChannel(canalDeConfirmacion);
		canal.postMessage(mensajeDeConfirmado);
		canal.close();
		window.close();
	}, []);
	return <p className="p-8 text-center text-tinta2">Confirmado. Puedes cerrar esta ventana.</p>;
}

export const Route = createFileRoute("/acceso/confirmado")({ component: Confirmado });
