/**
 * La entrada de Compras en el menú: su ícono. Su nombre, su grupo, su orden y su pastilla vienen de `admin.armazon`.
 * Fase 19 · docs/cimientos/ESTRUCTURA.md («Las pantallas por dentro») y docs/interfaz/comunes.md («El menú lateral»)
 */

import { ShoppingCart } from "lucide-react";
import type { EntradaDelMenu } from "../../comun/menu.ts";

export const menu: EntradaDelMenu = { icono: ShoppingCart };
