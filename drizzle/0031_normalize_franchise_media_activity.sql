UPDATE "admin_activity_logs"
SET "action" = 'franchise.media.attached'
WHERE "action" = 'franchise.media.suggested'
  AND "message" IN ('Серия добавлена к тайтлу.', 'Серия добавлена к записи.');

UPDATE "admin_activity_logs"
SET "message" = NULL
WHERE "action" IN ('franchise.media.attached', 'franchise.media.suggested')
  AND "message" IN (
    'Серия добавлена к тайтлу.',
    'Серия добавлена к записи.',
    'Связь серии предложена.'
  );

UPDATE "admin_activity_logs"
SET "message" = NULL
WHERE ("action" = 'franchise.media.attached' AND "message" = 'Запись привязана к серии.')
   OR ("action" = 'franchise.media.detached' AND "message" = 'Запись отвязана от серии.');
