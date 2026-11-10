/**
 * `admin.rotar_llave`: cambia la llave de un aparato; la anterior vale durante la gracia.
 * Fase 6 · docs/modulos/admin/dispositivos.md («`admin.rotar_llave`», regla 7)
 *
 * El aparato la cambia solo, con su llave vigente y su secreto nuevo. Desde la web, la dueña solo rota la
 * credencial de uniformame.mx y recibe el secreto nuevo una sola vez (un secreto del contrato: la respuesta
 * guardada va sin él). La anterior vale `admin.minutos_gracia_llave`; la primera llamada con la nueva acaba
 * la gracia. Nunca hashes ni secretos en la bitácora.
 */

import { rotarLlave } from "@uniformame/compartido/contratos/admin/dispositivos";
import { eq } from "drizzle-orm";
import { hashDe } from "../../../nucleo/acceso/cookies.ts";
import { tomarVersion } from "../../../nucleo/acciones/pisadas.ts";
import { errorDeCampo, errorDeRegla } from "../../../nucleo/http/errores.ts";
import { type ContextoDeAccion, implementarAccion } from "../../../nucleo/modulos.ts";
import { leerParametro } from "../../../nucleo/parametros.ts";
import { confirmadoConGoogle } from "../dominio/cuentas.ts";
import { type Dispositivo, leerDispositivo, nuevoSecreto } from "../dominio/dispositivos.ts";
import { dispositivos } from "../tablas.ts";

/**
 * Cambia la llave: la actual pasa a anterior con su gracia y entra el hash nueva.
 * @returns Cuándo se rotó.
 */
async function cambiarLlave(contexto: ContextoDeAccion, aparato: Dispositivo, secreto: string): Promise<string> {
	const minutos = Number(await leerParametro(contexto.transaccion, { clave: "admin.minutos_gracia_llave" }));
	const ahora = contexto.ahora.toString();
	await contexto.transaccion
		.update(dispositivos)
		.set({
			llaveAnteriorHash: aparato.llaveHash,
			llaveAnteriorVenceEn: contexto.ahora.add({ minutes: minutos }).toString(),
			llaveHash: hashDe(secreto),
			llaveRotadaEn: ahora,
		})
		.where(eq(dispositivos.id, aparato.id));
	contexto.guardarEvento({
		tipo: "dispositivo.llave_rotada",
		datos: { dispositivo_id: aparato.id },
		tablas: ["dispositivos"],
		entidad: "dispositivos",
		entidadId: aparato.id,
		entidadFolio: aparato.folio,
	});
	return ahora;
}

export const accionRotarLlave = implementarAccion(rotarLlave, async (contexto, datos) => {
	const { quien, transaccion } = contexto;
	if (quien.tipo === "aparato") {
		if (datos.secreto_nuevo === undefined) throw errorDeCampo("secreto_nuevo", "Manda el secreto nuevo.");
		const aparato = await leerDispositivo(transaccion, quien.dispositivoId);
		const llaveRotadaEn = await cambiarLlave(contexto, aparato, datos.secreto_nuevo);
		contexto.bitacora({
			descripcion: `${aparato.nombre} cambió su llave`,
			entidad: "dispositivos",
			entidadId: aparato.id,
		});
		return { resultado: { rotada_en: llaveRotadaEn, mensaje: "Llave cambiada" } };
	}
	if (datos.dispositivo_id === undefined) throw errorDeCampo("dispositivo_id", "Escoge la credencial.");
	const aparato = await leerDispositivo(transaccion, datos.dispositivo_id);
	if (aparato.tipo !== "credencial_servidor") {
		throw errorDeRegla(
			"solo_credencial",
			"Los aparatos cambian su llave solos. Aquí solo se rota la credencial de uniformame.mx.",
		);
	}
	if (aparato.bajaEn !== null) throw errorDeRegla("ya_revocado", `${aparato.nombre} ya está revocado.`);
	await tomarVersion(contexto, dispositivos, aparato.id, datos.version, async () => ({ dispositivo_id: aparato.id }));
	const secreto = nuevoSecreto();
	const llaveRotadaEn = await cambiarLlave(contexto, aparato, secreto);
	contexto.bitacora({
		descripcion: `Rotó la llave de ${aparato.nombre}`,
		entidad: "dispositivos",
		entidadId: aparato.id,
		confirmadoConGoogleEn: confirmadoConGoogle(contexto),
	});
	return {
		resultado: {
			rotada_en: llaveRotadaEn,
			secreto,
			mensaje: "Cópiala ahora en uniformame.mx: no se vuelve a mostrar",
		},
		entidad: { nombre: "dispositivos", id: aparato.id },
	};
});
