/**
 * Los contratos del módulo de prueba.
 * Fase 3 · docs/fases/03-api-protocolo-e-idempotencia.md («Cómo se construye»)
 */

import { definirAccion, definirConsulta, paginaDe, parametrosDePagina } from "@uniformame/compartido/contratos/definir";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";

/** Crea una nota; con `con_pin`, entrega un PIN que es secreto; con `fallar`, falla en ese paso. */
export const crearNota = definirAccion({
	nombre: "prueba.crear_nota",
	descripcion: "Crea una nota de prueba",
	entrada: z.object({
		texto: z.string().min(1, "Escribe el texto").describe("El texto de la nota"),
		monto_centavos: z.number().int().nonnegative().describe("Un monto, en centavos"),
		con_pin: z.boolean().optional().describe("Si entrega un PIN"),
		fallar: z
			.enum([
				"despues_de_la_interna",
				"con_regla",
				"con_choque_una_vez",
				"campo_de_mas",
				"secreto_en_aviso",
				"evento_con_monto",
				"sin_bitacora",
			])
			.optional()
			.describe("Dónde falla, para las pruebas"),
	}),
	salida: z.object({
		id: z.uuid().describe("El id de la nota"),
		pin: z.string().optional().describe("Un PIN que se entrega una sola vez"),
	}),
	permiso: { departamento: "ventas" },
	errores: [{ codigo: "texto_prohibido", mensaje: "Ese texto no se puede guardar" }],
	secretos: ["pin"],
});

/** Cambia el texto de una nota que ya existe. */
export const editarNota = definirAccion({
	nombre: "prueba.editar_nota",
	descripcion: "Cambia el texto de una nota",
	entrada: z.object({
		id: z.uuid().describe("La nota"),
		texto: z.string().min(1, "Escribe el texto").describe("El texto nuevo"),
	}),
	salida: z.object({}),
	permiso: { departamento: "ventas" },
	edita: true,
});

/** Agrega un renglón a una nota: sube la versión de la nota. */
export const agregarRenglon = definirAccion({
	nombre: "prueba.agregar_renglon",
	descripcion: "Agrega un renglón a una nota",
	entrada: z.object({
		nota_id: z.uuid().describe("La nota"),
		cantidad: z.number().int().positive().describe("Cuántas piezas"),
	}),
	salida: z.object({}),
	permiso: { departamento: "ventas" },
	edita: true,
});

/** Las notas, de 2 en 2 a lo más por página; el monto solo lo ve quien tiene `ven_montos`. */
export const listarNotas = definirConsulta({
	nombre: "prueba.notas",
	descripcion: "Las notas, por página",
	entrada: z.object(parametrosDePagina(2)),
	salida: z.object(
		paginaDe(
			z.object({
				id: z.uuid().describe("La nota"),
				texto: z.string().describe("Su texto"),
				monto_centavos: z.number().int().optional().describe("Su monto; se recorta sin ven_montos"),
			}),
		),
	),
	permiso: { departamento: "ventas" },
	recortables: ["monto_centavos"],
});

/** Una nota; las que empiezan con «privada» solo las ve la dueña: a las demás les responde 404. */
export const verNota = definirConsulta({
	nombre: "prueba.nota",
	descripcion: "Una nota",
	entrada: z.object({ id: z.uuid().describe("La nota") }),
	salida: z.object({
		id: z.uuid().describe("La nota"),
		texto: z.string().describe("Su texto"),
		version: z.number().int().describe("Su versión"),
	}),
	permiso: { departamento: "ventas" },
});

/** Pide «Confirmar con Google» y ser la dueña, para probar el 401 reautenticar y el 403 solo_duena. */
export const confirmar = definirAccion({
	nombre: "prueba.confirmar",
	descripcion: "Una acción que pide confirmar con Google",
	entrada: z.object({}),
	salida: z.object({}),
	permiso: { soloDuena: true, confirmarConGoogle: "probar la confirmación" },
});

/** Lanza el error que se le pide, para probar la forma de cada error de la tabla. */
export const provocar = definirAccion({
	nombre: "prueba.provocar",
	descripcion: "Lanza un error de la tabla",
	entrada: z.object({
		error: z
			.enum(["demasiados_intentos", "no_disponible", "interno", "base", "conflicto_con_monto", "regla_con_monto"])
			.describe("El error que lanza"),
		valor: z.string().optional().describe("Un valor que lleva la consulta que falla en la base"),
	}),
	salida: z.object({}),
	permiso: { departamento: "ventas" },
});

/** Edita sin tomar su versión: el corredor no la deja guardar. */
export const editarSinVersion = definirAccion({
	nombre: "prueba.editar_sin_version",
	descripcion: "Una acción que edita y se olvida de tomar su versión",
	entrada: z.object({ id: z.uuid().describe("La nota") }),
	salida: z.object({}),
	permiso: { departamento: "ventas" },
	edita: true,
});

/** Pide el permiso fino `ven_montos`. */
export const verMontos = definirAccion({
	nombre: "prueba.ver_montos",
	descripcion: "Una acción con permiso fino",
	entrada: z.object({}),
	salida: z.object({}),
	permiso: { departamento: "ventas", permisoFino: "ven_montos" },
});

/**
 * Una consulta que hace trampa: manda el monto y dice que lo recortó o, con `fuera`, dice que recortó un
 * campo que su contrato no deja recortar.
 */
export const trampa = definirConsulta({
	nombre: "prueba.trampa",
	descripcion: "Una consulta que manda lo que dice que recortó",
	entrada: z.object({ fuera: z.enum(["si"]).optional().describe("Recorta un campo que no es recortable") }),
	salida: z.object({ monto_centavos: z.number().int().optional().describe("Un monto") }),
	permiso: { departamento: "ventas" },
	recortables: ["monto_centavos"],
});

/** Una acción que responde con un monto, para ver que el recorte común también le quita los montos a soporte. */
export const conMonto = definirAccion({
	nombre: "prueba.con_monto",
	descripcion: "Una acción que responde con un monto",
	entrada: z.object({}),
	salida: z.object({ total_centavos: z.number().int().optional().describe("Un monto") }),
	permiso: { departamento: "ventas" },
});

/**
 * Una consulta que no recorta su monto ni su sueldo, como un módulo que lo olvidara: el recorte común del
 * servidor se los quita a quien no los ve.
 */
export const sinRecorte = definirConsulta({
	nombre: "prueba.sin_recorte",
	descripcion: "Una consulta que manda un monto y un sueldo sin recortarlos",
	entrada: z.object({}),
	salida: z.object({
		texto: z.string().describe("Un texto"),
		monto_centavos: z.number().int().optional().describe("Un monto"),
		renglones: z
			.array(z.object({ pago_dia_centavos: z.number().int().optional().describe("Un sueldo") }))
			.describe("Renglones con sueldo"),
	}),
	permiso: { departamento: "ventas" },
});

/** Recibe un día de negocio que el contrato transforma en `Temporal.PlainDate`, como lo harán los módulos. */
export const fechar = definirAccion({
	nombre: "prueba.fechar",
	descripcion: "Una acción con una fecha que el contrato transforma",
	entrada: z.object({
		dia: z.iso
			.date()
			.transform((texto) => Temporal.PlainDate.from(texto))
			.describe("Un día de negocio"),
	}),
	salida: z.object({ dia_siguiente: z.string().describe("El día siguiente") }),
	permiso: { departamento: "ventas" },
});

/** Una consulta sensible: la ficha de una nota, que se apunta en la bitácora. */
export const ficha = definirConsulta({
	nombre: "prueba.ficha",
	descripcion: "La ficha de una nota; consultarla se apunta en la bitácora",
	entrada: z.object({ id: z.uuid().describe("La nota") }),
	salida: z.object({ texto: z.string().describe("El texto") }),
	permiso: { departamento: "ventas" },
});

/** Adjunta un comprobante a una nota, con `admin.ligar_archivo`. */
export const adjuntar = definirAccion({
	nombre: "prueba.adjuntar",
	descripcion: "Adjunta un comprobante ya subido a una nota",
	entrada: z.object({ nota_id: z.uuid().describe("La nota"), archivo_id: z.uuid().describe("El archivo subido") }),
	salida: z.object({}),
	permiso: { departamento: "ventas" },
});

/** Imprime etiquetas de prueba en la impresora de una ubicación, con `admin.mandar_a_imprimir`. */
export const imprimir = definirAccion({
	nombre: "prueba.imprimir",
	descripcion: "Imprime etiquetas de prueba de unas notas",
	entrada: z.object({
		ubicacion_id: z.uuid().describe("La ubicación de la impresora"),
		ids: z.array(z.uuid()).describe("Las notas"),
		copias: z.number().int().describe("Las copias"),
	}),
	salida: z.object({ trabajo_id: z.uuid().describe("El trabajo") }),
	permiso: { departamento: "ventas" },
	errores: [{ codigo: "impresora_sin_puente", mensaje: "La impresora no está conectada. Usa el PDF." }],
});

/** Marca dos notas a la vez: deja un renglón de bitácora por nota, con el mismo comando. */
export const marcarDos = definirAccion({
	nombre: "prueba.marcar_dos",
	descripcion: "Marca dos notas; un renglón de bitácora por cada una",
	entrada: z.object({ ids: z.array(z.uuid()).length(2).describe("Las dos notas") }),
	salida: z.object({}),
	permiso: { departamento: "ventas" },
});

/** La tablet (o Ventas) abre un lote en su ubicación, con el id que hizo el aparato. */
export const abrirLote = definirAccion({
	nombre: "prueba.abrir_lote",
	descripcion: "Abre un lote de prueba",
	entrada: z.object({ id: z.uuid().describe("El lote"), nombre: z.string().min(1).describe("Su nombre") }),
	salida: z.object({ folio: z.string().describe("Su folio: el nombre del lote") }),
	permiso: { departamento: "ventas", aparatos: ["tablet"], cola: true },
});

/** La tablet registra un bulto de un lote: si el lote no ha llegado, espera; con más de 100 piezas, no cuadra. */
export const registrarBulto = definirAccion({
	nombre: "prueba.registrar_bulto",
	descripcion: "Registra un bulto de un lote",
	entrada: z.object({
		id: z.uuid().describe("El bulto"),
		lote_id: z.uuid().describe("Su lote"),
		piezas: z.number().int().positive().describe("Sus piezas"),
	}),
	salida: z.object({}),
	permiso: { aparatos: ["tablet"], cola: true },
	errores: [{ codigo: "lote_cerrado", mensaje: "Ese lote ya se cerró." }],
});

/** La tablet cancela un bulto: si ya se atendió, se cancela igual y abre la excepción de cancelación tardía. */
export const cancelarBulto = definirAccion({
	nombre: "prueba.cancelar_bulto",
	descripcion: "Cancela un bulto",
	entrada: z.object({ bulto_id: z.uuid().describe("El bulto") }),
	salida: z.object({}),
	permiso: { aparatos: ["tablet"], cola: true },
});

/** Ventas atiende un bulto. */
export const atenderBulto = definirAccion({
	nombre: "prueba.atender_bulto",
	descripcion: "Atiende un bulto",
	entrada: z.object({ bulto_id: z.uuid().describe("El bulto") }),
	salida: z.object({}),
	permiso: { departamento: "ventas" },
});

/** Ventas cierra un lote: sus bultos dejan de bajar, así que también se tocan (filtro en otra tabla). */
export const cerrarLote = definirAccion({
	nombre: "prueba.cerrar_lote",
	descripcion: "Cierra un lote",
	entrada: z.object({ lote_id: z.uuid().describe("El lote") }),
	salida: z.object({}),
	permiso: { departamento: "ventas" },
});

/** Contaduría (aquí, Ventas) pide a Dirección un pago fuera de lo normal de prueba: el tipo que su módulo aún no tiene. */
export const pedirAprobacion = definirAccion({
	nombre: "prueba.pedir_aprobacion",
	descripcion: "Pide a Dirección autorizar un pago de prueba",
	entrada: z.object({
		factura_id: z.uuid().describe("La factura de prueba"),
		resumen: z.string().min(1).describe("Qué se pide"),
	}),
	salida: z.object({ autorizacion_id: z.uuid(), folio: z.string() }),
	permiso: { departamento: "ventas" },
});

/** La factura de prueba se cancela, y con ella su autorización que espera. */
export const cancelarFactura = definirAccion({
	nombre: "prueba.cancelar_factura",
	descripcion: "Cancela una factura de prueba y la autorización que espera",
	entrada: z.object({ factura_id: z.uuid().describe("La factura de prueba") }),
	salida: z.object({}),
	permiso: { departamento: "ventas" },
});
