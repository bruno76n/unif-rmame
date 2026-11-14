/**
 * En tránsito: los despachos que su destino no ha confirmado, el más nuevo primero, por páginas. Despacho (folio y
 * salida; el recién despachado, resaltado) · Qué salió (y «A {destino o cliente}») · Cuánto · Debe confirmar · Sin
 * confirmar (su color) · el botón: «Confirmar entrega» en una nota o en una tienda sin caja (su ventana), «Recordar»
 * en lo demás (`inventario.recordar_despacho`). Vacío: «Nada en tránsito».
 * Fase 19 · docs/interfaz/fabrica/aduana.md («En tránsito»)
 */

import { enTransito } from "@uniformame/compartido/contratos/inventario/aduana";
import { recordarDespacho } from "@uniformame/compartido/contratos/inventario/despachos";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { Estado } from "@uniformame/interfaz/estados/estado";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { TextoConTono } from "@uniformame/interfaz/estados/textos-con-tono";
import { Panel } from "@uniformame/interfaz/pagina/panel";
import { DosRenglones } from "@uniformame/interfaz/tablas/dos-renglones";
import { Tabla } from "@uniformame/interfaz/tablas/tabla";
import { useState } from "react";
import type { z } from "zod";
import { usePaginas } from "../../../comun/api.tsx";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useDireccionDeAduana } from "../direccion.ts";
import { useEnvio } from "../envio.ts";
import { VentanaConfirmarEntregaNota } from "../ventanas/confirmar-entrega-nota.tsx";
import { VentanaConfirmarEntregaTienda } from "../ventanas/confirmar-entrega-tienda.tsx";

/** Un despacho en tránsito. */
type Despacho = z.infer<typeof enTransito.resultado>["renglones"][number];

/**
 * El botón de un despacho: «Confirmar entrega» abre su ventana; «Recordar» llama a su acción.
 * @param props El despacho y qué hacer con «Confirmar entrega».
 */
function BotonDelDespacho({
	despacho,
	alConfirmar,
}: {
	despacho: Despacho;
	alConfirmar: (despacho: Despacho) => void;
}) {
	const conConexion = useConConexion();
	const { enviar, enviando } = useEnvio(recordarDespacho);
	if (despacho.boton !== "recordar") {
		return (
			<Boton chico disabled={!conConexion} onClick={() => alConfirmar(despacho)}>
				Confirmar entrega
			</Boton>
		);
	}
	return (
		<Boton
			chico
			disabled={!conConexion || enviando}
			onClick={() => void enviar({ datos: { despacho_id: despacho.despacho_id }, version: despacho.version })}
		>
			Recordar
		</Boton>
	);
}

/** En tránsito. */
export function TransitoDeAduana() {
	const paginas = usePaginas(enTransito, {});
	const { busqueda } = useDireccionDeAduana();
	const [confirmando, setConfirmando] = useState<Despacho | null>(null);
	return (
		<SegunConsulta consulta={paginas}>
			{({ pages }) => {
				const renglones = pages.flatMap((pagina) => pagina.renglones);
				if (renglones.length === 0) return <EstadoDePantalla tipo="vacio" texto="Nada en tránsito" />;
				return (
					<div className="flex flex-col gap-3">
						<Panel>
							<Tabla
								nombre="En tránsito"
								filas={renglones}
								claveDeFila={(despacho: Despacho) => despacho.despacho_id}
								columnas={[
									{
										clave: "despacho",
										encabezado: "Despacho",
										celda: (despacho) => (
											<DosRenglones
												arriba={<b>{despacho.folio}</b>}
												abajo={
													busqueda.resaltar === despacho.despacho_id ? (
														<TextoConTono tono="ambar">{`Recién despachado · ${despacho.salio}`}</TextoConTono>
													) : (
														despacho.salio
													)
												}
											/>
										),
									},
									{
										clave: "que",
										encabezado: "Qué salió",
										celda: (despacho) => <DosRenglones arriba={despacho.que} abajo={despacho.a} />,
									},
									{ clave: "cuanto", encabezado: "Cuánto", alinear: "derecha", celda: (despacho) => despacho.cantidad },
									{ clave: "confirma", encabezado: "Debe confirmar", celda: (despacho) => despacho.debe_confirmar },
									{
										clave: "sin_confirmar",
										encabezado: "Sin confirmar",
										celda: (despacho) => (
											<Estado texto={despacho.sin_confirmar.texto} color={despacho.sin_confirmar.color} />
										),
									},
									{
										clave: "boton",
										encabezado: "",
										alinear: "derecha",
										celda: (despacho) => <BotonDelDespacho despacho={despacho} alConfirmar={setConfirmando} />,
									},
								]}
							/>
						</Panel>
						{paginas.hasNextPage ? (
							<Boton chico disabled={paginas.isFetchingNextPage} onClick={() => void paginas.fetchNextPage()}>
								Ver más
							</Boton>
						) : null}
						{confirmando?.nota != null ? (
							<VentanaConfirmarEntregaNota
								key={confirmando.despacho_id}
								nota={confirmando.nota}
								alCerrar={() => setConfirmando(null)}
							/>
						) : null}
						{confirmando !== null && confirmando.boton === "confirmar_tienda" ? (
							<VentanaConfirmarEntregaTienda
								key={confirmando.despacho_id}
								despacho={confirmando}
								alCerrar={() => setConfirmando(null)}
							/>
						) : null}
					</div>
				);
			}}
		</SegunConsulta>
	);
}
