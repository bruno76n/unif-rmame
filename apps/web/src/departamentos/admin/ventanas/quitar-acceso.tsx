/**
 * La ventana «Quitar acceso a {nombre}»: lo que pasa, el motivo (opcional) y «Confirmar con Google» en rojo, que
 * llama a `admin.quitar_acceso` con la versión de la cuenta.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Ventanas»: «Quitar acceso a {nombre}») y
 * docs/modulos/admin/cuentas.md («`admin.quitar_acceso`»)
 */

import type { usuariosDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-usuarios";
import { quitarAcceso } from "@uniformame/compartido/contratos/admin/cuentas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../envio.ts";

/** Una cuenta de `admin.usuarios`. */
type Cuenta = z.infer<typeof usuariosDeAdmin.resultado>["cuentas"][number];

/**
 * La ventana que le quita el acceso a una cuenta.
 * @param props La cuenta y qué hacer al cerrar.
 */
export function VentanaQuitarAcceso({ cuenta, alCerrar }: { cuenta: Cuenta; alCerrar: () => void }) {
	const envio = useEnvio(quitarAcceso);
	const conConexion = useConConexion();
	const [motivo, setMotivo] = useState("");
	const [error, setError] = useState<string | undefined>(undefined);
	/** Quita el acceso; el motivo va solo si se escribió. */
	const confirmar = async () => {
		const texto = motivo.trim();
		const salio = await envio.enviar(
			{ datos: { usuario_id: cuenta.usuario_id, ...(texto === "" ? {} : { motivo: texto }) }, version: cuenta.version },
			(campos) => setError(campos.motivo),
		);
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`Quitar acceso a ${cuenta.nombre}`}
			subtitulo="Su cuenta de Google deja de entrar y sus sesiones se cierran. Lo que hizo se conserva en la bitácora."
			accion={
				<Boton variante="peligro" disabled={!conConexion || envio.enviando} onClick={() => void confirmar()}>
					Confirmar con Google
				</Boton>
			}
		>
			{envio.choco ? <EstadoDePantalla tipo="choque" documento={`La cuenta de ${cuenta.nombre}`} /> : null}
			<Campo
				enVentana
				etiqueta="Motivo (opcional)"
				maxLength={quitarAcceso.entrada.shape.motivo.unwrap().maxLength ?? undefined}
				value={motivo}
				error={error}
				onChange={(evento) => setMotivo(evento.target.value)}
			/>
		</Ventana>
	);
}
