/**
 * La plantilla del correo de un aviso, con los componentes de React Email.
 * Fase 4 · docs/modulos/admin/avisos.md («El correo»)
 *
 * Una sola plantilla: el texto del aviso, el botón al enlace (con la dirección completa de la web) y la
 * marca de la empresa. El texto ya viene sin montos ni sueldos. Sin JSX: Node corre este archivo tal cual,
 * así que los elementos se arman con `createElement`.
 */

import { Body } from "@react-email/body";
import { Button } from "@react-email/button";
import { Container } from "@react-email/container";
import { Head } from "@react-email/head";
import { Hr } from "@react-email/hr";
import { Html } from "@react-email/html";
import { Preview } from "@react-email/preview";
import { Text } from "@react-email/text";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** Lo que lleva el correo de un aviso. */
export interface CorreoDeAviso {
	texto: string;
	/** La dirección completa a la pantalla donde se atiende, si la hay. */
	enlace: string | undefined;
	/** El nombre comercial de la empresa. */
	marca: string;
}

/**
 * Arma el HTML y el texto plano del correo de un aviso.
 * @param correo El texto, el enlace y la marca.
 */
export function armarCorreoDeAviso(correo: CorreoDeAviso): { html: string; texto: string } {
	const cuerpo = h(
		Html,
		{ lang: "es" },
		h(Head),
		h(Preview, null, correo.texto),
		h(
			Body,
			{ style: { fontFamily: "Arial, sans-serif", backgroundColor: "#ffffff" } },
			h(
				Container,
				null,
				h(Text, { style: { fontSize: "16px" } }, correo.texto),
				correo.enlace === undefined
					? null
					: h(
							Button,
							{ href: correo.enlace, style: { padding: "10px 16px", backgroundColor: "#1f2937", color: "#ffffff" } },
							"Abrir en Unifórmame",
						),
				h(Hr),
				h(Text, { style: { fontSize: "12px", color: "#6b7280" } }, correo.marca),
			),
		),
	);
	const html = `<!DOCTYPE html>${renderToStaticMarkup(cuerpo)}`;
	const texto = [correo.texto, correo.enlace ?? "", correo.marca].filter((linea) => linea !== "").join("\n\n");
	return { html, texto };
}
