/**
 * El cifrado de lo delicado que guarda la tablet (su secreto y los hashes de los PIN): AES-GCM de 256 bits con Web
 * Crypto, con una llave que nace en la tablet sin poder exportarse y se guarda en IndexedDB. El navegador no deja
 * sacarla, así que quien copie la base de la tablet no tiene nada de eso en claro.
 * Fase 20 · docs/apps/tablet.md («El registro», paso 5) y docs/modulos/personal/pin-del-taller.md («Cómo se guarda»)
 */

import type { BaseDeLaTablet, Cifrado } from "../copia/base.ts";

/** El id de la llave de cifrado en su tabla. */
const llaveDeLaTablet = "cifrado";

/**
 * La llave de cifrado de la tablet: la guardada, o una nueva que no se puede exportar.
 * @param base La base local.
 */
export async function llaveDeCifrado(base: BaseDeLaTablet): Promise<CryptoKey> {
	const guardada = await base.llaves.get(llaveDeLaTablet);
	if (guardada !== undefined) return guardada.llave;
	const llave = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
	// Si otra pestaña la hizo al mismo tiempo, vale la que quedó guardada.
	await base.llaves.add({ id: llaveDeLaTablet, llave }).catch(() => undefined);
	return (await base.llaves.get(llaveDeLaTablet))?.llave ?? llave;
}

/**
 * Cifra un texto.
 * @param llave La llave de la tablet.
 * @param texto Lo que se cifra.
 */
export async function cifrar(llave: CryptoKey, texto: string): Promise<Cifrado> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const datos = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, llave, new TextEncoder().encode(texto));
	return { iv, datos };
}

/**
 * Descifra un texto.
 * @param llave La llave de la tablet.
 * @param cifrado Lo cifrado.
 */
export async function descifrar(llave: CryptoKey, cifrado: Cifrado): Promise<string> {
	const iv = new Uint8Array(cifrado.iv);
	return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, llave, cifrado.datos));
}

/**
 * Si un valor guardado es un texto cifrado: lo que guarda la copia en una columna cifrada.
 * @param valor Lo que se leyó.
 */
export function esCifrado(valor: unknown): valor is Cifrado {
	return (
		typeof valor === "object" &&
		valor !== null &&
		"iv" in valor &&
		valor.iv instanceof Uint8Array &&
		"datos" in valor &&
		valor.datos instanceof ArrayBuffer
	);
}
