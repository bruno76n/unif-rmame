/**
 * «Confirmar con Google»: cuando una acción delicada responde `401 reautenticar`, la web abre la ventana de Google
 * aparte y espera a que regrese; entonces el cliente repite la acción con su misma clave.
 * Fase 19 · docs/interfaz/comunes.md («La ventana», regla 2) y docs/modulos/admin/acceso-con-google.md
 * («`admin.confirmar_con_google`»)
 *
 * La vuelta de Google llega a `/acceso/confirmado`, en la ventana aparte: esa ruta avisa por el canal
 * `confirmar-con-google` y se cierra. Si la persona cierra la ventana sin confirmar, la acción no se repite.
 */

/** El canal por el que la ventana aparte avisa que ya confirmó. */
export const canalDeConfirmacion = "confirmar-con-google";

/** El mensaje que manda la ventana aparte al confirmar. */
export const mensajeDeConfirmado = "confirmado";

/**
 * La dirección de la ida a Google para confirmar.
 * @param regresar La ruta de la web a la que vuelve Google.
 */
export function direccionDeConfirmar(regresar: string): string {
	return `/v1/acceso/google?${new URLSearchParams({ proposito: "confirmar", regresar }).toString()}`;
}

/**
 * Abre la ventana de Google y espera a que la persona confirme.
 * @returns Cuando la ventana aparte avisó que confirmó.
 * @throws Si la persona cerró la ventana sin confirmar: la acción no se repite.
 */
export function confirmarConGoogle(): Promise<void> {
	return new Promise((listo, fallo) => {
		const canal = new BroadcastChannel(canalDeConfirmacion);
		const ventana = window.open(
			direccionDeConfirmar("/acceso/confirmado"),
			"confirmar-con-google",
			"width=520,height=640",
		);
		let terminado = false;
		const terminar = (confirmo: boolean) => {
			if (terminado) return;
			terminado = true;
			canal.close();
			clearInterval(vigilar);
			if (confirmo) listo();
			else fallo(new Error("No se confirmó con Google."));
		};
		canal.onmessage = (evento) => terminar(evento.data === mensajeDeConfirmado);
		// Si la persona cierra la ventana sin confirmar, no se espera más.
		const vigilar = setInterval(() => {
			if (ventana === null || ventana.closed) setTimeout(() => terminar(false), 500);
		}, 500);
	});
}
