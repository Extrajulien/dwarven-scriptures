le titre a ete choisi "Dwarven scriptures" car avec google translate c'est "ecritures naine" en francais
ce qui est un peut funny et aussi reste dans l'univers des nains de dwarf fortress

pour l'icone de l'application j'ai modifier dans paint une frame de l'animation ascii du jeu original
en ajoutant une bulle de penser et un gars qui ecrit du feu dedans car le nain pense a l'ecriture 
et aussi car je trouve ca un peu farfelu.

## Palette

Direction « Dwarf Fortress » : pierre, grotte, torches, or des filons et lave. La
palette suit la nomenclature des surfaces du thème sombre existant
(background / surface / surface-container-* / on-surface, etc.) plus un groupe
« dwarf.* » pour la pierre du terminal de connexion. Toutes les couleurs sont
des jetons Tailwind définis par des variables CSS (`rgb(var(--…) / <alpha>)`)
dans `src/app/globals.css` ; les triplets RVB ont une source unique de vérité
dans `src/theme/palette.ts` (test anti-dérive : `src/theme/palette.test.ts`).

### Thème sombre (existant)

| Jeton | Valeur | Rôle |
| ----- | ------ | ---- |
| `background` / `surface` | `#131313` | fond principal, pierre de basalte éteinte |
| `surface-container-lowest` | `#0e0e0e` | barre de navigation, profondeur maximale |
| `surface-container` … `highest` | `#201f1f` → `#353534` | cartes empilées |
| `on-surface` | `#e5e2e1` | texte principal, parchemin clair |
| `on-surface-variant` | `#d1c5af` | texte secondaire |
| `primary` | `#eec14b` | or des filons — titres, boutons |
| `on-primary` | `#3e2e00` | texte sur l'or |
| `primary-container` | `#c59b27` | or moyen |
| `secondary` | `#ffb77b` | braise / forge |
| `tertiary` | `#a4d393` | mousse / rune verte |
| `error` | `#ffb4ab` | lave claire pour les erreurs |
| `outline` | `#9a907c` | contours de pierre |
| `dwarf.gold` … `dwarf.magma` | `#c59b27` … `#d34e24` | terminal : or, runes, magma |

### Palette — thème clair

Le thème clair garde la direction « forteresse naine » mais la transpose en
**pierre calcaire au grand jour** : surfaces de pierre claires et chaudes,
texte charbon foncé, le même or que le thème sombre mais assombri pour rester
lisible sur fond clair (contraste WCAG AA vérifié par
`src/theme/contrast.test.ts`), et magma/runes réajustés pour les fonds clairs.

| Jeton | Sombre | Clair | Note |
| ----- | ------ | ----- | ---- |
| `background` / `surface` | `#131313` | `#e9e2d2` | calcaire chaud |
| `surface-container-lowest` | `#0e0e0e` | `#f8f4ea` | pierre la plus claire |
| `surface-container` | `#201f1f` | `#ece7db` | cartes |
| `surface-container-high` | `#2a2a2a` | `#e6e0d2` | cartes élevées |
| `on-surface` / `on-background` | `#e5e2e1` | `#241f16` | charbon de pierre |
| `on-surface-variant` | `#d1c5af` | `#574e3f` | texte secondaire |
| `primary` | `#eec14b` | `#6f5100` | or sombre lisible (≥ 4,5:1) |
| `on-primary` | `#3e2e00` | `#fff8e7` | crème sur l'or sombre |
| `primary-container` | `#c59b27` | `#f2d98a` | or clair en fond |
| `on-primary-container` | `#473500` | `#3d2c00` | encre sur l'or clair |
| `inverse-primary` | `#775a00` | `#eec14b` | inverse du rôle primaire |
| `secondary` | `#ffb77b` | `#8c4a00` | braise foncée lisible |
| `tertiary` | `#a4d393` | `#3d6632` | mousse sombre lisible |
| `error` | `#ffb4ab` | `#ba1a1a` | rouge magma foncé |
| `outline` | `#9a907c` | `#796f5a` | contours de pierre |
| `dwarf.gold` | `#c59b27` | `#6f5100` | or du terminal sur fond clair |
| `dwarf.goldLight` / `goldHover` | `#e5a93c` / `#f5be54` | `#856300` / `#7a5b00` | survols, jauge |
| `dwarf.parchment` | `#d4c5a9` | `#3a3328` | texte du terminal |
| `dwarf.parchmentMuted` | `#968870` | `#675f51` | texte secondaire |
| `dwarf.bg` / `slate` / `basalt` | `#141312` / `#1c1a17` / `#25221d` | `#e9e2d2` / `#e2dac8` / `#ddd4c0` | pierres claires |
| `dwarf.runeBright` | `#629e52` | `#38602b` | rune verte lisible |
| `dwarf.magma` | `#d34e24` | `#a53a10` | magma sur fond clair |

Choix documentés :

- **`primary` clair = `#6f5100`** : c'est la même famille d'or que `#c59b27`,
  assombrie pour dépasser 4,5:1 sur le calcaire `#e9e2d2` (l'or `#c59b27`
  lui-même ne donne que ~2,0:1 sur fond clair). Les remplissages d'or
  (`primary-container`, `dwarf.goldLight`) restent dans la famille et
  reçoivent une encre foncée (`on-primary-container`).
- **`dwarf.abyss` clair = `#fff8e7`** : le jeton sert de *texte sur
  remplissage d'or* (puce active de l'explorateur, sélection) ; en clair il
  devient crème pour rester lisible sur l'or sombre.
- **Jetons fixes identiques dans les deux thèmes** : `primary-fixed*`,
  `secondary-fixed*`, `tertiary-fixed*`, `dwarf.runeGreen`,
  `dwarf.goldInk`, `chisel-gold-border/base` et le scanline — ce sont des
  constantes de la marque (or de forge, encre de runes) ou des artefacts
  indépendants du thème.
- Les classes bespoke (`stone-panel`, `btn-chisel-*`, `retro-scanlines`,
  `dwarf-checkbox`, `cave-ambient`) utilisent les mêmes variables ; leurs
  ombres (scrims noir/blanc) restent hors palette, seulement ajustées en
  alpha pour le clair.
- Les jetons `dwarf.cave`, `dwarf.terminal`, `dwarf.inputBg`, `dwarf.divider*`,
  `dwarf.showcase*`, `dwarf.danger`, `dwarf.parchmentIcon`… reprennent
  exactement les valeurs hexadécimales qui étaient codées en dur dans les
  écrans d'authentification (aucun changement de rendu en sombre).
