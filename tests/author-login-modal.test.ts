import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const actionsSource = readFileSync("src/app/author/login/actions.ts", "utf8");
const formSource = readFileSync("src/app/author/login/author-login-form.tsx", "utf8");
const loginPageSource = readFileSync("src/app/author/login/page.tsx", "utf8");
const tokenFormSource = readFileSync("src/app/author/token/author-token-login-form.tsx", "utf8");
const tokenPageSource = readFileSync("src/app/author/token/page.tsx", "utf8");
const profileActionsSource = readFileSync("src/app/author/(protected)/profile/actions.ts", "utf8");
const profilePageSource = readFileSync("src/app/author/(protected)/profile/page.tsx", "utf8");
const headerSource = readFileSync(
  "src/components/archive/archive-site-header.tsx",
  "utf8",
);
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
      /redirect\(result\.onboarding \? "\/author\/profile" : "\/author"\)/,
    );
  });

  it("links password login to registration and password recovery", () => {
    assert.match(formSource, /href="\/author\/register"/);
    assert.match(formSource, /Зарегистрироваться/);
    assert.match(formSource, /href="\/author\/forgot-password"/);
    assert.match(formSource, /Восстановить пароль/);
  });

  it("keeps token login off the regular form and on its own route", () => {
    assert.doesNotMatch(formSource, /loginAuthorInline|author-access-token|Войти по токену/);
    assert.doesNotMatch(loginPageSource, /\/author\/token|Вход по токену|Войти по токену/);
    assert.match(tokenFormSource, /loginAuthorInline/);
    assert.match(tokenFormSource, /name="accessToken"/);
    assert.match(tokenFormSource, /type="password"/);
    assert.match(tokenFormSource, /autoComplete="off"/);
    assert.match(tokenFormSource, /name="username"[\s\S]*autoComplete="username"/);
    assert.match(tokenFormSource, /state\.onboarding \? "\/author\/profile" : "\/author"/);
    assert.match(tokenPageSource, /getCurrentAuthor\(\)/);
    assert.match(tokenPageSource, /if \(author\) \{[\s\S]*redirect\("\/author"\)/);
    assert.match(tokenPageSource, /Вход по токену/);
    assert.match(tokenPageSource, /href="\/author\/login"/);
    assert.match(tokenPageSource, /robots:[\s\S]*index: false[\s\S]*follow: false/);
    assert.match(profilePageSource, /action=\{logoutAuthorToTokenLogin\}/);
    assert.match(
      profileActionsSource,
      /logoutAuthorToTokenLogin[\s\S]*clearAuthorSessionCookie\(\)[\s\S]*redirect\("\/author\/token"\)/,
    );
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
