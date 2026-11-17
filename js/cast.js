// The selectable characters. Plain data (no 3D code) so the HUD and menus can use it too.
// base: which body file (models/chars/female.glb or male.glb). pieces: the parts of that file to show,
// with a colour, or null to keep the part's own colours (saree, jewellery). h: height in metres.
// kid: the code-built figure (js/kid.js) shown while the models are still loading.

export const CAST = [
  {
    name: 'Kanu', star: true, base: 'kanu', body: 'BodySaree', h: 1.5, kid: 10,
    skin: 0xfff3ea, hair: ['Hair_Long', 0x0b0807], brows: 0x120c09,
    pieces: { Blouse: null, Saree: null, Pallu: null, Necklace: null, NecklaceStone: null, Bangles_l: null, Bangles_r: null,
      Earring_l: null, Earring_r: null, Bindi: null, Sandals: 0x5a3b22 },
  },
  { name: 'Orange tee', base: 'male', h: 1.66, kid: 0, skin: 0xfff6ef, hair: ['Hair_SimpleParted', 0x231710], brows: 0x231710,
    pieces: { Tee: 0xe2622e, KneeShorts: 0xd8cdb4, Sneakers: 0x2e2e2e } },
  { name: 'Red jersey', base: 'male', h: 1.72, kid: 1, skin: 0xffefe4, hair: ['Hair_Buzzed', 0x120c08], brows: 0x120c08,
    pieces: { Tank: 0xc8322b, Shorts: 0x1f1f24, Sneakers: 0x3a3d48 } },
  { name: 'Sky tee', base: 'male', h: 1.7, kid: 2, skin: 0xfff8f2, hair: ['Hair_Buzzed', 0x0c0806], brows: 0x0c0806,
    pieces: { Tee: 0x7fb4e0, KneeShorts: 0xcdb894, Sneakers: 0xf2f2f2 } },
  { name: 'White tank', base: 'male', h: 1.64, kid: 3, skin: 0xffffff, hair: ['Hair_SimpleParted', 0x4a321e], brows: 0x3a2616,
    pieces: { Tank: 0xf1efe8, Shorts: 0x34465f, Sandals: 0x5a4636 } },
  { name: 'Polo', base: 'male', h: 1.74, kid: 4, skin: 0xfff1e6, hair: ['Hair_SimpleParted', 0x1a120c], brows: 0x1a120c,
    pieces: { Tee: 0x1d2747, Collar: 0x1d2747, Trousers: 0xc9b591, Sneakers: 0x3b2a20 } },
  { name: 'Pink tee', base: 'female', h: 1.56, kid: 5, skin: 0xfff3ea, hair: ['Hair_Buns', 0x0c0806], brows: 0x0c0806,
    pieces: { Tee: 0xe85d9a, Capris: 0x3f5f8f, Sneakers: 0xf2f2f2 } },
  { name: 'Green tee', base: 'female', h: 1.6, kid: 6, skin: 0xfff6ef, hair: ['Hair_Long', 0x5a3a20], brows: 0x3a2616,
    pieces: { Tee: 0x5fb35c, Shorts: 0x232327, Sneakers: 0x2e2e2e } },
  { name: 'Sundress', base: 'female', body: 'BodySkirt', h: 1.58, kid: 7, skin: 0xffefe4, hair: ['Hair_Long', 0x2a1a10], brows: 0x1a120c,
    pieces: { Tank: 0xf3e6c8, Skirt: 0xf3e6c8, Sandals: 0xb07a50 } },
  { name: 'Blue top', base: 'female', body: 'BodySkirt', h: 1.62, kid: 8, skin: 0xfff8f2, hair: ['Hair_Buns', 0x1a120c], brows: 0x1a120c,
    pieces: { Tank: 0x8fb6e6, Skirt: 0xf5f3ee, Sandals: 0xd8c4a8 } },
  { name: 'Red top', base: 'female', h: 1.55, kid: 9, skin: 0xffffff, hair: ['Hair_BuzzedFemale', 0x2a1a10], brows: 0x2a1a10,
    pieces: { Tank: 0xd13b3b, Shorts: 0xf0e8de, Sandals: 0xf2f2f2 } },
];

export const CHARACTER_NAMES = CAST.map((c) => c.name);
