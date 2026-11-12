/**
 * Las acciones del contador externo: mandar el paquete del mes, que congela sus cifras y liga sus gastos, y guardar
 * los documentos que el contador regresa.
 * Fase 18 · docs/modulos/contaduria/contador-y-cuadres.md (reglas 2 a 7, «Acciones»)
 */

import { textoDeDia, textoDeMes } from "@uniformame/compartido/calculos/fechas";
import { adjuntarDocumentoContador, marcarPaqueteEnviado } from "@uniformame/compartido/contratos/contaduria/contador";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { nombreDeCuenta, quienCambia } from "../../../nucleo/acciones/comunes.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla, noExiste } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { textoDeSemana } from "../../personal/dominio/asistencia.ts";
import { cuentaDelPaquete, lecturaDelPaquete } from "../dominio/paquete-mes.ts";
import { documentosContador, gastos, nominas, paqueteContadorRenglones, paquetesContador } from "../tablas.ts";

export const accionMarcarPaqueteEnviado = implementarAccion(marcarPaqueteEnviado, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const [paquete] = await transaccion
		.select()
		.from(paquetesContador)
		.where(eq(paquetesContador.id, datos.paquete_contador_id))
		.for("update");
	if (paquete === undefined) throw noExiste();
	await tomarVersion(contexto, paquetesContador, paquete.id, version, async () => ({
		paquete_contador_id: paquete.id,
		estado: paquete.estado,
	}));
	const mes = textoDeMes(paquete.mes);
	if (paquete.estado === "enviado" && paquete.enviadoEn !== null) {
		throw errorDeRegla(
			"paquete_ya_enviado",
			`El paquete de ${mes} ya se mandó el ${textoDeDia(Temporal.Instant.from(paquete.enviadoEn).toZonedDateTimeISO("America/Mexico_City").toPlainDate())}.`,
		);
	}
	// La cuenta del mes, congelada tal como la mostraba la pantalla (regla 2).
	const lectura = await lecturaDelPaquete(transaccion, paquete.mes);
	const { renglones, gastoIds } = cuentaDelPaquete(
		paquete.mes,
		lectura.movimientos,
		lectura.gastos,
		lectura.mesesEnviados,
	);
	const quien = quienCambia(contexto);
	await transaccion
		.update(paquetesContador)
		.set({ estado: "enviado", enviadoEn: contexto.ahora.toString(), enviadoPor: quien })
		.where(eq(paquetesContador.id, paquete.id));
	await transaccion.insert(paqueteContadorRenglones).values(
		renglones.map((renglon) => ({
			id: uuidv7(),
			paqueteContadorId: paquete.id,
			concepto: renglon.concepto,
			categoriaId: renglon.categoriaId,
			deMesesAnteriores: renglon.deMesesAnteriores,
			montoCentavos: renglon.montoCentavos,
			documentos: renglon.documentos,
			creadoPor: quien,
		})),
	);
	// Cada gasto sale en un solo paquete (regla 4).
	if (gastoIds.length > 0) {
		await transaccion.update(gastos).set({ paqueteContadorId: paquete.id }).where(inArray(gastos.id, gastoIds));
	}
	// Una semana que terminó en el mes y sigue sin pagarse sale en el paquete del mes en que se pague (regla 6).
	const siguiente = Temporal.PlainDate.from(paquete.mes).add({ months: 1 }).toString();
	const sinPagar = await transaccion
		.select({ inicio: nominas.fechaInicio, fin: nominas.fechaFin })
		.from(nominas)
		.where(and(eq(nominas.estado, "por_pagar"), gte(nominas.fechaFin, paquete.mes), lt(nominas.fechaFin, siguiente)));
	contexto.guardarEvento({
		tipo: "paquete_contador.enviado",
		datos: { paquete_contador_id: paquete.id },
		tablas: ["paquetes_contador", "paquete_contador_renglones", "gastos"],
		entidad: "paquetes_contador",
		entidadId: paquete.id,
	});
	// La nómina va aparte, en un campo de sueldos: sin «ven sueldos y tarifas» la bitácora llega sin ella.
	const nomina = renglones.find((renglon) => renglon.concepto === "nomina");
	contexto.bitacora({
		descripcion: {
			plantilla: "{quien} mandó el paquete de {mes} al contador",
			valores: { quien: await nombreDeCuenta(contexto, quien), mes },
		},
		entidad: "paquetes_contador",
		entidadId: paquete.id,
		antes: { estado: "por_enviar" },
		despues: {
			estado: "enviado",
			renglones: renglones
				.filter((renglon) => renglon.concepto !== "nomina")
				.map((renglon) => ({
					concepto: renglon.concepto,
					categoria_id: renglon.categoriaId,
					de_meses_anteriores: renglon.deMesesAnteriores,
					monto_centavos: renglon.montoCentavos,
					documentos: renglon.documentos,
				})),
			semanas_de_nomina: nomina?.documentos ?? 0,
			total_nomina_centavos: nomina?.montoCentavos ?? 0,
		},
	});
	return {
		resultado: { mensaje: `Paquete de ${mes} enviado al contador`, paquete_contador_id: paquete.id },
		avisos: sinPagar.map(
			(semana) => `La nómina del ${textoDeSemana(semana.inicio, semana.fin)} sigue por pagar: no entra en este paquete`,
		),
		entidad: { nombre: "paquetes_contador", id: paquete.id },
	};
});

/** Lo que regresa `admin.datos_de_archivo`. */
const datosDelArchivo = z.object({ tipo_mime: z.string(), nombre_original: z.string() });

/** Los tipos de archivo que regresa el contador (regla 7). */
const tiposValidos =
	/^(application\/pdf|image\/[a-z.+-]+|application\/xml|text\/xml|application\/zip|application\/x-zip-compressed)$/;

export const accionAdjuntarDocumentoContador = implementarAccion(adjuntarDocumentoContador, async (contexto, datos) => {
	const { transaccion } = contexto;
	const archivo = datosDelArchivo.parse(
		await contexto.lectura("admin.datos_de_archivo", { archivo_id: datos.archivo_id }),
	);
	if (!tiposValidos.test(archivo.tipo_mime)) {
		throw errorDeRegla("archivo_invalido", "El archivo debe ser PDF, imagen, XML o ZIP.");
	}
	// Uno a la vez por archivo: dos guardados del mismo archivo a la vez dejan uno y el otro responde que ya está.
	await transaccion.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`documento_contador:${datos.archivo_id}`}))`);
	const [yaGuardado] = await transaccion
		.select({ id: documentosContador.id })
		.from(documentosContador)
		.where(eq(documentosContador.archivoId, datos.archivo_id));
	if (yaGuardado !== undefined) throw errorDeRegla("archivo_ya_guardado", "Ese archivo ya está guardado.");
	if (datos.paquete_contador_id !== undefined) {
		const [paquete] = await transaccion
			.select({ id: paquetesContador.id })
			.from(paquetesContador)
			.where(eq(paquetesContador.id, datos.paquete_contador_id));
		if (paquete === undefined) throw noExiste();
	}
	const id = uuidv7();
	const quien = quienCambia(contexto);
	await transaccion.insert(documentosContador).values({
		id,
		archivoId: datos.archivo_id,
		nombre: archivo.nombre_original,
		tipo: datos.tipo ?? "documento",
		mes: datos.mes ?? null,
		paqueteContadorId: datos.paquete_contador_id ?? null,
		llegoEn: contexto.diaDeNegocio.toString(),
		creadoPor: quien,
	});
	await contexto.interna("admin.ligar_archivo", {
		archivo_id: datos.archivo_id,
		proposito: "documento_contador",
		modulo: "contaduria",
		entidad: "documentos_contador",
		entidad_id: id,
	});
	contexto.guardarEvento({
		tipo: "documento_contador.guardado",
		datos: { documento_contador_id: id },
		tablas: ["documentos_contador"],
		entidad: "documentos_contador",
		entidadId: id,
	});
	contexto.bitacora({
		descripcion: `${await nombreDeCuenta(contexto, quien)} guardó ${archivo.nombre_original} del contador`,
		entidad: "documentos_contador",
		entidadId: id,
		despues: { tipo: datos.tipo ?? "documento", mes: datos.mes ?? null },
	});
	return {
		resultado: { mensaje: "Documento guardado", documento_contador_id: id },
		entidad: { nombre: "documentos_contador", id },
	};
});
