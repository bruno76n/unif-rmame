/**
 * La ventana «Registrar deuda»: «¿A quién le debemos?» (un tercero, u «Otro: darlo de alta» con su nombre y qué es; si
 * se parece a uno que ya existe, «¿Es el mismo?»), de qué es, el monto, las mensualidades y el primer vencimiento.
 * «Registrar deuda» llama a `contaduria.registrar_deuda`; con más de una mensualidad, las arma iguales la API.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Ventanas») y docs/modulos/contaduria/terceros-y-deudas.md
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { registrarDeuda } from "@uniformame/compartido/contratos/contaduria/por-pagar";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useEnvio } from "../envio.ts";

/** El valor de «Otro: darlo de alta». */
const otro = "otro";

/** El formulario, con los esquemas del contrato. */
const formularioDeDeuda = z.object({
	tercero: z.string().min(1, "¿A quién le debemos?"),
	nombre: z.string(),
	clase: registrarDeuda.entrada.shape.tercero_nuevo.unwrap().shape.clase,
	descripcion: registrarDeuda.entrada.shape.descripcion,
	monto: z.string().refine((texto) => pesosACentavos(texto) !== null, "Escribe el monto en pesos."),
	mensualidades: z.coerce.number<string>().int().min(1, "Al menos una mensualidad."),
	primer_vencimiento: registrarDeuda.entrada.shape.primer_vencimiento,
});

/**
 * La ventana para registrar una deuda con un acreedor.
 * @param props Los terceros para escoger y qué hacer al cerrar.
 */
export function VentanaRegistrarDeuda({
	terceros,
	alCerrar,
}: {
	terceros: readonly { id: string; nombre: string }[];
	alCerrar: () => void;
}) {
	const { enviar, enviando } = useEnvio(registrarDeuda);
	const conConexion = useConConexion();
	const [elMismo, setElMismo] = useState<{ mensaje: string; id: string | undefined } | undefined>(undefined);
	const formulario = useForm<z.input<typeof formularioDeDeuda>, unknown, z.output<typeof formularioDeDeuda>>({
		resolver: zodResolver(formularioDeDeuda),
		defaultValues: {
			tercero: "",
			nombre: "",
			clase: "persona",
			descripcion: "",
			monto: "",
			mensualidades: "1",
			primer_vencimiento: "",
		},
	});
	const errores = formulario.formState.errors;
	const esOtro = formulario.watch("tercero") === otro;
	const registrar = (ligarA?: string) =>
		formulario.handleSubmit(async (valores) => {
			if (valores.tercero === otro && valores.nombre.trim().length < 3) {
				formulario.setError("nombre", { message: "Escribe el nombre." });
				return;
			}
			const salio = await enviar(
				{
					datos: {
						...(valores.tercero === otro
							? { tercero_nuevo: { nombre: valores.nombre, clase: valores.clase } }
							: { tercero_id: valores.tercero }),
						...(ligarA === undefined ? {} : { ligar_a_tercero_id: ligarA }),
						descripcion: valores.descripcion,
						monto_total_centavos: pesosACentavos(valores.monto) ?? 0,
						numero_mensualidades: valores.mensualidades,
						primer_vencimiento: valores.primer_vencimiento,
					},
				},
				(campos) => {
					for (const [campo, mensaje] of Object.entries(campos)) {
						const enElFormulario = campo === "monto_total_centavos" ? "monto" : campo;
						const conocido = formularioDeDeuda.keyof().safeParse(enElFormulario);
						if (conocido.success) formulario.setError(conocido.data, { message: mensaje });
					}
				},
				(falla) => {
					// «¿Es el mismo?»: el que ya existe se busca por su nombre, para ligarlo si se dice que sí.
					if (falla.codigo !== "tercero_ya_existe") return;
					const nombre = valores.nombre.trim().toLocaleLowerCase("es-MX");
					const mismo = terceros.find((tercero) => tercero.nombre.toLocaleLowerCase("es-MX") === nombre);
					setElMismo({ mensaje: falla.mensaje, id: mismo?.id });
				},
			);
			if (salio !== undefined) alCerrar();
		})();
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo="Registrar deuda"
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void registrar()}>
					Registrar deuda
				</Boton>
			}
		>
			<form
				className="flex flex-col gap-4"
				onSubmit={(evento) => {
					evento.preventDefault();
					void registrar();
				}}
			>
				<Selector
					enVentana
					etiqueta="¿A quién le debemos?"
					vacio="Escoge"
					opciones={[
						...terceros.map((tercero) => ({ valor: tercero.id, texto: tercero.nombre })),
						{ valor: otro, texto: "Otro: darlo de alta" },
					]}
					error={errores.tercero?.message}
					{...formulario.register("tercero")}
				/>
				{esOtro ? (
					<>
						<Campo enVentana etiqueta="Nombre" error={errores.nombre?.message} {...formulario.register("nombre")} />
						<Selector
							enVentana
							etiqueta="Es"
							opciones={[
								{ valor: "persona", texto: "Persona" },
								{ valor: "banco", texto: "Banco" },
								{ valor: "empresa", texto: "Empresa" },
							]}
							{...formulario.register("clase")}
						/>
					</>
				) : null}
				{elMismo === undefined ? null : (
					<Recuadro
						color="ambar"
						boton={
							elMismo.id === undefined ? undefined : (
								<Boton chico disabled={enviando} onClick={() => void registrar(elMismo.id)}>
									Es el mismo
								</Boton>
							)
						}
					>
						{elMismo.mensaje}
					</Recuadro>
				)}
				<Campo
					enVentana
					etiqueta="De qué es"
					error={errores.descripcion?.message}
					{...formulario.register("descripcion")}
				/>
				<Campo
					enVentana
					etiqueta="Monto por pagar"
					inputMode="decimal"
					error={errores.monto?.message}
					{...formulario.register("monto")}
				/>
				<div className="grid grid-cols-2 gap-3">
					<Campo
						enVentana
						etiqueta="Mensualidades"
						inputMode="numeric"
						error={errores.mensualidades?.message}
						{...formulario.register("mensualidades")}
					/>
					<Campo
						enVentana
						type="date"
						etiqueta="Primer vencimiento"
						error={errores.primer_vencimiento?.message}
						{...formulario.register("primer_vencimiento")}
					/>
				</div>
			</form>
		</Ventana>
	);
}
