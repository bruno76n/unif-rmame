/**
 * `admin.revocar_dispositivo`: la dueña revoca un aparato: deja de entrar en ese momento.
 * Fase 6 · docs/modulos/admin/dispositivos.md («`admin.revocar_dispositivo`», reglas 5 y 6)
 *
 * Nada de su cola se tira: lo que llegue después queda retenido o apartado según cuándo pasó (ver
 * sincronización). `dispositivo.revocado` le manda `dispositivo_revocado` al aparato y su conexión en vivo
 * se corta. Anular los PIN del taller al revocar la tablet llega con Personal, en la fase 7.
 */

import { revocarDispositivo } from "@uniformame/compartido/contratos/admin/dispositivos";
import { eq } from "drizzle-orm";
import { tomarVersion, versionActual } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeRegla } from "../../../nucleo/http/errores.ts";
import { implementarAccion } from "../../../nucleo/modulos.ts";
import { confirmadoConGoogle, cuentaQueLlama } from "../dominio/cuentas.ts";
import { leerDispositivo } from "../dominio/dispositivos.ts";
import { dispositivos, dispositivosSync } from "../tablas.ts";

export const accionRevocarDispositivo = implementarAccion(revocarDispositivo, async (contexto, datos, version) => {
	const { transaccion } = contexto;
	const duena = cuentaQueLlama(contexto);
	const confirmado = confirmadoConGoogle(contexto);
	const aparato = await leerDispositivo(transaccion, datos.dispositivo_id);
	if (aparato.bajaEn !== null) throw errorDeRegla("ya_revocado", `${aparato.nombre} ya está revocado.`);
	await tomarVersion(contexto, dispositivos, aparato.id, version, async () => ({
		dispositivo_id: aparato.id,
		revocado: (await leerDispositivo(transaccion, aparato.id)).bajaEn !== null,
	}));
	await transaccion
		.update(dispositivos)
		.set({
			bajaEn: contexto.ahora.toString(),
			bajaPor: duena,
			motivoBaja: datos.motivo,
			bajaConfirmadoConGoogleEn: confirmado,
		})
		.where(eq(dispositivos.id, aparato.id));
	const [sync] = await transaccion
		.select({ pendientes: dispositivosSync.pendientesPorSubir })
		.from(dispositivosSync)
		.where(eq(dispositivosSync.dispositivoId, aparato.id));
	const pendientes = sync?.pendientes ?? 0;
	contexto.bitacora({
		descripcion: `Revocó ${aparato.nombre}: ${datos.motivo}`,
		entidad: "dispositivos",
		entidadId: aparato.id,
		entidadFolio: aparato.folio,
		antes: { revocado: false },
		despues: { revocado: true, motivo: datos.motivo, pendientes_por_subir: pendientes },
		confirmadoConGoogleEn: confirmado,
	});
	contexto.guardarEvento({
		tipo: "dispositivo.revocado",
		datos: { dispositivo_id: aparato.id },
		tablas: ["dispositivos"],
		entidad: "dispositivos",
		entidadId: aparato.id,
		entidadFolio: aparato.folio,
	});
	return {
		resultado: {
			mensaje: `${aparato.nombre} revocado: ya no entra`,
			version: await versionActual(transaccion, dispositivos, aparato.id),
		},
		avisos:
			pendientes > 0
				? [
						`Tiene ${pendientes} movimientos sin subir. Lo que llegue después entra a la bandeja de excepciones de Bodega.`,
					]
				: [],
		entidad: { nombre: "dispositivos", id: aparato.id },
	};
});
