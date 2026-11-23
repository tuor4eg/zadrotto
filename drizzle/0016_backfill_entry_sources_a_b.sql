-- Verified adaptation-to-source pairs from entry-sources-A-B.csv.
-- Resolve stable catalogue codes so environments can use different numeric IDs.
DO $$
DECLARE
    missing_count integer;
    inserted_count integer;
BEGIN
    WITH pairs(adaptation_code, source_code) AS (
        VALUES
        ('film-30-dnei-nochi-b12444e9', 'comic-30-days-of-night-5951038c'),
        ('game-the-walking-dead-the-game', 'comic-the-walking-dead-cb263f7b'),
        ('series-hodyachie-mertvecy-41fdcba7', 'comic-the-walking-dead-cb263f7b'),
        ('film-v-znachit-vendetta-1f85a925', 'comic-v-for-vendetta-94475130'),
        ('film-avtostopom-po-galaktike-bb493608', 'book-putevoditel-po-galaktike-dlya-puteshestvuyuschih-f746502e'),
        ('series-amerikanskie-bogi-70ca7645', 'book-amerikanskie-bogi-b29500b8'),
        ('film-beskonechnaya-istoriya-efd97b5e', 'book-beskonechnaya-istoriya-7481dfd3'),
        ('film-boicovskii-klub-12f2c067', 'book-boicovskii-klub-2a5c0cac'),
        ('series-veschie-sestrichki-9407c0df', 'book-veschie-sestrichki-0ebe47db'),
        ('film-vlastelin-kolec-bratstvo-kolca-8aa7bb11', 'book-vlastelin-kolec-ad8248f9'),
        ('film-vlastelin-kolec-vozvraschenie-korolya-58819637', 'book-vlastelin-kolec-ad8248f9'),
        ('film-vlastelin-kolec-dve-kreposti-bf9114b8', 'book-vlastelin-kolec-ad8248f9'),
        ('film-hobbit-b472e920', 'book-hobbit-ili-tuda-i-obratno-8cb8ae24'),
        ('film-hobbit-bitva-pyati-voinstv-a0ff4b99', 'book-hobbit-ili-tuda-i-obratno-8cb8ae24'),
        ('film-hobbit-nezhdannoe-puteshestvie-e9248c15', 'book-hobbit-ili-tuda-i-obratno-8cb8ae24'),
        ('film-hobbit-pustosh-smauga-24a09d1a', 'book-hobbit-ili-tuda-i-obratno-8cb8ae24'),
        ('film-garri-potter-i-dary-smerti-chast-i-c27b7731', 'book-garri-potter-i-dary-smerti-e5d62ca8'),
        ('film-garri-potter-i-dary-smerti-chast-ii-4181dd44', 'book-garri-potter-i-dary-smerti-e5d62ca8'),
        ('film-garri-potter-i-kubok-ognya-15c6c80a', 'book-garri-potter-i-kubok-ognya-26b57c8c'),
        ('film-garri-potter-i-orden-feniksa-78637987', 'book-garri-potter-i-orden-feniksa-f9a66746'),
        ('film-garri-potter-i-princ-polukrovka-0c476c7f', 'book-garri-potter-i-princ-polukrovka-21707ab3'),
        ('film-garri-potter-i-tainaya-komnata-051df85f', 'book-garri-potter-i-tainaya-komnata-56004831'),
        ('film-garri-potter-i-uznik-azkabana-b9aec7b7', 'book-garri-potter-i-uznik-azkabana-9be7adc9'),
        ('film-garri-potter-i-filosofskii-kamen-69a78f03', 'book-garri-potter-i-filosofskii-kamen-63a3c766'),
        ('film-gorod-grehov-2-zhenschina-radi-kotoroi-stoit-ubi-af3f2cce', 'comic-sin-city-a-dame-to-kill-for-2d399c8e'),
        ('film-dnevnoi-dozor-bc812284', 'book-dnevnoi-dozor-1eb89e67'),
        ('film-nochnoi-dozor-16c11dc4', 'book-nochnoi-dozor-0ef0b033'),
        ('dune-part-one', 'dune'),
        ('film-dyuna-c18ba681', 'dune'),
        ('film-dyuna-chast-vtoraya-30d31ed3', 'dune'),
        ('film-angely-i-demony-e65bfa21', 'book-angely-i-demony-70278ccb'),
        ('film-kod-da-vinchi-b5a072ec', 'book-kod-da-vinchi-83386392'),
        ('game-the-godfather-the-game', 'book-krestnyi-otec-eb4baed4'),
        ('film-krestnyi-otec-3f1d7146', 'book-krestnyi-otec-eb4baed4'),
        ('anime-leviathan-0713c50a', 'book-leviafan-7c32e8b3'),
        ('film-marsianin-2ca87570', 'book-marsianin-735f356d'),
        ('series-master-i-margarita-0e17f330', 'book-master-i-margarita-25128846'),
        ('series-opochtarenie-9dce6d69', 'book-derzhi-marku-061821e1'),
        ('film-na-zapadnom-fronte-bez-peremen-8852cf1b', 'book-na-zapadnom-fronte-bez-peremen-c591933c'),
        ('film-osobo-opasen-72731251', 'comic-wanted-96631398'),
        ('series-igra-prestolov-27b3d4cb', 'book-igra-prestolov-7df1a34f'),
        ('series-rycar-semi-korolevstv-6165dde9', 'book-rycar-semi-korolevstv-44334bb5'),
        ('film-pipec-29b1b470', 'comic-kick-ass-3fefff62'),
        ('film-proletaya-nad-gnezdom-kukushki-3b525733', 'book-nad-kukushkinym-gnezdom-f24cbf21'),
        ('series-prostranstvo-a0bf2b5c', 'book-voina-kalibana-4c8fc98a'),
        ('series-prostranstvo-a0bf2b5c', 'book-vrata-abaddona-9c896b88'),
        ('series-prostranstvo-a0bf2b5c', 'book-igry-nemezidy-24805156'),
        ('series-prostranstvo-a0bf2b5c', 'book-pozhar-siboly-2f89aadf'),
        ('series-prostranstvo-a0bf2b5c', 'book-probuzhdenie-leviafana-0684a603'),
        ('series-cvet-volshebstva-1f2efc47', 'book-cvet-volshebstva-3e5a55f7'),
        ('series-rokovaya-muzyka-67f5999d', 'book-rokovaya-muzyka-7fd17123'),
        ('series-santa-hryakus-strashdestvenskaya-skazka-b755b8bf', 'book-santa-hryakus-876abbcb'),
        ('film-temnaya-bashnya-3cd6a3b7', 'book-temnaya-bashnya-f20d5083'),
        ('film-hischniki-2178f1de', 'comic-predators-051339de'),
        ('film-hraniteli-21f70e59', 'watchmen'),
        ('game-alien-3', 'book-chuzhoi-3-32cc3b76'),
        ('film-chuzhoi-voskreshenie-208e6960', 'comic-alien-resurrection-b56315a1'),
        ('series-shtamm-4798d62a', 'comic-the-strain-b559a0cd'),
        ('film-azazel-51bcf2e7', 'book-azazel-950c3e06'),
        ('film-statskii-sovetnik-3bd54d22', 'book-statskii-sovetnik-791ce067'),
        ('film-tureckii-gambit-2a8b0127', 'book-tureckii-gambit-56d086ea'),
        ('film-kollekcioner-2086f7f7', 'book-kollekcioner-1cf4715a'),
        ('film-himera-4c2829d4', 'book-himera-2b8a0315'),
        ('film-1984-77a286ec', 'book-1984-1d650918'),
        ('film-300-spartancev-08015e59', 'comic-300-2a16ae6a'),
        ('film-red-b1f67e07', 'comic-red-e0f02e95'),
        ('film-red-2-cc5f593f', 'comic-red-e0f02e95'),
        ('series-dyuna-998f393a', 'dune'),
        ('film-krestnyi-otec-2-13415d92', 'book-krestnyi-otec-eb4baed4'),
        ('film-krestnyi-otec-3-2407f10a', 'book-krestnyi-otec-eb4baed4')
    ),
    resolved AS (
        SELECT adaptation.id AS entry_id, source.id AS source_entry_id
        FROM pairs
        LEFT JOIN media_items AS adaptation ON adaptation.code = pairs.adaptation_code
        LEFT JOIN media_items AS source ON source.code = pairs.source_code
    ),
    inserted AS (
        INSERT INTO entry_sources (entry_id, source_entry_id)
        SELECT entry_id, source_entry_id
        FROM resolved
        WHERE entry_id IS NOT NULL AND source_entry_id IS NOT NULL
        ON CONFLICT (source_entry_id, entry_id) WHERE source_entry_id IS NOT NULL DO NOTHING
        RETURNING id
    )
    SELECT count(*) FILTER (WHERE entry_id IS NULL OR source_entry_id IS NULL),
           (SELECT count(*) FROM inserted)
    INTO missing_count, inserted_count
    FROM resolved;

    RAISE NOTICE 'Entry source backfill A-B: % links added, % pairs with missing records skipped.',
        inserted_count, missing_count;
END;
$$;
