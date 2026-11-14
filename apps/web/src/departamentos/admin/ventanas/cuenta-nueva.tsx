/**
 * La ventana «Cuenta nueva» (la dueña) o «Pedir cuenta nueva» (las demás cuentas): la persona, su correo de Google,
 * sus departamentos y, al pedirla, para qué. La dueña la da de alta con «Confirmar con Google» (`admin.crear_cuenta`);
 * las demás mandan la solicitud a Dirección (`admin.pedir_cuenta`).
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Ventanas»: «Cuenta nueva») y docs/modulos/admin/cuentas.md
 *
 * El formulario valida con el mismo esquema del contrato; las opciones salen de `admin.cuenta_nueva`.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { cuentaNuevaDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-usuarios";
import { crearCuenta, pedirCuenta } from "@uniformame/compartido/contratos/admin/cuentas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useEnvio } from "../envio.ts";

/** El formulario: lo que pide la solicitud, con el mismo esquema del contrato (el alta no lleva «para qué»). */
const formulario = pedirCuenta.entrada;

/** Los campos del formulario, por su nombre. */
type Campos = z.input<typeof formulario>;

/**
 * La ventana para dar o pedir una cuenta.
 * @param props Qué hacer al cerrar.
 */
export function VentanaCuentaNueva({ alCerrar }: { alCerrar: () => void }) {
	const opciones = useConsulta(cuentaNuevaDeAdmin, {});
	const crear = useEnvio(crearCuenta);
	const pedir = useEnvio(pedirCuenta);
	const conConexion = useConConexion();
	const forma = useForm<Campos>({
		resolver: zodResolver(formulario),
		defaultValues: { persona_id: "", correo: "", departamentos: [], para_que: "" },
	});
	const errores = forma.formState.errors;
	const daLaCuenta = opciones.data?.puede_crear_cuenta === true;
	const escogidos = forma.watch("departamentos");
	/** Pone en sus campos lo que dijo la regla. */
	const alCampos = (campos: Record<string, string>) => {
		for (const [campo, mensaje] of Object.entries(campos)) {
			if (campo === "persona_id" || campo === "correo" || campo === "departamentos" || campo === "para_que") {
				forma.setError(campo, { message: mensaje });
			}
		}
	};
	const mandar = forma.handleSubmit(async (valores) => {
		const { para_que: paraQue, ...cuenta } = valores;
		const salio = daLaCuenta
			? await crear.enviar({ datos: cuenta }, alCampos)
			: await pedir.enviar(
					{ datos: { ...cuenta, ...(paraQue === undefined || paraQue === "" ? {} : { para_que: paraQue }) } },
					alCampos,
				);
		if (salio !== undefined) alCerrar();
	});
	return (
		<Ventana
			abierta
			ancha
			alCerrar={alCerrar}
			titulo={daLaCuenta ? "Cuenta nueva" : "Pedir cuenta nueva"}
			{...(daLaCuenta ? {} : { subtitulo: "La cuenta la da la dueña: la solicitud llega a Dirección" })}
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || opciones.data === undefined || crear.enviando || pedir.enviando}
					onClick={() => void mandar()}
				>
					{daLaCuenta ? "Dar de alta" : "Mandar solicitud"}
				</Boton>
			}
		>
			<SegunConsulta consulta={opciones} renglones={4}>
				{(datos) => (
					<form className="flex flex-col gap-4" onSubmit={(evento) => void mandar(evento)}>
						<Selector
							enVentana
							etiqueta="Persona"
							vacio="Escoge a la persona"
							opciones={datos.personas.map((persona) => ({ valor: persona.persona_id, texto: persona.texto }))}
							error={errores.persona_id?.message}
							{...forma.register("persona_id")}
						/>
						<Campo
							enVentana
							etiqueta="Correo de Google"
							type="email"
							autoComplete="off"
							error={errores.correo?.message}
							{...forma.register("correo")}
						/>
						<fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
							<legend className="mb-2 font-semibold text-etiqueta text-tinta2">Departamentos</legend>
							<div className="grid grid-cols-2 gap-2 max-telefono:grid-cols-1">
								{datos.departamentos.map((departamento) => (
									<Casilla
										key={departamento.clave}
										etiqueta={departamento.nombre}
										marcada={escogidos.includes(departamento.clave)}
										alCambiar={(marcada) =>
											forma.setValue(
												"departamentos",
												marcada
													? [...escogidos, departamento.clave]
													: escogidos.filter((clave) => clave !== departamento.clave),
												{ shouldValidate: forma.formState.isSubmitted },
											)
										}
									/>
								))}
							</div>
							{errores.departamentos?.message === undefined ? null : (
								<LineaDeAviso tono="error">{errores.departamentos.message}</LineaDeAviso>
							)}
						</fieldset>
						{daLaCuenta ? null : (
							<Campo
								enVentana
								etiqueta="Para qué (opcional)"
								placeholder="Por ejemplo: para revisar lotes en escritorio"
								error={errores.para_que?.message}
								{...forma.register("para_que")}
							/>
						)}
					</form>
				)}
			</SegunConsulta>
		</Ventana>
	);
}
