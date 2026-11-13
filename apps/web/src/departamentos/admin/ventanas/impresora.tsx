/**
 * La ventana «Impresora de etiquetas»: para agregar o cambiar, el nombre, el modelo, la ubicación y su programa
 * puente; para dar de baja, el motivo. «Guardar» (o «Dar de baja») llama a `admin.guardar_impresora`, con la versión si
 * ya existe.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Ventanas»: «Impresora de etiquetas») y
 * docs/modulos/admin/impresion.md («`admin.guardar_impresora`»)
 */

import { guardarImpresora } from "@uniformame/compartido/contratos/admin/impresion";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useState } from "react";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { useEnvio } from "../envio.ts";
import type { Configuracion } from "../pestanas/configuracion.tsx";

/** Una impresora de Configuración. */
type Impresora = Configuracion["impresoras"][number];

/** Lo que se hace con una impresora: agregarla, cambiarla o darla de baja. */
export type ImpresoraParaCambiar =
	| { tipo: "alta" }
	| { tipo: "cambiar"; impresora: Impresora }
	| { tipo: "baja"; impresora: Impresora };

/**
 * La ventana de una impresora de etiquetas.
 * @param props Qué se hace, los puentes y las ubicaciones para escoger, y qué hacer al cerrar.
 */
export function VentanaImpresora({
	impresora,
	puentes,
	ubicaciones,
	alCerrar,
}: {
	impresora: ImpresoraParaCambiar;
	puentes: Configuracion["puentes"];
	ubicaciones: Configuracion["ubicaciones_para_escoger"];
	alCerrar: () => void;
}) {
	const envio = useEnvio(guardarImpresora);
	const conConexion = useConConexion();
	const actual = impresora.tipo === "alta" ? undefined : impresora.impresora;
	const [nombre, setNombre] = useState(actual?.nombre ?? "");
	const [modelo, setModelo] = useState(actual?.modelo ?? "");
	const [ubicacion, setUbicacion] = useState(actual?.ubicacion_id ?? "");
	const [puente, setPuente] = useState(actual?.dispositivo_id ?? "");
	const [errores, setErrores] = useState<Record<string, string>>({});
	/** Lo que se manda de la impresora, con su versión si ya existe. */
	const datosDe = (base: Impresora | undefined) => ({
		...(base === undefined ? {} : { impresora_id: base.impresora_id, version: base.version }),
		nombre,
		modelo,
		ubicacion_id: ubicacion,
		...(puente === "" ? {} : { dispositivo_id: puente }),
	});
	/** Guarda el alta o el cambio. */
	const guardar = async () => {
		const salio = await envio.enviar({ datos: datosDe(actual) }, setErrores);
		if (salio !== undefined) alCerrar();
	};
	/** Da de baja con el motivo; si la regla lo detiene, regresa su mensaje para el campo. */
	const darDeBaja = async (motivo: string) => {
		let error: string | undefined;
		const salio = await envio.enviar({ datos: { ...datosDe(actual), baja: true, motivo_baja: motivo } }, (campos) => {
			error = campos.motivo_baja;
		});
		if (salio !== undefined) alCerrar();
		return error;
	};
	if (impresora.tipo === "baja") {
		return (
			<VentanaConMotivo
				alCerrar={alCerrar}
				titulo={`Dar de baja ${impresora.impresora.nombre}`}
				textoAccion="Dar de baja"
				enviando={envio.enviando}
				alConfirmar={darDeBaja}
			/>
		);
	}
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo="Impresora de etiquetas"
			accion={
				<Boton variante="principal" disabled={!conConexion || envio.enviando} onClick={() => void guardar()}>
					Guardar
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				{envio.choco ? <EstadoDePantalla tipo="choque" documento={actual?.nombre ?? "La impresora"} /> : null}
				<Campo
					enVentana
					etiqueta="Nombre"
					maxLength={40}
					value={nombre}
					error={errores.nombre}
					onChange={(evento) => setNombre(evento.target.value)}
				/>
				<Campo
					enVentana
					etiqueta="Modelo"
					maxLength={40}
					placeholder="Por ejemplo: Zebra ZD421"
					value={modelo}
					error={errores.modelo}
					onChange={(evento) => setModelo(evento.target.value)}
				/>
				<Selector
					enVentana
					etiqueta="Ubicación"
					vacio="Escoge la ubicación"
					opciones={ubicaciones.map((una) => ({ valor: una.ubicacion_id, texto: una.nombre }))}
					value={ubicacion}
					error={errores.ubicacion_id}
					onChange={(evento) => setUbicacion(evento.target.value)}
				/>
				<Selector
					enVentana
					etiqueta="Programa puente"
					vacio="Sin programa puente"
					opciones={puentes.map((uno) => ({ valor: uno.dispositivo_id, texto: uno.nombre }))}
					value={puente}
					error={errores.dispositivo_id}
					onChange={(evento) => setPuente(evento.target.value)}
				/>
			</div>
		</Ventana>
	);
}
