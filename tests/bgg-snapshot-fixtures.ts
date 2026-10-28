export function bggSnapshotXml(id = "42", options: { designerId?: string; designerName?: string; genre?: string; extra?: string; empty?: boolean } = {}) {
  const { designerId = "101", designerName = "Designer", genre = "Animals", extra = "", empty = false } = options;
  return `<?xml version="1.0" encoding="utf-8"?>
<items total="1"><item type="boardgame" id="${id}">
  <name type="primary" value="Game &amp; Friends"/>
  <name type="alternate" value="Крылья"/><name type="alternate" value="крылья"/><name type="alternate" value="Other language"/>
  <yearpublished value="2020"/><description><![CDATA[Birds <friends> & games]]></description>
  <minplayers value="1"/><maxplayers value="5"/><playingtime value="60"/><minplaytime value="40"/><maxplaytime value="70"/><minage value="10"/>
  ${empty ? "" : `<link type="boardgamedesigner" id="${designerId}" value="${designerName}"/><link type="boardgameartist" id="${designerId}" value="${designerName}"/><link type="boardgamecategory" id="7" value="${genre}"/>`}
  <link type="boardgamepublisher" id="9" value="Publisher"/><link type="boardgamemechanic" id="8" value="Drafting"/>
  <unknown future="preserved"><value><![CDATA[ raw <> & ]]></value></unknown>${extra}
</item></items>`;
}
