// Alle Positionen stammen aus dem 2D-Lageplan (Pixelkoordinaten der Vorlage).
// Maßstab abgeleitet aus "Mondi Pap Palette" = 3 Europaletten nebeneinander = 2,4 m = 100 px.
export const PX_PER_M = 41.7;
const OX = 13, OY = 13;

export const m = (px) => px / PX_PER_M;
export const X = (px) => (px - OX) / PX_PER_M;
export const Z = (py) => (py - OY) / PX_PER_M;
export const R = ([x0, y0, x1, y1]) => ({
  x0: X(x0), z0: Z(y0), x1: X(x1), z1: Z(y1),
  w: m(x1 - x0), d: m(y1 - y0),
  cx: X((x0 + x1) / 2), cz: Z((y0 + y1) / 2),
});

export const HALL = R([13, 13, 863, 1081]);
export const HALL_WALL_H = 3.4;   // Hallenwand angeschnitten (Cutaway), Decke ausgeblendet
export const ROOM_WALL_H = 2.8;   // Einbau (Büros/WC)

// Palettenregale (gelbe Querbalken). Unterstes Regal steht an der Südwand.
export const RACKS = [
  [13, 233, 385, 273], [13, 350, 385, 391], [13, 466, 385, 507], [13, 583, 385, 624],
  [13, 700, 385, 741], [13, 817, 385, 857], [13, 934, 385, 975], [13, 1044, 850, 1081],
];
export const RACK_LEVELS = [0, 1.6, 3.2, 4.8];
export const RACK_H = 6.2;

// Senkrechtes Regal am Einbau mit eingehängten Steh-Brettern (Front zeigt nach Westen)
export const REGAL = [582, 500, 620, 826];
export const REGAL_LEVELS = [1.1, 2.5, 3.9]; // 1,10 m = Traverse für Steh-Bretter, Bodenebene frei
export const STEHBRETTER = [[570, 505, 592, 580], [570, 583, 592, 660], [570, 664, 592, 740], [570, 744, 592, 822]];

// Mondi Pap Palette = 3 Europaletten nebeneinander mit ungefalteter Kartonage
export const MONDI = [
  [395, 368, 495, 432], [512, 368, 612, 432], [277, 397, 377, 461], [182, 515, 277, 578],
  [278, 748, 378, 812], [182, 865, 282, 928], [283, 981, 383, 1045],
];

export const MUSIK = [293, 522, 378, 568];
export const GETRAENKEWAGEN = [216, 638, 301, 687];
export const BAR = [341, 624, 375, 700];
export const FOTOBOX = [291, 873, 376, 919];

// Stehtisch-Bereich (Oval im Plan) – 5 Stehtische
export const STEHTISCH_ZONE = { cx: X(461), cz: Z(690), rx: m(65), rz: m(233) };
export const STEHTISCHE = [
  [X(452), Z(520)], [X(478), Z(608)], [X(446), Z(694)], [X(476), Z(780)], [X(455), Z(862)],
];

export const BIERBAENKE = [453, 517, 581, 645, 709, 773].map((x0) => R([x0, 945, x0 + 35, 1030]));

// Einbau rechts
export const ROOMS = [
  { name: 'Büro 2', r: [620, 155, 863, 320], floor: 'laminate' },
  { name: 'Küche / Gang', r: [620, 320, 716, 595], floor: 'tiles' },
  { name: null, r: [620, 595, 692, 690], floor: 'tiles' },
  { name: 'Ruheraum', r: [716, 320, 863, 395], floor: 'laminate' },
  { name: 'Eingang & Treppenhaus', r: [716, 395, 863, 512], floor: 'tiles' },
  { name: 'WC Damen', r: [716, 512, 790, 595], floor: 'tilesWhite' },
  { name: 'WC Herren', r: [790, 512, 863, 595], floor: 'tilesWhite' },
  { name: 'Gehege Max', r: [692, 595, 863, 690], floor: null },
  { name: 'Büro 1', r: [620, 690, 863, 826], floor: 'laminate' },
];

// Wände des Einbaus: Strecke a→b (px), Türen: Mittelpunkt (px entlang der Wand) + Breite (m)
export const ROOM_WALLS = [
  { a: [620, 155], b: [863, 155] },
  { a: [620, 155], b: [620, 826], doors: [{ at: 348, w: 1.0 }, { at: 480, w: 1.1 }] },
  { a: [620, 826], b: [863, 826] },
  { a: [620, 320], b: [863, 320], doors: [{ at: 668, w: 0.9 }] },
  { a: [716, 320], b: [716, 595], doors: [{ at: 480, w: 1.0 }] },
  { a: [716, 395], b: [863, 395], doors: [{ at: 800, w: 0.9 }] },
  { a: [716, 512], b: [863, 512], doors: [{ at: 753, w: 0.8 }, { at: 826, w: 0.8 }] },
  { a: [790, 512], b: [790, 595] },
  { a: [692, 595], b: [863, 595] },
  { a: [692, 595], b: [692, 690], fence: true, gate: { at: 642, w: 0.9 } }, // Gehege Max: Gitter zum Gang
  { a: [620, 690], b: [863, 690], doors: [{ at: 656, w: 0.9 }] },
];

// Gehege Max: Laufrunde des Hundes, Futternapf und Futterspender (am Gitter, Gangseite)
const GEHEGE = R([692, 595, 863, 690]);
export const MAX = {
  loop: { cx: GEHEGE.x0 + 1.22, cz: GEHEGE.cz, rx: 0.6, rz: 0.58 },
  bowl: [GEHEGE.x0 + 0.34, GEHEGE.z1 - 0.55],
  feeder: { x: GEHEGE.x0, z: GEHEGE.z1 - 0.55 },
  fenceH: 1.2,
};

export const PALETTENBLOCK = [[627, 440, 708, 458], [627, 507, 708, 525]];

// Öffnungen in der Ostwand (x = 863 px)
export const EXIT1 = { z: Z(850), w: 1.0 };
export const EXIT2 = { z: Z(480), w: 1.0 };
export const HALLENTOR = { z0: Z(875), z1: Z(970) };

export const GRILL = R([876, 692, 1078, 827]);

// Absperrkette zwischen Logistik- und Party-Bereich (Polylinien in px)
export const BARRIERS = [
  [[385, 362], [612, 362]],
  [[272, 393], [272, 464]],
  [[177, 509], [177, 581]],
  [[190, 626], [190, 698]],
  [[273, 743], [273, 815]],
  [[177, 859], [177, 932]],
  [[278, 977], [278, 1042]],
];

// Zonen-Overlay (Farben der Vorlage)
export const ZONE_GREEN = [
  [375, 391, 620, 1044], [620, 826, 863, 1044], [277, 391, 385, 466], [277, 507, 385, 583],
  [341, 624, 385, 700], [375, 741, 385, 817], [283, 857, 385, 934], [375, 975, 385, 1044],
];

// Kamera-Ansichten (Weltkoordinaten in m). eye = Augenhöhe, Abstand wird am Handy nicht vergrößert.
export const VIEWS = {
  overview:  { label: 'Übersicht',     pos: [31, 24, 37],      target: [12, 0, 13.5], fitR: 17 },
  top:       { label: 'Draufsicht',    pos: [12.6, 60, 13.31], target: [12.6, 0, 13.3], fov: 30, fit: [29, 27] },
  party:     { label: 'Party-Bereich', pos: [22.5, 8.5, 11],   target: [10.5, 0.3, 19], fitR: 8 },
  bar:       { label: 'Bar & Musik',   pos: [13.4, 2.2, 19.6], target: [7.4, 1.1, 14.0], eye: true },
  stehtische:{ label: 'Stehtische',    pos: [9.6, 1.8, 22.4],  target: [12.4, 1.0, 14.8], eye: true },
  max:       { label: 'Max',           pos: [14.85, 3.5, 14.1], target: [16.75, 0.5, 15.45], eye: true },
  eingang:   { label: 'Eingang #1',    pos: [19.6, 1.65, 22.2],target: [9, 1.2, 17.8], eye: true },
  grill:     { label: 'Grill',         pos: [29.8, 3.6, 25.6], target: [22.6, 0.9, 17.6], fitR: 5.5 },
  logistik:  { label: 'Logistik',      pos: [-7, 13, 28],      target: [7, 1, 11], fitR: 13 },
};

// Beschriftungen: [Text, x, y, z, Kategorie]
export const LABELS = [
  ['Abgesperrter Logistikbereich', X(300), 6.8, Z(150), 'zone'],
  ['Party-Bereich', X(700), 2.6, Z(900), 'zone'],
  ['Bar', X(358), 1.7, Z(662), 'main'],
  ['Getränkewagen', X(258), 2.7, Z(662), 'main'],
  ['Musik', X(335), 2.4, Z(545), 'main'],
  ['Fotobox', X(333), 2.3, Z(896), 'main'],
  ['Stehtische (5)', STEHTISCH_ZONE.cx, 1.75, STEHTISCH_ZONE.cz, 'main'],
  ['Steh-Bretter', X(560), 1.8, Z(662), 'main'],
  ['Bierbank-Garnituren (6)', X(630), 1.5, Z(987), 'main'],
  ['Grill-Pavillon', GRILL.cx, 3.3, GRILL.cz, 'main'],
  ['Ein/Ausgang #1', X(863) + 0.4, 2.7, EXIT1.z, 'exit'],
  ['Ein/Ausgang #2', X(863) + 0.4, 2.7, EXIT2.z, 'exit'],
  ['Hallentor', X(863) + 0.4, 3.7, (HALLENTOR.z0 + HALLENTOR.z1) / 2, 'exit'],
  ['Palettenregal', X(200), 6.6, Z(253), 'minor'],
  ['Futterspender', X(692) - 0.2, 1.85, Z(690) - 0.55, 'main'],
  ...MONDI.map((r) => ['Mondi Pap', R(r).cx, 1.7, R(r).cz, 'minor']),
  ...PALETTENBLOCK.map((r) => ['Palettenblock?', R(r).cx, 1.3, R(r).cz, 'minor']),
  ...ROOMS.filter((r) => r.name).map((r) => [r.name, R(r.r).cx, ROOM_WALL_H + 0.3, R(r.r).cz, 'room']),
];
