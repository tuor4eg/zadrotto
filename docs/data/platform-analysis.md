# Первоначальные платформы

Источник: media-items-2026-10-16.csv. 1456 записей, 106 исходных значений, 102 canonical платформы. Разделитель: ` | `. Частоты считают вхождения в строках CSV.

PC (Microsoft Windows), PC и Linux → PC; Mac и macOS → Mac; Xbox Series S/X и Xbox Series X|S → Xbox Series X|S. Остальные значения оставлены отдельно, включая региональные варианты, DOS и Classic Macintosh. Источник провайдера в CSV отсутствует: начальные mappings заведены отдельно для IGDB и RAWG; при обработке записи используется только её sourceProvider.

Воспроизведение: `./node_modules/.bin/tsx tools/generate-platform-seed.ts /path/to/media-items-2026-10-16.csv`. Машиночитаемый набор: platform-initial-mappings.json.

| Provider-значение | Частота | Canonical | Slug |
|---|---:|---|---|
| 3DO Interactive Multiplayer | 4 | 3DO Interactive Multiplayer | 3do-interactive-multiplayer |
| Acorn Archimedes | 4 | Acorn Archimedes | acorn-archimedes |
| Acorn Electron | 1 | Acorn Electron | acorn-electron |
| Amiga | 32 | Amiga | amiga |
| Amiga CD32 | 6 | Amiga CD32 | amiga-cd32 |
| Amstrad CPC | 9 | Amstrad CPC | amstrad-cpc |
| Android | 186 | Android | android |
| Apple II | 7 | Apple II | apple-ii |
| Apple IIGS | 2 | Apple IIGS | apple-iigs |
| Arcade | 38 | Arcade | arcade |
| Atari 2600 | 2 | Atari 2600 | atari-2600 |
| Atari 8-bit | 3 | Atari 8-bit | atari-8-bit |
| Atari Jaguar | 6 | Atari Jaguar | atari-jaguar |
| Atari Jaguar CD | 1 | Atari Jaguar CD | atari-jaguar-cd |
| Atari ST/STE | 10 | Atari ST/STE | atari-st-ste |
| BBC Microcomputer System | 1 | BBC Microcomputer System | bbc-microcomputer-system |
| BlackBerry OS | 6 | BlackBerry OS | blackberry-os |
| Classic Macintosh | 2 | Classic Macintosh | classic-macintosh |
| Commodore 16 | 1 | Commodore 16 | commodore-16 |
| Commodore C64/128/MAX | 11 | Commodore C64/128/MAX | commodore-c64-128-max |
| DOS | 42 | DOS | dos |
| Dreamcast | 16 | Dreamcast | dreamcast |
| FM Towns | 3 | FM Towns | fm-towns |
| FM-7 | 2 | FM-7 | fm-7 |
| Family Computer | 22 | Family Computer | family-computer |
| Family Computer Disk System | 1 | Family Computer Disk System | family-computer-disk-system |
| Game Boy | 1 | Game Boy | game-boy |
| Game Boy Advance | 5 | Game Boy Advance | game-boy-advance |
| Game Boy Color | 1 | Game Boy Color | game-boy-color |
| Gizmondo | 1 | Gizmondo | gizmondo |
| Google Stadia | 51 | Google Stadia | google-stadia |
| Handheld Electronic LCD | 4 | Handheld Electronic LCD | handheld-electronic-lcd |
| LaserActive | 1 | LaserActive | laseractive |
| Legacy Mobile Device | 8 | Legacy Mobile Device | legacy-mobile-device |
| Linux | 296 | PC | pc |
| MSX | 5 | MSX | msx |
| Mac | 511 | Mac | mac |
| Meta Quest 2 | 2 | Meta Quest 2 | meta-quest-2 |
| Meta Quest 3 | 1 | Meta Quest 3 | meta-quest-3 |
| N-Gage | 1 | N-Gage | n-gage |
| NES | 4 | NES | nes |
| Neo Geo AES | 4 | Neo Geo AES | neo-geo-aes |
| Neo Geo CD | 2 | Neo Geo CD | neo-geo-cd |
| Neo Geo MVS | 3 | Neo Geo MVS | neo-geo-mvs |
| New Nintendo 3DS | 1 | New Nintendo 3DS | new-nintendo-3ds |
| Nintendo 3DS | 21 | Nintendo 3DS | nintendo-3ds |
| Nintendo 64 | 3 | Nintendo 64 | nintendo-64 |
| Nintendo DS | 3 | Nintendo DS | nintendo-ds |
| Nintendo DSi | 3 | Nintendo DSi | nintendo-dsi |
| Nintendo Entertainment System | 44 | Nintendo Entertainment System | nintendo-entertainment-system |
| Nintendo GameCube | 27 | Nintendo GameCube | nintendo-gamecube |
| Nintendo Switch | 368 | Nintendo Switch | nintendo-switch |
| Nintendo Switch 2 | 67 | Nintendo Switch 2 | nintendo-switch-2 |
| Oculus Rift | 3 | Oculus Rift | oculus-rift |
| Odyssey 2 / Videopac G7000 | 1 | Odyssey 2 / Videopac G7000 | odyssey-2-videopac-g7000 |
| OnLive Game System | 5 | OnLive Game System | onlive-game-system |
| Ouya | 5 | Ouya | ouya |
| PC | 20 | PC | pc |
| PC (Microsoft Windows) | 1228 | PC | pc |
| PC-8800 Series | 1 | PC-8800 Series | pc-8800-series |
| PC-9800 Series | 4 | PC-9800 Series | pc-9800-series |
| Philips CD-i | 2 | Philips CD-i | philips-cd-i |
| PlayStation | 39 | PlayStation | playstation |
| PlayStation 2 | 79 | PlayStation 2 | playstation-2 |
| PlayStation 3 | 242 | PlayStation 3 | playstation-3 |
| PlayStation 4 | 431 | PlayStation 4 | playstation-4 |
| PlayStation 5 | 308 | PlayStation 5 | playstation-5 |
| PlayStation Portable | 28 | PlayStation Portable | playstation-portable |
| PlayStation VR | 4 | PlayStation VR | playstation-vr |
| PlayStation VR2 | 4 | PlayStation VR2 | playstation-vr2 |
| PlayStation Vita | 46 | PlayStation Vita | playstation-vita |
| Plug & Play | 1 | Plug & Play | plug-play |
| SG-1000 | 3 | SG-1000 | sg-1000 |
| Sega 32X | 4 | Sega 32X | sega-32x |
| Sega CD | 9 | Sega CD | sega-cd |
| Sega Game Gear | 10 | Sega Game Gear | sega-game-gear |
| Sega Master System/Mark III | 10 | Sega Master System/Mark III | sega-master-system-mark-iii |
| Sega Mega Drive/Genesis | 100 | Sega Mega Drive/Genesis | sega-mega-drive-genesis |
| Sega Saturn | 6 | Sega Saturn | sega-saturn |
| Sharp X1 | 3 | Sharp X1 | sharp-x1 |
| Sharp X68000 | 2 | Sharp X68000 | sharp-x68000 |
| Sinclair ZX81 | 1 | Sinclair ZX81 | sinclair-zx81 |
| SteamVR | 8 | SteamVR | steamvr |
| Super Famicom | 17 | Super Famicom | super-famicom |
| Super Nintendo Entertainment System | 44 | Super Nintendo Entertainment System | super-nintendo-entertainment-system |
| TRS-80 | 1 | TRS-80 | trs-80 |
| TRS-80 Color Computer | 1 | TRS-80 Color Computer | trs-80-color-computer |
| Tapwave Zodiac | 1 | Tapwave Zodiac | tapwave-zodiac |
| Tatung Einstein | 1 | Tatung Einstein | tatung-einstein |
| TurboGrafx-16/PC Engine | 3 | TurboGrafx-16/PC Engine | turbografx-16-pc-engine |
| Web browser | 10 | Web browser | web-browser |
| Wii | 55 | Wii | wii |
| Wii U | 48 | Wii U | wii-u |
| Windows Mixed Reality | 1 | Windows Mixed Reality | windows-mixed-reality |
| Windows Mobile | 5 | Windows Mobile | windows-mobile |
| Windows Phone | 21 | Windows Phone | windows-phone |
| Xbox | 82 | Xbox | xbox |
| Xbox 360 | 238 | Xbox 360 | xbox-360 |
| Xbox One | 395 | Xbox One | xbox-one |
| Xbox Series S/X | 1 | Xbox Series X\|S | xbox-series-x-s |
| Xbox Series X\|S | 271 | Xbox Series X\|S | xbox-series-x-s |
| ZX Spectrum | 10 | ZX Spectrum | zx-spectrum |
| Zeebo | 3 | Zeebo | zeebo |
| iOS | 221 | iOS | ios |
| macOS | 4 | Mac | mac |
| visionOS | 1 | visionOS | visionos |
