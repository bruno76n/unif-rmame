-- Custom SQL migration file, put your code below! --
-- Escrito a mano (auditoría de la fase 2): el disparador ya no se puede engañar con una secuencia temporal.
-- La función busca solo en pg_catalog y public, y nombra la secuencia con su esquema.
CREATE OR REPLACE FUNCTION poner_columnas_comunes() RETURNS trigger
	LANGUAGE plpgsql
	SET search_path = pg_catalog, public
	AS $$
BEGIN
	NEW.version := nextval('public.version_global');
	NEW.actualizado_en := now();
	IF TG_ARGV[0] = 'baja_a_aparatos' THEN
		NEW.xid_escritura := pg_current_xact_id();
	END IF;
	RETURN NEW;
END
$$;
--> statement-breakpoint
-- La app no crea objetos temporales: ni secuencias ni tablas que tapen a las del sistema.
DO $$
BEGIN
	EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
	-- Si quien migra no es dueño de la base, el REVOKE solo avisa: aquí no se sigue sin quitarlo.
	IF has_database_privilege('uniformame_app', current_database(), 'TEMP') THEN
		RAISE EXCEPTION 'uniformame_app todavía puede crear objetos temporales: migra con el dueño de la base';
	END IF;
END
$$;
--> statement-breakpoint
-- «baja» se confundía con «dar de baja»: el argumento dice que la tabla baja a los aparatos.
DROP FUNCTION poner_disparador_comun(regclass, boolean);
--> statement-breakpoint
CREATE FUNCTION poner_disparador_comun(tabla regclass, baja_a_aparatos boolean DEFAULT false) RETURNS void
	LANGUAGE plpgsql
	SET search_path = pg_catalog, public
	AS $$
BEGIN
	EXECUTE format(
		'CREATE TRIGGER columnas_comunes BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION public.poner_columnas_comunes(%L)',
		tabla,
		CASE WHEN baja_a_aparatos THEN 'baja_a_aparatos' ELSE 'no_baja' END
	);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION poner_disparador_comun(regclass, boolean) FROM PUBLIC;
