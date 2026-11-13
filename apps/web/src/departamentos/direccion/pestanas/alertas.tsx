/**
 * La pestaña Alertas cruzadas de Dirección: una tarjeta por alerta, con su orilla roja o ámbar a la izquierda, el
 * título en negritas, el detalle, «Cruza: {departamentos}» y «Ver ›», que lleva al departamento de la alerta y no sale
 * si la cuenta no lo tiene.
 * Fase 19 · docs/interfaz/fabrica/direccion.md («Alertas cruzadas»)
 */

import type { alertas } from "@uniformame/compartido/contratos/direccion/alertas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Tarjeta } from "@uniformame/interfaz/contenedores/tarjeta";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { ChevronRight } from "lucide-react";
import type { z } from "zod";

/** Lo que trae `direccion.alertas`. */
type Datos = z.infer<typeof alertas.resultado>;

/**
 * La pestaña Alertas cruzadas.
 * @param props Las alertas y cómo navegar.
 */
export function PestanaAlertas({ datos, ir }: { datos: Datos; ir: (ruta: string) => void }) {
	if (datos.alertas.length === 0) return <EstadoDePantalla tipo="vacio" texto="Nada fuera de lo normal" bien />;
	return (
		<div className="flex flex-col gap-3">
			{datos.alertas.map((alerta) => {
				const ver = alerta.ver;
				return (
					<Tarjeta key={alerta.clave} nombre={alerta.titulo} orilla={alerta.color}>
						<b className="font-bold">{alerta.titulo}</b>
						<span className="text-tinta2">{alerta.detalle}</span>
						<footer className="flex flex-wrap items-center gap-3">
							<span className="text-etiqueta text-tinta3">Cruza: {alerta.cruza.join(", ")}</span>
							{ver === null ? null : (
								<span className="ml-auto">
									<Boton chico variante="fantasma" onClick={() => ir(ver)}>
										Ver
										<ChevronRight aria-hidden="true" size={15} strokeWidth={1.9} />
									</Boton>
								</span>
							)}
						</footer>
					</Tarjeta>
				);
			})}
		</div>
	);
}
