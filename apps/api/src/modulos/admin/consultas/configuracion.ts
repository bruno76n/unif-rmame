/**
 * Las consultas de Configuración: `admin.configuracion` y `admin.historial_parametro`.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Configuración») y docs/modulos/admin/configuracion.md
 *
 * Los parámetros van por sección y en el orden de cada módulo (el del registro de módulos y luego su `orden`); el valor
 * en pesos viaja en `valor_centavos`, que el servidor le quita a soporte. Los permisos finos son de las cuentas activas
 * sin soporte, la dueña con todos. Las secciones del catálogo van como una lista más, aunque son de Catálogo, y solo
 * la dueña les agrega. Si la impresora está conectada lo dice la regla de impresión (`puenteConectado`), y los
 * siguientes folios, la lectura de folios.
 */

import {
	configuracionDeAdmin,
	historialParametroDeAdmin,
	type parametroParaVer,
	tiposDeValorDeParametro,
} from "@uniformame/compartido/contratos/admin/consultas-configuracion";
import { permisosFinosDeCuenta } from "@uniformame/compartido/contratos/admin/cuentas";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { esLaDuena } from "../../../nucleo/acceso/quien.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { type ContextoDeConsulta, implementarConsulta } from "../../../nucleo/modulos.ts";
import { tipoDeParametro, valorDelRenglon, valorDelTexto } from "../../../nucleo/parametros.ts";
import { secciones, tiposPrenda } from "../../catalogo/tablas.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { personas } from "../../personal/tablas.ts";
import { valorParaLeer } from "../acciones/cambiar-parametro.ts";
import { puenteConectado, tipoPuente } from "../dominio/impresion.ts";
import {
	contadoresFolio,
	dispositivos,
	empresa,
	impresoras,
	listas,
	listaValores,
	parametros,
	parametrosHistorial,
	permisosFinos,
	usuarios,
} from "../tablas.ts";
import { diaYHora } from "./comun.ts";

/** Un parámetro como lo pinta su casilla. */
type ParametroParaVer = z.infer<typeof parametroParaVer>;

/** Un renglón de `parametros`. */
type Parametro = typeof parametros.$inferSelect;

/**
 * Una opción para leer: «siguiente_semana» es «Siguiente semana».
 * @param opcion El valor de la opción.
 */
function opcionParaLeer(opcion: string): string {
	const texto = opcion.replaceAll("_", " ");
	return texto.charAt(0).toLocaleUpperCase("es-MX") + texto.slice(1);
}

/**
 * Un parámetro como lo pinta su casilla: el de pesos en `valor_centavos`, los demás en `valor`.
 * @param parametro El renglón.
 */
function parametroParaLaCasilla(parametro: Parametro): ParametroParaVer {
	const tipo = z.enum(tiposDeValorDeParametro).parse(tipoDeParametro(parametro.tipoValor));
	const valor = valorDelRenglon(parametro);
	return {
		clave: parametro.clave,
		ubicacion_id: parametro.ubicacionId,
		version: parametro.version,
		nombre: parametro.nombre,
		explicacion: parametro.explicacion,
		tipo,
		unidad: parametro.unidad,
		...(tipo === "centavos" ? { valor: null, valor_centavos: typeof valor === "number" ? valor : null } : { valor }),
		opciones: (parametro.opciones ?? []).map((opcion) => ({ valor: opcion, texto: opcionParaLeer(opcion) })),
		minimo: parametro.minimo,
		maximo: parametro.maximo,
		permite_vacio: parametro.permiteVacio,
		por_decidir: parametro.estadoDecision === "por_decidir",
	};
}

/**
 * Los parámetros de todo el sistema, en el orden de cada módulo y luego en el suyo.
 * @param contexto El contexto de la consulta.
 */
async function parametrosEnOrden(contexto: ContextoDeConsulta) {
	const todos = await contexto.base.select().from(parametros).where(isNull(parametros.ubicacionId));
	const ordenDelModulo = new Map(contexto.registro.modulos.map((modulo, lugar) => [modulo.nombre, lugar]));
	const lugarDe = (parametro: Parametro) => ordenDelModulo.get(parametro.moduloLector) ?? ordenDelModulo.size;
	return todos.sort(
		(uno, otro) => lugarDe(uno) - lugarDe(otro) || uno.orden - otro.orden || uno.clave.localeCompare(otro.clave),
	);
}

/** Qué es cada tipo de ubicación y quién responde si no tiene responsable. */
const deLaUbicacion: Readonly<Record<string, { queEs: string; responsable: string }>> = {
	aduana: { queEs: "Paso de todo lo que entra y sale", responsable: "—" },
	bodega: { queEs: "Mercancía y material guardado", responsable: "—" },
	tienda: { queEs: "Venta al público", responsable: "—" },
	taller: {
		queEs: "Lo que está en proceso: rollos y avíos entregados al corte y piezas cortadas",
		responsable: "—",
	},
	transito: { queEs: "Hasta que el otro lado confirma", responsable: "Quien despachó" },
	en_camino_aduana: {
		queEs: "Lo que salió de una tienda hacia aduana, hasta que Aduana lo recibe",
		responsable: "La tienda que lo envía",
	},
};

/** Los folios que salen en «Empresa», con su nombre. */
const foliosDeLaEmpresa = [
	{ tipo: "pedido", nombre: "Siguiente pedido" },
	{ tipo: "nota_entrega", nombre: "Siguiente nota de entrega" },
	{ tipo: "orden_compra", nombre: "Siguiente orden de compra" },
	{ tipo: "gasto", nombre: "Siguiente gasto" },
] as const;

/** Lo que regresa `admin.siguiente_folio`. */
const folioLeido = z.object({ folio: z.string(), quedan: z.number().optional() });

/**
 * Los siguientes folios y el siguiente código de barras, con su rango.
 * @param contexto El contexto de la consulta.
 */
async function siguientesFolios(contexto: ContextoDeConsulta) {
	const folios = await Promise.all(
		foliosDeLaEmpresa.map(async ({ tipo, nombre }) => ({
			nombre,
			folio: folioLeido.parse(await contexto.lectura("admin.siguiente_folio", { tipo })).folio,
		})),
	);
	const codigo = folioLeido.parse(await contexto.lectura("admin.siguiente_folio", { tipo: "codigo_barras" }));
	const [rango] = await contexto.base
		.select({ minimo: contadoresFolio.minimo, maximo: contadoresFolio.maximo })
		.from(contadoresFolio)
		.where(eq(contadoresFolio.tipo, "codigo_barras"))
		.limit(1);
	const deFabrica = rango === undefined ? "" : ` · fábrica ${rango.minimo}–${rango.maximo ?? ""}`;
	return { folios, codigoBarras: `${codigo.quedan === 0 ? "Sin códigos" : codigo.folio}${deFabrica}` };
}

/**
 * Las listas con sus valores, y las secciones del catálogo como una lista más.
 * @param contexto El contexto de la consulta.
 * @param esDuena Si quien ve es la dueña.
 */
async function listasConValores(contexto: ContextoDeConsulta, esDuena: boolean) {
	const todas = await contexto.base.select().from(listas).orderBy(asc(listas.nombre));
	const valores = await contexto.base
		.select({ listaId: listaValores.listaId, nombre: listaValores.nombre })
		.from(listaValores)
		.where(isNull(listaValores.bajaEn))
		.orderBy(asc(listaValores.orden), asc(listaValores.nombre));
	const deCatalogo = await contexto.base
		.select({ nombre: secciones.nombre })
		.from(secciones)
		.where(isNull(secciones.bajaEn))
		.orderBy(asc(secciones.orden));
	return [
		...todas.map((lista) => ({
			clave: lista.clave,
			nombre: lista.nombre,
			valores: valores.filter((valor) => valor.listaId === lista.id).map((valor) => valor.nombre),
			puede_agregar: esDuena || !lista.soloDuenaAgrega,
		})),
		{
			clave: "secciones_catalogo",
			nombre: "Secciones del catálogo",
			valores: deCatalogo.map((seccion) => seccion.nombre),
			puede_agregar: esDuena,
		},
	];
}

/**
 * Las impresoras sin baja, con su programa puente y si está conectado.
 * @param contexto El contexto de la consulta.
 */
async function impresorasConPuente(contexto: ContextoDeConsulta) {
	const vigentes = await contexto.base
		.select({
			id: impresoras.id,
			version: impresoras.version,
			nombre: impresoras.nombre,
			modelo: impresoras.modelo,
			ubicacionId: impresoras.ubicacionId,
			ubicacion: ubicaciones.nombre,
			dispositivoId: impresoras.dispositivoId,
			puente: dispositivos.nombre,
		})
		.from(impresoras)
		.innerJoin(ubicaciones, eq(ubicaciones.id, impresoras.ubicacionId))
		.leftJoin(dispositivos, eq(dispositivos.id, impresoras.dispositivoId))
		.where(isNull(impresoras.bajaEn))
		.orderBy(asc(impresoras.nombre));
	// Si está conectada lo dice la regla de impresión, que recibe el contexto de una acción.
	const conectadas = await contexto.comoAccion((accion) =>
		Promise.all(vigentes.map((impresora) => puenteConectado(accion, impresora.dispositivoId))),
	);
	return vigentes.map((impresora, lugar) => ({
		impresora_id: impresora.id,
		version: impresora.version,
		nombre: impresora.nombre,
		modelo: impresora.modelo,
		ubicacion_id: impresora.ubicacionId,
		ubicacion: impresora.ubicacion,
		dispositivo_id: impresora.dispositivoId,
		puente: impresora.puente,
		conectada: conectadas[lugar] ?? false,
	}));
}

export const consultaConfiguracion = implementarConsulta(configuracionDeAdmin, async (contexto) => {
	const { base, quien } = contexto;
	const esDuena = esLaDuena(quien);
	const todos = (await parametrosEnOrden(contexto)).map((parametro) => ({
		seccion: parametro.seccion,
		casilla: parametroParaLaCasilla(parametro),
	}));
	const deLaSeccion = (seccion: string) =>
		todos.filter((parametro) => parametro.seccion === seccion).map((parametro) => parametro.casilla);
	const cuentas = await base
		.select({
			id: usuarios.id,
			version: usuarios.version,
			nombre: sql<string>`coalesce(${personas.nombre}, ${usuarios.nombre}, ${usuarios.correo})`,
			esDuena: usuarios.esDuena,
		})
		.from(usuarios)
		.leftJoin(personas, eq(personas.id, usuarios.personaId))
		.where(and(eq(usuarios.estado, "activa"), eq(usuarios.esSoporte, false)))
		.orderBy(desc(usuarios.esDuena), asc(sql`coalesce(${personas.nombre}, ${usuarios.correo})`));
	const vigentes = await base
		.select({ usuarioId: permisosFinos.usuarioId, permiso: permisosFinos.permiso })
		.from(permisosFinos)
		.where(isNull(permisosFinos.bajaEn));
	const lugares = await base
		.select({ id: ubicaciones.id, nombre: ubicaciones.nombre, tipo: ubicaciones.tipo, responsable: personas.nombre })
		.from(ubicaciones)
		.leftJoin(personas, eq(personas.id, ubicaciones.responsablePersonaId))
		.where(isNull(ubicaciones.bajaEn))
		.orderBy(asc(ubicaciones.orden));
	const [datosDeEmpresa] = await base.select().from(empresa);
	const puentes = await base
		.select({ dispositivo_id: dispositivos.id, nombre: dispositivos.nombre })
		.from(dispositivos)
		.where(and(eq(dispositivos.tipo, tipoPuente), isNull(dispositivos.bajaEn)))
		.orderBy(asc(dispositivos.nombre));
	const prendas = await base
		.select({ id: tiposPrenda.id, nombre: tiposPrenda.nombre })
		.from(tiposPrenda)
		.where(isNull(tiposPrenda.bajaEn))
		.orderBy(asc(tiposPrenda.orden), asc(tiposPrenda.nombre));
	const { folios, codigoBarras } = await siguientesFolios(contexto);
	return {
		resultado: {
			es_duena: esDuena,
			decisiones: deLaSeccion("decision_operacion"),
			permisos_finos: cuentas.map((cuenta) => ({
				usuario_id: cuenta.id,
				version: cuenta.version,
				nombre: cuenta.nombre,
				es_duena: cuenta.esDuena,
				// La dueña los tiene todos, sin renglones.
				permisos: cuenta.esDuena
					? [...permisosFinosDeCuenta]
					: permisosFinosDeCuenta.filter((permiso) =>
							vigentes.some((vigente) => vigente.usuarioId === cuenta.id && vigente.permiso === permiso),
						),
			})),
			parametros: deLaSeccion("parametro"),
			tecnicos: deLaSeccion("tecnico"),
			ubicaciones: lugares.map((lugar) => ({
				nombre: lugar.nombre,
				responsable: lugar.responsable ?? deLaUbicacion[lugar.tipo]?.responsable ?? "—",
				que_es: deLaUbicacion[lugar.tipo]?.queEs ?? "",
			})),
			listas: await listasConValores(contexto, esDuena),
			tipos_prenda: prendas,
			empresa:
				datosDeEmpresa === undefined
					? null
					: {
							version: datosDeEmpresa.version,
							razon_social: datosDeEmpresa.razonSocial,
							nombre_comercial: datosDeEmpresa.nombreComercial,
							rfc: datosDeEmpresa.rfc,
							domicilio: datosDeEmpresa.domicilio,
						},
			impresoras: await impresorasConPuente(contexto),
			puentes,
			ubicaciones_para_escoger: lugares.map((lugar) => ({ ubicacion_id: lugar.id, nombre: lugar.nombre })),
			folios,
			codigo_barras: codigoBarras,
		},
	};
});

export const consultaHistorialParametro = implementarConsulta(historialParametroDeAdmin, async ({ base }, entrada) => {
	const [parametro] = await base
		.select()
		.from(parametros)
		.where(
			and(
				eq(parametros.clave, entrada.clave),
				entrada.ubicacion_id === undefined
					? isNull(parametros.ubicacionId)
					: eq(parametros.ubicacionId, entrada.ubicacion_id),
			),
		);
	if (parametro === undefined) throw noExiste();
	const tipo = tipoDeParametro(parametro.tipoValor);
	const valores = await base
		.select({
			valor: parametrosHistorial.valorNuevo,
			creadoEn: parametrosHistorial.creadoEn,
			creadoPor: parametrosHistorial.creadoPor,
			quien: sql<string | null>`coalesce(${personas.nombre}, ${usuarios.nombre}, ${usuarios.correo})`,
		})
		.from(parametrosHistorial)
		.leftJoin(usuarios, eq(usuarios.id, parametrosHistorial.creadoPor))
		.leftJoin(personas, eq(personas.id, usuarios.personaId))
		.where(eq(parametrosHistorial.parametroId, parametro.id))
		.orderBy(desc(parametrosHistorial.creadoEn), desc(parametrosHistorial.id));
	return {
		resultado: {
			nombre: parametro.nombre,
			renglones: valores.map((renglon) => {
				const valor = valorDelTexto(tipo, renglon.valor);
				return {
					...(tipo === "centavos"
						? { valor: null, valor_centavos: typeof valor === "number" ? valor : null }
						: { valor: valorParaLeer(parametro, valor) }),
					desde: diaYHora(renglon.creadoEn),
					quien: renglon.creadoPor === null ? "Valor inicial" : (renglon.quien ?? "—"),
				};
			}),
		},
	};
});
