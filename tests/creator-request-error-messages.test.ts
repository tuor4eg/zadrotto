import assert from "node:assert/strict";
import { test } from "node:test";
import { getCreatorRequestErrorMessage, isCreatorRequestErrorCode } from "../src/app/admin/(protected)/creator-requests/messages";

test("a second TMDB person ID gives a specific identity conflict message", () => {
  assert.equal(isCreatorRequestErrorCode("tmdb-person-conflict"), true);
  assert.match(getCreatorRequestErrorMessage("tmdb-person-conflict"), /другой TMDB person ID/);
  assert.match(getCreatorRequestErrorMessage("tmdb-person-conflict"), /отдельного создателя/);
});
test("unknown query parameters never become displayed error messages", () => {
  for (const code of ["database error with private details", "toString", "1"]) {
    assert.equal(isCreatorRequestErrorCode(code), false);
    assert.equal(getCreatorRequestErrorMessage(code), "Не удалось выполнить действие. Проверьте состояние заявки.");
  }
});
