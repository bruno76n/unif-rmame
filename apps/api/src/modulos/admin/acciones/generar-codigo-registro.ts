/**
 * `admin.generar_codigo_registro`: la dueña genera el código de 10 minutos para registrar un aparato.
 * Fase 6 · docs/modulos/admin/dispositivos.md («`admin.generar_codigo_registro`»)
 *
 * El código sale en claro una sola vez: la base guarda su SHA-256 y la respuesta guardada para los
 * reintentos va sin él (es un secreto del contrato). El registro lo confirma el aparato al canjearlo.
 */

import { generarCodigoRegistro } from "@uniformame/compartido/contratos/admin/dispositivos";
import { v7 as uuidv7 } from "uuid";
import { hashDe } from "../../../nucleo/acceso/cookies.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { cuentaQueLlama } from "../dominio/cuentas.ts";
import { nombreDelTipo, nuevoCodigo, revisarUbicacion } from "../dominio/dispositivos.ts";
import { codigosRegistro } from "../tablas.ts";

export const accionGenerarCodigoRegistro = implementarAccion(generarCodigoRegistro, async (contexto, datos) => {
	const { transaccion } = contexto;
	const duena = cuentaQueLlama(contexto);
	await revisarUbicacion(transaccion, datos.tipo, datos.ubicacion_id);
	const minutos = Number(await leerParametro(transaccion, { clave: "admin.codigo_registro_vigencia_min" }));
	const codigo = nuevoCodigo();
	const id = uuidv7();
	const venceEn = contexto.ahora.add({ minutes: minutos }).toString();
	const nombre = datos.nombre === undefined || datos.nombre === "" ? "Dispositivo" : datos.nombre;
	await transaccion.insert(codigosRegistro).values({
		id,
		codigoHash: hashDe(codigo.normal),
		nombre,
		tipo: datos.tipo,
		ubicacionId: datos.ubicacion_id,
		venceEn,
		estado: "vigente",
		creadoPor: duena,
	});
	contexto.bitacora({
		descripcion: `Generó un código para registrar ${nombre} (${nombreDelTipo[datos.tipo] ?? datos.tipo})`,
		entidad: "codigos_registro",
		entidadId: id,
	});
	contexto.guardarEvento({
		tipo: "dispositivo.codigo_generado",
		datos: { codigo_registro_id: id },
		tablas: ["codigos_registro"],
		entidad: "codigos_registro",
		entidadId: id,
	});
	return {
		resultado: {
			codigo_registro_id: id,
			codigo: codigo.paraLeer,
			vence_en: venceEn,
			mensaje: `Escribe este código en la pantalla de registro del dispositivo nuevo. Vence en ${minutos} minutos.`,
		},
		entidad: { nombre: "codigos_registro", id },
	};
});
