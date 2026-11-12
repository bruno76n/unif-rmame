ALTER TABLE "pagos" DROP CONSTRAINT "pagos_monto";--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_monto" CHECK ("pagos"."monto_centavos" > 0);