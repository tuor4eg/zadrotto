import assert from "node:assert/strict";
import {test} from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import sharp from "sharp";
import { PlatformLogoChoiceForm } from "../src/app/admin/(protected)/platform-requests/logo-choice-form";
import {PlatformLogo} from "../src/components/archive/platform-logo";
import {transformPlatformLogo} from "../src/lib/platforms/logo-storage";
import {resolvePlatformLogoUrl,getPlatformLogoUrl} from "../src/lib/platforms/logo-url";

test("platform logo preserves a wide transparent image with padding instead of cropping",async()=>{
  const source=await sharp({create:{width:240,height:40,channels:4,background:{r:210,g:20,b:30,alpha:1}}}).png().toBuffer();
  const output=await transformPlatformLogo(source);
  const {data,info}=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,info.height);
  const alpha=(x:number,y:number)=>data[(y*info.width+x)*4+3];
  assert.equal(alpha(Math.floor(info.width/2),0),0,"top margin remains transparent");
  assert.ok(alpha(0,Math.floor(info.height/2))>240,"left edge of wide source remains visible");
  assert.ok(alpha(info.width-1,Math.floor(info.height/2))>240,"right edge of wide source remains visible");
  assert.ok(alpha(Math.floor(info.width/2),Math.floor(info.height/2))>240);
  await assert.rejects(transformPlatformLogo(Buffer.from("not an image")));
});
test("manual logo wins and combined platforms allow approved imported assets",()=>{
  const manual="logos/platforms/1/12345678-1234-4123-8123-123456789012.webp";
  const imported="avatars/platform-providers/igdb/7/"+'a'.repeat(64)+".webp";
  assert.equal(resolvePlatformLogoUrl({logoMode:"exact",manualLogoObjectKey:manual,importedLogoObjectKey:imported}),getPlatformLogoUrl(manual));
  assert.equal(resolvePlatformLogoUrl({logoMode:"combined",manualLogoObjectKey:manual,importedLogoObjectKey:imported}),getPlatformLogoUrl(manual));
  assert.equal(resolvePlatformLogoUrl({logoMode:"combined",manualLogoObjectKey:null,importedLogoObjectKey:imported}),getPlatformLogoUrl(imported));
  assert.equal(resolvePlatformLogoUrl({logoMode:"exact",manualLogoObjectKey:null,importedLogoObjectKey:imported}),getPlatformLogoUrl(imported));
});
test("platform logo fallback identifies the platform without a generic device icon",()=>{
  const html=renderToStaticMarkup(createElement(PlatformLogo,{name:"PlayStation 5",logoUrl:null}));
  assert.match(html,/Платформа PlayStation 5/);
  assert.match(html,/>P5</);
  assert.doesNotMatch(html,/<svg/);
});


test("logo approval presents images and two simple decisions without ID selectors", () => {
  const html = renderToStaticMarkup(createElement(PlatformLogoChoiceForm, {
    requestId: 7, action: async () => {}, candidates: [
      { key: "first", provider: "igdb", name: "Nintendo Switch", objectKey: `avatars/platform-providers/igdb/130/${"a".repeat(64)}.webp` },
      { key: "second", provider: "rawg", name: "Nintendo Switch", objectKey: `avatars/platform-providers/rawg/7/${"b".repeat(64)}.webp` },
    ],
  }));
  assert.equal((html.match(/type="radio"/g) ?? []).length, 2);
  assert.match(html, /name="candidateKey" value="first"/);
  assert.match(html, /Использовать выбранное/);
  assert.match(html, /Без логотипа/);
  assert.match(html, /IGDB/);
  assert.match(html, /RAWG/);
  assert.doesNotMatch(html, /<select|Внешний ID|name="externalId"/);
});

test("logo approval allows exclusion without choosing a candidate", () => {
  const html = renderToStaticMarkup(createElement(PlatformLogoChoiceForm, { requestId: 7, candidates: [], action: async () => {} }));
  assert.match(html, /<button[^>]*value="map"[^>]*disabled=""/);
  assert.match(html, /<button[^>]*value="exclude"[^>]*>Без логотипа/);
});
