import { XMLParser, XMLValidator } from "fast-xml-parser";
import { normalizeMediaItemTitleAliases } from "@/lib/media/title-aliases";
import { BggRequestError } from "@/lib/covers/providers/bgg-runtime";

const TYPES = "boardgame,boardgameexpansion";
export const MAX_BGG_XML_BYTES = 2 * 1024 * 1024;
const IMAGE_HOSTS = new Set(["cf.geekdo-images.com"]);
export type XmlNode = Record<string, unknown>;
export type BggItem = {
  id: string; type: string; title: string; alternateNames: string[];
  year: number | null; description: string | null; image: string | null;
  facts: Record<string, unknown>;
};

function record(value: unknown): XmlNode {
  return value && typeof value === "object" && !Array.isArray(value) ? value as XmlNode : {};
}
function list(value: unknown): XmlNode[] {
  return (Array.isArray(value) ? value : value == null ? [] : [value]).map(record);
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function positive(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
export function normalizeBggId(value: string) {
  return /^\d+$/.test(value) && positive(value) ? String(Number(value)) : null;
}
function imageUrl(value: unknown) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" && IMAGE_HOSTS.has(url.hostname) && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
export function parseBggXml(xml: string): XmlNode[] {
  if (Buffer.byteLength(xml) > MAX_BGG_XML_BYTES || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new BggRequestError("provider-unavailable");
  }
  const parsed = record(new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, htmlEntities: true }).parse(xml));
  if (!Object.hasOwn(parsed, "items") || Object.keys(parsed).some((key) => key !== "items" && key !== "?xml")) {
    throw new BggRequestError("provider-unavailable");
  }
  const root = record(parsed.items);
  if (root.error || root.errors) throw new BggRequestError("provider-unavailable");
  return list(root.item);
}
export function parseBggItem(node: XmlNode, full: boolean): BggItem {
  const id = normalizeBggId(text(node["@_id"]));
  const type = text(node["@_type"]);
  const names = list(node.name);
  const title = text((names.find((name) => name["@_type"] === "primary") ?? names[0])?.["@_value"]);
  if (!id || !TYPES.split(",").includes(type) || !title) throw new BggRequestError("provider-unavailable");
  const alternateNames = normalizeMediaItemTitleAliases(names.filter((name) => name["@_type"] === "alternate").map((name) => text(name["@_value"])), { title, originalTitle: title });
  const links = list(node.link);
  const values = (kind: string) => [...new Set(links.filter((link) => link["@_type"] === kind).map((link) => text(link["@_value"])).filter(Boolean))];
  const participants = links.filter(link => link["@_type"] === "boardgamedesigner" || link["@_type"] === "boardgameartist");
  const validParticipants = participants.every(link => normalizeBggId(text(link["@_id"])) && text(link["@_value"]));
  if (full && !validParticipants) throw new BggRequestError("provider-unavailable");
  const bggCreators = participants.map(link => ({ externalId: normalizeBggId(text(link["@_id"]))!, name: text(link["@_value"]), roleCode: link["@_type"] === "boardgamedesigner" ? "designer" : "artist" }));
  const genres = values("boardgamecategory");
  const year = positive(record(node.yearpublished)["@_value"]);
  const facts: Record<string, unknown> = full ? {
    ...(validParticipants ? { bggCreators } : {}),
    bggItemType: type, authors: values("boardgamedesigner"), artists: values("boardgameartist"),
    publishers: values("boardgamepublisher"), mechanics: values("boardgamemechanic"), genres,
    genreReferences: genres.flatMap((name) => {
      const link = links.find((link) => link["@_type"] === "boardgamecategory" && text(link["@_value"]) === name);
      const genreId = normalizeBggId(text(link?.["@_id"]));
      return genreId ? [{ name, id: genreId }] : [];
    }),
    minPlayers: positive(record(node.minplayers)["@_value"]), maxPlayers: positive(record(node.maxplayers)["@_value"]),
    runtimeMinutes: positive(record(node.playingtime)["@_value"]),
    minPlayingTimeMinutes: positive(record(node.minplaytime)["@_value"]), maxPlayingTimeMinutes: positive(record(node.maxplaytime)["@_value"]),
    minAge: positive(record(node.minage)["@_value"]),
  } : {};
  return { id, type, title, alternateNames, year: year && year <= 9999 ? year : null, description: text(node.description) || null,
    image: imageUrl(node.image) ?? imageUrl(node.thumbnail), facts };
}
