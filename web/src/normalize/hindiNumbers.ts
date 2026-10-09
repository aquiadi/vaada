/**
 * Hindi number words 1 to 99, in Roman script as people actually type them and in Devanagari.
 * Roman spellings vary a lot (pachees, pachchis, pachis), so every spelling is folded through
 * romanKey before lookup; the first spelling in each row is the common one, the rest are variants
 * seen in chats that don't fold to the same key.
 */
const ROMAN: ReadonlyArray<readonly [number, readonly string[]]> = [
  [1, ["ek", "aek"]],
  [2, ["do", "dou"]],
  [3, ["teen", "tin"]],
  [4, ["char", "chaar"]],
  [5, ["paanch", "panch", "paach"]],
  [6, ["chhe", "chhah", "chheh", "chah", "chhai", "chha"]],
  [7, ["saat", "sat"]],
  [8, ["aath", "ath"]],
  [9, ["nau"]],
  [10, ["das", "dus", "dass"]],
  [11, ["gyarah", "gyaarah", "gyara", "igyarah", "gyaara", "gyaraa"]],
  [12, ["barah", "baarah", "bara", "baara"]],
  [13, ["terah", "tera", "teraa"]],
  [14, ["chaudah", "chaudha", "chodah", "chauda", "choudah", "chouda"]],
  [15, ["pandrah", "pandhrah", "pandra", "pandhra", "pandraah", "pundrah"]],
  [16, ["solah", "sola", "solaa"]],
  [17, ["satrah", "sattrah", "satra", "sattra"]],
  [18, ["atharah", "attharah", "athara", "atthara", "athaarah"]],
  [19, ["unnis", "unees", "unnees", "unis", "unnis"]],
  [20, ["bees", "bis", "bish"]],
  [21, ["ikkis", "ikkees", "ikis", "ikees"]],
  [22, ["bais", "baais", "baees", "baaees", "baayis"]],
  [23, ["teis", "teyis", "teees", "tais", "teiss", "teyees"]],
  [24, ["chaubis", "chaubees", "chobis", "chobees", "chaubbis"]],
  [25, ["pachees", "pachchis", "pachis", "pachchees", "pacchis", "pachiss"]],
  [26, ["chhabbis", "chabbis", "chhabees", "chabees", "chhabis"]],
  [27, ["sattais", "sattaees", "sataees", "satais", "sattayis"]],
  [28, ["atthais", "athais", "athaees", "atthaees", "athayis"]],
  [29, ["untees", "unatees", "untis", "unatis", "unattis"]],
  [30, ["tees", "tis", "tiss"]],
  [31, ["iktees", "ikattis", "ikatees", "iktis", "ikatis"]],
  [32, ["battees", "battis", "batis", "batees"]],
  [33, ["taintees", "taintis", "tetis", "tentis", "tetees", "tentees"]],
  [34, ["chauntees", "chautis", "chontis", "chauntis", "chautees", "chontees"]],
  [35, ["paintees", "paintis", "pentis", "pentees", "paintiss"]],
  [36, ["chhattees", "chattis", "chhattis", "chattees", "chatis"]],
  [37, ["saintees", "saintis", "sentis", "sentees"]],
  [38, ["adtees", "artees", "adtis", "artis", "adhtis", "arthis"]],
  [39, ["untalis", "untaalis", "unchalis", "untaalees", "unchaalis"]],
  [40, ["chaalis", "chalis", "chaalees", "chalees"]],
  [41, ["iktaalis", "iktalis", "iktalees", "iktaalees"]],
  [42, ["bayaalis", "bayalis", "byalis", "beyalis", "byaalis"]],
  [43, ["taintaalis", "taintalis", "tentalis", "tetalis", "tentaalis"]],
  [44, ["chauvaalis", "chavalis", "chawalis", "chauwalis", "chavaalis"]],
  [45, ["paintaalis", "paintalis", "pentalis", "pentaalis"]],
  [46, ["chhiyaalis", "chiyalis", "chhiyalis", "chiyaalees", "chhiyalees"]],
  [47, ["saintaalis", "saintalis", "sentalis", "sentaalis"]],
  [48, ["adtaalis", "adtalis", "artalis", "arhtalis", "artaalis"]],
  [49, ["unchaas", "unchas", "unanchas"]],
  [50, ["pachaas", "pachas", "pachaass"]],
  [51, ["ikyaavan", "ikyavan", "ikkyavan", "ikyawan", "ikkyaavan"]],
  [52, ["baavan", "bavan", "baawan", "bawan"]],
  [53, ["tirpan", "tirepan", "tirrepan", "tirapan", "tirppan"]],
  [54, ["chauvan", "chauwan", "chouvan", "chowan"]],
  [55, ["pachpan", "pachapan"]],
  [56, ["chhappan", "chappan", "chhapan"]],
  [57, ["sattaavan", "sattavan", "sattawan", "satavan"]],
  [58, ["atthaavan", "athavan", "atthawan", "athawan"]],
  [59, ["unsath", "unsaath", "unsadh", "unsat"]],
  [60, ["saath", "sath"]],
  [61, ["iksath", "ikasath", "iksaath", "ikasaath"]],
  [62, ["baasath", "basath", "baasaath", "basaath"]],
  [63, ["tirsath", "tiresath", "tirsaath", "tiresaath"]],
  [64, ["chausath", "chaunsath", "chausaath", "chaunsaath"]],
  [65, ["painsath", "pensath", "painsaath", "pensaath"]],
  [66, ["chhiyasath", "chiyasath", "chhiyaasaath", "chhiyasaath"]],
  [67, ["sadsath", "sarsath", "satsath", "sadsaath", "sarsaath"]],
  [68, ["adsath", "arsath", "adsaath", "arsaath", "adhsath"]],
  [69, ["unhattar", "unhatar", "unahattar"]],
  [70, ["sattar", "sattarr", "sathar"]],
  [71, ["ikhattar", "ikahattar", "ikhatar"]],
  [72, ["bahattar", "behattar", "bahatar"]],
  [73, ["tihattar", "tehattar", "tihatar"]],
  [74, ["chauhattar", "chohattar", "chauhatar"]],
  [75, ["pachhattar", "pachattar", "pachahattar", "pachhatar"]],
  [76, ["chhihattar", "chihattar", "chhiyattar", "chiyattar"]],
  [77, ["satattar", "sathattar", "satahattar", "sathatar"]],
  [78, ["athattar", "athhattar", "atthattar", "athahattar"]],
  [79, ["unaasi", "unasi", "unnasi", "unyaasi", "unyasi"]],
  [80, ["assi", "assee", "asi", "asee"]],
  [81, ["ikyaasi", "ikyasi", "ikkyasi", "ikkyaasi"]],
  [82, ["bayaasi", "bayasi", "byasi", "byaasi"]],
  [83, ["tiraasi", "tirasi", "tirrasi"]],
  [84, ["chauraasi", "chaurasi", "chorasi", "chouraasi"]],
  [85, ["pachaasi", "pachasi", "pichasi", "pichaasi"]],
  [86, ["chhiyaasi", "chiyasi", "chhiyasi", "chiyaasi"]],
  [87, ["sattaasi", "sattasi", "satasi"]],
  [88, ["atthaasi", "athasi", "atthasi", "athaasi"]],
  [89, ["navaasi", "nawasi", "navasi", "nawaasi"]],
  [90, ["nabbe", "nabe", "nabbey", "nabbay"]],
  [91, ["ikyaanave", "ikyanave", "ikyanve", "ikyaanve"]],
  [92, ["baanave", "banave", "baanve", "banve"]],
  [93, ["tiraanave", "tiranave", "tiranve", "tiraanve"]],
  [94, ["chauraanave", "chauranave", "chauranve", "chauraanve"]],
  [95, ["pachaanave", "pachanave", "pachanve", "pachaanve"]],
  [96, ["chhiyaanave", "chhiyanave", "chiyanve", "chhiyaanve", "chiyanave"]],
  [97, ["sattaanave", "sattanave", "sattanve", "sattaanve"]],
  [98, ["atthaanave", "athanave", "atthanve", "athaanve"]],
  [99, ["ninyaanave", "ninyanave", "ninyanve", "ninnyanve", "ninyaanve"]],
];

const DEVANAGARI: ReadonlyArray<readonly [number, readonly string[]]> = [
  [1, ["एक"]],
  [2, ["दो"]],
  [3, ["तीन"]],
  [4, ["चार"]],
  [5, ["पांच", "पाँच"]],
  [6, ["छह", "छः", "छे", "छै"]],
  [7, ["सात"]],
  [8, ["आठ"]],
  [9, ["नौ"]],
  [10, ["दस"]],
  [11, ["ग्यारह"]],
  [12, ["बारह"]],
  [13, ["तेरह"]],
  [14, ["चौदह"]],
  [15, ["पंद्रह", "पन्द्रह"]],
  [16, ["सोलह"]],
  [17, ["सत्रह"]],
  [18, ["अठारह"]],
  [19, ["उन्नीस"]],
  [20, ["बीस"]],
  [21, ["इक्कीस"]],
  [22, ["बाईस"]],
  [23, ["तेईस"]],
  [24, ["चौबीस"]],
  [25, ["पच्चीस"]],
  [26, ["छब्बीस"]],
  [27, ["सत्ताईस"]],
  [28, ["अट्ठाईस", "अठाईस"]],
  [29, ["उनतीस"]],
  [30, ["तीस"]],
  [31, ["इकतीस", "इकत्तीस"]],
  [32, ["बत्तीस"]],
  [33, ["तैंतीस", "तेंतीस"]],
  [34, ["चौंतीस"]],
  [35, ["पैंतीस"]],
  [36, ["छत्तीस"]],
  [37, ["सैंतीस"]],
  [38, ["अड़तीस", "अडतीस"]],
  [39, ["उनतालीस", "उनचालीस"]],
  [40, ["चालीस"]],
  [41, ["इकतालीस"]],
  [42, ["बयालीस", "बियालीस"]],
  [43, ["तैंतालीस", "तेंतालीस"]],
  [44, ["चवालीस", "चौवालीस"]],
  [45, ["पैंतालीस"]],
  [46, ["छियालीस"]],
  [47, ["सैंतालीस"]],
  [48, ["अड़तालीस", "अडतालीस"]],
  [49, ["उनचास"]],
  [50, ["पचास"]],
  [51, ["इक्यावन"]],
  [52, ["बावन"]],
  [53, ["तिरेपन", "तिरपन"]],
  [54, ["चौवन"]],
  [55, ["पचपन"]],
  [56, ["छप्पन"]],
  [57, ["सत्तावन"]],
  [58, ["अट्ठावन", "अठावन"]],
  [59, ["उनसठ"]],
  [60, ["साठ"]],
  [61, ["इकसठ"]],
  [62, ["बासठ"]],
  [63, ["तिरेसठ", "तिरसठ"]],
  [64, ["चौंसठ"]],
  [65, ["पैंसठ"]],
  [66, ["छियासठ"]],
  [67, ["सड़सठ", "सडसठ"]],
  [68, ["अड़सठ", "अडसठ"]],
  [69, ["उनहत्तर"]],
  [70, ["सत्तर"]],
  [71, ["इकहत्तर"]],
  [72, ["बहत्तर"]],
  [73, ["तिहत्तर"]],
  [74, ["चौहत्तर"]],
  [75, ["पचहत्तर"]],
  [76, ["छिहत्तर"]],
  [77, ["सतहत्तर"]],
  [78, ["अठहत्तर"]],
  [79, ["उन्यासी", "उनासी"]],
  [80, ["अस्सी"]],
  [81, ["इक्यासी"]],
  [82, ["बयासी"]],
  [83, ["तिरासी"]],
  [84, ["चौरासी"]],
  [85, ["पचासी"]],
  [86, ["छियासी"]],
  [87, ["सत्तासी"]],
  [88, ["अट्ठासी", "अठासी"]],
  [89, ["नवासी"]],
  [90, ["नब्बे"]],
  [91, ["इक्यानवे"]],
  [92, ["बानवे"]],
  [93, ["तिरानवे"]],
  [94, ["चौरानवे"]],
  [95, ["पचानवे", "पचानबे"]],
  [96, ["छियानवे"]],
  [97, ["सत्तानवे"]],
  [98, ["अट्ठानवे", "अठानवे"]],
  [99, ["निन्यानवे", "निन्यानबे"]],
];

/** Folds the common spelling variations of Roman Hindi into one key. */
export function romanKey(word: string): string {
  return word
    .toLowerCase()
    .replace(/w/g, "v")
    .replace(/ee|ii/g, "i")
    .replace(/oo/g, "u")
    .replace(/aa+/g, "a")
    .replace(/chch|cch/g, "ch")
    .replace(/chh/g, "ch")
    .replace(/([bcdfgjklmnpqrstvxz])\1+/g, "$1")
    .replace(/([aeiou])h$/, "$1");
}

/** Devanagari spellings vary by nukta and chandrabindu; fold both away. */
export function devanagariKey(word: string): string {
  return word.replace(/\u093C/g, "").replace(/\u0901/g, "\u0902");
}

function buildIndex(
  rows: ReadonlyArray<readonly [number, readonly string[]]>,
  key: (w: string) => string,
): Map<string, number> {
  const index = new Map<string, number>();
  for (const [n, spellings] of rows) {
    for (const spelling of spellings) {
      const k = key(spelling);
      const existing = index.get(k);
      if (existing !== undefined && existing !== n) {
        throw new Error(`Hindi number spellings collide: ${spelling} folds to ${k} for ${existing} and ${n}`);
      }
      index.set(k, n);
    }
  }
  return index;
}

const ROMAN_INDEX = buildIndex(ROMAN, romanKey);
const DEVANAGARI_INDEX = buildIndex(DEVANAGARI, devanagariKey);

export function hindiNumber(word: string): number | undefined {
  if (/\p{Script=Devanagari}/u.test(word)) return DEVANAGARI_INDEX.get(devanagariKey(word));
  return ROMAN_INDEX.get(romanKey(word));
}

export const ROMAN_SPELLINGS = ROMAN;
export const DEVANAGARI_SPELLINGS = DEVANAGARI;
