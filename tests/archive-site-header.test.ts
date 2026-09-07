import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (file: string) => readFileSync(file, "utf8");
const headerSource = read("src/components/archive/public-site-header.tsx");
const headerStateSource = read("src/lib/archive/public-site-header.ts");
const footerLayerSource = read("src/components/archive/public-site-footer-layer.tsx");
const rootLayoutSource = read("src/app/layout.tsx");
const mainPageSource = read("src/app/page.tsx");
const globalsSource = read("src/app/globals.css");

const publicPages = [
  "src/app/page.tsx", "src/app/archive/page.tsx", "src/app/series/page.tsx",
  "src/app/series/[code]/page.tsx", "src/app/series/[code]/children/page.tsx",
  "src/app/collections/page.tsx", "src/app/collections/[slug]/page.tsx",
  "src/app/media/[code]/page.tsx",   "src/app/reviews/page.tsx", "src/app/reviews/[id]/page.tsx",
  "src/app/achievements/page.tsx",
  "src/app/users/[id]/page.tsx", "src/app/users/[id]/achievements/page.tsx",
  "src/app/about/page.tsx", "src/app/help/page.tsx", "src/app/rules/page.tsx",
  "src/app/feedback/page.tsx",
];

const excludedPages = [
  "src/app/author/(protected)/layout.tsx", "src/app/admin/(protected)/layout.tsx",
  "src/app/author/login/page.tsx", "src/app/author/register/page.tsx",
  "src/app/author/forgot-password/page.tsx", "src/app/author/reset-password/page.tsx",
  "src/app/admin/login/page.tsx",
];

describe("public site header", () => {
  it("owns the common brand, navigation, search, and author actions", () => {
    assert.match(headerSource, /src="\/site-logo\.png"/);
    assert.match(headerSource, /width=\{60\}[\s\S]*height=\{60\}[\s\S]*className="size-\[60px\] object-contain"/);
    assert.match(headerSource, /<header className="[^"]*h-14[^"]*"/);
    assert.match(headerSource, />\s*Задротто\s*</);
    for (const [href, label] of [["/archive", "Архив"], ["/series", "Серии"], ["/collections", "Подборки"], ["/reviews", "Рецензии"]]) {
      assert.match(headerSource, new RegExp(`href: "${href}"[^}]*label: "${label}"`));
    }
    assert.match(headerSource, /max-w-\[1480px\]/);
    assert.match(headerSource, /<form[\s\S]*action="\/archive"[\s\S]*method="get"[\s\S]*role="search"/);
    assert.match(headerSource, /id="public-header-search"[\s\S]*className="archive-control-surface h-9/);
    assert.match(headerSource, /showAchievements[\s\S]*href: "\/achievements"[\s\S]*label: "Ачивки"/);
    assert.match(headerSource, /isDemo/);
    assert.match(headerSource, /Демо-режим/);
    assert.match(headerSource, /Данные хранятся только на устройстве/);
    assert.match(headerSource, /авторизуйтесь чтобы не потерять их/);
    assert.match(headerSource, /<NotificationBell align="right" round \/>[\s\S]*href="\/admin"[\s\S]*href="\/author"/);
    assert.match(headerSource, /href="\/admin"[\s\S]*NotificationBadge[\s\S]*count=\{adminNotificationCount\}/);
  });

  it("opens guest login in one modal and refreshes after success", () => {
    assert.match(headerSource, /onClick=\{\(\) => setIsLoginOpen\(true\)\}/);
    assert.match(
      headerSource,
      /aria-label="Войти"[\s\S]*className="grid size-9[^\"]*border border-stone-200 bg-white/,
    );
    assert.match(headerSource, /createPortal\([\s\S]*<AuthorLoginModal/);
    assert.match(headerSource, /onSuccess=\{\(\) => \{[\s\S]*router\.refresh\(\)/);
    assert.equal((headerSource.match(/<AuthorLoginModal/g) ?? []).length, 1);
    assert.doesNotMatch(headerSource, /href=[{"']*\/author\/login/);
  });

  it("loads all shared session state once", () => {
    assert.match(headerStateSource, /getCurrentAuthor\(\)/);
    assert.match(headerStateSource, /getCurrentAdminUser\(\)/);
    assert.match(headerStateSource, /getSubmittedModerationRequestCountForAdmin\(\)/);
    assert.match(headerStateSource, /adminUser\s*\?\s*await getSubmittedModerationRequestCountForAdmin\(\)\s*:\s*0/);
    assert.match(headerStateSource, /headerProps:[\s\S]*avatarObjectKey: author\.avatarObjectKey, name: author\.name/);
  });

  it("is mounted on every public page and excluded from private and auth shells", () => {
    for (const file of publicPages) {
      const source = read(file);
      assert.match(source, /<PublicSiteHeader\b/, `${file} must render PublicSiteHeader`);
      assert.match(source, /getPublicSiteHeaderState/, `${file} must load shared header state`);
    }
    for (const file of excludedPages) {
      assert.doesNotMatch(read(file), /PublicSiteHeader/, `${file} must keep its own shell`);
    }
  });

  it("uses the main-page spacing between the header and primary content", () => {
    for (const file of [
      "src/app/page.tsx",
      "src/app/archive/page.tsx",
      "src/app/series/page.tsx",
      "src/app/series/[code]/page.tsx",
      "src/app/collections/page.tsx",
      "src/app/collections/[slug]/page.tsx",
      "src/app/reviews/page.tsx",
      "src/app/achievements/page.tsx",
    ]) {
      assert.match(
        read(file),
        /max-w-\[1480px\][^"\n]*flex-col gap-3/,
        `${file} must use the shared 0.75rem content gap`,
      );
    }
  });

  it("replaces the legacy header implementations", () => {
    assert.equal(existsSync("src/components/archive/archive-site-header.tsx"), false);
    assert.equal(existsSync("src/app/catalog-sticky-header.tsx"), false);
    assert.equal(existsSync("src/app/main/main-header.tsx"), false);
  });

  it("mounts one shared footer layer on public routes only", () => {
    assert.match(rootLayoutSource, /<PublicSiteFooterLayer \/>/);
    assert.match(footerLayerSource, /public-site-footer-layer/);
    assert.match(footerLayerSource, /<ArchiveSiteFooter \/>/);
    assert.match(footerLayerSource, /max-w-\[1480px\]/);
    assert.match(footerLayerSource, /"\/admin"[\s\S]*"\/author"/);
    assert.doesNotMatch(mainPageSource, /<ArchiveSiteFooter \/>/);
    assert.match(
      read("src/components/archive/archive-site-footer.tsx"),
      /18\+ · В отдельных статьях, мнениях и описаниях может встречаться ненормативная лексика/,
    );
    assert.match(
      globalsSource,
      /\.archive-page:has\(\+ \.public-site-footer-layer\) \{\s*min-height: auto;/,
    );
    assert.match(
      globalsSource,
      /archive-page:not\(\.archive-catalog-page\):has\(\.public-site-header\) \{[\s\S]*padding-bottom: 0\.75rem;/,
    );
    assert.doesNotMatch(
      globalsSource,
      /archive-page:not\(\.archive-catalog-page\):has\(\.public-site-header\) \{\s*padding-bottom: (?:1\.25|1\.75)rem;/,
    );
  });
});
