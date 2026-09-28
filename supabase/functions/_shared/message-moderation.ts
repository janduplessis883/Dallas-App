const blockedWords = new Set([
  'asshole',
  'bastard',
  'bitch',
  'cunt',
  'dickhead',
  'faggot',
  'fuck',
  'fucker',
  'fucking',
  'motherfucker',
  'nigger',
  'nigga',
  'retard',
  'shit',
  'slut',
  'whore',
  'dyke',
]);

const blockedPhrases = [
  ['go', 'die'],
  ['kill', 'yourself'],
  ['k', 'y', 's'],
  ['i', 'will', 'kill', 'you'],
  ['i', 'am', 'going', 'to', 'kill', 'you'],
  ['i', 'will', 'hurt', 'you'],
  ['i', 'will', 'rape', 'you'],
  ['you', 'deserve', 'to', 'die'],
];

const disallowedMessage =
  'Please edit this message. Some language that can be threatening or hurtful is not allowed.';

export function moderateMessage(text: string): { allowed: boolean; reason?: string } {
  const normalized = normalizeTokens(text);

  if (normalized.some((token) => blockedWords.has(token))) {
    return { allowed: false, reason: disallowedMessage };
  }

  if (containsBlockedPhrase(normalized)) {
    return { allowed: false, reason: disallowedMessage };
  }

  return { allowed: true };
}

function normalizeTokens(text: string): string[] {
  const normalized = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u200b-\u200d\ufeff]/g, '')
    .toLowerCase()
    .replace(/[013457@$]/g, (character) => {
      const substitutions: Record<string, string> = {
        '0': 'o',
        '1': 'i',
        '3': 'e',
        '4': 'a',
        '5': 's',
        '7': 't',
        '@': 'a',
        '$': 's',
      };
      return substitutions[character] ?? character;
    });

  return normalized.match(/[a-z]+/g) ?? [];
}

function containsBlockedPhrase(tokens: string[]): boolean {
  return blockedPhrases.some((phrase) => {
    if (phrase.length > tokens.length) return false;

    return tokens.some((_, start) => {
      return phrase.every((word, offset) => tokens[start + offset] === word);
    });
  });
}
