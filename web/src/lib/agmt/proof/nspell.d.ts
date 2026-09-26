declare module "nspell" {
  type HunspellInput = string | Uint8Array;
  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
  }
  interface NSpellConstructor {
    (aff: HunspellInput, dic?: HunspellInput): NSpell;
    (dictionary: { aff: HunspellInput; dic: HunspellInput }): NSpell;
    new (aff: HunspellInput, dic?: HunspellInput): NSpell;
  }
  const nspell: NSpellConstructor;
  export default nspell;
}
