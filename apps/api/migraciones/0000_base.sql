CREATE SEQUENCE "public"."version_global" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
-- Escrito a mano (docs/cimientos/BASE-DE-DATOS.md): lo que drizzle-kit no genera.
-- Comparar sin acentos ni mayúsculas.
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE FUNCTION sin_acentos(texto text) RETURNS text
	LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
	AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, lower(texto)) $$;
--> statement-breakpoint
-- El rol de la app: con él se conectan la API y el worker. Sin contraseña aquí: cada máquina se la pone.
DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'uniformame_app') THEN
		CREATE ROLE uniformame_app NOLOGIN;
	END IF;
END
$$;
--> statement-breakpoint
-- Las transacciones son cortas: una que se queda abierta sin hacer nada se corta a los 60 segundos.
ALTER ROLE uniformame_app SET idle_in_transaction_session_timeout = '60s';
--> statement-breakpoint
-- Nada se borra: la app lee, agrega y cambia, pero nunca borra. Lo que se depura lo concede su tabla.
GRANT USAGE ON SCHEMA public TO uniformame_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO uniformame_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO uniformame_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE version_global TO uniformame_app;
--> statement-breakpoint
-- El disparador de las columnas comunes: version, actualizado_en y, en las tablas que bajan, xid_escritura.
-- Corre antes de cada escritura y pisa lo que traiga el renglón: el código nunca las pone a mano.
CREATE FUNCTION poner_columnas_comunes() RETURNS trigger
	LANGUAGE plpgsql
	AS $$
BEGIN
	NEW.version := nextval('version_global');
	NEW.actualizado_en := now();
	IF TG_ARGV[0] = 'baja' THEN
		NEW.xid_escritura := pg_current_xact_id();
	END IF;
	RETURN NEW;
END
$$;
--> statement-breakpoint
-- Pone el disparador en una tabla de negocio. Cada migración que crea una tabla de negocio lo llama.
CREATE FUNCTION poner_disparador_comun(tabla regclass, baja boolean DEFAULT false) RETURNS void
	LANGUAGE plpgsql
	AS $$
BEGIN
	EXECUTE format(
		'CREATE TRIGGER columnas_comunes BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION poner_columnas_comunes(%L)',
		tabla,
		CASE WHEN baja THEN 'baja' ELSE 'no_baja' END
	);
END
$$;
--> statement-breakpoint
-- Marca una tabla que solo crece: la app ya no la puede cambiar.
CREATE FUNCTION marcar_solo_crece(tabla regclass) RETURNS void
	LANGUAGE plpgsql
	AS $$
BEGIN
	EXECUTE format('REVOKE UPDATE ON %s FROM uniformame_app', tabla);
END
$$;
--> statement-breakpoint
-- Los ayudantes de las migraciones no los corre la app.
REVOKE ALL ON FUNCTION poner_disparador_comun(regclass, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION marcar_solo_crece(regclass) FROM PUBLIC;
