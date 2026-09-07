-- Agendamento por link: de slots fixos para faixas livres, e de vários links
-- nomeados para UM link por dono. Escrito à mão — o auto-gerado adiciona a
-- coluna NOT NULL sem backfill e cria o índice único sem deduplicar, e as duas
-- coisas explodem em qualquer banco com dados.
--
-- ATENÇÃO: é migração de mão única. A disponibilidade semanal configurada em
-- `availability` é perdida, e os links não-eleitos param de funcionar.

-- ══ 1. Duração da solicitação ═══════════════════════════════════════════════
-- O visitante agora informa início E fim; a solicitação passa a carregar a
-- própria duração em vez de herdar o default do link no momento do aceite.
ALTER TABLE "booking_requests" ADD COLUMN "requested_duration_minutes" integer;--> statement-breakpoint

-- Backfill antes do NOT NULL. Linhas antigas herdam o default do link de
-- origem; as que já perderam o link (FK ON DELETE SET NULL) ficam com 30, que é
-- exatamente o fallback que o serviço aplicava na prática — nada muda
-- retroativamente. Roda ANTES do passo 4, que mexe em `booking_link_id`.
UPDATE "booking_requests" r
SET "requested_duration_minutes" = COALESCE(
  (SELECT l."default_duration_minutes" FROM "booking_links" l WHERE l."id" = r."booking_link_id"),
  30
);--> statement-breakpoint
ALTER TABLE "booking_requests" ALTER COLUMN "requested_duration_minutes" SET NOT NULL;--> statement-breakpoint

-- ══ 2. Eleger o link sobrevivente de cada dono ══════════════════════════════
-- Vencedor = link ativo, mais usado, desempatando pelo mais antigo. É o token
-- com maior chance de já estar circulando por aí, e trocar em silêncio o token
-- público de alguém quebra o link de todo mundo que o tem.
CREATE TEMP TABLE booking_link_winner AS
SELECT "owner_user_id", "id" AS winner_id
FROM (
  SELECT l."owner_user_id",
         l."id",
         ROW_NUMBER() OVER (
           PARTITION BY l."owner_user_id"
           ORDER BY l."active" DESC,
                    (SELECT COUNT(*) FROM "booking_requests" r
                      WHERE r."booking_link_id" = l."id") DESC,
                    l."created_at" ASC,
                    l."id" ASC
         ) AS rn
  FROM "booking_links" l
) ranked
WHERE rn = 1;--> statement-breakpoint

-- ══ 3. Repontar o histórico ANTES de apagar ═════════════════════════════════
-- Obrigatoriamente antes do DELETE: a FK é ON DELETE SET NULL, então apagar
-- primeiro orfanaria as solicitações em silêncio, sem erro nenhum. O `IS NULL`
-- no WHERE ainda repara as que já estavam órfãs — dá para fazer porque
-- `owner_user_id` é desnormalizado na própria solicitação.
UPDATE "booking_requests" r
SET "booking_link_id" = w.winner_id
FROM booking_link_winner w
WHERE r."owner_user_id" = w."owner_user_id"
  AND (r."booking_link_id" IS NULL OR r."booking_link_id" <> w.winner_id);--> statement-breakpoint

DELETE FROM "booking_links" l
USING booking_link_winner w
WHERE l."owner_user_id" = w."owner_user_id" AND l."id" <> w.winner_id;--> statement-breakpoint

DROP TABLE booking_link_winner;--> statement-breakpoint

-- ══ 4. Travar a unicidade ═══════════════════════════════════════════════════
DROP INDEX "booking_links_owner_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "booking_links_owner_idx" ON "booking_links" USING btree ("owner_user_id");--> statement-breakpoint

-- ══ 5. Modelo de link único ═════════════════════════════════════════════════
-- Disponibilidade semanal não existe mais no produto. Dropar (em vez de deixar
-- a coluna morta) importa: a API do dono devolve a linha crua, então manter
-- significaria continuar vazando `availability` como se fosse suportada.
ALTER TABLE "booking_links" DROP COLUMN "availability";--> statement-breakpoint
-- `name` deixa de identificar um link entre vários e vira só o título da página
-- pública. Vazio é legítimo: cai no nome do dono ("Agendar com Fulano").
ALTER TABLE "booking_links" ALTER COLUMN "name" SET DEFAULT '';--> statement-breakpoint

-- ══ 6. Índice do cálculo de faixas ══════════════════════════════════════════
CREATE INDEX "booking_requests_owner_date_idx"
  ON "booking_requests" USING btree ("owner_user_id","requested_date");
