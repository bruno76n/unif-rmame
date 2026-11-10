/**
 * `admin.registrar_restauracion`: la dueña registra una prueba de restauración con su evidencia.
 * Fase 4 · docs/modulos/admin/respaldos.md («`admin.registrar_restauracion`»)
 *
 * La evidencia se liga con `admin.ligar_archivo`. Una prueba que no cuadró se guarda, pero no cuenta como
 * última prueba buena.
 */

import { zonaDelNegocio } from "@uniformame/compartido/calculos/fechas";
import { registrarRestauracion } from "@uniformame/compartido/contratos/admin/respaldos";
import { eq } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { v7 as uuidv7 } from "uuid";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { respaldos, restauracionesProbadas } from "../tablas.ts";

export const accionRegistrarRestauracion = implementarAccion(registrarRestauracion, async (contexto, datos) => {
	const { transaccion, quien } = contexto;
	if (datos.evidencia_archivo_id === undefined)
		throw errorDeCampo("evidencia_archivo_id", "Sube la evidencia de la prueba.");
	const probadaEn = Temporal.Instant.from(datos.probada_en);
	if (Temporal.Instant.compare(probadaEn, contexto.ahora) > 0) {
		throw errorDeCampo("probada_en", "La prueba no puede ser de una fecha futura.");
	}
	if (datos.tipo === "semanal_externo") {
		const [respaldo] =
			datos.respaldo_id === undefined
				? []
				: await transaccion
						.select({ estado: respaldos.estado })
						.from(respaldos)
						.where(eq(respaldos.id, datos.respaldo_id));
		if (respaldo === undefined) throw errorDeCampo("respaldo_id", "Escoge el respaldo que restauraste.");
		if (respaldo.estado === "fallido")
			throw errorDeRegla("respaldo_fallido", "Ese respaldo falló: escoge uno correcto.");
	}
	if (datos.tipo === "punto_en_el_tiempo" && datos.punto_restaurado_en === undefined) {
		throw errorDeCampo("punto_restaurado_en", "Escribe el momento que restauraste.");
	}
	const id = uuidv7();
	await contexto.interna("admin.ligar_archivo", {
		archivo_id: datos.evidencia_archivo_id,
		proposito: "evidencia_restauracion",
		modulo: "admin",
		entidad: "restauraciones_probadas",
		entidad_id: id,
	});
	await transaccion.insert(restauracionesProbadas).values({
		id,
		probadaEn: probadaEn.toString(),
		tipo: datos.tipo,
		respaldoId: datos.tipo === "semanal_externo" ? (datos.respaldo_id ?? null) : null,
		puntoRestauradoEn: datos.tipo === "punto_en_el_tiempo" ? (datos.punto_restaurado_en ?? null) : null,
		conteosCuadraron: datos.conteos_cuadraron,
		conteos: datos.conteos ?? null,
		evidenciaArchivoId: datos.evidencia_archivo_id,
		nota: datos.nota ?? null,
		creadoPor: quien.tipo === "cuenta" ? quien.usuarioId : null,
	});
	contexto.bitacora({
		descripcion: "Registró una restauración probada en el ambiente de pruebas",
		entidad: "restauraciones_probadas",
		entidadId: id,
		despues: { tipo: datos.tipo, respaldo_id: datos.respaldo_id ?? null, conteos_cuadraron: datos.conteos_cuadraron },
	});
	contexto.guardarEvento({
		tipo: "restauracion.registrada",
		datos: { restauracion_id: id },
		tablas: ["restauraciones_probadas"],
		entidad: "restauraciones_probadas",
		entidadId: id,
	});
	const cadaDias = Number(await contexto.lectura("admin.parametro", { clave: "admin.restauracion_cada_dias" }));
	const siguiente = probadaEn
		.add({ hours: 24 * cadaDias })
		.toZonedDateTimeISO(zonaDelNegocio)
		.toPlainDate();
	return {
		resultado: {
			mensaje: datos.conteos_cuadraron
				? `Restauración registrada. La siguiente toca el ${siguiente.toString()}`
				: "La prueba no cuadró: el respaldo sigue por probar.",
			restauracion_id: id,
		},
		entidad: { nombre: "restauraciones_probadas", id },
	};
});
