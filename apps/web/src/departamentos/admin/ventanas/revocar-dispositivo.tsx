/**
 * La ventana «Revocar {dispositivo}»: deja de entrar en cuanto se confirma; si tiene movimientos sin subir lo dice; el
 * motivo (de 5 a 60) y, en la tablet, «¿Se perdió o la pudo usar alguien más?», que anula los PIN del taller.
 * «Confirmar con Google» llama a `admin.revocar_dispositivo` con la versión del aparato.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Ventanas»: «Revocar {dispositivo}») y
 * docs/modulos/admin/dispositivos.md («`admin.revocar_dispositivo`»)
 */

import { revocarDispositivo } from "@uniformame/compartido/contratos/admin/dispositivos";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { useState } from "react";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { useEnvio } from "../envio.ts";
import type { Registrado } from "../pestanas/dispositivos.tsx";

/**
 * La ventana para revocar un aparato.
 * @param props El aparato y qué hacer al cerrar.
 */
export function VentanaRevocarDispositivo({ aparato, alCerrar }: { aparato: Registrado; alCerrar: () => void }) {
	const envio = useEnvio(revocarDispositivo);
	const [anularPines, setAnularPines] = useState(false);
	const esTablet = aparato.tipo === "tablet_taller";
	/** Revoca con el motivo; si la regla lo detiene, regresa su mensaje para el campo. */
	const confirmar = async (motivo: string) => {
		let error: string | undefined;
		const salio = await envio.enviar(
			{
				datos: { dispositivo_id: aparato.dispositivo_id, motivo, ...(esTablet ? { anular_pines: anularPines } : {}) },
				version: aparato.version,
			},
			(campos) => {
				error = campos.motivo ?? campos.anular_pines;
			},
		);
		if (salio !== undefined) alCerrar();
		return error;
	};
	return (
		<VentanaConMotivo
			alCerrar={alCerrar}
			titulo={`Revocar ${aparato.nombre}`}
			subtitulo="Deja de entrar en cuanto confirmes."
			textoAccion="Confirmar con Google"
			ejemplo="Por ejemplo: se perdió"
			enviando={envio.enviando}
			alConfirmar={confirmar}
		>
			{envio.choco ? <EstadoDePantalla tipo="choque" documento={aparato.nombre} /> : null}
			{aparato.pendientes_por_subir === 0 ? null : (
				<Recuadro color="ambar">
					{`Tiene ${aparato.pendientes_por_subir} ${aparato.pendientes_por_subir === 1 ? "movimiento" : "movimientos"} sin subir. Lo que llegue después entra a la bandeja de excepciones de Bodega.`}
				</Recuadro>
			)}
			{esTablet ? (
				<Casilla etiqueta="¿Se perdió o la pudo usar alguien más?" marcada={anularPines} alCambiar={setAnularPines} />
			) : null}
		</VentanaConMotivo>
	);
}
