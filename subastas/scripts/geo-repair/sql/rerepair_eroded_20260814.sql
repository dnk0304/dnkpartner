-- MUNI-B erosion re-repair -- 19 rows (2026-08-14)
--
-- These rows were repaired by the MUNI-B pass and then silently re-dirtied by the
-- TGSS and PLABI scrapers, which wrote `municipality` through the OLD normalizer
-- (canonical_municipality_name title-cases anything it does not recognise). Only
-- the BOE path carried the ingest guard until 485cb15 added it to those two.
--
-- Run AFTER the guard is live (wave194-a9a8262 deployed 2026-08-14). Running it
-- before the deploy just re-arms the same erosion.
--
-- Every UPDATE is guarded on the CURRENT dirty value, so it is a no-op for any row
-- that a post-deploy TGSS/PLABI pass has already self-healed -- the guard rewrites
-- these to the canonical name on re-scrape rather than merely refusing to clobber.
--
-- Rollback for the whole MUNI-B pass remains geo_muni_pre_snapshot_20260813
-- (full 241,335-row before-image) and ghost_muni_snapshot_20260813 (per-row ledger).
--
-- Verify afterwards -- expect 0:
--   SELECT count(*) FROM ghost_muni_snapshot_20260813 l
--   JOIN "Auction" a ON a.id = l.id
--   JOIN geo_muni_pre_snapshot_20260813 s ON s.id = l.id
--   WHERE a.municipality IS NOT DISTINCT FROM s.municipality;

BEGIN;
-- SUB-PLABI-PLB1t00035040100  [Madrid]  'Molinos (los)' -> 'Los Molinos'
UPDATE "Auction" SET municipality = 'Los Molinos' WHERE id = '811924fa-3525-4e8e-a542-87b4f9daace7' AND municipality = 'Molinos (los)';
-- SUB-SS-101  [Alicante]  'Elche/elx' -> 'Elx/Elche'
UPDATE "Auction" SET municipality = 'Elx/Elche' WHERE id = 'd0ec10c2-48ef-438c-bafe-c36d2d77e278' AND municipality = 'Elche/elx';
-- SUB-SS-209  [Barcelona]  'Hospitalet de Llobregat,' -> "L'Hospitalet de Llobregat"
UPDATE "Auction" SET municipality = 'L''Hospitalet de Llobregat' WHERE id = '5867513c-3fb8-4dac-91dc-7aa5500fecc5' AND municipality = 'Hospitalet de Llobregat,';
-- SUB-SS-214  [Girona]  'Castell' -> "Castell d'Aro, Platja d'Aro i s'Agaró"
UPDATE "Auction" SET municipality = 'Castell d''Aro, Platja d''Aro i s''Agaró' WHERE id = '241ff493-cbbb-48ac-b142-7d17f79d21c4' AND municipality = 'Castell';
-- SUB-SS-215  [Girona]  'Castell' -> "Castell d'Aro, Platja d'Aro i s'Agaró"
UPDATE "Auction" SET municipality = 'Castell d''Aro, Platja d''Aro i s''Agaró' WHERE id = '3e8e41dd-fe88-4926-b56a-8c40dc393abe' AND municipality = 'Castell';
-- SUB-SS-259  [Cádiz]  'Chiclana' -> 'Chiclana de la Frontera'
UPDATE "Auction" SET municipality = 'Chiclana de la Frontera' WHERE id = '9dcc83ee-15fd-463f-8a9a-45f0b3fc4bae' AND municipality = 'Chiclana';
-- SUB-SS-260  [Cádiz]  'La Linea Concepcion' -> 'La Línea de la Concepción'
UPDATE "Auction" SET municipality = 'La Línea de la Concepción' WHERE id = 'afd25a7f-b379-47b6-b6a7-875fc845068f' AND municipality = 'La Linea Concepcion';
-- SUB-SS-261  [Cádiz]  'La Linea Concepcion' -> 'La Línea de la Concepción'
UPDATE "Auction" SET municipality = 'La Línea de la Concepción' WHERE id = '74bd3673-03e2-4995-922a-f7f5e11c7c40' AND municipality = 'La Linea Concepcion';
-- SUB-SS-263  [Cádiz]  'Línea de la Concepción, L' -> 'La Línea de la Concepción'
UPDATE "Auction" SET municipality = 'La Línea de la Concepción' WHERE id = '81b92d3c-5e30-4002-b139-52bd82e346c0' AND municipality = 'Línea de la Concepción, L';
-- SUB-SS-264  [Cádiz]  'Línea de la Concepción, L' -> 'La Línea de la Concepción'
UPDATE "Auction" SET municipality = 'La Línea de la Concepción' WHERE id = '8d9c38c7-f668-4c54-a3e7-5c560223eae9' AND municipality = 'Línea de la Concepción, L';
-- SUB-SS-267  [Cádiz]  'Línea de la Concepción, L' -> 'La Línea de la Concepción'
UPDATE "Auction" SET municipality = 'La Línea de la Concepción' WHERE id = 'fe5a3e3a-7b22-44be-8d31-cb21a57ad99b' AND municipality = 'Línea de la Concepción, L';
-- SUB-SS-288  [Castellón]  'Vila' -> 'Vila-real'
UPDATE "Auction" SET municipality = 'Vila-real' WHERE id = '3b5e060a-8899-4acd-87a6-0bbdb3c69260' AND municipality = 'Vila';
-- SUB-SS-328  [Málaga]  'Vélez' -> 'Vélez-Málaga'
UPDATE "Auction" SET municipality = 'Vélez-Málaga' WHERE id = 'f957729a-43f1-4c9f-b9f1-6753fe4fcd12' AND municipality = 'Vélez';
-- SUB-SS-5  [Alicante]  'Villajoyosa/vila Joiosa,' -> 'la Vila Joiosa/Villajoyosa'
UPDATE "Auction" SET municipality = 'la Vila Joiosa/Villajoyosa' WHERE id = '2745c6f6-0e2c-4522-bce3-8a1228712306' AND municipality = 'Villajoyosa/vila Joiosa,';
-- SUB-SS-61  [Alicante]  'San Vicente del Raspeig/s' -> 'Sant Vicent del Raspeig/San Vicente del Raspeig'
UPDATE "Auction" SET municipality = 'Sant Vicent del Raspeig/San Vicente del Raspeig' WHERE id = 'eef72179-78e5-4c96-827a-0e86f8c304c9' AND municipality = 'San Vicente del Raspeig/s';
-- SUB-SS-659  [Las Palmas]  'Palmas de Gran Canaria, L' -> 'Las Palmas de Gran Canaria'
UPDATE "Auction" SET municipality = 'Las Palmas de Gran Canaria' WHERE id = '9ac4a796-cf16-4e95-986b-ec90b1b13d97' AND municipality = 'Palmas de Gran Canaria, L';
-- SUB-SS-727  [Sevilla]  'Bollullos Mitacion' -> 'Bollullos de la Mitación'
UPDATE "Auction" SET municipality = 'Bollullos de la Mitación' WHERE id = '8bf49997-e8e4-455c-86da-9f2f205ca894' AND municipality = 'Bollullos Mitacion';
-- SUB-SS-87  [Alicante]  'Alcoy/alcoi' -> 'Alcoi/Alcoy'
UPDATE "Auction" SET municipality = 'Alcoi/Alcoy' WHERE id = 'c97a8740-8bfc-4759-8e60-46279092a74d' AND municipality = 'Alcoy/alcoi';
-- SUB-SS-89  [Alicante]  'Elche/elx' -> 'Elx/Elche'
UPDATE "Auction" SET municipality = 'Elx/Elche' WHERE id = 'b515ac3a-91d3-4953-9d63-ff8345fd5fa9' AND municipality = 'Elche/elx';
COMMIT;
