/**
 * El almacén de archivos: Cloudflare R2 con la interfaz de S3.
 * Fase 4 · docs/modulos/admin/archivos.md y docs/cimientos/INFRAESTRUCTURA.md («R2»)
 *
 * El cubo es privado: se entra solo con direcciones firmadas. La de subida firma el tipo, el tamaño y la
 * suma SHA-256 como encabezados que el cliente tiene que mandar tal cual, así que R2 rechaza otro
 * contenido. La revisión (`HEAD`) da el tamaño y la suma de lo que llegó. Las sumas automáticas del SDK
 * van apagadas: R2 no las pide y la suma que vale es la que declaró quien sube.
 */

import { createHash } from "node:crypto";
import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Entorno } from "./entorno.ts";

/** Lo que se declara de un archivo antes de subirlo. */
export interface ObjetoDeclarado {
	tipo: string;
	tamano: number;
	/** La suma SHA-256 del contenido, en hexadecimal. */
	sha256: string;
}

/** Lo que el almacén dice de un objeto que llegó. */
export interface ObjetoGuardado {
	tamano: number;
	/** La suma SHA-256 en hexadecimal, si se guardó con ella. */
	sha256: string | undefined;
}

/** El almacén, como lo usan los archivos y los respaldos. */
export interface Almacen {
	/** Una dirección firmada para subir un objeto, con los encabezados que el cliente tiene que mandar. */
	direccionDeSubida(
		clave: string,
		objeto: ObjetoDeclarado,
		segundos: number,
	): Promise<{ url: string; encabezados: Record<string, string> }>;
	/** Una dirección firmada para abrir o bajar un objeto. */
	direccionDeBajada(clave: string, opciones: { nombre: string; descarga: boolean }, segundos: number): Promise<string>;
	/** El tamaño y la suma de un objeto, o `undefined` si no está. */
	revisar(clave: string): Promise<ObjetoGuardado | undefined>;
	/** Guarda un objeto que generó el servidor, con su suma. */
	guardar(clave: string, contenido: Uint8Array, tipo: string): Promise<void>;
	/**
	 * Guarda lo que va saliendo de un flujo, por partes y sin pasar por disco, cada parte con su suma. Antes
	 * de cerrar la subida espera `antesDeCerrar` (que quien produce el flujo terminó bien): si falla, la
	 * subida se cancela y el objeto no queda.
	 * @returns El tamaño y la suma SHA-256 (hexadecimal) de todo lo que se subió.
	 */
	guardarFlujo(
		clave: string,
		flujo: AsyncIterable<Uint8Array>,
		tipo: string,
		antesDeCerrar?: () => Promise<void>,
	): Promise<ObjetoGuardado & { sha256: string }>;
}

/** El tamaño de cada parte de una subida por partes: S3 pide al menos 5 MB, salvo la última. */
const tamanoDeParte = 8 * 1024 * 1024;

/** Cómo se conecta el almacén. */
export interface ConexionDelAlmacen {
	/** La dirección de S3: `https://{R2_CUENTA}.r2.cloudflarestorage.com`, o la del servidor de `pnpm local`. */
	direccion: string;
	cubo: string;
	llaveId: string;
	secreto: string;
}

/** Los dos cubos: el de los archivos y el de los respaldos (docs/cimientos/INFRAESTRUCTURA.md). */
export const cubos = { archivos: "uniformame-archivos", respaldos: "uniformame-respaldos" } as const;

/** La suma SHA-256 de hexadecimal a base64, como la pide S3. */
function hexABase64(hex: string): string {
	return Buffer.from(hex, "hex").toString("base64");
}

/** La suma SHA-256 de base64 (como la da S3) a hexadecimal. */
function base64AHex(base64: string): string {
	return Buffer.from(base64, "base64").toString("hex");
}

/** Dice si un error de S3 es «no está». */
function noEsta(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"$metadata" in error &&
		typeof error.$metadata === "object" &&
		error.$metadata !== null &&
		"httpStatusCode" in error.$metadata &&
		error.$metadata.httpStatusCode === 404
	);
}

/**
 * La dirección de R2 de una cuenta.
 * @param cuenta El identificador de la cuenta de Cloudflare (`R2_CUENTA`).
 */
export function direccionDeR2(cuenta: string): string {
	return `https://${cuenta}.r2.cloudflarestorage.com`;
}

/**
 * Arma el almacén sobre un cubo de R2 (o de un servidor compatible con S3).
 * @param conexion La dirección, el cubo y su credencial.
 */
export function crearAlmacen(conexion: ConexionDelAlmacen): Almacen {
	const cliente = new S3Client({
		endpoint: conexion.direccion,
		region: "auto",
		forcePathStyle: true,
		credentials: { accessKeyId: conexion.llaveId, secretAccessKey: conexion.secreto },
		requestChecksumCalculation: "WHEN_REQUIRED",
		responseChecksumValidation: "WHEN_REQUIRED",
	});
	const Bucket = conexion.cubo;
	return {
		async direccionDeSubida(clave, objeto, segundos) {
			const encabezados = {
				"content-type": objeto.tipo,
				"content-length": String(objeto.tamano),
				"x-amz-checksum-sha256": hexABase64(objeto.sha256),
			};
			const url = await getSignedUrl(
				cliente,
				new PutObjectCommand({
					Bucket,
					Key: clave,
					ContentType: objeto.tipo,
					ContentLength: objeto.tamano,
					ChecksumSHA256: encabezados["x-amz-checksum-sha256"],
				}),
				{
					expiresIn: segundos,
					// Firmados como encabezados, no en la dirección: el cliente los tiene que mandar tal cual.
					signableHeaders: new Set(Object.keys(encabezados)),
					unhoistableHeaders: new Set(Object.keys(encabezados)),
				},
			);
			return { url, encabezados };
		},
		async direccionDeBajada(clave, opciones, segundos) {
			const nombre = encodeURIComponent(opciones.nombre);
			return getSignedUrl(
				cliente,
				new GetObjectCommand({
					Bucket,
					Key: clave,
					ResponseContentDisposition: `${opciones.descarga ? "attachment" : "inline"}; filename*=UTF-8''${nombre}`,
				}),
				{ expiresIn: segundos },
			);
		},
		async revisar(clave) {
			try {
				const objeto = await cliente.send(new HeadObjectCommand({ Bucket, Key: clave, ChecksumMode: "ENABLED" }));
				return {
					tamano: objeto.ContentLength ?? 0,
					sha256: objeto.ChecksumSHA256 === undefined ? undefined : base64AHex(objeto.ChecksumSHA256),
				};
			} catch (error) {
				if (noEsta(error)) return undefined;
				throw error;
			}
		},
		async guardarFlujo(clave, flujo, tipo, antesDeCerrar) {
			const { UploadId } = await cliente.send(
				new CreateMultipartUploadCommand({ Bucket, Key: clave, ContentType: tipo, ChecksumAlgorithm: "SHA256" }),
			);
			const suma = createHash("sha256");
			const partes: { PartNumber: number; ETag: string | undefined; ChecksumSHA256: string }[] = [];
			let pendiente: Uint8Array[] = [];
			let enEspera = 0;
			let tamano = 0;
			/** Sube lo que va juntado como una parte. */
			const subirParte = async () => {
				const parte = Buffer.concat(pendiente);
				pendiente = [];
				enEspera = 0;
				const ChecksumSHA256 = createHash("sha256").update(parte).digest("base64");
				const PartNumber = partes.length + 1;
				const subida = await cliente.send(
					new UploadPartCommand({ Bucket, Key: clave, UploadId, PartNumber, Body: parte, ChecksumSHA256 }),
				);
				partes.push({ PartNumber, ETag: subida.ETag, ChecksumSHA256 });
			};
			try {
				for await (const pedazo of flujo) {
					suma.update(pedazo);
					tamano += pedazo.byteLength;
					pendiente.push(pedazo);
					enEspera += pedazo.byteLength;
					if (enEspera >= tamanoDeParte) await subirParte();
				}
				if (enEspera > 0 || partes.length === 0) await subirParte();
				await antesDeCerrar?.();
				await cliente.send(
					new CompleteMultipartUploadCommand({ Bucket, Key: clave, UploadId, MultipartUpload: { Parts: partes } }),
				);
			} catch (error) {
				// Se cancela lo subido; si cancelar también falla, el error que importa es el primero.
				await cliente.send(new AbortMultipartUploadCommand({ Bucket, Key: clave, UploadId })).catch(() => undefined);
				throw error;
			}
			return { tamano, sha256: suma.digest("hex") };
		},
		async guardar(clave, contenido, tipo) {
			await cliente.send(
				new PutObjectCommand({
					Bucket,
					Key: clave,
					Body: contenido,
					ContentType: tipo,
					ChecksumSHA256: createHash("sha256").update(contenido).digest("base64"),
				}),
			);
		},
	};
}

/** La dirección del almacén: la de `pnpm local` o la de R2 de la cuenta. */
export function direccionDelAlmacen(entorno: Entorno): string | undefined {
	const cuenta = entorno.R2_CUENTA;
	return entorno.R2_DIRECCION ?? (cuenta === undefined ? undefined : direccionDeR2(cuenta));
}

/**
 * El almacén de archivos según el entorno, para la API (las subidas y las descargas) y para lo que genera
 * el worker (el ZIP del contador, las guías): el cubo de archivos con su credencial. Sin ella, las rutas de
 * los archivos no existen y `admin.guardar_archivo` falla en el worker.
 */
export function almacenDeArchivosDelEntorno(entorno: Entorno): { almacen?: Almacen } {
	const direccion = direccionDelAlmacen(entorno);
	const llaveId = entorno.R2_ARCHIVOS_LLAVE_ID;
	const secreto = entorno.R2_ARCHIVOS_SECRETO;
	if (direccion === undefined || llaveId === undefined || secreto === undefined) return {};
	return { almacen: crearAlmacen({ direccion, cubo: cubos.archivos, llaveId, secreto }) };
}
