ALTER TABLE "pagos" DROP CONSTRAINT "pagos_monto";--> statement-breakpoint
DROP INDEX "anticipos_aplicado";--> statement-breakpoint
CREATE UNIQUE INDEX "anticipos_aplicado" ON "anticipos" USING btree ("anticipo_aplicado_id") WHERE "anticipos"."estado" = 'vigente';--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_monto" CHECK ("pagos"."monto_centavos" > 0
				and ("pagos"."monto_centavos" % 100 = 0 or "pagos"."concepto" in ('nota', 'devolucion_saldo_favor')));