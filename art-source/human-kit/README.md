# Arcade Games: kit pro ChatGPT (oblečení, boty, účesy a klobouky pro postavy)

Stejný postup jako kosmetický kit ve Versu, jen pro člověka místo opice a kočky. Postavy ve hře jsou teď na původním
Verso rigu (stejné proporce, ramena, rukávy, ruce, animace) a tenhle kit jim dodá oblečení, boty, účesy a klobouky
přesně ve formátu, který Verso importoval: každá věc sama ve 4 pohledech na zelené, u oblečení navíc vzorek rukávu,
a ke každé dávce kontrola na postavě.

## Co je uvnitř

| Složka / soubor | Co to je |
|---|---|
| `prompts/INDEX.md` | přehled všech 9 dávek: co obsahují, co přiložit, kam uložit |
| `prompts/<dávka>.md` | jedna dávka = jeden chat: přílohy, první věta, prompt na list, prompt na kontrolu |
| `references/people/` | postava z naší hry ve 4 pohledech (bez oblečení), jen trup, jen hlava, jen nohy |
| `references/current/` | jak to vypadá teď: tričko, 8 účesů, čtyři hráči |
| `references/palette.png`, `palette.md` | barvy hry |
| `references/STYLE.md` | pravidla stylu (když ChatGPT ujíždí, vlož mu tenhle soubor) |
| `output/` | sem ukládej výsledky |

## Postup v každém chatu

1. **Nový chat na každou dávku** (styl pak neujíždí).
2. **První zpráva:** přilož 4 obrázky vypsané v dávce a napiš větu z dávky („These are the official characters…“).
3. **Druhá zpráva:** vlož prompt „1. The item sheet“ celý, nic neupravuj.
4. **Zkontroluj list:** správný počet řádků, 4 pohledy v pořadí (zepředu, 3/4 doprava, z boku doprava, zezadu), u
   oblečení 5. sloupec se vzorkem rukávu, všude čistá zelená `#00FF00` a žádná zelená v kresbě, žádný text, nic se
   nedotýká. Když něco nesedí, pošli „retry“ větu z dávky.
5. **Ulož** list jako PNG v plné velikosti (stáhnout, ne screenshot) do `output/<dávka>.png`.
6. **Kontrola na postavě:** přilož `references/people/bare-human.png`, vlož prompt „2. Fit check“ a ulož jako
   `output/<dávka>-fit.png`.

## Pořadí

1. `outfits-1-tops`: proužkované tričko, polo, dres, havajská košile, tričko s lemem
2. `outfits-2-casual`: mikina, džínová bunda, svetr, flanelová košile, sportovní bunda
3. `outfits-3-jackets`: bomber, křivák, péřovka, pláštěnka, sako
4. `outfits-4-full-body`: lacláče, montérky, pyžamo, tepláková souprava, westernový outfit
5. `shoes-1-everyday`: tenisky, kotníkové tenisky, mokasíny, chelsea boty, běžecké boty
6. `shoes-2-sport`: kopačky, kovbojky, holínky, bačkory, skate boty
7. `hair-1`: krátké, crop, ježek, bodliny
8. `hair-2`: kudrny, dlouhé, drdol, culík
9. `hats-1`: kšiltovka, kulich, bucket hat, kovbojský klobouk, čelenka

Dvě verze, mezi kterými nevíš? Ulož druhou jako `<dávka>-b.png`, vyberu já. Jedna řada se nepovedla? Nech si ji
přegenerovat samotnou a ulož jako `<dávka>-row<n>.png`.

## Až bude hotovo

Pošli mi složku `output/` (nebo celý kit zabalený). Naimportuju to stejnými nástroji jako ve Versu: vyřežu, převedu
oblečení na vektorové textury, boty a klobouky na obrázky s ukotvením, účesy na vektory v barvě vlasů hráče, napojím
to do rigu a výběru postavy, zkontroluju všechny hry a přegeneruju obaly, screenshoty i GIF.
