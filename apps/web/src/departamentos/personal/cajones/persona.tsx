/**
 * El cajón de la persona y el de «Nueva persona»: el encabezado «{E-} · {área}» y el nombre (en el alta, «Personal» y
 * «Nueva persona»); en una persona que existe, sus botones con cifra (días y piezas de esta semana, su PIN del taller y
 * su forma de pago), su baja si está dada de baja, «Entra al sistema» y «Esta semana». Los campos: Nombre completo,
 * Área (y su rol en una tienda), Puesto, Forma de pago, el pago por día (solo con el permiso de sueldos) y la Fecha de
 * ingreso. Botones: «Dar de alta»; en una que existe, «Guardar» y «Dar de baja» (con su ventana); dada de baja,
 * «Reactivar».
 * Fase 19 · docs/interfaz/fabrica/personal.md («La persona y «Nueva persona»», «Ventanas»)
 *
 * El formulario va con React Hook Form y el esquema del contrato de `personal.dar_alta_persona`: lo capturado (el área
 * con su tienda, los pesos por día) se vuelve los datos de la acción y se revisa igual que en la API. Con cambios sin
 * guardar, cerrar el cajón, cambiar de pestaña o salir por el menú pregunta antes.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@tanstack/react-router";
import { centavosACampo, pesosACentavos } from "@uniformame/compartido/calculos/dinero";
import { textoDeMomentoCorto } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import {
	persona as consultaDePersona,
	darAltaPersona,
	darBajaPersona,
	editarPersona,
	formasDePago,
	nombresDeArea,
	nombresDeFormaDePago,
	nombresDeRolDeTienda,
	reactivarPersona,
	rolesDeTienda,
} from "@uniformame/compartido/contratos/personal/personas";
import { Boton } from "@uniformame/interfaz/botones/boton";
import { BotonConCifra } from "@uniformame/interfaz/botones/boton-con-cifra";
import { Campo } from "@uniformame/interfaz/captura/campo";
import { Selector } from "@uniformame/interfaz/captura/selector";
import { Cajon } from "@uniformame/interfaz/contenedores/cajon";
import { EstadoDePantalla } from "@uniformame/interfaz/estados/estado-de-pantalla";
import { Recuadro } from "@uniformame/interfaz/estados/recuadro";
import { LineaDeAviso } from "@uniformame/interfaz/estados/textos-con-tono";
import { Dato } from "@uniformame/interfaz/pagina/dato";
import { Check, Clock, Tablet, Wallet, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { z } from "zod";
import { useConsulta } from "../../../comun/api.tsx";
import { usePreguntarAntesDeSalir } from "../../../comun/cambios-sin-guardar.tsx";
import { erroresEnSusCampos } from "../../../comun/envio.ts";
import { useConConexion } from "../../../comun/estado-de-la-app.ts";
import { SegunConsulta } from "../../../comun/segun-consulta.tsx";
import { useTieneDepartamento } from "../../../comun/tiene-departamento.ts";
import { VentanaConMotivo } from "../../../comun/ventana-con-motivo.tsx";
import { type BusquedaDePersonal, type PestanaDePersonal, useDireccionDePersonal } from "../direccion.ts";
import { useEnvio } from "../envio.ts";

/** Lo que regresa la consulta. */
type Ficha = z.infer<typeof consultaDePersona.resultado>;

/** Lo capturado, como texto: el área es una de las áreas o `tienda:{id}`, y el pago va en pesos. */
const capturado = z.object({
	nombre: z.string(),
	area: z.string(),
	rol_tienda: z.string(),
	puesto: z.string(),
	forma_pago: z.enum(formasDePago),
	pago_dia_centavos: z.string(),
	fecha_ingreso: z.string(),
});

/** Lo capturado. */
type Capturado = z.infer<typeof capturado>;

/**
 * Lo capturado como la ficha de `personal.dar_alta_persona` y `personal.editar_persona`: el área con su tienda, el
 * rol solo en tienda y el pago por día en centavos solo si no es por pieza y la cuenta ve sueldos (sin el permiso no
 * viaja y se conserva).
 * @param veSueldos Si la cuenta ve y cambia el pago por día.
 */
function aFicha(veSueldos: boolean) {
	return (lo: Capturado): z.input<typeof darAltaPersona.entrada> => {
		const enTienda = lo.area.startsWith("tienda:");
		const pago = lo.pago_dia_centavos.trim() === "" ? undefined : (pesosACentavos(lo.pago_dia_centavos) ?? Number.NaN);
		return {
			nombre: lo.nombre,
			area: enTienda ? "tienda" : z.enum(["taller", "oficina", "aduana_bodega"]).catch("taller").parse(lo.area),
			...(enTienda ? { ubicacion_id: lo.area.slice("tienda:".length) } : {}),
			...(enTienda && lo.rol_tienda !== "" ? { rol_tienda: z.enum(rolesDeTienda).parse(lo.rol_tienda) } : {}),
			puesto: lo.puesto,
			forma_pago: lo.forma_pago,
			...(veSueldos && lo.forma_pago !== "pieza" && pago !== undefined ? { pago_dia_centavos: pago } : {}),
			fecha_ingreso: lo.fecha_ingreso,
		};
	};
}

/**
 * Lo capturado al abrir el cajón: lo de la ficha (o los valores del alta).
 * @param ficha Lo que dio la consulta.
 */
function capturaDe(ficha: Ficha): Capturado {
	return {
		nombre: ficha.nombre,
		area: ficha.area === "tienda" && ficha.ubicacion_id !== null ? `tienda:${ficha.ubicacion_id}` : ficha.area,
		rol_tienda: ficha.rol_tienda ?? "",
		puesto: ficha.puesto,
		forma_pago: ficha.forma_pago,
		pago_dia_centavos: centavosACampo(ficha.pago_dia_centavos),
		fecha_ingreso: ficha.fecha_ingreso,
	};
}

/**
 * El nombre del área de la ficha: la tienda con su nombre.
 * @param ficha La ficha.
 */
function nombreDelArea(ficha: Ficha): string {
	if (ficha.area !== "tienda") return nombresDeArea[ficha.area];
	return ficha.tiendas.find((tienda) => tienda.id === ficha.ubicacion_id)?.nombre ?? nombresDeArea.tienda;
}

/**
 * Los botones con cifra de una persona que existe: cada uno lleva a lo suyo solo si la cuenta lo tiene.
 * @param props La ficha y cómo ir a una pestaña de Personal.
 */
function Relacionados({ ficha, irA }: { ficha: Ficha; irA: (pestana: PestanaDePersonal) => void }) {
	const tiene = useTieneDepartamento();
	const router = useRouter();
	const { esta_semana: semana, tablet } = ficha;
	if (semana === null || tablet === null) return null;
	return (
		<div className="flex flex-wrap gap-2">
			<BotonConCifra
				icono={Clock}
				{...(semana.dias === null ? {} : { cifra: semana.dias })}
				texto={semana.dias === null ? "— días esta semana" : "días esta semana"}
				{...(semana.dias === null ? {} : { alTocar: () => irA("pendientes") })}
			/>
			<BotonConCifra
				icono={Workflow}
				{...(semana.piezas === null ? {} : { cifra: semana.piezas })}
				texto={semana.piezas === null ? "— piezas esta semana" : "piezas esta semana"}
				{...(semana.piezas !== null && tiene("produccion")
					? { alTocar: () => router.history.push("/produccion/por-persona") }
					: {})}
			/>
			<BotonConCifra
				icono={Tablet}
				texto={`${tablet.tiene ? "Sí" : "No"} · PIN del taller`}
				{...(tablet.puede ? { alTocar: () => irA("pin") } : {})}
			/>
			<BotonConCifra
				icono={Wallet}
				texto={`${nombresDeFormaDePago[ficha.forma_pago]} · forma de pago`}
				{...(tiene("contaduria") && ficha.ve_sueldos
					? { alTocar: () => router.history.push("/contaduria/nomina") }
					: {})}
			/>
		</div>
	);
}

/**
 * Los campos de la ficha.
 * @param props La ficha y el formulario.
 */
function Campos({
	ficha,
	forma,
}: {
	ficha: Ficha;
	forma: UseFormReturn<Capturado, unknown, z.output<typeof darAltaPersona.entrada>>;
}) {
	const error = (campo: keyof Capturado) => forma.formState.errors[campo]?.message;
	const area = forma.watch("area");
	const formaPago = forma.watch("forma_pago");
	return (
		<div className="flex flex-col gap-3">
			<Campo
				etiqueta="Nombre completo"
				maxLength={40}
				autoComplete="off"
				error={error("nombre")}
				{...forma.register("nombre")}
			/>
			<div className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1">
				<Selector
					etiqueta="Área"
					opciones={[
						{ valor: "taller", texto: nombresDeArea.taller },
						{ valor: "oficina", texto: nombresDeArea.oficina },
						{ valor: "aduana_bodega", texto: nombresDeArea.aduana_bodega },
						...ficha.tiendas.map((tienda) => ({ valor: `tienda:${tienda.id}`, texto: tienda.nombre })),
					]}
					error={error("area")}
					{...forma.register("area")}
				/>
				<Campo
					etiqueta="Puesto"
					maxLength={30}
					autoComplete="off"
					error={error("puesto")}
					{...forma.register("puesto")}
				/>
			</div>
			{area.startsWith("tienda:") ? (
				<Selector
					etiqueta="Rol en la tienda"
					vacio="¿Cajera o encargada?"
					opciones={rolesDeTienda.map((rol) => ({ valor: rol, texto: nombresDeRolDeTienda[rol] }))}
					error={error("rol_tienda")}
					{...forma.register("rol_tienda")}
				/>
			) : null}
			<div className="grid grid-cols-2 gap-3 max-telefono:grid-cols-1">
				<Selector
					etiqueta="Forma de pago"
					opciones={formasDePago.map((forma) => ({ valor: forma, texto: nombresDeFormaDePago[forma] }))}
					error={error("forma_pago")}
					{...forma.register("forma_pago")}
				/>
				<Campo
					etiqueta="Fecha de ingreso"
					type="date"
					max={ficha.id === null ? ficha.fecha_ingreso : undefined}
					error={error("fecha_ingreso")}
					{...forma.register("fecha_ingreso")}
				/>
			</div>
			{formaPago !== "pieza" && ficha.ve_sueldos ? (
				<Campo
					etiqueta={formaPago === "mixta" ? "Base por día" : "Por día"}
					inputMode="decimal"
					maxLength={9}
					autoComplete="off"
					placeholder="$"
					error={error("pago_dia_centavos")}
					{...forma.register("pago_dia_centavos")}
				/>
			) : null}
			{formaPago !== "tiempo" ? (
				<LineaDeAviso tono="info">
					Las piezas llegan de la puerta del taller con la tarifa de cada operación.
				</LineaDeAviso>
			) : null}
		</div>
	);
}

/**
 * Lo que se lee de una persona que existe: por dónde entra y su semana.
 * @param props La ficha.
 */
function DeEstaPersona({ ficha }: { ficha: Ficha }) {
	if (ficha.esta_semana === null) return null;
	const { dias, piezas } = ficha.esta_semana;
	const semana =
		dias !== null ? plural(dias, "día", "días") : piezas !== null ? plural(piezas, "pieza", "piezas") : "—";
	return (
		<section className="grid grid-cols-2 gap-4 max-telefono:grid-cols-1">
			<Dato etiqueta="Entra al sistema">{ficha.entra_al_sistema ?? "—"}</Dato>
			<Dato etiqueta="Esta semana">{semana}</Dato>
		</section>
	);
}

/**
 * El cajón con la ficha ya leída.
 * @param props La ficha y cómo cerrar el cajón.
 */
function CajonConFicha({ ficha, alCerrar }: { ficha: Ficha; alCerrar: () => void }) {
	const conConexion = useConConexion();
	const { navegar } = useDireccionDePersonal();
	const alta = useEnvio(darAltaPersona);
	const edicion = useEnvio(editarPersona);
	const baja = useEnvio(darBajaPersona);
	const reactivacion = useEnvio(reactivarPersona);
	const [ventanaDeBaja, setVentanaDeBaja] = useState(false);
	// A dónde ir cuando ya no hay cambios que preguntar (después de guardar).
	const [destino, setDestino] = useState<{ cambios: Partial<BusquedaDePersonal>; pestana?: PestanaDePersonal } | null>(
		null,
	);
	const forma = useForm<Capturado, unknown, z.output<typeof darAltaPersona.entrada>>({
		resolver: zodResolver(capturado.transform(aFicha(ficha.ve_sueldos)).pipe(darAltaPersona.entrada)),
		defaultValues: capturaDe(ficha),
	});
	const conCambios = forma.formState.isDirty && destino === null;
	const pregunta = usePreguntarAntesDeSalir(conCambios);
	useEffect(() => {
		if (destino !== null && !conCambios) navegar(destino.cambios, destino.pestana);
	}, [destino, conCambios, navegar]);
	const existe = ficha.id !== null && ficha.version !== null;
	const deBaja = ficha.baja_en !== null;
	const enviando = alta.enviando || edicion.enviando || baja.enviando || reactivacion.enviando;
	// La tienda va dentro del área.
	const alFallar = (falla: { campos: Record<string, string> }) =>
		erroresEnSusCampos(falla.campos, forma, { ubicacion_id: "area" });
	const guardar = forma.handleSubmit(async (datos) => {
		if (ficha.id === null || ficha.version === null) {
			const salio = await alta.enviar({ datos }, alFallar);
			if (salio !== undefined) {
				setDestino({
					cambios: { cajon: undefined, id: undefined, area: undefined, resaltar: salio.persona_id },
					pestana: "personas",
				});
			}
			return;
		}
		const salio = await edicion.enviar({ datos: { persona_id: ficha.id, ...datos }, version: ficha.version }, alFallar);
		if (salio !== undefined) forma.reset(forma.getValues());
	});
	const reactivar = async () => {
		if (ficha.id === null || ficha.version === null) return;
		const fecha = forma.getValues("fecha_ingreso");
		await reactivacion.enviar({
			datos: { persona_id: ficha.id, ...(fecha !== ficha.fecha_ingreso ? { fecha_ingreso: fecha } : {}) },
			version: ficha.version,
		});
	};
	const choco = edicion.choco || baja.choco || reactivacion.choco;
	return (
		<>
			<Cajon
				abierto
				alCerrar={alCerrar}
				contexto={existe ? `${ficha.folio ?? ""} · ${nombreDelArea(ficha)}` : "Personal"}
				titulo={existe ? ficha.nombre : "Nueva persona"}
				relacionados={
					existe ? (
						<Relacionados ficha={ficha} irA={(pestana) => navegar({ cajon: undefined, id: undefined }, pestana)} />
					) : undefined
				}
				pieIzquierda={
					existe && !deBaja ? (
						<span className="flex gap-2">
							<Boton variante="fantasma" onClick={alCerrar}>
								Cerrar
							</Boton>
							<Boton variante="peligro" disabled={!conConexion || enviando} onClick={() => setVentanaDeBaja(true)}>
								Dar de baja
							</Boton>
						</span>
					) : undefined
				}
				accion={
					<span className="flex gap-2">
						{deBaja ? (
							<Boton disabled={!conConexion || enviando} onClick={() => void reactivar()}>
								Reactivar
							</Boton>
						) : null}
						<Boton
							variante="principal"
							icono={Check}
							disabled={!conConexion || enviando}
							onClick={() => void guardar()}
						>
							{existe ? "Guardar" : "Dar de alta"}
						</Boton>
					</span>
				}
			>
				<form className="flex flex-col gap-5" onSubmit={(evento) => void guardar(evento)}>
					{choco ? <EstadoDePantalla tipo="choque" documento={ficha.nombre} /> : null}
					{deBaja && ficha.baja_en !== null ? (
						<Recuadro color="ambar">{`Dada de baja el ${textoDeMomentoCorto(new Date(ficha.baja_en).toISOString())}: ${ficha.motivo_baja ?? ""}`}</Recuadro>
					) : null}
					<Campos ficha={ficha} forma={forma} />
					<DeEstaPersona ficha={ficha} />
					<LineaDeAviso tono="info">Ver tarifas y sueldos queda en la bitácora</LineaDeAviso>
				</form>
			</Cajon>
			{ventanaDeBaja && existe ? (
				<VentanaConMotivo
					titulo={`Dar de baja a ${ficha.nombre}`}
					textoAccion="Dar de baja"
					enviando={baja.enviando}
					alCerrar={() => setVentanaDeBaja(false)}
					alConfirmar={async (motivo) => {
						if (ficha.id === null || ficha.version === null) return undefined;
						let error: string | undefined;
						const salio = await baja.enviar(
							{ datos: { persona_id: ficha.id, motivo }, version: ficha.version },
							(falla) => {
								error = falla.campos.motivo ?? falla.mensaje;
							},
						);
						if (salio !== undefined) setVentanaDeBaja(false);
						return error;
					}}
				>
					<LineaDeAviso tono="info">No se borra: su producción y sus pagos se conservan.</LineaDeAviso>
				</VentanaConMotivo>
			) : null}
			{pregunta}
		</>
	);
}

/**
 * El cajón de una persona, o el del alta si no hay persona.
 * @param props La persona (o nada, en el alta) y cómo cerrar el cajón.
 */
export function CajonPersona({ personaId, alCerrar }: { personaId: string | undefined; alCerrar: () => void }) {
	const consulta = useConsulta(consultaDePersona, personaId === undefined ? {} : { persona_id: personaId });
	if (consulta.data !== undefined) {
		// Lo capturado se queda aunque llegue otra versión (un choque): la ficha nueva solo trae su versión y sus datos.
		return <CajonConFicha key={consulta.data.id ?? "nueva"} ficha={consulta.data} alCerrar={alCerrar} />;
	}
	return (
		<Cajon abierto alCerrar={alCerrar} contexto="Personal" titulo={personaId === undefined ? "Nueva persona" : ""}>
			<SegunConsulta consulta={consulta}>{() => null}</SegunConsulta>
		</Cajon>
	);
}
