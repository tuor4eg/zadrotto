import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const actionsSource = readFileSync("src/app/author/login/actions.ts", "utf8");
const formSource = readFileSync("src/app/author/login/author-login-form.tsx", "utf8");
const headerSource = readFileSync("src/app/catalog-sticky-header.tsx", "utf8");
const ratingDialogSource = readFileSync("src/app/media-item-rating-dialog.tsx", "utf8");

describe("author login modal contracts", () => {
  it("keeps inline errors aligned with the login form messages", () => {
    for (const error of ["invalid", "rate-limit", "rate-limit-unavailable"]) {
      assert.match(actionsSource, new RegExp(`error: [^\\n]*"${error}"`));
      assert.match(formSource, new RegExp(`(?:^|\\n)\\s*"?${error}"?:`));
    }
  });

  it("keeps the standalone login action redirects", () => {
    assert.match(actionsSource, /redirect\(`\/author\/login\?error=\$\{result\.error\}`\)/);
    assert.match(
      actionsSource,
      /redirect\(result\.onboarding \? "\/author\/onboarding" : "\/author"\)/,
    );
  });

  it("links password login to registration and password recovery", () => {
    assert.match(formSource, /href="\/author\/register"/);
    assert.match(formSource, /Зарегистрироваться/);
    assert.match(formSource, /href="\/author\/forgot-password"/);
    assert.match(formSource, /Восстановить пароль/);
  });

  it("opens login modals for guests instead of linking to the login page", () => {
    assert.doesNotMatch(headerSource, /href=[{"']*\/author\/login/);
    assert.match(headerSource, /setIsLoginOpen\(true\)/);

    assert.doesNotMatch(ratingDialogSource, /href=[{"']*\/author\/login/);
    assert.match(ratingDialogSource, /currentAuthor \? setIsOpen\(true\) : setIsLoginOpen\(true\)/);
  });

  it("requests refreshed author data and opens rating after modal login", () => {
    assert.match(ratingDialogSource, /setOpenRatingAfterLogin\(true\);\s*router\.refresh\(\)/);
    assert.match(
      ratingDialogSource,
      /const isRatingOpen = isOpen \|\| Boolean\(currentAuthor && openRatingAfterLogin\)/,
    );
    assert.match(
      ratingDialogSource,
      /onClose=\{\(\) => \{\s*setIsOpen\(false\);\s*setOpenRatingAfterLogin\(false\);\s*\}\}/,
    );
  });
});
