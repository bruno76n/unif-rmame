/**
 * La ventana «Registrar restauración probada»: qué se restauró (un respaldo semanal correcto o un punto en el tiempo),
 * cuándo se probó, si los conteos cuadraron, la evidencia (un archivo: imagen, PDF o texto) y una nota. «Registrar»
 * sube la evidencia y llama a `admin.registrar_restauracion` con su `evidencia_archivo_id`; la acción dice cuándo toca
 * la siguiente o que la prueba no cuadró.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Ventanas»: «Registrar restauración probada»),
 * docs/modulos/admin/respaldos.md («`admin.registrar_restauracion`») y docs/interfaz/comunes.md («Subir un archivo»)
 *
 * La evidencia se sube al mandar, no al escogerla, y una sola vez por archivo escogido: si la acción no sale y se
 * vuelve a mandar, va con el mismo `archivo_id`. Que sea obligatoria lo dice la acción («Sube la evidencia de la
 * prueba.», en su campo); si la subida falla, el aviso dice por qué y lo capturado se queda.
 */

import type { respaldosDeAdmin } from "@uniformame/compartido/contratos/admin/consultas-respaldos";
import { registrarRestauracion } from "@uniformame/compartido/contratos/admin/respaldos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { CampoDeArchivo } from "@uniformame/interfaz/captura/campo-de-archivo";
import { Casilla } from "@uniformame/interfaz/captura/casilla";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { useState } from "react";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { useSubidaAlMandar } from "../../../comun/subida.ts";
import { useEnvio } from "../envio.ts";

/** Los respaldos correctos para escoger. */
type Respaldos = z.infer<typeof respaldosDeAdmin.resultado>["respaldos_correctos"];

/**
 * Lo que el selector de archivos ofrece para la evidencia (el `accept` de HTML). Solo ayuda a escoger: los tipos que
 * se aceptan los revisa la API por su propósito, `evidencia_restauracion`.
 */
const aceptaEvidencia = "image/jpeg,image/png,image/webp,image/heic,application/pdf,text/plain,.txt";

/** El valor del selector cuando se restauró un punto en el tiempo. */
const puntoEnElTiempo = "punto_en_el_tiempo";

/**
 * Un momento escrito en la casilla de fecha y hora, en ISO.
 * @param texto Lo de la casilla («2026-11-09T10:42»).
 * @returns El momento, o nada si está vacía.
 */
function momentoDe(texto: string): string | undefined {
	return texto === "" ? undefined : new Date(texto).toISOString();
}

/**
 * La ventana para registrar una restauración probada.
 * @param props Los respaldos correctos y qué hacer al cerrar.
 */
export function VentanaRegistrarRestauracion({ respaldos, alCerrar }: { respaldos: Respaldos; alCerrar: () => void }) {
	const envio = useEnvio(registrarRestauracion);
	const conConexion = useConConexion();
	const [evidencia, setEvidencia] = useState<File | null>(null);
	const { subir, subiendo } = useSubidaAlMandar("evidencia_restauracion", "admin");
	const [que, setQue] = useState(respaldos[0]?.respaldo_id ?? puntoEnElTiempo);
	const [punto, setPunto] = useState("");
	const [probada, setProbada] = useState("");
	const [cuadraron, setCuadraron] = useState(true);
	const [nota, setNota] = useState("");
	const [errores, setErrores] = useState<Record<string, string>>({});
	/** Sube la evidencia y registra la prueba con lo capturado. */
	const registrar = async () => {
		const evidenciaId = evidencia === null ? undefined : await subir(evidencia);
		if (evidencia !== null && evidenciaId === undefined) return;
		const esPunto = que === puntoEnElTiempo;
		const restaurado = momentoDe(punto);
		const salio = await envio.enviar(
			{
				datos: {
					tipo: esPunto ? "punto_en_el_tiempo" : "semanal_externo",
					...(esPunto ? {} : { respaldo_id: que }),
					...(esPunto && restaurado !== undefined ? { punto_restaurado_en: restaurado } : {}),
					probada_en: momentoDe(probada) ?? "",
					conteos_cuadraron: cuadraron,
					...(evidenciaId === undefined ? {} : { evidencia_archivo_id: evidenciaId }),
					...(nota.trim() === "" ? {} : { nota: nota.trim() }),
				},
			},
			setErrores,
		);
		if (salio !== undefined) alCerrar();
	};
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo="Registrar restauración probada"
			accion={
				<Boton
					variante="principal"
					disabled={!conConexion || envio.enviando || subiendo}
					onClick={() => void registrar()}
				>
					Registrar
				</Boton>
			}
		>
			<div className="flex flex-col gap-4">
				<Selector
					enVentana
					etiqueta="Qué se restauró"
					opciones={[
						...respaldos.map((respaldo) => ({
							valor: respaldo.respaldo_id,
							texto: `Respaldo semanal · ${respaldo.texto}`,
						})),
						{ valor: puntoEnElTiempo, texto: "Un punto en el tiempo" },
					]}
					value={que}
					error={errores.respaldo_id}
					onChange={(evento) => setQue(evento.target.value)}
				/>
				{que === puntoEnElTiempo ? (
					<Campo
						enVentana
						etiqueta="Momento restaurado"
						type="datetime-local"
						value={punto}
						error={errores.punto_restaurado_en}
						onChange={(evento) => setPunto(evento.target.value)}
					/>
				) : null}
				<Campo
					enVentana
					etiqueta="Cuándo se probó"
					type="datetime-local"
					value={probada}
					error={errores.probada_en}
					onChange={(evento) => setProbada(evento.target.value)}
				/>
				<Casilla
					etiqueta="Los conteos y el cuadre de inventario cuadraron"
					marcada={cuadraron}
					alCambiar={setCuadraron}
				/>
				<CampoDeArchivo
					enVentana
					etiqueta="Evidencia"
					acepta={aceptaEvidencia}
					archivo={evidencia}
					error={errores.evidencia_archivo_id}
					alEscoger={(archivo) => {
						setEvidencia(archivo);
						setErrores(({ evidencia_archivo_id: _quitado, ...demas }) => demas);
					}}
				/>
				<Campo
					enVentana
					etiqueta="Nota (opcional)"
					maxLength={200}
					value={nota}
					error={errores.nota}
					onChange={(evento) => setNota(evento.target.value)}
				/>
			</div>
		</Ventana>
	);
}
