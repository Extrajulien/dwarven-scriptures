import { and, eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';

/**
 * Development seed (`npm run db:seed`): fills the local database with the
 * typing corpus (CONF-03/05), the random-mode word dictionaries (CONF-03) and
 * demo accounts (TECH-04).
 *
 * ## Idempotency strategy
 *
 * Running the seed twice must not duplicate rows, so each section checks what
 * already exists before writing:
 *
 * - `texts`: if the table already contains any row, the whole corpus is
 *   skipped with a log message (the corpus is a fixed public-domain set, so
 *   there is nothing to update). Re-seed after deleting the rows manually.
 * - `word_dictionaries`: keyed by the unique `(language, complexity)` pair —
 *   rows present in the database are skipped, missing ones are inserted.
 * - `users`: demo accounts are keyed by their unique username — a username
 *   that already exists is skipped together with its stats.
 *
 * All passages and word lists are public domain. Every corpus passage cites
 * its work and author in the `source` field next to the text itself; nothing
 * is invented authorial text.
 *
 * This script runs outside Next.js, so `.env.local` is not loaded for us. It
 * is read before `./index` is evaluated, and ESM evaluates the whole import
 * graph before any module body runs — the db client and the queries module
 * are therefore imported lazily inside `main`, exactly like `migrate.ts`.
 */
dotenv.config({ path: '.env.local' });

type Language = 'fr' | 'en';
type Complexity = 'facile' | 'moyen' | 'difficile';

type CorpusEntry = {
  language: Language;
  /** Author, work and year, shown to players. */
  title: string;
  /** Public-domain source citation (work, author, repository). */
  source: string;
  body: string;
};

/**
 * Coherent-mode corpus (CONF-03): 30 public-domain passages, 13 in French and
 * 17 in English, spanning facile/moyen/difficile and ~20 to ~200 words. All
 * texts are verbatim from public-domain editions (Project Gutenberg; see the
 * `source` of each entry). Complexity is not set by hand: `computeTextMetrics`
 * measures each passage and `classifyComplexity` derives the level from those
 * measurements, so the stored classification is justified by numbers.
 */
const CORPUS: CorpusEntry[] = [
  // ---------------------------------------------------------------- FRENCH
  {
    language: 'fr',
    title: 'La Cigale et la Fourmi — Jean de La Fontaine (1668)',
    source: 'Fables de La Fontaine, livre I, fable 1 — Project Gutenberg (public domain)',
    body: "La Cigale, ayant chanté\nTout l'été,\nSe trouva fort dépourvue\nQuand la bise fut venue :\nPas un seul petit morceau\nDe mouche ou de vermisseau.\nElle alla crier famine\nChez la Fourmi sa voisine,\nLa priant de lui prêter\nQuelque grain pour subsister\nJusqu'à la saison nouvelle.\n« Je vous paierai, lui dit-elle,\nAvant l'août, foi d'animal,\nIntérêt et principal. »\nLa Fourmi n'est pas prêteuse :\nC'est là son moindre défaut.\n« Que faisiez-vous au temps chaud ?\nDit-elle à cette emprunteuse.\n— Nuit et jour à tout venant\nJe chantais, ne vous déplaise.\n— Vous chantiez ? j'en suis fort aise.\nEh bien ! dansez maintenant.",
  },
  {
    language: 'fr',
    title: 'Le Corbeau et le Renard — Jean de La Fontaine (1668)',
    source: 'Fables de La Fontaine, livre I, fable 2 — Project Gutenberg (public domain)',
    body: "Maître Corbeau, sur un arbre perché,\nTenait en son bec un fromage.\nMaître Renard, par l'odeur alléché,\nLui tint à peu près ce langage :\n« Hé ! bonjour, Monsieur du Corbeau.\nQue vous êtes joli ! que vous me semblez beau !\nSans mentir, si votre ramage\nSe rapporte à votre plumage,\nVous êtes le Phénix des hôtes de ces bois. »\nÀ ces mots le Corbeau ne se sent pas de joie ;\nEt pour montrer sa belle voix,\nIl ouvre un large bec, laisse tomber sa proie.\nLe Renard s'en saisit, et dit : « Mon bon Monsieur,\nApprenez que tout flatteur\nVit aux dépens de celui qui l'écoute :\nCette leçon vaut bien un fromage, sans doute. »\nLe Corbeau, honteux et confus,\nJura, mais un peu tard, qu'on ne l'y prendrait plus.",
  },
  {
    language: 'fr',
    title: 'La Grenouille qui se veut faire aussi grosse que le Bœuf — Jean de La Fontaine (1668)',
    source: 'Fables de La Fontaine, livre I, fable 3 — Project Gutenberg (public domain)',
    body: "Une Grenouille vit un Bœuf\nQui lui sembla de belle taille.\nElle, qui n'était pas grosse en tout comme un œuf,\nEnvieuse, s'étend, et s'enfle, et se travaille,\nPour égaler l'animal en grosseur,\nDisant : « Regardez bien, ma sœur ;\nEst-ce assez ? dites-moi ; n'y suis-je point encore ?\n— Nenni. — M'y voici donc ? — Point du tout. — M'y voilà ?\n— Vous n'en approchez point. » La chétive pécore\nS'enfla si bien qu'elle creva.",
  },
  {
    language: 'fr',
    title: 'Demain, dès l’aube… — Victor Hugo, Les Contemplations (1856)',
    source: 'Les Contemplations, livre IV, poème XIV — Project Gutenberg (public domain)',
    body: "Demain, dès l'aube, à l'heure où blanchit la campagne,\nJe partirai. Vois-tu, je sais que tu m'attends.\nJ'irai par la forêt, j'irai par la montagne.\nJe ne puis demeurer loin de toi plus longtemps.\nJe marcherai les yeux fixés sur mes pensées,\nSans rien voir au dehors, sans entendre aucun bruit,\nSeul, inconnu, le dos courbé, les mains croisées,\nTriste, et le jour pour moi sera comme la nuit.\nJe ne regarderai ni l'or du soir qui tombe,\nNi les voiles au loin descendant vers Harfleur,\nEt quand j'arriverai, je mettrai sur ta tombe\nUn bouquet de houx vert et de bruyère en fleur.",
  },
  {
    language: 'fr',
    title: 'Le Petit Chaperon rouge (ouverture) — Charles Perrault (1697)',
    source: 'Contes de ma mère l’Oye — Project Gutenberg (public domain)',
    body: "Il était une fois une petite fille de village, la plus jolie qu'on eût su voir ; sa mère en était folle, et sa mère-grand plus folle encore. Cette bonne femme lui fit faire un petit chaperon rouge, qui lui seyait si bien, que partout on l'appelait le Petit Chaperon rouge. Un jour, sa mère, ayant cuit et fait des galettes, lui dit : « Va voir comment se porte ta mère-grand, car on m'a dit qu'elle était malade. Porte-lui une galette et ce petit pot de beurre. » Le Petit Chaperon rouge partit aussitôt pour aller chez sa mère-grand, qui demeurait dans un autre village.",
  },
  {
    language: 'fr',
    title: 'Le Petit Poucet (ouverture) — Charles Perrault (1697)',
    source: 'Contes de ma mère l’Oye — Project Gutenberg (public domain)',
    body: "Il était une fois un bûcheron et une bûcheronne qui avaient sept enfants, tous garçons. L'aîné n'avait que dix ans, et le plus jeune n'en avait que sept. On s'étonnera que le bûcheron ait eu tant d'enfants en si peu de temps ; c'est que sa femme allait vite en besogne, et n'en faisait pas moins de deux à la fois.",
  },
  {
    language: 'fr',
    title: 'La Barbe bleue (ouverture) — Charles Perrault (1697)',
    source: 'Contes de ma mère l’Oye — Project Gutenberg (public domain)',
    body: "Il était une fois un homme qui avait de belles maisons à la ville et à la campagne, de la vaisselle d'or et d'argent, des meubles en broderie, et des carrosses tout dorés. Mais par malheur cet homme avait la barbe bleue : cela le rendait si laid et si terrible, qu'il n'était ni femme ni fille qui ne s'enfuît de devant lui.",
  },
  {
    language: 'fr',
    title: 'Vingt mille lieues sous les mers (ouverture) — Jules Verne (1869)',
    source: 'Vingt mille lieues sous les mers, chapitre I — Project Gutenberg (public domain)',
    body: "L'année 1866 fut marquée par un événement bizarre, un phénomène inexpliqué et inexplicable que personne n'a sans doute oublié. Sans parler des bruits qui agitaient les populations des ports et surexcitaient l'esprit public à l'intérieur des continents, les gens de mer furent particulièrement émus. Les négociants, armateurs, capitaines de navires, skippers et masters de l'Europe et de l'Amérique, officiers des marines militaires de tous pays, et, après eux, les gouvernements des divers États des deux continents, se préoccupèrent de ce fait au plus haut point. En effet, depuis quelque temps, plusieurs navires s'étaient rencontrés sur mer avec « une chose énorme », un objet long, fusiforme, parfois phosphorescent, infiniment plus vaste et plus rapide qu'une baleine.",
  },
  {
    language: 'fr',
    title: 'L’Albatros — Charles Baudelaire, Les Fleurs du mal (1857)',
    source: 'Les Fleurs du mal, section « Spleen et Idéal » — Project Gutenberg (public domain)',
    body: "Souvent, pour s'amuser, les hommes d'équipage\nPrennent des albatros, vastes oiseaux des mers,\nQui suivent, indolents compagnons de voyage,\nLe navire glissant sur les gouffres amers.\nÀ peine les ont-ils déposés sur les planches,\nQue ces rois de l'azur, maladroits et honteux,\nLaissent piteusement leurs grandes ailes blanches\nComme des avirons traîner à côté d'eux.\nCe voyageur ailé, comme il est gauche et veule !\nLui, naguère si beau, qu'il est comique et laid !\nL'un agace son bec avec un brûle-gueule,\nL'autre mime, en boitant, l'infirme qui volait !\nLe Poète est semblable au prince des nuées\nQui hante la tempête et se rit de l'archer ;\nExilé sur le sol au milieu des huées,\nSes ailes de géant l'empêchent de marcher.",
  },
  {
    language: 'fr',
    title: 'La Parure (ouverture) — Guy de Maupassant (1884)',
    source: 'La Parure, nouvelle — Project Gutenberg (public domain)',
    body: "C'était une de ces jolies et charmantes filles, nées, comme par une erreur du destin, dans une famille d'employés. Elle n'avait pas de dot, pas d'espérances, aucun moyen d'être connue, comprise, aimée, épousée par un homme riche et distingué ; et elle se laissa marier avec un petit commis du ministère de l'Instruction publique. Elle fut simple, ne pouvant être parée, mais malheureuse comme une déclassée ; car les femmes n'ont point de caste ni de race, leur beauté, leur grâce et leur charme leur servant de naissance et de famille. Leur finesse native, leur instinct d'élégance, leur souplesse d'esprit sont leur seule hiérarchie, et font des filles du peuple les égales des plus grandes dames.",
  },
  {
    language: 'fr',
    title: 'Le Dormeur du val — Arthur Rimbaud (1870)',
    source: 'Poésies — Project Gutenberg (public domain)',
    body: "C'est un trou de verdure où chante une rivière,\nAccrochant follement aux herbes des haillons\nD'argent ; où le soleil, de la montagne fière,\nLuit : c'est un petit val qui mousse de rayons.\nUn soldat jeune, bouche ouverte, tête nue,\nEt la nuque baignant dans le frais cresson bleu,\nDort ; il est étendu dans l'herbe, sous la nue,\nPâle dans son lit vert où la lumière pleut.\nLes pieds dans les glaïeuls, il dort. Souriant comme\nSourirait un enfant malade, il fait un somme :\nNature, berce-le chaudement : il a froid.\nLes parfums ne font pas frissonner sa narine ;\nIl dort dans le soleil, la main sur sa poitrine,\nTranquille. Il a deux trous rouges au côté droit.",
  },
  {
    language: 'fr',
    title: 'La Chèvre de M. Seguin (ouverture) — Alphonse Daudet, Lettres de mon moulin (1869)',
    source: 'Lettres de mon moulin — Project Gutenberg (public domain)',
    body: "Tu seras bien toujours le même, mon pauvre Gringoire !\nComment ! on t'offre une place de chroniqueur dans un bon journal de Paris, et tu as l'aplomb de refuser... Mais regarde-toi, malheureux garçon ! Regarde ce pourpoint troué, ces chausses en déroute, cette face maigre qui crie la faim. Voilà pourtant où t'a conduit la passion des belles rimes ! Voilà ce que t'ont valu dix ans de loyaux services dans les pages du sire Apollon... Est-ce que tu n'as pas honte, à la fin ?\nFais-toi donc chroniqueur, imbécile ! fais-toi chroniqueur ! Tu gagneras de beaux écus à la rose, tu auras ton couvert chez Brébant, et tu pourras te montrer les jours de première avec une plume neuve à ta barrette...",
  },
  {
    language: 'fr',
    title: 'Germinal (ouverture) — Émile Zola (1885)',
    source: 'Germinal, partie I, chapitre 1 — Project Gutenberg (public domain)',
    body: "Dans la plaine rase, sous la nuit sans étoiles, d'une obscurité et d'une épaisseur d'encre, un homme suivait seul la grande route de Marchiennes à Montsou, dix kilomètres de pavé coupant tout droit, à travers les champs de betteraves. Devant lui, il ne voyait même pas le sol noir, et il n'avait la sensation de l'immense horizon plat que par les souffles du vent de mars, des rafales larges comme sur une mer, glacées d'avoir balayé des lieues de marais et de terres nues. Aucune ombre d'arbre ne tachait le ciel, le pavé se déroulait avec la rectitude d'une jetée, au milieu de l'embrun aveuglant des ténèbres.",
  },
  // ---------------------------------------------------------------- ENGLISH
  {
    language: 'en',
    title: 'Humpty Dumpty — traditional nursery rhyme (Mother Goose)',
    source: 'Traditional nursery rhyme, Mother Goose — public domain',
    body: "Humpty Dumpty sat on a wall,\nHumpty Dumpty had a great fall.\nAll the king's horses and all the king's men\nCouldn't put Humpty together again.",
  },
  {
    language: 'en',
    title: 'The Hare and the Tortoise — Aesop, Fables (G. F. Townsend translation)',
    source: 'Aesop’s Fables, George Fyler Townsend translation — Project Gutenberg ebook #21 (public domain)',
    body: "The Hare was once boasting of his speed before the other animals. 'I have never yet been beaten,' said he, 'when I put forth my full speed. I challenge any one here to race with me.' The Tortoise said quietly, 'I accept your challenge.' 'That is a good joke,' said the Hare; 'I could dance round you all the way.' 'Keep your boasting till you've beaten,' answered the Tortoise. 'Shall we race?' So a course was fixed and a start was made. The Hare darted almost out of sight at once, but soon stopped and, to show his contempt for the Tortoise, lay down to have a nap. The Tortoise plodded on and plodded on, and when the Hare awoke from his nap, he saw the Tortoise just near the winning-post and could not run up in time to save the race. Then said the Tortoise: 'Plodding wins the race.'",
  },
  {
    language: 'en',
    title: 'The Fox and the Grapes — Aesop, Fables (G. F. Townsend translation)',
    source: 'Aesop’s Fables, George Fyler Townsend translation — Project Gutenberg ebook #21 (public domain)',
    body: "One hot summer's day a Fox was strolling through an orchard till he came to a bunch of Grapes just ripening on a vine which had been trained over a lofty branch. 'Just the thing to quench my thirst,' quoth he. Drawing back a few paces, he took a run and a jump, and just missed the bunch. Turning round again with a One, Two, Three, he jumped up, but with no greater success. Again and again he tried after the tempting morsel, but at last had to give it up, and walked away with his nose in the air, saying: 'I am sure they are sour.'",
  },
  {
    language: 'en',
    title: 'Twinkle, Twinkle, Little Star — Jane Taylor (1806)',
    source: 'Rhymes for the Nursery, Jane and Ann Taylor — public domain',
    body: "Twinkle, twinkle, little star,\nHow I wonder what you are!\nUp above the world so high,\nLike a diamond in the sky.\nWhen the blazing sun is gone,\nWhen he nothing shines upon,\nThen you show your little light,\nTwinkle, twinkle, all the night.\nThen the traveller in the dark,\nThanks you for your tiny spark,\nHe could not see which way to go,\nIf you did not twinkle so.",
  },
  {
    language: 'en',
    title: '“Hope” is the thing with feathers — Emily Dickinson (c. 1861)',
    source: 'Poems by Emily Dickinson — public domain',
    body: "'Hope' is the thing with feathers —\nThat perches in the soul —\nAnd sings the tune without the words —\nAnd never stops — at all —\nAnd sweetest — in the Gale — is heard —\nAnd sore must be the storm —\nThat could abash the little Bird\nThat kept so many warm —\nI've heard it in the chillest land —\nAnd on the strangest Sea —\nYet — never — in Extremity,\nIt asked a crumb — of me.",
  },
  {
    language: 'en',
    title: 'Pride and Prejudice (opening) — Jane Austen (1813)',
    source: 'Pride and Prejudice, chapter 1 — Project Gutenberg ebook #1342 (public domain)',
    body: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.',
  },
  {
    language: 'en',
    title: 'Moby-Dick (chapter 1) — Herman Melville (1851)',
    source: 'Moby-Dick; or, The Whale, chapter 1 — Project Gutenberg ebook #2701 (public domain)',
    body: "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people's hats off—then, I account it high time to get to sea as soon as I can. This is my substitute for pistol and ball. With a philosophical flourish Cato throws himself upon his sword; I quietly take to the ship. There is nothing surprising in this. If they but knew it, almost all men in their degree, some time or other, cherish very nearly the same feelings towards the ocean with me.",
  },
  {
    language: 'en',
    title: 'A Tale of Two Cities (opening) — Charles Dickens (1859)',
    source: 'A Tale of Two Cities, book I, chapter 1 — Project Gutenberg ebook #98 (public domain)',
    body: 'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair, we had everything before us, we had nothing before us, we were all going direct to Heaven, we were all going direct the other way—in short, the period was so far like the present period, that some of its noisiest authorities insisted on its being received, for good or for evil, in the superlative degree of comparison only.',
  },
  {
    language: 'en',
    title: "Alice's Adventures in Wonderland (opening) — Lewis Carroll (1865)",
    source: "Alice's Adventures in Wonderland, chapter 1 — Project Gutenberg ebook #11 (public domain)",
    body: "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, 'and what is the use of a book,' thought Alice 'without pictures or conversations?' So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.",
  },
  {
    language: 'en',
    title: 'The Raven (first stanza) — Edgar Allan Poe (1845)',
    source: 'The Raven — Project Gutenberg (public domain)',
    body: "Once upon a midnight dreary, while I pondered, weak and weary,\nOver many a quaint and curious volume of forgotten lore—\nWhile I nodded, nearly napping, suddenly there came a tapping,\nAs of some one gently rapping, rapping at my chamber door.\n'Tis some visitor,' I muttered, 'tapping at my chamber door—\nOnly this and nothing more.",
  },
  {
    language: 'en',
    title: 'Treasure Island (chapter 1) — Robert Louis Stevenson (1883)',
    source: 'Treasure Island, part I — Project Gutenberg ebook #120 (public domain)',
    body: "Squire Trelawney, Dr. Livesey, and the rest of these gentlemen having asked me to write down the whole particulars about Treasure Island, from the beginning to the end, keeping nothing back but the bearings of the island, and that only because there is still treasure not yet lifted, I take up my pen in the year of grace 17—, and go back to the time when my father kept the Admiral Benbow inn, and the brown old seaman with the sabre cut first took up his lodging under our roof.",
  },
  {
    language: 'en',
    title: 'The Adventures of Tom Sawyer (chapter 1) — Mark Twain (1876)',
    source: 'The Adventures of Tom Sawyer, chapter 1 — Project Gutenberg ebook #74 (public domain)',
    body: "Tom! No answer. Tom! No answer. What's gone with that boy, I wonder? You TOM! No answer. The old lady pulled her spectacles down and looked over them about the room; then she put them up and looked out under them. She seldom or never looked through them for so small a thing as a boy; they were her state pair, the pride of her heart, and were built for style, not service—she could have seen through a pair of stove-lids just as well. She looked perplexed for a moment, and then said, not fiercely, but still loud enough for the furniture to hear: Well, I lay if I get hold of you I'll—",
  },
  {
    language: 'en',
    title: 'Meditation XVII (modernized spelling) — John Donne, Devotions upon Emergent Occasions (1624)',
    source: 'Devotions upon Emergent Occasions, Meditation XVII — public domain (modernized spelling)',
    body: "No man is an island, entire of itself; every man is a piece of the continent, a part of the main. If a clod be washed away by the sea, Europe is the less, as well as if a promontory were, as well as if a manor of thy friend's or of thine own were: any man's death diminishes me, because I am involved in mankind, and therefore never send to know for whom the bell tolls; it tolls for thee.",
  },
  {
    language: 'en',
    title: 'Of Studies — Francis Bacon (1625)',
    source: 'The Essayes or Counsels, Civill and Morall — public domain',
    body: 'Studies serve for delight, for ornament, and for ability. Their chief use for delight is in privateness and retiring; for ornament, is in discourse; and for ability, is in the judgment and disposition of business. For expert men can execute, and perhaps judge of particulars, one by one; but the general counsels, and the plots and marshalling of affairs, come best from those that are learned.',
  },
  {
    language: 'en',
    title: "Gulliver's Travels (chapter 1) — Jonathan Swift (1726)",
    source: "Gulliver's Travels, part I, chapter 1 — Project Gutenberg (public domain)",
    body: 'My father had a small estate in Nottinghamshire; I was the third of five sons. He sent me to Emanuel College in Cambridge at fourteen years old, where I resided three years, and applied myself close to my studies; but the charge of maintaining me, although I had a very scanty allowance, being too great for a narrow fortune, I was bound apprentice to Mr. James Bates, an eminent surgeon in London, with whom I continued four years.',
  },
  {
    language: 'en',
    title: 'On the Origin of Species (introduction) — Charles Darwin (1859)',
    source: 'On the Origin of Species by Means of Natural Selection — Project Gutenberg (public domain)',
    body: "When on board H.M.S. 'Beagle,' as naturalist, I was much struck with certain facts in the distribution of the inhabitants of South America, and in the geological relations of the present to the past inhabitants of that continent. These facts seemed to me to throw some light on the origin of species—that mystery of mysteries, as it has been called by one of our greatest philosophers. On my return home, it occurred to me, in 1837, that something might perhaps be made out on this question by patiently accumulating and reflecting on all sorts of facts which could possibly have any bearing on it.",
  },
  {
    language: 'en',
    title: 'The Federalist No. 1 (opening) — Alexander Hamilton (1787)',
    source: 'The Federalist Papers, No. 1 — Project Gutenberg (public domain)',
    body: 'After an unequivocal experience of the inefficiency of the subsisting federal government, you are called upon to deliberate on a new Constitution for the United States of America. The subject speaks its own importance; comprehending in its consequences nothing less than the existence of the UNION, the safety and welfare of the parts of which it is composed, the fate of an empire in many respects the most interesting in the world.',
  },
];

type DictionaryEntry = {
  language: Language;
  complexity: Complexity;
  words: string[];
};

/**
 * Random-mode word pools (CONF-03): one list per (language, complexity) — 6
 * lists of 150 profanity-free words. The facile lists hold short, common
 * words; the difficile lists hold long, rare ones. Every list is >= 100
 * entries (the `word_dictionaries_words_min_length` CHECK enforces this).
 */
const DICTIONARIES: DictionaryEntry[] = [
  {
    language: 'fr',
    complexity: 'facile',
    words: [
      'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'mais', 'donc',
      'or', 'ni', 'car', 'si', 'que', 'qui', 'quoi', 'où', 'dont', 'ce',
      'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son',
      'sa', 'ses', 'notre', 'votre', 'leur', 'leurs', 'je', 'tu', 'il', 'elle',
      'on', 'nous', 'vous', 'ils', 'elles', 'être', 'avoir', 'faire', 'dire', 'aller',
      'voir', 'savoir', 'pouvoir', 'vouloir', 'venir', 'prendre', 'donner', 'parler', 'aimer', 'jouer',
      'manger', 'boire', 'dormir', 'lire', 'écrire', 'marcher', 'courir', 'sauter', 'chanter', 'danser',
      'maison', 'table', 'chaise', 'porte', 'fenêtre', 'mur', 'toit', 'rue', 'ville', 'eau',
      'feu', 'terre', 'ciel', 'mer', 'lac', 'rivière', 'montagne', 'forêt', 'arbre', 'fleur',
      'herbe', 'pierre', 'bois', 'main', 'pied', 'tête', 'yeux', 'bouche', 'nez', 'cœur',
      'ami', 'enfant', 'père', 'mère', 'frère', 'sœur', 'jour', 'nuit', 'matin', 'soir',
      'été', 'hiver', 'an', 'mois', 'semaine', 'heure', 'petit', 'grand', 'bon', 'beau',
      'jeune', 'vieux', 'rouge', 'bleu', 'vert', 'noir', 'blanc', 'trois', 'quatre', 'cinq',
      'six', 'sept', 'huit', 'neuf', 'dix', 'cent', 'mille', 'plus', 'moins', 'bien',
      'mal', 'vite', 'tôt', 'tard', 'ici', 'là', 'bas', 'haut', 'près', 'loin',
      'avec', 'sans', 'sous', 'sur', 'dans', 'pour', 'par', 'vers', 'chez', 'entre',
    ],
  },
  {
    language: 'fr',
    complexity: 'moyen',
    words: [
      'maison', 'jardin', 'fenêtre', 'cuisine', 'chambre', 'escalier', 'village', 'quartier', 'chemin', 'voyage',
      'bagage', 'valise', 'avion', 'bateau', 'train', 'voiture', 'bicyclette', 'conducteur', 'passager', 'billet',
      'gare', 'aéroport', 'destination', 'paysage', 'campagne', 'colline', 'vallée', 'ruisseau', 'cascade', 'océan',
      'plage', 'tempête', 'nuage', 'pluie', 'neige', 'orage', 'éclair', 'tonnerre', 'saison', 'printemps',
      'automne', 'calendrier', 'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'matinée',
      'soirée', 'journée', 'histoire', 'aventure', 'mystère', 'secret', 'trésor', 'carte', 'boussole', 'explorateur',
      'capitaine', 'équipage', 'navire', 'phare', 'port', 'ancre', 'cordage', 'voile', 'mât', 'pont',
      'cabine', 'horizon', 'aube', 'crépuscule', 'lumière', 'ombre', 'reflet', 'silence', 'bruit', 'chanson',
      'musique', 'instrument', 'piano', 'guitare', 'violon', 'orchestre', 'concert', 'théâtre', 'scène', 'acteur',
      'spectateur', 'tableau', 'peinture', 'couleur', 'dessin', 'crayon', 'papier', 'livre', 'roman', 'poème',
      'poète', 'écrivain', 'lecture', 'bibliothèque', 'école', 'classe', 'élève', 'professeur', 'leçon', 'exercice',
      'devoir', 'question', 'réponse', 'idée', 'pensée', 'souvenir', 'rêve', 'espoir', 'joie', 'tristesse',
      'colère', 'courage', 'patience', 'amitié', 'famille', 'parent', 'oncle', 'tante', 'cousin', 'cousine',
      'grand-père', 'grand-mère', 'anniversaire', 'cadeau', 'fête', 'balle', 'jouet', 'match', 'équipe', 'victoire',
      'défaite', 'effort', 'entraînement', 'promenade', 'boulangerie', 'marché', 'boutique', 'pharmacie', 'hôpital', 'bureau',
    ],
  },
  {
    language: 'fr',
    complexity: 'difficile',
    words: [
      'anticonstitutionnellement', 'labyrinthique', 'crépusculaire', 'magnanime', 'hiéroglyphe', 'phosphorescence', 'inextricable', 'incompréhensible', 'vraisemblablement', 'hypothétique',
      'métamorphose', 'sibyllin', 'quintessence', 'nébuleux', 'anachronique', 'abscons', 'hermétique', 'énigmatique', 'indéchiffrable', 'hiératique',
      'térébrant', 'ubiquité', 'circonlocution', 'tautologie', 'pléonasme', 'oxymore', 'synecdoque', 'métonymie', 'allégorie', 'parabole',
      'prosopopée', 'anaphore', 'catachrèse', 'euphémisme', 'litote', 'hyperbole', 'périphrase', 'antithèse', 'chiasme', 'paronomase',
      'assonance', 'dissonance', 'cacophonie', 'symphonie', 'philharmonie', 'ornithorynque', 'hippopotame', 'rhinocéros', 'caméléon', 'salamandre',
      'mandragore', 'ciguë', 'aubépine', 'eucalyptus', 'rhododendron', 'chrysanthème', 'pissenlit', 'coquelicot', 'marronnier', 'peuplier',
      'peupleraie', 'sylvestre', 'arborescent', 'frondaison', 'ramure', 'branchage', 'feuillage', 'canopée', 'sous-bois', 'clairière',
      'broussaille', 'friche', 'jachère', 'chaume', 'guéret', 'sillon', 'moisson', 'vendange', 'fenaison', 'arpentage',
      'géodésie', 'topographie', 'cartographie', 'orographie', 'hydrographie', 'météorologie', 'climatologie', 'astronomie', 'astrophysique', 'cosmologie',
      'constellation', 'nébuleuse', 'galaxie', 'planète', 'satellite', 'astéroïde', 'comète', 'éclipse', 'solstice', 'équinoxe',
      'zénith', 'nadir', 'azimut', 'méridien', 'latitude', 'longitude', 'équateur', 'tropique', 'hémisphère', 'atmosphère',
      'stratosphère', 'troposphère', 'ionosphère', 'magnétosphère', 'lithosphère', 'hydrosphère', 'biosphère', 'écosystème', 'biodiversité', 'symbiose',
      'photosynthèse', 'chlorophylle', 'mitochondrie', 'chromosome', 'génome', 'hérédité', 'mutation', 'évolution', 'adaptation', 'hibernation',
      'migration', 'prédateur', 'herbivore', 'carnivore', 'omnivore', 'insectivore', 'frugivore', 'granivore', 'piscivore', 'charognard',
      'mammifère', 'amphibie', 'reptile', 'crustacé', 'mollusque', 'céphalopode', 'gastéropode', 'bivalve', 'annélide', 'arthropode',
    ],
  },
  {
    language: 'en',
    complexity: 'facile',
    words: [
      'the', 'and', 'of', 'to', 'in', 'is', 'it', 'you', 'that', 'he',
      'was', 'for', 'on', 'are', 'as', 'with', 'his', 'they', 'at', 'be',
      'this', 'have', 'from', 'or', 'one', 'had', 'by', 'word', 'but', 'not',
      'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use',
      'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up',
      'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her',
      'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more',
      'write', 'go', 'see', 'number', 'no', 'way', 'could', 'people', 'my', 'than',
      'first', 'water', 'been', 'call', 'who', 'oil', 'its', 'now', 'find', 'long',
      'down', 'day', 'did', 'get', 'come', 'made', 'may', 'part', 'over', 'new',
      'sound', 'take', 'only', 'little', 'work', 'know', 'place', 'year', 'live', 'me',
      'back', 'give', 'most', 'very', 'after', 'thing', 'our', 'just', 'name', 'good',
      'sentence', 'man', 'think', 'say', 'great', 'where', 'help', 'through', 'much', 'before',
      'line', 'right', 'too', 'mean', 'old', 'any', 'same', 'tell', 'boy', 'follow',
      'came', 'want', 'show', 'also', 'around', 'form', 'three', 'small', 'set', 'put',
    ],
  },
  {
    language: 'en',
    complexity: 'moyen',
    words: [
      'mountain', 'journey', 'window', 'weather', 'morning', 'evening', 'garden', 'kitchen', 'bedroom', 'staircase',
      'village', 'quarter', 'highway', 'travel', 'baggage', 'suitcase', 'airport', 'airplane', 'sailboat', 'railway',
      'driver', 'passenger', 'ticket', 'station', 'destination', 'landscape', 'country', 'hillside', 'valley', 'riverbank',
      'waterfall', 'ocean', 'seashore', 'thunderstorm', 'rainbow', 'sunshine', 'snowflake', 'raindrop', 'season', 'springtime',
      'autumn', 'winter', 'summer', 'calendar', 'holiday', 'weekend', 'monday', 'tuesday', 'wednesday', 'thursday',
      'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'june', 'july', 'august',
      'september', 'october', 'november', 'december', 'afternoon', 'nightfall', 'daylight', 'moonlight', 'starlight', 'twilight',
      'sunrise', 'sunset', 'meadow', 'forest', 'woodland', 'stream', 'brook', 'pond', 'bridge', 'cottage',
      'castle', 'tower', 'knight', 'dragon', 'wizard', 'princess', 'kingdom', 'throne', 'crown', 'sword',
      'shield', 'helmet', 'armor', 'battle', 'victory', 'defeat', 'courage', 'wisdom', 'adventure', 'treasure',
      'secret', 'mystery', 'legend', 'story', 'chapter', 'author', 'writer', 'reader', 'library', 'bookshelf',
      'notebook', 'pencil', 'paper', 'letter', 'envelope', 'stamp', 'postcard', 'package', 'parcel', 'delivery',
      'message', 'telephone', 'radio', 'television', 'computer', 'keyboard', 'screen', 'program', 'machine', 'engine',
      'motor', 'battery', 'energy', 'power', 'electric', 'current', 'circuit', 'switch', 'button', 'lever',
      'wheel', 'gear', 'chain', 'pedal', 'handle', 'basket', 'blanket', 'pillow', 'mattress', 'curtain',
    ],
  },
  {
    language: 'en',
    complexity: 'difficile',
    words: [
      'quintessential', 'juxtaposition', 'sesquipedalian', 'onomatopoeia', 'ephemeral', 'ubiquitous', 'sycophant', 'obfuscate', 'mellifluous', 'serendipity',
      'discombobulate', 'flabbergasted', 'lollygag', 'bamboozle', 'kerfuffle', 'hullabaloo', 'brouhaha', 'shenanigans', 'tomfoolery', 'malarkey',
      'gobbledygook', 'gibberish', 'balderdash', 'flummox', 'befuddle', 'persnickety', 'cantankerous', 'curmudgeon', 'misanthrope', 'philanthropist',
      'magnanimous', 'munificent', 'benevolent', 'malevolent', 'magniloquent', 'grandiloquent', 'loquacious', 'garrulous', 'taciturn', 'laconic',
      'reticent', 'verbosity', 'prolixity', 'circumlocution', 'euphemism', 'dysphemism', 'neologism', 'archaism', 'solecism', 'malapropism',
      'spoonerism', 'anachronism', 'atavism', 'paradigm', 'syzygy', 'zephyr', 'quixotic', 'xenophobia', 'whimsical', 'verisimilitude',
      'transcendental', 'tempestuous', 'surreptitious', 'superfluous', 'subterranean', 'stoichiometry', 'steganography', 'speleology', 'somnambulist', 'soliloquy',
      'sequestration', 'scrupulous', 'sagacious', 'rumbustious', 'rodomontade', 'rhododendron', 'recalcitrant', 'quagmire', 'pusillanimous', 'pulchritude',
      'procrastinate', 'prescient', 'precocious', 'posthumous', 'portentous', 'polyglot', 'perspicacious', 'pernicious', 'perfidious', 'peregrination',
      'penultimate', 'pedantic', 'pecuniary', 'oxymoron', 'oscillate', 'ostentatious', 'obsequious', 'obdurate', 'notorious', 'nomenclature',
      'nonchalant', 'nebulous', 'meticulous', 'meretricious', 'mendacious', 'melancholy', 'maudlin', 'litigious', 'lethargic', 'labyrinthine',
      'lacrimose', 'juxtapose', 'intransigent', 'interminable', 'insidious', 'innocuous', 'inimitable', 'indefatigable', 'incongruous', 'inconsequential',
      'ineffable', 'indubitable', 'indolent', 'incredulous', 'incorrigible', 'inconspicuous', 'inchoate', 'incandescent', 'imperious', 'impeccable',
      'immutable', 'illustrious', 'idiosyncratic', 'ignominious', 'iconoclast', 'hypocritical', 'hyperbole', 'histrionic', 'heterogeneous', 'hedonistic',
      'harangue', 'halcyon', 'gregarious', 'gratuitous', 'antidisestablishmentarianism', 'floccinaucinihilipilification', 'pneumonoultramicroscopicsilicovolcanoconiosis', 'perambulate', 'tantamount', 'vicissitude',
    ],
  },
];

/** Demo accounts (TECH-04). Password is shared by the three demo users. */
const DEMO_PASSWORD = 'demo-password-123';

type DemoUser = {
  username: string;
  stats: {
    racesCompleted: number;
    totalWords: number;
    totalTimeMs: number;
    bestWpm: string;
    wins: number;
    correctKeystrokes: number;
    totalKeystrokes: number;
  };
};

/**
 * Realistic-looking typing history for the demo profiles. Keystroke counters
 * exceed `totalWords * 5` (words include a trailing space) and yield a
 * plausible accuracy; `avgWpm` stays derivable as
 * `totalWords / (totalTimeMs / 60000)`.
 */
const DEMO_USERS: DemoUser[] = [
  {
    username: 'demo',
    stats: {
      racesCompleted: 48,
      totalWords: 18_540,
      totalTimeMs: 29_100_000,
      bestWpm: '87.40',
      wins: 23,
      correctKeystrokes: 108_500,
      totalKeystrokes: 115_200,
    },
  },
  {
    username: 'demo2',
    stats: {
      racesCompleted: 127,
      totalWords: 61_230,
      totalTimeMs: 75_000_000,
      bestWpm: '102.15',
      wins: 61,
      correctKeystrokes: 372_000,
      totalKeystrokes: 399_500,
    },
  },
  {
    username: 'demo3',
    stats: {
      racesCompleted: 12,
      totalWords: 2_340,
      totalTimeMs: 4_800_000,
      bestWpm: '44.80',
      wins: 2,
      correctKeystrokes: 13_800,
      totalKeystrokes: 17_900,
    },
  },
];

/**
 * Asserts a word list is sane before inserting it: at least 100 entries and no
 * duplicates. The database CHECK also enforces the 100-entry minimum, but a
 * friendly message beats a constraint error.
 */
function assertValidDictionary(entry: DictionaryEntry): void {
  if (entry.words.length < 100) {
    throw new Error(
      `Dictionary ${entry.language}/${entry.complexity} has ${entry.words.length} words (minimum 100)`,
    );
  }
  if (new Set(entry.words).size !== entry.words.length) {
    throw new Error(`Dictionary ${entry.language}/${entry.complexity} contains duplicates`);
  }
}

async function main(): Promise<void> {
  const { db } = await import('./index');
  const { texts, wordDictionaries, userStats, users } = await import('./schema');
  const { hashPassword } = await import('../lib/password');
  const { createUserWithProfiles } = await import('./queries/users');
  const { classifyComplexity, computeTextMetrics } = await import('../lib/text-metrics');

  // ---------------------------------------------------------------- corpus
  const existingText = await db.select({ id: texts.id }).from(texts).limit(1);
  if (existingText.length > 0) {
    console.log(
      `→ texts: table already contains rows (${existingText.length}+ found) — corpus skipped.`,
    );
  } else {
    for (const entry of CORPUS) {
      const metrics = computeTextMetrics(entry.body);
      const complexity = classifyComplexity(metrics);

      await db.insert(texts).values({
        language: entry.language,
        title: entry.title,
        body: entry.body,
        wordCount: metrics.wordCount,
        complexity,
        avgWordLength: metrics.avgWordLength.toFixed(2),
        longWordRatio: metrics.longWordRatio.toFixed(4),
        specialCharRatio: metrics.specialCharRatio.toFixed(4),
        hasPunctuation: metrics.hasPunctuation,
        hasNumbers: metrics.hasNumbers,
        hasCapitals: metrics.hasCapitals,
        hasAccents: metrics.hasAccents,
      });

      console.log(
        `+ text [${entry.language}/${complexity}] ${metrics.wordCount} words — ${entry.title} (${entry.source})`,
      );
    }
  }

  // ---------------------------------------------------------- dictionaries
  for (const entry of DICTIONARIES) {
    assertValidDictionary(entry);

    const existing = await db
      .select({ id: wordDictionaries.id })
      .from(wordDictionaries)
      .where(
        and(
          eq(wordDictionaries.language, entry.language),
          eq(wordDictionaries.complexity, entry.complexity),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(
        `→ dictionary ${entry.language}/${entry.complexity}: already present (${entry.words.length} words) — skipped.`,
      );
      continue;
    }

    await db.insert(wordDictionaries).values({
      language: entry.language,
      complexity: entry.complexity,
      words: entry.words,
    });

    const metrics = computeTextMetrics(entry.words.join(' '));
    console.log(
      `+ dictionary ${entry.language}/${entry.complexity}: ${entry.words.length} words (avg length ${metrics.avgWordLength}).`,
    );
  }

  // ------------------------------------------------------------ demo users
  for (const demo of DEMO_USERS) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, demo.username))
      .limit(1);

    if (existing.length > 0) {
      console.log(`→ user ${demo.username}: already present — skipped.`);
      continue;
    }

    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const created = await createUserWithProfiles({
      username: demo.username,
      passwordHash,
    });

    await db
      .update(userStats)
      .set({
        racesCompleted: demo.stats.racesCompleted,
        totalWords: BigInt(demo.stats.totalWords),
        totalTimeMs: BigInt(demo.stats.totalTimeMs),
        bestWpm: demo.stats.bestWpm,
        wins: demo.stats.wins,
        correctKeystrokes: BigInt(demo.stats.correctKeystrokes),
        totalKeystrokes: BigInt(demo.stats.totalKeystrokes),
        updatedAt: new Date(),
      })
      .where(eq(userStats.userId, created.id));

    console.log(
      `+ user ${demo.username}: created with ${demo.stats.racesCompleted} races, best ${demo.stats.bestWpm} wpm.`,
    );
  }

  console.log('\n✅ Seed completed (running it again will not duplicate rows).');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
