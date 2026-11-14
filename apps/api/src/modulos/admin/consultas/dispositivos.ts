/**
 * Las consultas de Dispositivos: `admin.dispositivos`, `admin.codigo_registro` y `admin.comandos_apartados`.
 * Fase 19 · docs/interfaz/fabrica/administracion.md («Dispositivos» y «Ventanas») y docs/modulos/admin/dispositivos.md
 *
 * La credencial de uniformame.mx no sale aquí: llega con uniformame.mx. La tablet (y la caja, con el POS) dice su
 * última sincronización, en rojo pasadas `admin.horas_sin_sincronizar_aviso`; el programa de impresión, su último
 * contacto, en rojo pasados `admin.minutos_puente_sin_contacto`; el teléfono no sincroniza. De la llave solo viaja su
 * parte pública.
 */

import { textoDeDiaCorto } from "@uniformame/compartido/calculos/fechas";
import {
	codigoRegistroDeAdmin,
	comandosApartadosDeAdmin,
	dispositivosDeAdmin,
} from "@uniformame/compartido/contratos/admin/consultas-dispositivos";
import type { tiposQueSeRegistran } from "@uniformame/compartido/contratos/admin/dispositivos";
import { and, asc, desc, eq, isNull, lt, ne, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { esLaDuena } from "../../../nucleo/acceso/quien.ts";
import { leerCursor, paginar } from "../../../nucleo/http/consultas.ts";
import { noExiste } from "../../../nucleo/http/errores.ts";
import { implementarConsulta } from "../../../nucleo/modulos.ts";
import { parametroNumero } from "../../../nucleo/parametros.ts";
import { ubicaciones } from "../../inventario/tablas.ts";
import { personas } from "../../personal/tablas.ts";
import { tiposQueSincronizan } from "../dominio/dispositivos.ts";
import { codigosRegistro, comandosRecibidos, dispositivos, dispositivosSync, impresoras } from "../tablas.ts";
import { diaDe, diaYHora, instanteDe } from "./comun.ts";

/** Cómo se lee cada tipo de aparato en la tabla. */
const textoDelTipo: Readonly<Record<string, string>> = {
	tablet_taller: "Tablet del taller",
	telefono_escanear: "Teléfono para escanear",
	puente_impresion: "Programa de impresión",
	computadora_tienda: "Computadora de tienda",
};

/** El tipo de aparato que va en cada tipo de ubicación (docs/modulos/admin/dispositivos.md, «Los tipos»). */
const aparatoDeLaUbicacion: Readonly<Record<string, (typeof tiposQueSeRegistran)[number]>> = {
	taller: "tablet_taller",
	aduana: "telefono_escanear",
	bodega: "telefono_escanear",
};

/** La credencial de uniformame.mx: no sale en Dispositivos. */
const credencial = "credencial_servidor";

/**
 * La parte pública de una llave como se lee: «k1·a8f2».
 * @param llaveId La parte pública.
 */
function llaveParaLeer(llaveId: string): string {
	return `${llaveId.slice(0, 2)}·${llaveId.slice(2)}`;
}

/**
 * Hace cuánto pasó algo: «hace 5 min», «hace 3 h», «hace 4 días». Lo de menos de un minuto dice «hace 1 min», nunca «hace
 * 0 min».
 * @param minutos Los minutos que pasaron.
 */
function haceCuanto(minutos: number): string {
	if (minutos < 60) return `hace ${Math.max(1, minutos)} min`;
	const horas = Math.floor(minutos / 60);
	return horas < 48 ? `hace ${horas} h` : `hace ${Math.floor(horas / 24)} días`;
}

/** Los comandos de un aparato que quedaron apartados sin descartarse. */
const apartadosSinDescartar = and(eq(comandosRecibidos.resultado, "apartado"), isNull(comandosRecibidos.descartadoEn));

export const consultaDispositivos = implementarConsulta(dispositivosDeAdmin, async (contexto) => {
	const { base, quien, ahora } = contexto;
	const horasAviso = await parametroNumero(contexto, "admin.horas_sin_sincronizar_aviso");
	const minutosPuente = await parametroNumero(contexto, "admin.minutos_puente_sin_contacto");
	const minutosReloj = await parametroNumero(contexto, "sync.minutos_reloj_desfasado");
	const aparatos = await base
		.select({
			id: dispositivos.id,
			version: dispositivos.version,
			nombre: dispositivos.nombre,
			tipo: dispositivos.tipo,
			ubicacion: ubicaciones.nombre,
			llaveId: dispositivos.llaveId,
			creadoEn: dispositivos.creadoEn,
			bajaEn: dispositivos.bajaEn,
			motivo: dispositivos.motivoBaja,
			sincronizado: dispositivosSync.ultimaSincronizacionEn,
			contacto: dispositivosSync.ultimoContactoEn,
			versionApp: dispositivosSync.versionApp,
			desfase: dispositivosSync.desfaseRelojSeg,
			pendientes: dispositivosSync.pendientesPorSubir,
			apartados: sql<number>`(select count(*)::int from ${comandosRecibidos} where ${comandosRecibidos.dispositivoId} = ${dispositivos.id}
				and ${apartadosSinDescartar} and not ${comandosRecibidos.dispositivoRevocado})`,
			despues: sql<number>`(select count(*)::int from ${comandosRecibidos} where ${comandosRecibidos.dispositivoId} = ${dispositivos.id}
				and ${comandosRecibidos.dispositivoRevocado})`,
		})
		.from(dispositivos)
		.leftJoin(dispositivosSync, eq(dispositivosSync.dispositivoId, dispositivos.id))
		.leftJoin(ubicaciones, eq(ubicaciones.id, dispositivos.ubicacionId))
		.where(ne(dispositivos.tipo, credencial))
		.orderBy(asc(dispositivos.creadoEn));
	/** Los minutos desde un momento hasta ahora. */
	const minutosDesde = (momento: string) => Math.floor(instanteDe(momento).until(ahora).total("minutes"));
	/** La sincronización de un aparato, según su tipo. */
	const sincronizacionDe = (aparato: (typeof aparatos)[number]) => {
		if (aparato.tipo === "puente_impresion") {
			if (aparato.contacto === null) return { texto: "Nunca", tono: "rojo" as const };
			const minutos = minutosDesde(aparato.contacto);
			return {
				texto: `Último contacto ${haceCuanto(minutos)}`,
				tono: minutos > minutosPuente ? ("rojo" as const) : ("verde" as const),
			};
		}
		if (!tiposQueSincronizan.includes(aparato.tipo)) return { texto: "No sincroniza", tono: "ninguno" as const };
		const minutos = minutosDesde(aparato.sincronizado ?? aparato.creadoEn);
		const tono = minutos >= horasAviso * 60 ? ("rojo" as const) : ("verde" as const);
		return { texto: aparato.sincronizado === null ? "Nunca" : haceCuanto(minutos), tono };
	};
	const lugares = await base
		.select({
			id: ubicaciones.id,
			nombre: ubicaciones.nombre,
			tipo: ubicaciones.tipo,
			conImpresora: sql<boolean>`exists (select 1 from ${impresoras} where ${impresoras.ubicacionId} = ${ubicaciones.id}
				and ${impresoras.bajaEn} is null)`,
		})
		.from(ubicaciones)
		.where(isNull(ubicaciones.bajaEn))
		.orderBy(asc(ubicaciones.orden));
	return {
		resultado: {
			// Registrar (`admin.generar_codigo_registro`) y revocar (`admin.revocar_dispositivo`) son solo de la dueña.
			puede: { registrar: esLaDuena(quien), revocar: esLaDuena(quien) },
			registrados: aparatos
				.filter((aparato) => aparato.bajaEn === null)
				.map((aparato) => {
					const registradoEl = diaDe(aparato.creadoEn);
					return {
						dispositivo_id: aparato.id,
						version: aparato.version,
						nombre: aparato.nombre,
						registrado: `Registrado el ${textoDeDiaCorto(registradoEl)} ${registradoEl.slice(0, 4)}`,
						tipo: aparato.tipo,
						tipo_texto: textoDelTipo[aparato.tipo] ?? aparato.tipo,
						ubicacion: aparato.ubicacion,
						sincronizacion: sincronizacionDe(aparato),
						llave_id: llaveParaLeer(aparato.llaveId),
						version_app: aparato.versionApp,
						reloj_desfasado: Math.abs(aparato.desfase ?? 0) > minutosReloj * 60,
						apartados: aparato.apartados,
						pendientes_por_subir: aparato.pendientes ?? 0,
					};
				}),
			revocados: aparatos
				.filter((aparato) => aparato.bajaEn !== null)
				.map((aparato) => ({
					dispositivo_id: aparato.id,
					nombre: aparato.nombre,
					llave_id: llaveParaLeer(aparato.llaveId),
					revocado: textoDeDiaCorto(diaDe(aparato.bajaEn ?? aparato.creadoEn)),
					motivo: aparato.motivo ?? "",
					despues_de_revocar: aparato.despues,
				})),
			donde_se_usa: lugares.flatMap((lugar) => {
				const tipo = aparatoDeLaUbicacion[lugar.tipo];
				return tipo === undefined && !lugar.conImpresora
					? []
					: [
							{
								ubicacion_id: lugar.id,
								nombre: lugar.nombre,
								tipo: tipo ?? "puente_impresion",
								con_impresora: lugar.conImpresora,
							},
						];
			}),
			vigencia_codigo_min: await parametroNumero(contexto, "admin.codigo_registro_vigencia_min"),
		},
	};
});

export const consultaCodigoRegistro = implementarConsulta(
	codigoRegistroDeAdmin,
	async ({ base, ahora }, parametros) => {
		const [codigo] = await base
			.select()
			.from(codigosRegistro)
			.where(eq(codigosRegistro.id, parametros.codigo_registro_id));
		if (codigo === undefined) throw noExiste();
		// «Vencido» se calcula: un código vigente que ya pasó su hora.
		const vencido =
			codigo.estado === "vigente" && instanteDe(codigo.venceEn).epochMilliseconds <= ahora.epochMilliseconds;
		return {
			resultado: {
				estado: vencido ? ("vencido" as const) : z.enum(["vigente", "canjeado", "cancelado"]).parse(codigo.estado),
				nombre: codigo.nombre,
				dispositivo_id: codigo.dispositivoId,
			},
		};
	},
);

/**
 * Un motivo de apartado para leer: «falta_documento» es «Falta documento».
 * @param motivo El código del motivo.
 */
function motivoParaLeer(motivo: string): string {
	const texto = motivo.replaceAll("_", " ");
	return texto.charAt(0).toLocaleUpperCase("es-MX") + texto.slice(1);
}

/** Cuántos apartados por página si no se pide otro número. */
const apartadosPorPagina = 20;

export const consultaComandosApartados = implementarConsulta(
	comandosApartadosDeAdmin,
	async ({ base, quien }, parametros) => {
		const [aparato] = await base
			.select({ nombre: dispositivos.nombre })
			.from(dispositivos)
			.where(eq(dispositivos.id, parametros.dispositivo_id));
		if (aparato === undefined) throw noExiste();
		const posicion = leerCursor(parametros.cursor);
		const despues: SQL | undefined =
			posicion === undefined
				? undefined
				: or(
						lt(comandosRecibidos.recibidoEn, String(posicion.recibido_en)),
						and(
							eq(comandosRecibidos.recibidoEn, String(posicion.recibido_en)),
							lt(comandosRecibidos.id, String(posicion.id)),
						),
					);
		const limite = parametros.limite ?? apartadosPorPagina;
		const leidos = await base
			.select({
				id: comandosRecibidos.id,
				recibidoEn: comandosRecibidos.recibidoEn,
				ocurridoEn: comandosRecibidos.ocurridoEn,
				accion: comandosRecibidos.tipoComando,
				motivo: comandosRecibidos.motivoApartado,
				persona: personas.nombre,
				reintentos: comandosRecibidos.reintentos,
				descartadoEn: comandosRecibidos.descartadoEn,
				motivoDescarte: comandosRecibidos.motivoDescarte,
			})
			.from(comandosRecibidos)
			.leftJoin(personas, eq(personas.id, comandosRecibidos.personaId))
			.where(
				and(
					eq(comandosRecibidos.dispositivoId, parametros.dispositivo_id),
					eq(comandosRecibidos.resultado, "apartado"),
					parametros.incluir_descartados === "si" ? undefined : isNull(comandosRecibidos.descartadoEn),
					despues,
				),
			)
			.orderBy(desc(comandosRecibidos.recibidoEn), desc(comandosRecibidos.id))
			.limit(limite + 1);
		const pagina = paginar(leidos, limite, (renglon) => ({ recibido_en: renglon.recibidoEn, id: renglon.id }));
		return {
			resultado: {
				nombre: aparato.nombre,
				// `admin.descartar_comando_apartado` es solo de la dueña.
				puede_descartar: esLaDuena(quien),
				...pagina,
				renglones: pagina.renglones.map((renglon) => ({
					comando_id: renglon.id,
					cuando: diaYHora(renglon.ocurridoEn),
					accion: renglon.accion,
					motivo: motivoParaLeer(renglon.motivo ?? ""),
					persona: renglon.persona,
					reintentos: renglon.reintentos,
					descartado: renglon.descartadoEn === null ? null : `Descartado: ${renglon.motivoDescarte ?? ""}`,
				})),
			},
		};
	},
);
