/**
 * La ventana «Cambiar departamentos»: por cuenta, lo que recibe y lo que deja; «Confirmar con Google» manda todo en
 * `admin.cambiar_departamentos`, con la versión de cada cuenta.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Ventanas»: «Cambiar departamentos») y
 * docs/modulos/admin/cuentas.md («`admin.cambiar_departamentos`»)
 */

import type { usuariosDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-usuarios";
import { cambiarDepartamentos } from "@uniformame/compartido/contratos/admin/cuentas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../envio.ts";

/** Lo que da `admin.usuarios`. */
type Usuarios = z.infer<typeof usuariosDeAdmin.resultado>;

/** Lo que cambia de una cuenta: lo que recibe y lo que deja. */
export interface CambioDeDepartamentos {
	cuenta: Usuarios["cuentas"][number];
	recibe: Usuarios["departamentos"];
	deja: Usuarios["departamentos"];
}

/**
 * Cómo se lee lo que cambia de una cuenta: «Gloria recibe Calidad y deja Producción».
 * @param cambio Lo que cambia.
 */
function textoDelCambio({ cuenta, recibe, deja }: CambioDeDepartamentos): string {
	const nombres = (departamentos: Usuarios["departamentos"]) => departamentos.map((uno) => uno.nombre).join(", ");
	const partes = [
		...(recibe.length === 0 ? [] : [`recibe ${nombres(recibe)}`]),
		...(deja.length === 0 ? [] : [`deja ${nombres(deja)}`]),
	];
	return `${cuenta.nombre} ${partes.join(" y ")}`;
}

/**
 * La ventana que confirma los cambios del borrador.
 * @param props Los cambios, qué hacer al cerrar y al guardar.
 */
export function VentanaCambiarDepartamentos({
	cambios,
	alCerrar,
	alGuardar,
}: {
	cambios: readonly CambioDeDepartamentos[];
	alCerrar: () => void;
	alGuardar: () => void;
}) {
	const envio = useEnvio(cambiarDepartamentos);
	const conConexion = useConConexion();
	/** Manda todos los cambios juntos, cada cuenta con la versión que se leyó. */
	const confirmar = async () => {
		const salio = await envio.enviar({
			datos: {
				cambios: cambios.map(({ cuenta, recibe, deja }) => ({
					usuario_id: cuenta.usuario_id,
					version: cuenta.version,
					recibe: recibe.map((uno) => uno.clave),
					deja: deja.map((uno) => uno.clave),
				})),
			},
		});
		if (salio !== undefined) alGuardar();
	};
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo="Cambiar departamentos"
			subtitulo="Los menús de cada quien cambian en cuanto confirmes."
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || envio.enviando || cambios.length === 0}
					onClick={() => void confirmar()}
				>
					Confirmar con Google
				</Boton>
			}
		>
			{envio.choco ? <EstadoDePantalla tipo="choque" documento="Los departamentos" /> : null}
			<ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
				{cambios.map((cambio) => (
					<li key={cambio.cuenta.usuario_id}>{textoDelCambio(cambio)}</li>
				))}
			</ul>
		</Ventana>
	);
}
