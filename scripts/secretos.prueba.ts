/**
 * Prueba de la búsqueda de secretos de la revisión completa.
 * Fase 1 · docs/cimientos/SEGURIDAD.md («Secretos y variables de entorno»)
 *
 * Los secretos de ejemplo se arman por pedazos para que este archivo no tenga ninguno escrito.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarRepositorioDePrueba, crearRepositorioDePrueba, escribir } from "./repositorio-de-prueba.ts";
import { buscarSecretos } from "./secretos.ts";

const ejemplos: [string, string][] = [
	["una llave privada", `-----BEGIN ${"RSA "}PRIVATE KEY-----\nMIIabc\n`],
	[
		"una dirección de Postgres con contraseña",
		`const url = "postgres${"ql"}://app:${"clave123"}@localhost:5432/uniformame";\n`,
	],
	["el secreto de cliente de Google", `const s = "${"GOCSPX"}-${"a".repeat(28)}";\n`],
	["una llave de API de Google", `const k = "${"AIza"}${"B".repeat(35)}";\n`],
	["una llave de Resend", `const r = "${"re"}_${"c1tpEyD8"}_${"NKFusih9vKVQknRAQfmFcWCv"}";\n`],
	["una variable de la lista con un valor escrito", `${"RESEND_LLAVE"}=${"algo"}\n`],
];

describe("la búsqueda de secretos encuentra los secretos que usa el sistema en lo que se va a guardar", () => {
	let raiz = "";
	beforeEach(() => {
		raiz = crearRepositorioDePrueba();
	});
	afterEach(() => borrarRepositorioDePrueba(raiz));

	it("no encuentra nada en un repositorio limpio", () => {
		expect(buscarSecretos(raiz)).toEqual([]);
	});

	it.each(ejemplos)("encuentra %s", (_que, contenido) => {
		escribir(raiz, "scripts/ejemplo.ts", contenido);
		const hallazgos = buscarSecretos(raiz);
		expect(hallazgos).toHaveLength(1);
		expect(hallazgos[0]?.archivo).toBe("scripts/ejemplo.ts");
	});

	it("una variable de la lista sin valor no es secreto", () => {
		escribir(raiz, "otro.env.ejemplo", "RESEND_LLAVE=\nCOOKIE_SECRETO=\n");
		expect(buscarSecretos(raiz)).toEqual([]);
	});

	it("encuentra un .env que no está en .gitignore", () => {
		writeFileSync(join(raiz, ".gitignore"), "node_modules\n");
		escribir(raiz, ".env", "ENTORNO=\n");
		expect(buscarSecretos(raiz).map((h) => h.archivo)).toContain(".env");
	});

	it("no revisa lo que git ignora", () => {
		escribir(raiz, ".env", `${"RESEND_LLAVE"}=${"algo"}\n`);
		expect(buscarSecretos(raiz)).toEqual([]);
	});
});
