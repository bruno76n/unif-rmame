/**
 * La ventana «Datos de la empresa»: razón social, nombre comercial, RFC y domicilio, con el esquema del contrato;
 * «Guardar» llama a `admin.editar_empresa` con la versión que se leyó.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Ventanas»: «Datos de la empresa») y
 * docs/modulos/admin/configuracion.md («`admin.editar_empresa`»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { editarEmpresa } from "@uniformame/compartido/contratos/admin/configuracion";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../envio.ts";
import type { Configuracion } from "../pestanas/configuracion.tsx";

/** Los campos del formulario: los del contrato. */
type Campos = z.input<typeof editarEmpresa.entrada>;

/** Los nombres de los campos. */
const campos = ["razon_social", "nombre_comercial", "rfc", "domicilio"] as const;

/**
 * La ventana que edita los datos de la empresa.
 * @param props Los datos de hoy y qué hacer al cerrar.
 */
export function VentanaEmpresa({
	empresa,
	alCerrar,
}: {
	empresa: NonNullable<Configuracion["empresa"]>;
	alCerrar: () => void;
}) {
	const envio = useEnvio(editarEmpresa);
	const conConexion = useConConexion();
	const forma = useForm<Campos, unknown, z.output<typeof editarEmpresa.entrada>>({
		resolver: zodResolver(editarEmpresa.entrada),
		defaultValues: {
			razon_social: empresa.razon_social,
			nombre_comercial: empresa.nombre_comercial,
			rfc: empresa.rfc,
			domicilio: empresa.domicilio,
		},
	});
	const errores = forma.formState.errors;
	const guardar = forma.handleSubmit(async (valores) => {
		const salio = await envio.enviar({ datos: valores, version: empresa.version }, (deLaRegla) => {
			for (const campo of campos) {
				const mensaje = deLaRegla[campo];
				if (mensaje !== undefined) forma.setError(campo, { message: mensaje });
			}
		});
		if (salio !== undefined) alCerrar();
	});
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo="Datos de la empresa"
			accion={
				<Boton variante="principal" disabled={!conConexion || envio.enviando} onClick={() => void guardar()}>
					Guardar
				</Boton>
			}
		>
			<form className="flex flex-col gap-4" onSubmit={(evento) => void guardar(evento)}>
				{envio.choco ? <EstadoDePantalla tipo="choque" documento="Los datos de la empresa" /> : null}
				<Campo
					enVentana
					etiqueta="Razón social"
					error={errores.razon_social?.message}
					{...forma.register("razon_social")}
				/>
				<Campo
					enVentana
					etiqueta="Nombre comercial"
					error={errores.nombre_comercial?.message}
					{...forma.register("nombre_comercial")}
				/>
				<Campo enVentana etiqueta="RFC" error={errores.rfc?.message} {...forma.register("rfc")} />
				<Campo enVentana etiqueta="Domicilio" error={errores.domicilio?.message} {...forma.register("domicilio")} />
			</form>
		</Ventana>
	);
}
