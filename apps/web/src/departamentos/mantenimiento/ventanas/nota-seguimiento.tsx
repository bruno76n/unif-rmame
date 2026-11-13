/**
 * La ventana «Nota de seguimiento de {FM}»: la nota (hasta 200; vacía, la borra). «Guardar nota» llama
 * `mantenimiento.guardar_nota_seguimiento` con la versión de la falla.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Ventanas») y
 * docs/modulos/mantenimiento/maquinas-fallas-y-servicios.md (regla 9, «`mantenimiento.guardar_nota_seguimiento`»)
 */

import { zodResolver } from "@hookform/resolvers/zod";
import type { fallaDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-cajones";
import { guardarNotaSeguimiento } from "@uniformame/compartido/contratos/mantenimiento/maquinas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Ventana } from "@uniformame/interfaz/contenedores/ventana";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { erroresEnSusCampos } from "../comun.tsx";
import { useEnvio } from "../envio.ts";

/** La falla del cajón. */
type Falla = z.infer<typeof fallaDeMantenimiento.resultado>;

/**
 * La ventana de la nota de seguimiento de una falla abierta.
 * @param props La falla y cómo cerrar la ventana.
 */
export function VentanaNotaSeguimiento({ falla, alCerrar }: { falla: Falla; alCerrar: () => void }) {
	const conConexion = useConConexion();
	const { enviar, enviando, choco } = useEnvio(guardarNotaSeguimiento);
	const forma = useForm<
		z.input<typeof guardarNotaSeguimiento.entrada>,
		unknown,
		z.output<typeof guardarNotaSeguimiento.entrada>
	>({
		resolver: zodResolver(guardarNotaSeguimiento.entrada),
		defaultValues: { falla_id: falla.falla_id, nota: falla.nota_seguimiento ?? "" },
	});
	const guardar = forma.handleSubmit(async (datos) => {
		const salio = await enviar({ datos, version: falla.version }, (fallo) => erroresEnSusCampos(fallo.campos, forma));
		if (salio !== undefined) alCerrar();
	});
	return (
		<Ventana
			abierta
			alCerrar={alCerrar}
			titulo={`Nota de seguimiento de ${falla.folio}`}
			accion={
				<Boton variante="principal" disabled={!conConexion || enviando} onClick={() => void guardar()}>
					Guardar nota
				</Boton>
			}
		>
			<form className="flex flex-col gap-3" onSubmit={(evento) => void guardar(evento)}>
				{choco ? <EstadoDePantalla tipo="choque" documento={falla.folio} /> : null}
				<Campo
					etiqueta="Nota"
					enVentana
					maxLength={200}
					autoComplete="off"
					error={forma.formState.errors.nota?.message}
					{...forma.register("nota")}
				/>
			</form>
		</Ventana>
	);
}
