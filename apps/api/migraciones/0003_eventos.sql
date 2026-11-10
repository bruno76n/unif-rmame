CREATE TABLE "eventos" (
	"id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"modulo" text NOT NULL,
	"entidad" text,
	"entidad_id" uuid,
	"entidad_folio" text,
	"datos" jsonb,
	"tablas" text[] NOT NULL,
	"ubicacion_ids" uuid[] DEFAULT '{}' NOT NULL,
	"usuario_id" uuid,
	"persona_id" uuid,
	"dispositivo_id" uuid,
	"comando_id" uuid,
	"ocurrido_en" timestamp with time zone NOT NULL,
	"procesado_en" timestamp with time zone,
	"intentos" smallint DEFAULT 0 NOT NULL,
	"siguiente_intento_en" timestamp with time zone,
	"ultimo_error" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eventos_id_creado_en_pk" PRIMARY KEY("id","creado_en")
) PARTITION BY RANGE ("creado_en");
--> statement-breakpoint
CREATE TABLE "trabajos_vueltas" (
	"trabajo" text NOT NULL,
	"periodo" text NOT NULL,
	"encolado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"terminado_en" timestamp with time zone,
	"intentos" integer DEFAULT 0 NOT NULL,
	"ultimo_error" text,
	CONSTRAINT "trabajos_vueltas_trabajo_periodo_pk" PRIMARY KEY("trabajo","periodo")
);
--> statement-breakpoint
CREATE INDEX "eventos_pendientes" ON "eventos" USING btree ("creado_en") WHERE "eventos"."procesado_en" is null;--> statement-breakpoint
CREATE INDEX "eventos_entidad" ON "eventos" USING btree ("entidad","entidad_id");--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md, «Tablas que crecen sin parar»): las particiones por mes.
-- Crea las particiones de una tabla partida por mes, del mes en curso a `meses` más adelante, y la de
-- respaldo (`_otros`) que recibe lo que caiga fuera. Los meses son de UTC: es un corte técnico, no de
-- negocio. Corre con los permisos del dueño para que el reloj del worker la pueda llamar. La app no tiene
-- permisos sobre las particiones: entra por la tabla madre, que es la que dice qué puede hacer.
CREATE FUNCTION asegurar_particiones(tabla regclass, meses integer) RETURNS void
	LANGUAGE plpgsql SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
DECLARE
	nombre text := (SELECT relname FROM pg_class WHERE oid = tabla);
	inicio timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
	desde timestamptz;
BEGIN
	EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I PARTITION OF %s DEFAULT', nombre || '_otros', tabla);
	EXECUTE format('REVOKE ALL ON public.%I FROM uniformame_app', nombre || '_otros');
	FOR i IN 0..meses LOOP
		desde := inicio + make_interval(months => i);
		EXECUTE format(
			'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
			nombre || '_' || to_char(desde AT TIME ZONE 'UTC', 'YYYY_MM'),
			tabla,
			desde,
			desde + interval '1 month'
		);
		-- La app entra solo por la tabla madre, con sus permisos; a la partición, directo, no.
		EXECUTE format('REVOKE ALL ON public.%I FROM uniformame_app', nombre || '_' || to_char(desde AT TIME ZONE 'UTC', 'YYYY_MM'));
	END LOOP;
END
$$;
--> statement-breakpoint
-- Suelta las particiones de `eventos` que terminan antes de `antes` y ya no tienen nada sin procesar.
-- Regresa cuántas soltó. Es lo único que se depura de los eventos (docs/cimientos/EVENTOS-Y-TRABAJOS.md).
CREATE FUNCTION soltar_particiones_de_eventos(antes timestamptz) RETURNS integer
	LANGUAGE plpgsql SECURITY DEFINER
	SET search_path = pg_catalog, public
	AS $$
DECLARE
	particion record;
	pendientes boolean;
	sueltas integer := 0;
BEGIN
	FOR particion IN
		SELECT hija.oid::regclass AS tabla,
			(regexp_match(pg_get_expr(hija.relpartbound, hija.oid), 'TO \(''([^'']+)''\)'))[1]::timestamptz AS hasta
		FROM pg_inherits
		JOIN pg_class hija ON hija.oid = pg_inherits.inhrelid
		WHERE pg_inherits.inhparent = 'public.eventos'::regclass
			AND pg_get_expr(hija.relpartbound, hija.oid) <> 'DEFAULT'
	LOOP
		CONTINUE WHEN particion.hasta > antes;
		EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE procesado_en IS NULL)', particion.tabla) INTO pendientes;
		CONTINUE WHEN pendientes;
		EXECUTE format('DROP TABLE %s', particion.tabla);
		sueltas := sueltas + 1;
	END LOOP;
	RETURN sueltas;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION asegurar_particiones(regclass, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION soltar_particiones_de_eventos(timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION asegurar_particiones(regclass, integer) TO uniformame_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION soltar_particiones_de_eventos(timestamptz) TO uniformame_app;
--> statement-breakpoint
SELECT asegurar_particiones('public.eventos', 2);
--> statement-breakpoint
-- De un evento solo cambian las columnas del proceso.
REVOKE UPDATE ON eventos FROM uniformame_app;
--> statement-breakpoint
GRANT UPDATE (procesado_en, intentos, siguiente_intento_en, ultimo_error) ON eventos TO uniformame_app;
