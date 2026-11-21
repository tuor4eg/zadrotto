import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("avatar menu provides personal navigation and the existing logout action", () => {
  const menu = read("src/components/archive/author-avatar-menu.tsx");
  assert.match(menu, /`\/users\/\$\{author.id\}`/);
  for (const label of ["Мой профиль", "Настройки", "Предложения", "Друзья", "Выход"]) {
    assert.ok(menu.includes(label));
  }
  assert.match(menu, /action=\{logoutAuthor\}/);
  assert.match(menu, /aria-expanded=\{isOpen\}/);
  assert.match(menu, /event.key === "Escape"/);
  assert.match(menu, /document.addEventListener\("pointerdown"/);
});

test("cabinet keeps only the shared site header without a profile banner", () => {
  const layout = read("src/app/author/(protected)/layout.tsx");
  assert.match(layout, /<PublicSiteHeader/);
  assert.doesNotMatch(layout, /PublicUserHeader|getAuthorLevelProgress/);
  assert.doesNotMatch(layout, /AuthorMobileNavMenu|AuthorProposalsMenu|<nav/);
});

test("proposals contain records only", () => {
  assert.doesNotMatch(read("src/app/author/(protected)/media/page.tsx"), /AuthorProposalTabs/);
  assert.doesNotMatch(read("src/app/author/(protected)/author-proposals-menu.tsx"), /href="\/author\/series"/);
});


test("profile action block provides sharing, a disabled card and self logout", () => {
  const header = read("src/app/users/[id]/public-user-header.tsx");
  assert.match(header, /aria-label="Действия профиля"/);
  assert.match(header, /<ProfileShareButton profileId=\{profile.id\}/);
  assert.match(header, /disabled aria-label="Карточка профиля — скоро"/);
  assert.match(header, /profile.relationState === "self"[\s\S]*action=\{logoutAuthor\}/);
  assert.match(header, /<FriendshipControls iconOnly/);
  const controls = read("src/app/users/friendship-controls.tsx");
  assert.match(controls, /if \(iconOnly\)/);
  assert.match(controls, /<ConfirmAction action=\{item.action\}/);
  for (const action of ["sendFriendRequestAction", "removeFriendAction", "cancelFriendRequestAction", "acceptFriendRequestAction", "declineFriendRequestAction"]) {
    assert.ok(controls.includes(`action: ${action}`));
  }
  const sharing = read("src/app/users/[id]/profile-share-button.tsx");
  assert.match(sharing, /navigator.clipboard.writeText\(url\)/);
  assert.match(sharing, /navigator.share\(/);
});
