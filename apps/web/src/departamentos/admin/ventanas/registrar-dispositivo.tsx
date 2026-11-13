/**
 * La ventana «Registrar dispositivo»: el nombre, dónde se usa y la casilla «Programa de impresión»; «Dar código» (con
 * «Confirmar con Google») llama a `admin.generar_codigo_registro` y muestra el código en grande, que no se vuelve a
 * mostrar. Mientras espera pregunta a `admin.codigo_registro` si ya se canjeó; cuando nace el aparato, avisa
 * «{nombre} registrado con su propia llave» y lo deja resaltado en la tabla. «Volver» con el código a la vista lo
 * cancela (`admin.cancelar_codigo_registro`).
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Ventanas»: «Registrar dispositivo») y
 * docs/modulos/admin/dispositivos.md («`admin.generar_codigo_registro`»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import {
	codigoRegistroDeAdmin,
	type dispositivosDeAdmin,
} from "@uniformame/compartido/contratos/admin/consultas-dispositivos";
import { cancelarCodigoRegistro, generarCodigoRegistro } from "@uniformame/compartido/contratos/admin/dispositivos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { useAvisar } from "../../../comun/avisos-de-abajo.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useDireccionDeAdmin } from "../direccion.ts";
import { useEnvio } from "../envio.ts";

/** Las opciones de «Dónde se usa». */
type DondeSeUsa = z.infer<typeof dispositivosDeAdmin.resultado>["donde_se_usa"];

/** Cada cuánto pregunta si el aparato ya canjeó su código, en milisegundos. */
const cadaCuantoPregunta = 3000;

/** El formulario, con los campos del contrato. */
const formulario = z.object({
	nombre: generarCodigoRegistro.entrada.shape.nombre,
	ubicacion_id: generarCodigoRegistro.entrada.shape.ubicacion_id,
	impresion: z.boolean(),
});

/** El código ya dado: su id, cómo se lee y el nombre que se le dio. */
interface CodigoDado {
	id: string;
	codigo: string;
	nombre: string;
}

/**
 * La ventana para registrar un aparato.
 * @param props Las opciones de «Dónde se usa», cuántos minutos vale el código y qué hacer al cerrar.
 */
export function VentanaRegistrarDispositivo({
	dondeSeUsa,
	vigenciaMinutos,
	alCerrar,
}: {
	dondeSeUsa: DondeSeUsa;
	vigenciaMinutos: number;
	alCerrar: () => void;
}) {
	const generar = useEnvio(generarCodigoRegistro);
	const cancelar = useEnvio(cancelarCodigoRegistro);
	const conConexion = useConConexion();
	const [dado, setDado] = useState<CodigoDado | undefined>(undefined);
	const forma = useForm<z.input<typeof formulario>, unknown, z.output<typeof formulario>>({
		resolver: zodResolver(formulario),
		defaultValues: { nombre: "", ubicacion_id: "", impresion: false },
	});
	const lugar = dondeSeUsa.find((uno) => uno.ubicacion_id === forma.watch("ubicacion_id"));
	const impresion = forma.watch("impresion");
	const dar = forma.handleSubmit(async (valores) => {
		const tipo = valores.impresion ? "puente_impresion" : (lugar?.tipo ?? "puente_impresion");
		const nombre = valores.nombre ?? "";
		const salio = await generar.enviar(
			{ datos: { ...(nombre === "" ? {} : { nombre }), tipo, ubicacion_id: valores.ubicacion_id } },
			(campos) => {
				if (campos.ubicacion_id !== undefined) forma.setError("ubicacion_id", { message: campos.ubicacion_id });
				if (campos.nombre !== undefined) forma.setError("nombre", { message: campos.nombre });
			},
		);
		if (salio?.codigo !== undefined) {
			setDado({ id: salio.codigo_registro_id, codigo: salio.codigo, nombre: nombre === "" ? "Dispositivo" : nombre });
		}
	});
	/** «Volver»: con el código a la vista, lo cancela antes de cerrar. */
	const volver = async () => {
		if (dado !== undefined) await cancelar.enviar({ datos: { codigo_registro_id: dado.id } });
		alCerrar();
	};
	return (
		<Ventana
			abierta
			alCerrar={() => void volver()}
			titulo="Registrar dispositivo"
			accion={
				dado === undefined ? (
					<Boton variante="principal" disabled={!conConexion || generar.enviando} onClick={() => void dar()}>
						Dar código
					</Boton>
				) : undefined
			}
		>
			{dado === undefined ? (
				<form className="flex flex-col gap-4" onSubmit={(evento) => void dar(evento)}>
					<Campo
						enVentana
						etiqueta="Nombre"
						maxLength={30}
						placeholder="Por ejemplo: Tablet de calidad"
						error={forma.formState.errors.nombre?.message}
						{...forma.register("nombre")}
					/>
					<Selector
						enVentana
						etiqueta="Dónde se usa"
						vacio="Escoge dónde"
						opciones={dondeSeUsa.map((uno) => ({ valor: uno.ubicacion_id, texto: uno.nombre }))}
						error={forma.formState.errors.ubicacion_id?.message}
						{...forma.register("ubicacion_id")}
					/>
					<Casilla
						etiqueta="Programa de impresión"
						marcada={impresion}
						deshabilitada={lugar?.con_impresora !== true}
						alCambiar={(marcada) => forma.setValue("impresion", marcada)}
					/>
				</form>
			) : (
				<CodigoEnEspera dado={dado} vigenciaMinutos={vigenciaMinutos} alRegistrarse={alCerrar} />
			)}
		</Ventana>
	);
}

/**
 * El código en grande mientras el aparato lo canjea: pregunta cada pocos segundos y, cuando nace el aparato, avisa y
 * lo resalta en la tabla.
 * @param props El código dado, cuántos minutos vale y qué hacer cuando el aparato se registra.
 */
function CodigoEnEspera({
	dado,
	vigenciaMinutos,
	alRegistrarse,
}: {
	dado: CodigoDado;
	vigenciaMinutos: number;
	alRegistrarse: () => void;
}) {
	const estado = useConsulta(codigoRegistroDeAdmin, { codigo_registro_id: dado.id });
	const avisar = useAvisar();
	const { navegar } = useDireccionDeAdmin();
	const { refetch } = estado;
	// Pregunta cada pocos segundos si el aparato ya lo canjeó.
	useEffect(() => {
		const reloj = setInterval(() => void refetch(), cadaCuantoPregunta);
		return () => clearInterval(reloj);
	}, [refetch]);
	const nacio = estado.data?.estado === "canjeado" ? estado.data.dispositivo_id : null;
	useEffect(() => {
		if (nacio === null) return;
		avisar(`${dado.nombre} registrado con su propia llave`, "bien");
		navegar({ resaltar: nacio });
		alRegistrarse();
	}, [nacio, dado.nombre, avisar, navegar, alRegistrarse]);
	return (
		<div className="flex flex-col items-center gap-4 text-center">
			<p className="m-0">
				{`Escribe este código en la pantalla de registro del dispositivo nuevo. Vence en ${vigenciaMinutos} minutos.`}
			</p>
			<b className="font-mono text-titulo-cajon tracking-widest">{dado.codigo}</b>
			{estado.data?.estado === "vencido" || estado.data?.estado === "cancelado" ? (
				<LineaDeAviso tono="advertencia">Ese código ya no sirve. Vuelve y da otro.</LineaDeAviso>
			) : null}
		</div>
	);
}
