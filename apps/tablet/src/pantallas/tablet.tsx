/**
 * La Puerta del taller: según el estado del aparato, «Registrar esta tablet», «Preparando la tablet…», la revocada o la
 * de actualizar; ya lista, «¿Quién eres?», el PIN y, con alguien adentro, su inicio y cada paso a pantalla completa. Lee
 * solo de su copia y todo lo que escribe va por su cola: el aviso de abajo dice si se registró o si se guardó en la
 * tablet para mandarse al volver el internet. Sin tocar la pantalla `personal.tablet_inactividad_seg`, la sesión se
 * cierra sola.
 * Fase 20 · docs/interfaz/tablet.md
 */

import { diaDeNegocio } from "@uniformame/compartido/calculos/fechas";
import { plural } from "@uniformame/compartido/calculos/textos";
import { Aviso } from "@uniformame/interfaz/estados/aviso";
import { MarcoDeTablet } from "@uniformame/interfaz/tablet/marco";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Temporal } from "temporal-polyfill";
import { registrarOperacion, reportarFalla, tomarConsumible } from "../cola/capturas.ts";
import type { BaseDeLaTablet } from "../copia/base.ts";
import { esquemas } from "../copia/esquemas.ts";
import {
	bultosParaTi,
	consumibles,
	leerTaller,
	type MaquinaDeLaTablet,
	maquinasDe,
	motivosDeFalla,
	type PersonaConPin,
	pasosDelBulto,
	personasConPin,
	prendaYTalla,
	produccionDe,
	tarifaDe,
} from "../copia/lecturas.ts";
import { parametroEntero } from "../copia/parametros.ts";
import { buscarBulto } from "../lector/lector.ts";
import { estaBloqueada, revisarPin } from "../pin/pin.ts";
import { registrarTablet } from "../registro/registro.ts";
import type { Conexion } from "../sincronizacion/api.ts";
import type { MotorDeLaTablet } from "../sincronizacion/motor.ts";
import { Actualizar, Preparando, RegistrarTablet, Revocada } from "./aparato.tsx";
import { QueTomas } from "./consumible.tsx";
import { QuienEres, TuPin } from "./entrada.tsx";
import { Escanear } from "./escanear.tsx";
import { QueLePasa, QueMaquina } from "./falla.tsx";
import { useCopia, useEstadoDelMotor, useHora, useInactividad } from "./ganchos.ts";
import { Inicio } from "./inicio.tsx";
import { Registrar } from "./registrar.tsx";

/** Dónde está la persona. */
type Paso =
	| { pantalla: "inicio" }
	| { pantalla: "registrar"; bultoId: string; flujoOperacionId: string }
	| { pantalla: "escanear" }
	| { pantalla: "maquinas" }
	| { pantalla: "motivos"; maquina: MaquinaDeLaTablet }
	| { pantalla: "consumibles" };

/** Lo que recibe la tablet. */
export interface PropsDeLaTablet {
	base: BaseDeLaTablet;
	conexion: Conexion;
	motor: MotorDeLaTablet;
	/** Aplica la versión nueva («Actualizar»). */
	alActualizar: () => void;
}

/**
 * La tablet entera.
 * @param props Su base, su conexión, su motor y cómo actualizarse.
 */
export function Tablet({ base, conexion, motor, alActualizar }: PropsDeLaTablet) {
	const estado = useEstadoDelMotor(motor);
	const hora = useHora();
	const [persona, setPersona] = useState<PersonaConPin | null>(null);
	const [escogida, setEscogida] = useState<PersonaConPin | null>(null);
	const [paso, setPaso] = useState<Paso>({ pantalla: "inicio" });
	const [aviso, setAviso] = useState<{ texto: string; como: "bien" | "no_se_pudo" } | null>(null);
	const lista = estado.aparato === "lista";
	const inactividad = useCopia(
		() => (lista ? parametroEntero(base, "personal.tablet_inactividad_seg") : Promise.resolve(undefined)),
		[lista],
	);
	const salir = useCallback(() => {
		setPersona(null);
		setEscogida(null);
		setPaso({ pantalla: "inicio" });
	}, []);
	useInactividad(persona !== null, inactividad, salir);

	// Lo que mandó al volver el internet se dice una vez.
	useEffect(() => {
		if (estado.enviadasAlVolver === 0) return;
		setAviso({
			texto: `${plural(estado.enviadasAlVolver, "captura enviada", "capturas enviadas")} al volver el internet`,
			como: "bien",
		});
		motor.avisoVisto();
	}, [estado.enviadasAlVolver, motor]);

	/** Después de guardar: vuelve a contar la cola, intenta subir y regresa al inicio con su aviso. */
	const guardado = async (conInternet: string, sinInternet: string) => {
		await motor.refrescar();
		void motor.sincronizar();
		setAviso(estado.conectada ? { texto: conInternet, como: "bien" } : { texto: sinInternet, como: "no_se_pudo" });
		setPaso({ pantalla: "inicio" });
	};

	const textoDeLaRed = estado.conectada
		? "Conectada"
		: `Sin internet${
				estado.pendientes === 0 ? "" : ` · ${plural(estado.pendientes, "captura guardada", "capturas guardadas")} aquí`
			}`;
	const marco = (contenido: ReactNode) => (
		<MarcoDeTablet
			conectada={estado.conectada}
			textoDeLaRed={textoDeLaRed}
			hora={hora}
			{...(persona === null
				? {}
				: { persona: { nombre: persona.nombre.split(" ")[0] ?? persona.nombre, iniciales: persona.iniciales } })}
			alSalir={salir}
		>
			{contenido}
			{aviso === null ? null : <Aviso texto={aviso.texto} como={aviso.como} alCerrar={() => setAviso(null)} />}
		</MarcoDeTablet>
	);

	if (estado.aparato === "sin_registro") {
		return marco(
			<RegistrarTablet
				alRegistrar={async (codigo) => {
					const registro = await registrarTablet(base, conexion, codigo);
					if (!registro.registrada) return registro.mensaje;
					await motor.refrescar();
					void motor.sincronizar();
					return null;
				}}
			/>,
		);
	}
	if (estado.aparato === "preparando") return marco(<Preparando renglones={estado.avanceDeLaFoto} />);
	if (estado.aparato === "revocada") return marco(<Revocada pendientes={estado.pendientes} />);
	if (estado.aparato === "actualizar") return marco(<Actualizar alActualizar={alActualizar} />);
	if (persona === null) {
		return marco(
			escogida === null ? (
				<Personas base={base} alEscoger={setEscogida} />
			) : (
				<TuPin
					persona={escogida}
					revisar={async (pin) => {
						const revision = await revisarPin(base, escogida.id, pin);
						if (revision.resultado === "bloqueado") await motor.refrescar();
						return revision;
					}}
					alEntrar={() => setPersona(escogida)}
					alRegresar={() => setEscogida(null)}
				/>
			),
		);
	}
	return marco(
		<Pasos
			base={base}
			persona={persona}
			paso={paso}
			irA={setPaso}
			sinInternet={!estado.conectada}
			alGuardar={guardado}
		/>,
	);
}

/**
 * «¿Quién eres?», con las personas de la copia.
 * @param props La base y qué hacer al escoger.
 */
function Personas({ base, alEscoger }: { base: BaseDeLaTablet; alEscoger: (persona: PersonaConPin) => void }) {
	const personas = useCopia(() => personasConPin(base, (pin) => estaBloqueada(base, pin)), []);
	return personas === undefined ? null : <QuienEres personas={personas} alEscoger={alEscoger} />;
}

/**
 * Lo de la persona adentro: su inicio y cada paso.
 * @param props La base, la persona, el paso, cómo moverse, si hay internet y qué hacer después de guardar.
 */
function Pasos({
	base,
	persona,
	paso,
	irA,
	sinInternet,
	alGuardar,
}: {
	base: BaseDeLaTablet;
	persona: PersonaConPin;
	paso: Paso;
	irA: (paso: Paso) => void;
	sinInternet: boolean;
	alGuardar: (conInternet: string, sinInternet: string) => Promise<void>;
}) {
	const ahora = Temporal.Now.instant();
	const inicio = useCopia(
		async () => ({
			produccion: await produccionDe(base, persona.id, ahora),
			bultos: await bultosParaTi(base, persona.id, ahora),
		}),
		[persona.id, paso.pantalla],
	);
	const taller = useCopia(() => leerTaller(base), [paso.pantalla]);
	const maquinas = useCopia(() => maquinasDe(base, persona.id), [persona.id, paso.pantalla]);
	const motivos = useCopia(() => motivosDeFalla(base), []);
	const deConsumibles = useCopia(
		async () => ({
			lista: await consumibles(base),
			maximo: await parametroEntero(base, "produccion.consumible_max_por_vez"),
		}),
		[],
	);
	const tarifas = useCopia(async () => {
		const hoy = diaDeNegocio(Temporal.Now.instant());
		const todas = new Map<string, number | null | undefined>();
		for (const pasoDelFlujo of (await leerTaller(base)).pasos)
			todas.set(pasoDelFlujo.id, await tarifaDe(base, pasoDelFlujo.id, hoy));
		return todas;
	}, []);

	if (paso.pantalla === "registrar") {
		const bulto = taller?.bultos.find((suyo) => suyo.id === paso.bultoId);
		const lote = taller?.lotes.find((suyo) => suyo.id === bulto?.lote_id);
		if (taller === undefined || bulto === undefined || lote === undefined) return null;
		return (
			<Registrar
				key={`${paso.bultoId}:${paso.flujoOperacionId}`}
				bulto={{
					folio: bulto.folio,
					prendaYTalla: prendaYTalla(taller, bulto),
					deQuien: `${lote.para_quien ?? ""} · ${lote.folio}`,
					pasos: pasosDelBulto(taller, bulto),
				}}
				flujoOperacionId={paso.flujoOperacionId}
				personaId={persona.id}
				tarifaDe={(flujoOperacionId) => tarifas?.get(flujoOperacionId)}
				alVolver={() => irA({ pantalla: "inicio" })}
				alRegistrar={(registro) => {
					const operacion = pasosDelBulto(taller, bulto).find(
						(suyo) => suyo.flujoOperacionId === registro.flujoOperacionId,
					);
					const danadas = registro.danadas === 0 ? "" : `, ${registro.danadas} dañadas`;
					void registrarOperacion(base, {
						personaId: persona.id,
						bultoId: bulto.id,
						loteId: lote.id,
						flujoOperacionId: registro.flujoOperacionId,
						buenas: registro.buenas,
						danadas: registro.danadas,
						sinInternet,
					}).then(() =>
						alGuardar(
							`${registro.buenas} de ${operacion?.operacion ?? ""} registradas en ${bulto.folio}${danadas}`,
							`${registro.buenas} de ${operacion?.operacion ?? ""} guardadas en la tablet. Se envían al volver el internet`,
						),
					);
				}}
			/>
		);
	}
	if (paso.pantalla === "escanear") {
		return (
			<Escanear
				alVolver={() => irA({ pantalla: "inicio" })}
				alLeer={async (codigo) => {
					const busqueda = await buscarBulto(base, codigo);
					if (!busqueda.encontrado)
						return busqueda.motivo === "no_es_bulto"
							? "Esa etiqueta no es de un bulto"
							: "No hay un bulto con ese código";
					const pasos = pasosDelBulto(await leerTaller(base), esquemas.bultos.parse(busqueda.bulto)).filter(
						(suyo) => suyo.tope > 0,
					);
					// Primero la operación de base de la persona; si no tiene, la primera con piezas listas.
					const elegido = pasos.find((suyo) => suyo.personaBaseId === persona.id) ?? pasos[0];
					if (elegido === undefined) return "Ese bulto ya pasó todas sus operaciones";
					irA({ pantalla: "registrar", bultoId: busqueda.bulto.id, flujoOperacionId: elegido.flujoOperacionId });
					return null;
				}}
			/>
		);
	}
	if (paso.pantalla === "maquinas") {
		return maquinas === undefined ? null : (
			<QueMaquina
				maquinas={maquinas}
				alVolver={() => irA({ pantalla: "inicio" })}
				alEscoger={(maquina) => irA({ pantalla: "motivos", maquina })}
			/>
		);
	}
	if (paso.pantalla === "motivos") {
		const { maquina } = paso;
		return (
			<QueLePasa
				maquina={maquina}
				motivos={motivos ?? []}
				alOtra={() => irA({ pantalla: "maquinas" })}
				alEscoger={(motivo) => {
					void reportarFalla(base, {
						personaId: persona.id,
						maquinaId: maquina.id,
						motivoId: motivo.id,
						sinInternet,
					}).then(() =>
						alGuardar(
							`Falla de ${maquina.nombre} enviada a Mantenimiento: ${motivo.nombre.toLowerCase()}`,
							`Falla de ${maquina.nombre} guardada en la tablet; llega a Mantenimiento al volver el internet`,
						),
					);
				}}
			/>
		);
	}
	if (paso.pantalla === "consumibles") {
		return deConsumibles === undefined ? null : (
			<QueTomas
				consumibles={deConsumibles.lista.map((material) => ({
					id: material.id,
					nombre: material.nombre,
					// Sin unidad de la tablet, se toma en su unidad de inventario.
					unidad: material.unidad_tablet ?? material.unidad,
				}))}
				maximo={deConsumibles.maximo}
				alVolver={() => irA({ pantalla: "inicio" })}
				alTomar={(tomados) => {
					const textos = tomados.map((tomado) => `${tomado.cantidad} ${tomado.consumible.unidad}`);
					const lista =
						textos.length === 1 ? (textos[0] ?? "") : `${textos.slice(0, -1).join(", ")} y ${textos.at(-1)}`;
					const texto = `Tomaste ${lista}. Se descuenta del taller`;
					void tomarConsumible(base, {
						personaId: persona.id,
						renglones: tomados.map((tomado) => ({ materialId: tomado.consumible.id, cantidad: tomado.cantidad })),
					}).then(() => alGuardar(texto, texto));
				}}
			/>
		);
	}
	return inicio === undefined ? null : (
		<Inicio
			produccion={inicio.produccion}
			bultos={inicio.bultos}
			alEscanear={() => irA({ pantalla: "escanear" })}
			alFalla={() => irA({ pantalla: "maquinas" })}
			alConsumible={() => irA({ pantalla: "consumibles" })}
			alAbrirBulto={(bulto) =>
				irA({ pantalla: "registrar", bultoId: bulto.bultoId, flujoOperacionId: bulto.flujoOperacionId })
			}
		/>
	);
}
