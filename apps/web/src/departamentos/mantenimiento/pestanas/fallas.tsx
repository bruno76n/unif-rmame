/**
 * Fallas de Mantenimiento: «Abiertas» (rojo, desplegado) y «Resueltas» (verde, plegado, con «Ver más»), cada grupo con
 * cuántas fallas trae; el que no tiene fallas no sale. Cada renglón abre el cajón Falla.
 * Fase 19 · docs/interfaz/fabrica/mantenimiento.md («Fallas»)
 *
 * Las resueltas se piden por páginas solo al desplegarlas.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";

import { fallasDeMantenimiento } from "@uniformame/compartido/contratos/mantenimiento/consultas-pestanas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { GrupoPlegable } from "@uniformame/interfaz/contenedores/grupo-plegable";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useState } from "react";
import type { z } from "zod";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { usePaginas } from "../comun.tsx";
import { useDireccionDeMantenimiento } from "../direccion.ts";

/** Lo que regresa la consulta. */
type Fallas = z.infer<typeof fallasDeMantenimiento.resultado>;

/** Una falla de la lista. */
type Falla = Fallas["renglones"][number];

/**
 * La tabla de un grupo de fallas.
 * @param props Sus fallas y qué hacer al tocar una.
 */
function TablaDeFallas({ fallas, alTocar }: { fallas: readonly Falla[]; alTocar: (id: string) => void }) {
	return (
		<Tabla
			nombre="Fallas"
			filas={fallas}
			claveDeFila={(falla) => falla.falla_id}
			alTocarFila={(falla) => alTocar(falla.falla_id)}
			columnas={[
				{
					clave: "falla",
					encabezado: "Falla",
					celda: (falla) => <DosRenglones arriba={falla.folio} abajo={textoDeDiaCorto(falla.fecha)} />,
				},
				{
					clave: "maquina",
					encabezado: "Máquina",
					celda: (falla) => <DosRenglones arriba={falla.maquina} abajo={falla.maquina_folio} />,
				},
				{
					clave: "motivo",
					encabezado: "Qué le pasa",
					celda: (falla) => (
						<DosRenglones arriba={falla.motivo} abajo={falla.detuvo ? "La detuvo" : "Siguió trabajando"} />
					),
				},
				{ clave: "reporto", encabezado: "Reportó", celda: (falla) => falla.reporto },
				{
					clave: "paro",
					encabezado: "Paro",
					alinear: "derecha",
					celda: (falla) => (falla.horas_paro === null ? "—" : `${falla.horas_paro} h`),
				},
				{
					clave: "estado",
					encabezado: "Estado",
					celda: (falla) => <Estado texto={falla.estado.texto} color={falla.estado.color} />,
				},
			]}
		/>
	);
}

/**
 * Las resueltas, por páginas, con «Ver más».
 * @param props Qué hacer al tocar una.
 */
function Resueltas({ alTocar }: { alTocar: (id: string) => void }) {
	const paginas = usePaginas(fallasDeMantenimiento, { grupo: "resueltas" });
	return (
		<SegunConsulta consulta={paginas} renglones={3}>
			{({ pages }) => (
				<div className="flex flex-col gap-3">
					<TablaDeFallas fallas={pages.flatMap((pagina) => pagina.renglones)} alTocar={alTocar} />
					{paginas.hasNextPage ? (
						<Boton chico disabled={paginas.isFetchingNextPage} onClick={() => void paginas.fetchNextPage()}>
							Ver más
						</Boton>
					) : null}
				</div>
			)}
		</SegunConsulta>
	);
}

/**
 * Fallas de Mantenimiento.
 * @param props Las abiertas, de `mantenimiento.fallas`, con los conteos de los dos grupos.
 */
export function FallasDeMantenimiento({ abiertas }: { abiertas: Fallas }) {
	const { abrir } = useDireccionDeMantenimiento();
	const [abiertasDesplegadas, setAbiertasDesplegadas] = useState(true);
	const [resueltasDesplegadas, setResueltasDesplegadas] = useState(false);
	const { conteos } = abiertas;
	const alTocar = (id: string) => abrir("falla", id);
	if (conteos.abiertas === 0 && conteos.resueltas === 0) return <EstadoDePantalla tipo="vacio" texto="Sin fallas" />;
	return (
		<div className="flex flex-col gap-4">
			{conteos.abiertas === 0 ? null : (
				<GrupoPlegable
					titulo="Abiertas"
					color="rojo"
					cuantos={plural(conteos.abiertas, "falla", "fallas")}
					abierto={abiertasDesplegadas}
					alCambiar={setAbiertasDesplegadas}
				>
					<TablaDeFallas fallas={abiertas.renglones} alTocar={alTocar} />
				</GrupoPlegable>
			)}
			{conteos.resueltas === 0 ? null : (
				<GrupoPlegable
					titulo="Resueltas"
					color="verde"
					cuantos={plural(conteos.resueltas, "falla", "fallas")}
					abierto={resueltasDesplegadas}
					alCambiar={setResueltasDesplegadas}
				>
					<Resueltas alTocar={alTocar} />
				</GrupoPlegable>
			)}
		</div>
	);
}
