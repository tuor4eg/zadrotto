import assert from "node:assert/strict";
import { test } from "node:test";
import { buildArchiveLinkMetadata, selectArchiveLinkTarget } from "../src/lib/archive/link-metadata";
import nextConfig from "../next.config";

test("entity previews include kind, name, canonical URL and optional images in both protocols", () => {
  for (const [kind, label] of [["series", "Серия"], ["genre", "Жанр"], ["platform", "Платформа"], ["creator", "Создатель"]] as const) {
    for (const imageUrl of [null, "/images/example.webp"]) {
      const result = buildArchiveLinkMetadata({ kind, key: "имя & имя", name: "Название", imageUrl });
      assert.equal(result.title, `${label}: Название`);
      assert.equal(result.openGraph?.title, result.title);
      assert.equal(result.twitter?.title, result.title);
      assert.equal(result.openGraph?.description, result.description);
      assert.equal(result.twitter?.description, result.description);
      const canonical = `/archive?${new URLSearchParams({ [kind]: "имя & имя" })}`;
      assert.deepEqual(result.alternates, { canonical });
      assert.equal(result.openGraph?.url, canonical);
      assert.deepEqual(result.openGraph?.images, imageUrl ? [imageUrl] : []);
      assert.deepEqual(result.twitter?.images, imageUrl ? [imageUrl] : []);
      assert.equal(result.twitter && "card" in result.twitter ? result.twitter.card : null, imageUrl ? "summary_large_image" : "summary");
    }
  }
  assert.deepEqual(buildArchiveLinkMetadata(null), {});
});

test("selection is deterministic for combined filters and ignores empty or repeated parameters", () => {
  assert.deepEqual(selectArchiveLinkTarget({ series: " s ", genre: "g", platform: "p", creator: "c" }), { kind: "creator", key: "c" });
  assert.deepEqual(selectArchiveLinkTarget({ series: " s ", genre: "g", platform: "p" }), { kind: "platform", key: "p" });
  assert.deepEqual(selectArchiveLinkTarget({ series: " s ", genre: "g" }), { kind: "genre", key: "g" });
  assert.deepEqual(selectArchiveLinkTarget({ series: " s " }), { kind: "series", key: "s" });
  assert.equal(selectArchiveLinkTarget({ creator: ["one", "two"], genre: " " }), null);
});

test("Telegram receives blocking metadata while existing Next crawler support stays intact", () => {
  const bots = nextConfig.htmlLimitedBots!;
  for (const ua of ["TelegramBot (like TwitterBot)", "TelegramBot", "Twitterbot/1.0", "Slackbot-LinkExpanding", "facebookexternalhit/1.1", "Discordbot", "WhatsApp", "LinkedInBot"]) assert.ok(bots.test(ua), ua);
  assert.equal(bots.test("Mozilla/5.0 Chrome/140.0"), false);
});
