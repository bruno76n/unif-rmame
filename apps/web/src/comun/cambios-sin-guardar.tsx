/**
 * Con cambios sin guardar, cambiar de pestaña o salir por el menú pregunta antes: «Tienes cambios sin guardar. ¿Salir
 * sin guardar?», con «Volver» y «Salir sin guardar». Cerrar el cajón ya lo pregunta el cajón; esto cubre lo demás.
 * Fase 19 · docs/interfaz/comunes.md («El cajón», regla 4)
 *
 * Uso, en la pantalla que tiene la captura: `const pregunta = usePreguntarAntesDeSalir(hayCambios);` y pintar
 * `{pregunta}`.
 */

import { useBlocker } from "@tanstack/react-router";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { textoCambiosSinGuardar } from "@uniformame/interfaz/contenedores/cajon";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";

/**
 * Detiene la navegación mientras haya cambios sin guardar y pregunta antes de salir.
 * @param conCambios Si hay cambios sin guardar.
 * @returns La ventana que pregunta, para pintarla.
 */
export function usePreguntarAntesDeSalir(conCambios: boolean) {
	const bloqueo = useBlocker({ shouldBlockFn: () => conCambios, withResolver: true, enableBeforeUnload: conCambios });
	return (
		<Ventana
			abierta={bloqueo.status === "blocked"}
			alCerrar={() => bloqueo.reset?.()}
			titulo={textoCambiosSinGuardar}
			accion={
				<Boton variante="peligro" onClick={() => bloqueo.proceed?.()}>
					Salir sin guardar
				</Boton>
			}
		/>
	);
}
