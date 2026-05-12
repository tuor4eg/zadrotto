IMAGE ?= ghcr.io/tuor4eg/zadrotto:latest
MIGRATOR_IMAGE ?= ghcr.io/tuor4eg/zadrotto-migrator:latest

.PHONY: push deploy migrate seed-admin

# Build images locally and push them to the registry.
push:
	docker build -t $(IMAGE) .
	docker build \
		--target migrator \
		-t $(MIGRATOR_IMAGE) .
	docker push $(IMAGE)
	docker push $(MIGRATOR_IMAGE)

# Pull the fresh app image and restart the application.
deploy:
	docker compose pull app
	docker compose up -d app

# Pull the fresh migrator image and apply migrations.
migrate:
	docker compose --profile migrate pull migrate
	docker compose --profile migrate run --rm migrate

# Create the first admin user when the database is empty.
seed-admin:
	docker compose --profile seed pull seed-admin
	docker compose --profile seed run --rm seed-admin
