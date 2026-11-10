# Unifórmame

> **Qué cubre:** qué es Unifórmame, para quién es, qué entra ahora y qué después, el orden en que se construye y los principios que nunca se rompen.
> **Estado:** Decidido.
> **Se construye en:** [fase 1](fases/01-repositorio-reglas-y-paquete-compartido.md).
> **Se conecta con:** [AGENTS.md](../AGENTS.md) · [fases](fases/FASES.md) · [glosario](GLOSARIO.md) · [decisiones](DECISIONES.md) · [registros](registros/REGISTROS.md) · [permisos](modulos/admin/permisos.md) · [arquitectura](cimientos/ARQUITECTURA.md)

## Qué es

Unifórmame es el sistema a la medida de **Uniformes Alameda**, una fábrica familiar de uniformes escolares. Junta en un solo lugar lo que hoy vive en papel, en hojas de cálculo, en un punto de venta provisional y en mensajes de WhatsApp: los pedidos de las escuelas y los mayoristas, las compras de tela, el corte y la costura, la aduana y la bodega, las dos tiendas, la tienda en línea, el dinero y la nómina.

Es **una sola API sobre una sola base de datos**. Todo lo que se ve en una pantalla, en la tablet del taller o, después, en la caja de una tienda sale de ahí.

## El negocio en pocas líneas

- **Qué se hace:** uniformes escolares (playeras polo, pantalones, pants y las demás prendas del catálogo) para escuelas, mayoristas y venta de mostrador. La temporada fuerte es el regreso a clases.
- **Cómo se fabrica:** Compras consigue la tela y los avíos; Patronaje escribe la receta de cada prenda; Producción corta lotes y los parte en bultos; el taller los cose operación por operación y registra cada bulto en la tablet; Calidad revisa; Aduana cuenta todo lo que entra y sale; Bodega guarda y surte.
- **Cómo se vende:** a clientes externos con pedidos talla por talla (PE-) y notas de entrega (NV-); en las dos tiendas (Tienda 1 y Tienda 2); y en línea (pedidos W-).
- **Ejemplo de todo junto:** el Instituto Juan Pablo II pide 190 polos en el PE-0145; Ventas lo manda a producción; se corta el lote L-2026-122 con tres rollos; el taller lo cose; Calidad lo revisa; Aduana lo cuenta a ciegas; Ventas arma la nota de entrega NV-0151; Aduana despacha; el cliente firma y en ese momento nace la cuenta por cobrar en Contaduría.

## Para quién

- **La dueña.** Ve todo. Solo ella da y quita accesos, registra y revoca aparatos, cambia los parámetros del negocio y registra las pruebas de restauración.
- **Los 15 departamentos de la fábrica**, en sus grupos (la Puerta del taller es la tablet; no sale en el menú de la web):

  | Grupo | Departamentos |
  |---|---|
  | — | Dirección |
  | Operación | Compras · Catálogo · Patronaje · Ventas a externos · Tienda en línea |
  | Taller | Producción · Puerta del taller · Calidad · Mantenimiento |
  | Almacén | Aduana · Bodega |
  | Administración | Contaduría · Personal · Administración del sistema |

  Cada cuenta ve solo los departamentos que la dueña le dio. Las cuentas de hoy son la dueña, la oficina, aduana y bodega, y el encargado del taller.
- **El taller.** Las costureras no tienen cuenta: eligen su nombre en la tablet y meten su PIN de cuatro cifras.
- **Después, las tiendas.** La caja de cada tienda habla con la misma API, pero el personal de tienda nunca entra al sistema de la fábrica.

Quién ve qué, con detalle, está en [permisos](modulos/admin/permisos.md).

## Qué entra ahora y qué después

**Ahora (las 23 fases de [FASES.md](fases/FASES.md)):**

- el sistema de la fábrica, con sus 15 departamentos;
- la tablet del taller, que trabaja sin internet;
- el programa puente que imprime etiquetas en las Zebra;
- la API completa, ya lista para la caja y para uniformame.mx: la sincronización de aparatos, la credencial limitada y los pedidos W- que recibe Tienda en línea.

**Después, en este orden:**

1. **El POS de las tiendas** (Electron con SQLite), en este mismo repositorio, sobre la misma API y la misma base.
2. **uniformame.mx**, la tienda en línea, con su vitrina y su panel.

Lo que no entra ahora está en «Para después» de [REGISTROS.md](registros/REGISTROS.md). Ninguna idea nueva entra a escondidas.

**Por qué en este orden:** las tiendas y la tienda en línea dependen de lo que pasa en la fábrica (el catálogo, la existencia, los traspasos). Primero la fábrica funciona y se adapta; después las tiendas se conectan a algo que ya existe; al final la tienda en línea, cuando todo lo demás ya se usa.

## Principios

Valen para todo el sistema y para todas las fases. Nadie los rompe, ni para llegar al verde.

1. **Los archivos de creación son la fuente de verdad: lo que no está escrito no se construye.** El código sale de lo decidido. Si algo no está escrito, primero se decide y se escribe; si algo choca con lo escrito, se dice antes de construirlo. Así el sistema hace lo que el negocio pidió, no lo que alguien supuso.
2. **El inventario es la suma de movimientos; toda pieza está en un solo lugar, y nada pasa de un lugar a otro sin que lo confirmen los dos lados.** Bruno: cada pieza en un solo lugar. Si algo falta, siempre se sabe dónde estaba y quién la tenía.
3. **Nada se borra:** se cancela, se da de baja o se corrige con otro documento ligado. Siempre se puede saber qué pasó, quién lo hizo y qué había antes.
4. **Una acción es una transacción, con su clave de idempotencia, su bitácora y sus eventos.** O se hace todo o no se hace nada, y un reintento nunca duplica. El internet de la fábrica y de las tiendas se cae; el sistema no se rompe por eso.
5. **Dinero en centavos; fechas de negocio en hora de México.** Los centavos enteros no pierden ni un peso al sumar. El día de negocio no se cambia a las seis de la tarde porque el servidor cuenta en otra hora.
6. **Nadie ve ni hace más de lo que su cuenta permite, y la base nunca se expone.** Bruno: «por ninguna circunstancia el de la tienda tiene que tener entrada» y «los de las máquinas no pueden entrar al CRM de contaduría». El permiso se revisa en el servidor, y lo que una cuenta no debe ver no viaja.
7. **Ningún dato del negocio en la lógica.** Plazos, porcentajes, mínimos, tarifas, listas y opciones de operación son datos o parámetros con su valor inicial, y solo la dueña los cambia. Bruno: «esos datos se deben de poder configurar en el sistema, no están metidos en la lógica».

## Lo que no es

- **No es multiempresa.** Hay una sola empresa; las tablas no llevan empresa.
- **No es un sistema público.** La API no tiene clientes de fuera: su documentación existe solo en local, para quien la construye.
- **No reemplaza a Google ni al contador.** Se entra con la cuenta de Google, sin contraseñas propias; la contabilidad la lleva el contador externo con el paquete que le manda Contaduría.
