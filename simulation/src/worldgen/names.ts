import type { Rng } from '../rng.js';

/**
 * Generador de nombres por "lenguas" ficticias. Cada cultura usa una fonología propia
 * para que provincias, ciudades y personas tengan coherencia regional.
 */
export interface Phonology {
  onsets: string[];
  vowels: string[];
  codas: string[];
  placeSuffix: string[];
  countrySuffix: string[];
  given: string[];
  surnameSuffix: string[];
  currencies: string[];
  capitalize?: boolean;
}

export const LANGUAGES: Record<string, Phonology> = {
  aurel: {
    onsets: ['v', 'c', 'l', 'm', 's', 't', 'r', 'b', 'd', 'f', 'g', 'p', 'n', 'br', 'tr', 'cr', 'gr', 'val', 'cas', 'mor'],
    vowels: ['a', 'e', 'i', 'o', 'u', 'ia', 'io', 'ei'],
    codas: ['', '', '', 'n', 'r', 's', 'l', 'nt'],
    placeSuffix: ['a', 'ino', 'ella', 'ora', 'ano', 'eda', 'iel', 'osa', 'enza', 'ar'],
    countrySuffix: ['ia', 'enia', 'oria', 'ana', 'esia'],
    given: ['Aurelio', 'Mireia', 'Tadeo', 'Livia', 'Corvin', 'Sabela', 'Elian', 'Renata', 'Osvaldo', 'Ilaria', 'Dario', 'Marcela'],
    surnameSuffix: ['ez', 'ini', 'osa', 'eda', 'ari'],
    currencies: ['dobla', 'tálaro', 'sólido', 'escudo aureliano', 'florán']
  },
  nordh: {
    onsets: ['h', 'v', 's', 'st', 'k', 'b', 'r', 't', 'g', 'fj', 'hj', 'sk', 'str', 'br', 'dr', 'ul', 'eir', 'aa'],
    vowels: ['a', 'e', 'i', 'o', 'u', 'ö', 'å', 'ei', 'y'],
    codas: ['', 'n', 'rd', 'lm', 'r', 'k', 'ng', 'st'],
    placeSuffix: ['holm', 'vik', 'berg', 'stad', 'mark', 'heim', 'fjord', 'dal', 'by', 'vang'],
    countrySuffix: ['mark', 'land', 'heim', 'holm'],
    given: ['Eirik', 'Solveig', 'Halvar', 'Ingrid', 'Torvald', 'Ylva', 'Ragnvald', 'Liv', 'Arne', 'Sigrun', 'Bjarke', 'Tove'],
    surnameSuffix: ['sen', 'dahl', 'berg', 'strand', 'lund'],
    currencies: ['krona', 'skilling', 'mark', 'daler']
  },
  kharz: {
    onsets: ['k', 'kh', 'z', 'zh', 'dr', 'v', 't', 'ts', 's', 'sh', 'b', 'g', 'm', 'n', 'r', 'l', 'ch', 'y', 'pr', 'ost'],
    vowels: ['a', 'o', 'e', 'i', 'u', 'y', 'ya', 'ie'],
    codas: ['', 'k', 'v', 'sk', 'r', 'n', 'm', 'z', 'l'],
    placeSuffix: ['ovsk', 'grad', 'ar', 'avan', 'ezh', 'insk', 'ov', 'ava', 'eya', 'ostan'],
    countrySuffix: ['ia', 'ava', 'stan', 'ovia', 'ezia'],
    given: ['Vasilk', 'Mirela', 'Dragan', 'Yevra', 'Kostin', 'Zhanna', 'Ruslav', 'Olesya', 'Timur', 'Darya', 'Bogdar', 'Lyuba'],
    surnameSuffix: ['ov', 'enko', 'ik', 'ev', 'insky'],
    currencies: ['rubal', 'dravo', 'kopek', 'zolta', 'leván']
  },
  solv: {
    onsets: ['z', 'q', 't', 's', 'kh', 'h', 'n', 'm', 'r', 'b', 'd', 'j', 'sh', 'f', 'ar', 'el', 'ib'],
    vowels: ['a', 'i', 'u', 'e', 'aa', 'ai', 'ou'],
    codas: ['', 'r', 'd', 'n', 'm', 'sh', 'z', 'h', 'r'],
    placeSuffix: ['abad', 'ir', 'ah', 'un', 'esh', 'ara', 'iya', 'ar', 'oun', 'ad'],
    countrySuffix: ['abad', 'ir', 'esh', 'ar', 'ia'],
    given: ['Rashan', 'Layla', 'Tariq', 'Nasrin', 'Kadar', 'Samira', 'Hadin', 'Zahra', 'Faris', 'Amira', 'Jalun', 'Nour'],
    surnameSuffix: ['i', 'ani', 'oun', 'ar', 'ezi'],
    currencies: ['dirán', 'qasri', 'tumán', 'sahel']
  },
  merid: {
    onsets: ['t', 'tl', 'k', 'c', 'ch', 'y', 'p', 'm', 'n', 'q', 'h', 'hu', 'gu', 'ar', 'ol', 'it'],
    vowels: ['a', 'e', 'i', 'o', 'u', 'ua', 'ue', 'ai'],
    codas: ['', '', 'l', 'n', 'c', 'x', 'r'],
    placeSuffix: ['pa', 'tlán', 'ca', 'quí', 'ruá', 'lco', 'tepe', 'ayo', 'uana', 'ichi'],
    countrySuffix: ['pa', 'ia', 'ú', 'uay', 'ana'],
    given: ['Itzel', 'Mateo', 'Yaretzi', 'Tupac', 'Ximena', 'Huaman', 'Citlali', 'Joaquín', 'Nayeli', 'Amaru', 'Inés', 'Teo'],
    surnameSuffix: ['ez', 'ari', 'uay', 'oca', 'án'],
    currencies: ['peso meridiano', 'cóndor', 'sol', 'real', 'quetzal']
  },
  ostr: {
    onsets: ['k', 't', 'm', 'n', 'h', 'r', 's', 'y', 'w', 'ts', 'ch', 'f', 'ky'],
    vowels: ['a', 'i', 'u', 'e', 'o', 'ai', 'ou'],
    codas: ['', '', '', 'n'],
    placeSuffix: ['ra', 'nui', 'moa', 'kai', 'hara', 'zaki', 'lani', 'mura', 'oto', 'ika'],
    countrySuffix: ['ra', 'nui', 'kai', 'mura'],
    given: ['Haruto', 'Leilani', 'Kenta', 'Moana', 'Riku', 'Keala', 'Sora', 'Nalani', 'Tavita', 'Emi', 'Kaito', 'Hina'],
    surnameSuffix: ['moto', 'kawa', 'nui', 'hara', 'ta'],
    currencies: ['ryo', 'kaimon', 'tala', 'sen']
  },
  velm: {
    onsets: ['k', 'th', 'ph', 'm', 'l', 'n', 's', 't', 'd', 'r', 'ar', 'el', 'kr', 'pl', 'ky'],
    vowels: ['a', 'e', 'i', 'o', 'y', 'ai', 'eo'],
    codas: ['', 's', 'n', 'r', 'l'],
    placeSuffix: ['ene', 'os', 'ia', 'ossa', 'ythea', 'ion', 'amos', 'ira', 'enai', 'opolis'],
    countrySuffix: ['ene', 'ossa', 'ia', 'ythea', 'or'],
    given: ['Theron', 'Myrto', 'Lysandro', 'Ione', 'Kallias', 'Daphne', 'Nikandro', 'Thalia', 'Orestes', 'Elektra', 'Pheidon', 'Zoe'],
    surnameSuffix: ['ides', 'akis', 'opoulos', 'aris', 'enos'],
    currencies: ['drakma', 'óbolo', 'estáter', 'fénix']
  }
};

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

export function word(rng: Rng, lang: string, syllables: number): string {
  const p = LANGUAGES[lang] ?? LANGUAGES.aurel;
  let w = '';
  for (let i = 0; i < syllables; i++) {
    w += rng.pick(p.onsets) + rng.pick(p.vowels);
    if (i === syllables - 1 || rng.chance(0.3)) w += rng.pick(p.codas);
  }
  return w;
}

export class NameRegistry {
  private used = new Set<string>();
  constructor(private rng: Rng) {}
  reserve(name: string): void { this.used.add(name.toLowerCase()); }
  private unique(gen: () => string): string {
    for (let i = 0; i < 60; i++) {
      const n = gen();
      if (n.length >= 3 && n.length <= 16 && !this.used.has(n.toLowerCase())) { this.used.add(n.toLowerCase()); return n; }
    }
    const n = gen() + ' ' + this.rng.int(2, 99);
    this.used.add(n.toLowerCase());
    return n;
  }
  place(lang: string): string {
    const p = LANGUAGES[lang] ?? LANGUAGES.aurel;
    return this.unique(() => cap(word(this.rng, lang, this.rng.int(1, 2)) + this.rng.pick(p.placeSuffix)));
  }
  country(lang: string): string {
    const p = LANGUAGES[lang] ?? LANGUAGES.aurel;
    return this.unique(() => cap(word(this.rng, lang, this.rng.int(1, 2)) + this.rng.pick(p.countrySuffix)));
  }
  feature(lang: string): string {
    return this.unique(() => cap(word(this.rng, lang, this.rng.int(2, 3))));
  }
}

export function personName(rng: Rng, lang: string): string {
  const p = LANGUAGES[lang] ?? LANGUAGES.aurel;
  return `${rng.pick(p.given)} ${cap(word(rng, lang, rng.int(1, 2)))}${rng.pick(p.surnameSuffix)}`;
}

export function adjectiveOf(name: string): string {
  const base = name.replace(/(ia|ía|a|e|o|os|ú|ar|ir|esh|abad|stan|mark|land|heim|holm|ene|or|ra|nui|kai|mura|pa|ana|ava|uay)$/i, '');
  const root = base.length >= 3 ? base : name;
  return root + (/[aeiou]$/i.test(root) ? 'no' : 'ense');
}

export function currencyCode(name: string, rng: Rng): string {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 2) + (letters[2] ?? 'X') ).slice(0, 3) || 'UMX' + rng.int(0, 9);
}
