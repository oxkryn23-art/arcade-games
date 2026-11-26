// Player names, shared by the site (window.DuelNames) and the server (require('../public/js/names.js')):
//   random()      a fun default nickname, adjective + animal or thing ("SneakyPretzel", "LuckyBadger"); each
//                 browser keeps its own.
//   problem(name) why a name can't be used ('' when it is fine): 3–18 characters, English letters, digits, space,
//                 _ . - (starting and ending with a letter or digit), not a reserved word, no profanity (checked on
//                 a normalized copy: lower case, common look-alike digits/symbols mapped, separators removed).
// Uniqueness is the server's job (case-insensitive, server/users.js).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DuelNames = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const ADJ = ['Sneaky', 'Fuzzy', 'Lucky', 'Grumpy', 'Sleepy', 'Turbo', 'Cosmic', 'Spicy', 'Wobbly', 'Mighty', 'Shady', 'Jolly',
    'Sassy', 'Dizzy', 'Crispy', 'Silent', 'Rusty', 'Golden', 'Noisy', 'Fancy', 'Bouncy', 'Stealthy', 'Cheeky', 'Nimble',
    'Salty', 'Frosty', 'Zesty', 'Bold', 'Clever', 'Wild', 'Dusty', 'Velvet', 'Sly', 'Brave', 'Hasty', 'Moody', 'Swift',
    'Tiny', 'Giant', 'Funky', 'Jumpy', 'Lazy', 'Witty', 'Peppy', 'Snappy', 'Quirky', 'Breezy', 'Chunky', 'Dapper', 'Gentle',
    'Happy', 'Icy', 'Mellow', 'Plucky', 'Rowdy', 'Shiny', 'Smooth', 'Sunny', 'Tricky', 'Zippy', 'Calm', 'Lucid', 'Nifty'];
  const NOUN = ['Banana', 'Whisker', 'Noodle', 'Pickle', 'Mango', 'Pretzel', 'Coconut', 'Muffin', 'Taco', 'Biscuit', 'Waffle',
    'Pebble', 'Cactus', 'Tumbleweed', 'Paws', 'Bandit', 'Outlaw', 'Ranger', 'Sheriff', 'Dumpling', 'Nugget', 'Gizmo',
    'Rocket', 'Pirate', 'Wizard', 'Goblin', 'Yeti', 'Llama', 'Badger', 'Otter', 'Gecko', 'Walrus', 'Toast', 'Panda', 'Koala',
    'Ferret', 'Penguin', 'Raccoon', 'Hamster', 'Lobster', 'Moose', 'Parrot', 'Falcon', 'Turtle', 'Beaver', 'Weasel', 'Bison',
    'Pancake', 'Cupcake', 'Meatball', 'Popcorn', 'Bagel', 'Donut', 'Cookie', 'Pudding', 'Nacho', 'Kiwi', 'Lemon', 'Peanut',
    'Marble', 'Teapot', 'Compass', 'Anchor', 'Lantern', 'Domino', 'Joker', 'Dice', 'Trumpet', 'Banjo', 'Kazoo', 'Comet'];

  const pick = (l, rnd) => l[Math.floor(rnd() * l.length)];
  // "SneakyPretzel"; with `digits` a number is added ("SneakyPretzel42"), for when the plain one is taken
  function random({ rnd = Math.random, digits = false } = {}) {
    for (;;) {
      const base = pick(ADJ, rnd) + pick(NOUN, rnd);
      const name = digits ? base + String(10 + Math.floor(rnd() * 990)) : base;
      if (name.length <= 18) return name;
    }
  }

  const FORMAT = /^[A-Za-z0-9](?:[A-Za-z0-9 _.-]{1,16})[A-Za-z0-9]$/;
  const RESERVED = ['you', 'ai', 'admin', 'administrator', 'moderator', 'mod', 'arcadegames', 'system', 'support', 'staff', 'official',
    'guest', 'demo', 'bot', 'house', 'null', 'undefined', 'anonymous'];
  // staff look-alikes anywhere in a name (letters and digits only, lower case), and names that start or end with the site name
  const STAFF = /admin|moderator|houseai|^arcadegames|arcadegames$/;
  // Word stems that are never allowed anywhere in a name (normalized, see below). Kept short and general on purpose.
  const BANNED = ['fuck', 'fuk', 'fck', 'shit', 'cunt', 'bitch', 'bastard', 'dick', 'cock', 'pussy', 'penis', 'vagina', 'whore',
    'slut', 'wank', 'twat', 'prick', 'bollock', 'asshole', 'arsehole', 'jizz', 'cum', 'porn', 'sex', 'rape', 'nazi', 'hitler',
    'nigg', 'nigga', 'fag', 'retard', 'spic', 'chink', 'kike', 'tranny', 'dyke', 'coon', 'wetback', 'paki', 'gook',
    'killyourself', 'kys', 'pedo', 'molest', 'incest', 'anal', 'boob', 'tits', 'dildo', 'horny', 'nude', 'milf', 'hentai'];
  // look-alikes: 0→o 1→i 3→e 4→a 5→s 7→t 8→b @→a $→s; separators and repeated letters collapse
  const MAP = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i' };
  const normalize = (s) => String(s).toLowerCase().replace(/[01345789@$!|]/g, (c) => MAP[c] || c).replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  // a few stems are also common inside harmless words ("Scunthorpe", "cocktail", "Dickens", "analyst", "cumin"): those
  // only count as whole words of the name (split by case, digits and separators)
  const WHOLE_WORD = new Set(['cum', 'anal', 'cock', 'dick', 'prick', 'coon', 'spic', 'paki', 'fag', 'mod', 'sex', 'nude', 'tits', 'boob', 'kys', 'gook']);
  const words = (s) => String(s).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  function profane(name) {
    // whole words are compared as written (no collapsing: "Bob" is not "boob")
    const flat = normalize(name), ws = words(String(name).replace(/[01345789@$!|]/g, (c) => MAP[c] || c));
    if (/k{3}/i.test(String(name))) return true;
    return BANNED.some((b) => {
      const stem = b.replace(/(.)\1+/g, '$1');
      return WHOLE_WORD.has(b) ? ws.includes(b) || ws.includes(`${b}s`) : flat.includes(stem);
    });
  }
  function problem(name) {
    const n = String(name ?? '').trim();
    if (!FORMAT.test(n) || /\s{2}/.test(n)) return 'Names are 3–18 characters: English letters, numbers, spaces, _ . or -, starting and ending with a letter or number.';
    if (!/[A-Za-z]/.test(n)) return 'Names need at least one letter.';
    if (RESERVED.includes(n.toLowerCase().replace(/[ _.-]/g, ''))) return 'That name is reserved. Pick another one.';
    // nobody may pose as the site or its staff: "Arcade Games Team", "ArcadeGamesSupport", "Admin2", "House AI"
    if (STAFF.test(n.toLowerCase().replace(/[^a-z0-9]/g, ''))) return 'That name is reserved. Pick another one.';
    if (profane(n)) return "That name isn't allowed. Pick another one.";
    return '';
  }
  const clean = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');

  return { ADJ, NOUN, random, problem, clean, normalize };
});
