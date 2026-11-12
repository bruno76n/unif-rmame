/**
 * La campana de la barra superior: los avisos de la cuenta, con cuántos van sin leer. Tocar uno lo marca leído y abre
 * su enlace; «Marcar todos como leídos» los marca todos.
 * Fase 19 · docs/interfaz/comunes.md («La barra superior», «`admin.mis_avisos`») y docs/modulos/admin/avisos.md
 */

import { useRouter } from "@tanstack/react-router";
import { misAvisos } from "@uniformame/compartido/contratos/admin/armazon";
import { marcarAvisoLeido } from "@uniformame/compartido/contratos/admin/avisos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { unirClases } from "@uniformame/interfaz/clases";
import { Emergente } from "@uniformame/interfaz/contenedores/emergente";
import { Bell } from "lucide-react";
import { useAccion, useConsulta } from "./api.tsx";

/** Lo que cambia al leer un aviso. */
const cambian = ["admin.mis_avisos", "admin.armazon"];

/**
 * La campana.
 * @param props Cuántos avisos van sin leer (de `admin.armazon`).
 */
export function Campana({ sinLeer }: { sinLeer: number }) {
	const router = useRouter();
	const avisos = useConsulta(misAvisos, { limite: 20 });
	const marcar = useAccion(marcarAvisoLeido, cambian);
	return (
		<Emergente
			etiqueta={sinLeer === 0 ? "Avisos" : `Avisos: ${sinLeer} sin leer`}
			boton={<Bell aria-hidden="true" size={20} strokeWidth={1.9} />}
			marca={sinLeer}
			titulo="Avisos"
			accion={
				sinLeer === 0 ? undefined : (
					<Boton chico variante="fantasma" onClick={() => marcar.mutate({ datos: { todos: true } })}>
						Marcar todos como leídos
					</Boton>
				)
			}
		>
			<ul className="m-0 list-none p-0">
				{(avisos.data?.renglones ?? []).map((aviso) => (
					<li key={aviso.id}>
						<button
							type="button"
							onClick={() => {
								if (!aviso.leido) marcar.mutate({ datos: { aviso_ids: [aviso.id] } });
								if (aviso.enlace !== null) router.history.push(`/${aviso.enlace.replace(/^\//, "")}`);
							}}
							className={unirClases(
								"flex w-full flex-col gap-0.5 rounded-mediano px-2.5 py-2 text-left hover:bg-suave",
								!aviso.leido && "bg-marca-fondo",
							)}
						>
							<span className={unirClases(!aviso.leido && "font-semibold")}>{aviso.texto}</span>
							<span className="text-tinta3 text-xs">
								{new Date(aviso.creado_en).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
							</span>
						</button>
					</li>
				))}
				{avisos.data?.renglones.length === 0 ? <li className="px-2.5 py-3 text-tinta2">Sin avisos</li> : null}
			</ul>
		</Emergente>
	);
}
