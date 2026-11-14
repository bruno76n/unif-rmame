/**
 * La base local de la tablet, en IndexedDB con Dexie: una tabla por cada tabla que le baja (tal como la manda el
 * servidor, con sus columnas), la cola de lo que falta subir, el estado de su sincronización, su aparato con su llave
 * cifrada, la llave de cifrado (que el navegador no deja exportar) y los intentos de PIN de cada persona.
 * Fase 20 · docs/apps/tablet.md («La copia local», «El registro» y «El PIN sin internet»)
 *
 * Lo que nace en la tablet y todavía no regresa del servidor lleva `_local`: «guardada» mientras espera respuesta,
 * «apartado» si el servidor lo apartó. Un renglón que baja del servidor lo reemplaza entero. Un cambio en la forma de
 * esta base sube su versión, con su migración.
 */

import { Dexie, type Table } from "dexie";

/** Las tablas que bajan a la tablet, con sus índices además del `id`. */
export const tablasQueBajan = {
	tallas: "",
	productos: "",
	variantes: "producto_id",
	materiales: "",
	motivos_falla: "",
	maquinas: "persona_id",
	fallas: "maquina_id",
	personas: "",
	pines: "persona_id",
	tarifas_operacion: "flujo_operacion_id",
	operaciones: "",
	flujos: "",
	flujo_operaciones: "flujo_id, persona_base_id",
	lotes: "estado",
	lote_tallas: "lote_id",
	bultos: "folio_mayusculas, lote_id",
	registros_operacion: "bulto_id, persona_id, lote_id",
	parametros: "clave",
	dispositivos: "",
} as const;

/** El nombre de una tabla que baja. */
export type TablaQueBaja = keyof typeof tablasQueBajan;

/** Cómo terminó en el servidor lo que nació en la tablet: espera respuesta, o se apartó. */
export type MarcaLocal = "guardada" | "apartado";

/** Un renglón de una tabla que baja: su id y sus columnas, tal como las manda el servidor. */
export interface Renglon {
	id: string;
	/** Solo en lo que nació en la tablet y todavía no regresa del servidor. */
	_local?: MarcaLocal;
	[columna: string]: unknown;
}

/** Un comando de la cola: lo que falta subir, en el orden en que pasó. */
export interface ComandoEnCola {
	/** El orden en que pasó; lo pone Dexie. */
	orden?: number;
	clave_idempotencia: string;
	accion: string;
	datos: Record<string, unknown>;
	ocurrido_en: string;
	persona_id?: string;
	/** Los renglones locales que nacieron con el comando, para marcarlos con su respuesta. */
	renglones: { tabla: TablaQueBaja; id: string }[];
}

/** Un texto cifrado con AES-GCM: su vector y sus bytes. */
export interface Cifrado {
	iv: Uint8Array;
	datos: ArrayBuffer;
}

/** El aparato registrado: lo que regresó el canje, con su secreto cifrado. */
export interface AparatoRegistrado {
	id: "aparato";
	dispositivo_id: string;
	folio: string;
	ubicacion_id: string | null;
	llave_id: string;
	secreto: Cifrado;
	/** Mientras cambia su llave: el secreto nuevo, hasta saber si se aplicó. */
	secreto_nuevo?: Cifrado;
}

/** Un dato del estado de la sincronización: el cursor, el estado del aparato, la última bajada. */
export interface DatoDeSincronizacion {
	clave: string;
	valor: unknown;
}

/** Los intentos equivocados de PIN de una persona, y cuándo la bloqueó la tablet. */
export interface IntentosDePin {
	persona_id: string;
	intentos: number;
	bloqueado_en?: string;
}

/** La base local de la tablet. */
export class BaseDeLaTablet extends Dexie {
	cola!: Table<ComandoEnCola, number>;
	sincronizacion!: Table<DatoDeSincronizacion, string>;
	aparato!: Table<AparatoRegistrado, string>;
	llaves!: Table<{ id: string; llave: CryptoKey }, string>;
	intentos_pin!: Table<IntentosDePin, string>;

	/**
	 * Abre la base.
	 * @param nombre Su nombre en IndexedDB.
	 */
	constructor(nombre = "puerta-del-taller") {
		super(nombre);
		const indices: Record<string, string> = {};
		for (const [tabla, extra] of Object.entries(tablasQueBajan)) indices[tabla] = extra === "" ? "id" : `id, ${extra}`;
		this.version(1).stores({
			...indices,
			cola: "++orden, &clave_idempotencia",
			sincronizacion: "clave",
			aparato: "id",
			llaves: "id",
			intentos_pin: "persona_id",
		});
	}

	/**
	 * Una tabla que baja, por su nombre.
	 * @param tabla Su nombre.
	 */
	copia(tabla: TablaQueBaja): Table<Renglon, string> {
		return this.table(tabla);
	}
}

/** La base de la tablet: una sola por pestaña. */
export const base = new BaseDeLaTablet();

/**
 * Si un nombre es de una tabla que baja.
 * @param tabla El nombre que mandó el servidor.
 */
export function esTablaQueBaja(tabla: string): tabla is TablaQueBaja {
	return Object.hasOwn(tablasQueBajan, tabla);
}
