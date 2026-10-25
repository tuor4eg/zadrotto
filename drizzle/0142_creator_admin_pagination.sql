CREATE INDEX creators_display_name_order_idx ON creators ((coalesce(name_ru, name)), id);
