import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const imageUploadFormSource = readFileSync("src/components/forms/image-upload-form.tsx", "utf8");
const adminMediaFormSource = readFileSync("src/app/admin/(protected)/media/media-form.tsx", "utf8");
const authorMediaFormSource = readFileSync("src/app/author/(protected)/media/media-item-form.tsx", "utf8");

test("admin media form shows rejected cover uploads as a toast", () => {
  assert.match(imageUploadFormSource, /onUploadRejected\?\.\(message\)/);
  assert.match(
    adminMediaFormSource,
    /onUploadRejected=\{\(message\) => \{[\s\S]*setLocalErrorToast\([\s\S]*text: message/,
  );
});

test("author media form maps an oversized request to the cover size error", () => {
  assert.match(
    authorMediaFormSource,
    /runServerActionWithImageUploadGuard\([\s\S]*\(\) => \(\{ error: "cover-too-large" \}\)/,
  );
});
