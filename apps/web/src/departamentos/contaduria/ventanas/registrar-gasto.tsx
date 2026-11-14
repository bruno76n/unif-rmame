/**
 * La ventana «Registrar gasto»: la categoría (sin «Reparación de máquinas»), el monto en pesos enteros, dónde (la
 * Fábrica al abrir, una ubicación o En línea), la fecha (hoy o antes), de dónde salió, el comprobante (imagen, PDF o XML,
 * opcional) y su tipo. «Registrar gasto» sube el comprobante y llama a `contaduria.registrar_gasto` con su `archivo_id`;
 * si la subida falla, el aviso dice por qué y lo capturado se queda.
 * Fase 19 · docs/interfaz/fabrica/contaduria.md («Ventanas») y docs/modulos/contaduria/gastos.md
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import type { gastosDeContaduria } from "@uniformame/compartido/contratos/contaduria/consultas-gastos-contador";
import { registrarGasto } from "@uniformame/compartido/contratos/contaduria/gastos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { CampoDeArchivo } from "@uniformame/interfaz/captura/campo-de-archivo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { aceptaDe, useSubidaAlMandar } from "../../../comun/subida.ts";
import { medioDe, opcionesDeSaleDe } from "../comun.tsx";
import { useEnvio } from "../envio.ts";

/** Las opciones de la ventana, de `contaduria.gastos`. */
type Opciones = Pick<
	z.infer<typeof gastosDeContaduria.resultado>,
	"categorias" | "ubicaciones" | "tipos_comprobante" | "cuentas_fabrica" | "hoy"
>;

/** Lo que se escoge en «Dónde»: la fábrica, en línea o el id de una ubicación. */
const fabrica = "fabrica";
const enLinea = "en_linea";

/** El formulario, con los esquemas del contrato. */
const formularioDeGasto = z.object({
	categoria_id: registrarGasto.entrada.shape.categoria_id,
	monto: z
		.string()
		.refine(
			(texto) => registrarGasto.entrada.shape.monto_centavos.safeParse(pesosACentavos(texto)).success,
			"Escribe el monto en pesos",
		),
	donde: z.string().min(1),
	fecha: registrarGasto.entrada.shape.fecha,
	sale_de: z.string().min(1, "Escoge de dónde salió."),
	tipo_comprobante_id: z.string(),
});

/**
 * La ventana para registrar un gasto.
 * @param props Las opciones y qué hacer al cerrar.
 */
export function VentanaRegistrarGasto({ opciones, alCerrar }: { opciones: Opciones; alCerrar: () => void }) {
	const { enviar, enviando } = useEnvio(registrarGasto);
	const conConexion = useConConexion();
	const { subir, subiendo } = useSubidaAlMandar("comprobante", "contaduria");
	const [comprobante, setComprobante] = useState<File | null>(null);
	const [errorDelComprobante, setErrorDelComprobante] = useState<string | undefined>(undefined);
	const saleDe = opcionesDeSaleDe(opciones.cuentas_fabrica);
	const formulario = useForm<z.input<typeof formularioDeGasto>>({
		resolver: zodResolver(formularioDeGasto),
		defaultValues: {
			categoria_id: "",
			monto: "",
			donde: fabrica,
			// El día de negocio que da la API, no el reloj de la computadora.
			fecha: opciones.hoy,
			sale_de: saleDe[0]?.valor ?? "",
			tipo_comprobante_id: "",
		},
	});
	const errores = formulario.formState.errors;
	const registrar = formulario.handleSubmit(async (valores) => {
		// El comprobante se sube primero; si no se pudo, ya lo avisó y no se registra.
		const comprobanteId = comprobante === null ? undefined : await subir(comprobante);
		if (comprobante !== null && comprobanteId === undefined) return;
		const area = valores.donde === fabrica ? "fabrica" : valores.donde === enLinea ? "en_linea" : "ubicacion";
		const salio = await enviar(
			{
				datos: {
					categoria_id: valores.categoria_id,
					monto_centavos: pesosACentavos(valores.monto) ?? 0,
					area,
					...(area === "ubicacion" ? { ubicacion_id: valores.donde } : {}),
					fecha: valores.fecha,
					...medioDe(valores.sale_de),
					...(comprobanteId === undefined ? {} : { comprobante_archivo_id: comprobanteId }),
					...(valores.tipo_comprobante_id === "" ? {} : { tipo_comprobante_id: valores.tipo_comprobante_id }),
				},
			},
			(campos) => {
				setErrorDelComprobante(campos.comprobante_archivo_id);
				for (const [campo, mensaje] of Object.entries(campos)) {
					const enElFormulario =
						campo === "monto_centavos"
							? "monto"
							: campo === "ubicacion_id"
								? "donde"
								: campo === "cuenta_fabrica_id"
									? "sale_de"
									: campo;
					const conocido = formularioDeGasto.keyof().safeParse(enElFormulario);
					if (conocido.success) formulario.setError(conocido.data, { message: mensaje });
				}
			},
		);
		if (salio !== undefined) alCerrar();
	});
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo="Registrar gasto"
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando || subiendo} onClick={() => void registrar()}>
					Registrar gasto
				</Boton>
			}
		>
			<form className="flex flex-col gap-4" onSubmit={(evento) => void registrar(evento)}>
				<Selector
					enVentana
					etiqueta="Categoría"
					vacio="Escoge la categoría"
					opciones={opciones.categorias.map((categoria) => ({ valor: categoria.id, texto: categoria.nombre }))}
					error={errores.categoria_id?.message}
					{...formulario.register("categoria_id")}
				/>
				<Campo
					enVentana
					etiqueta="Monto"
					inputMode="numeric"
					error={errores.monto?.message}
					{...formulario.register("monto")}
				/>
				<Selector
					enVentana
					etiqueta="Dónde"
					opciones={[
						{ valor: fabrica, texto: "Fábrica" },
						...opciones.ubicaciones.map((ubicacion) => ({ valor: ubicacion.id, texto: ubicacion.nombre })),
						{ valor: enLinea, texto: "En línea" },
					]}
					error={errores.donde?.message}
					{...formulario.register("donde")}
				/>
				<Campo
					enVentana
					type="date"
					etiqueta="Fecha"
					max={opciones.hoy}
					error={errores.fecha?.message}
					{...formulario.register("fecha")}
				/>
				<Selector
					enVentana
					etiqueta="Salió de"
					opciones={saleDe}
					error={errores.sale_de?.message}
					{...formulario.register("sale_de")}
				/>
				<CampoDeArchivo
					enVentana
					etiqueta="Comprobante (opcional)"
					acepta={aceptaDe.comprobante}
					archivo={comprobante}
					error={errorDelComprobante}
					alEscoger={(archivo) => {
						setComprobante(archivo);
						setErrorDelComprobante(undefined);
					}}
				/>
				<Selector
					enVentana
					etiqueta="Tipo de comprobante"
					vacio="Sin comprobante"
					opciones={opciones.tipos_comprobante.map((tipo) => ({ valor: tipo.id, texto: tipo.nombre }))}
					{...formulario.register("tipo_comprobante_id")}
				/>
			</form>
		</Ventana>
	);
}
