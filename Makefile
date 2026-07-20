IMAGE ?= ghcr.io/tuor4eg/zadrotto:latest
MIGRATOR_IMAGE ?= ghcr.io/tuor4eg/zadrotto-migrator:latest

.PHONY: push clean-next deploy migrate seed-admin

# Drop local Next.js build/cache artifacts before building Docker images.
clean-next:
	npm run clean:next

# Build images locally and push them to the registry.
push: clean-next
	@set -a; . ./.env; set +a; \
		test -n "$$SITE_URL" || { echo "SITE_URL is required in .env"; exit 1; }; \
		docker build --build-arg SITE_URL="$$SITE_URL" -t $(IMAGE) .
	docker build \
		--target migrator \
		-t $(MIGRATOR_IMAGE) .
	docker push $(IMAGE)
	docker push $(MIGRATOR_IMAGE)

# Pull fresh runtime images and restart the application with background workers.
deploy:
	docker compose pull app email-worker auth-cleanup-worker
	docker compose up -d app email-worker auth-cleanup-worker

# Pull the fresh migrator image and apply migrations.
migrate:
	docker compose --profile migrate pull migrate
	docker compose --profile migrate run --rm migrate

# Create the first admin user when the database is empty.
seed-admin:
	docker compose --profile seed pull seed-admin
	docker compose --profile seed run --rm seed-admin
