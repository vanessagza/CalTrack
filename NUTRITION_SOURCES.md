# Extra nutrient tracking and sources

Research date: 16 October 2026. The tracker uses adult planning references.
The insulin-resistance preference adds general guidance; personal treatment
targets can differ.

## Daily reference values

| Measurement | Calculation | How to interpret it |
| --- | --- | --- |
| Fiber | `daily calorie budget × 14 / 1000` g | A minimum to aim for. |
| Saturated fat | `daily calorie budget × 0.10 / 9` g | A ceiling, not an amount to eat up to. |
| Added sugar | `daily calorie budget × 0.10 / 4` g | A retained **FDA labeling reference** for compatibility; added sugar has no dashboard bar. It is not the current DGA recommendation or an amount to aim for. |
| Sodium | 2,300 mg | An adult ceiling; it is not multiplied by body weight. |
| Total sugar | No daily target | The dashboard bar shows its share of the carbohydrate budget, not a recommended sugar limit. Includes naturally occurring fruit and milk sugars. Added sugar is part of total sugar. |

The calorie budget already uses the user's current weight, height, formula sex,
age, activity and selected deficit in calculated mode (Mifflin–St Jeor). The
energy-based references therefore follow those settings automatically. In manual
calorie mode they follow the chosen budget. There is no supported universal
separate weight-, height-, or sex-based multiplier for these extra nutrients.
Sodium stays fixed when the calorie budget changes.

The insulin-resistance setting does not invent different nutrient percentages.
The ADA's 2026 guidance still recommends at least 14 g fiber per 1,000 kcal and
general-population saturated-fat guidance, and emphasizes individualized eating
patterns. The checkbox surfaces relevant guidance about fiber, minimally
processed carbohydrate sources, and minimizing added sugar. The values are daily
references; a checkbox cannot determine a personal treatment plan.

### Guidance citations

- **ADA Standards of Care in Diabetes—2026, section 5**, DOI
  [10.2337/dc26-S005](https://doi.org/10.2337/dc26-S005).
  Recommendation 5.24 specifies at least 14 g fiber per 1,000 kcal for people
  with diabetes and those at risk. Recommendation 5.20 addresses sodium below
  2,300 mg/day as clinically appropriate. The nutrition discussion says there is
  no ideal universal proportion of calories from carbohydrate, protein and fat,
  and applies general-population saturated-fat guidance. Research read the
  [public plaintext mirror](https://github.com/zinojeng/linechatbot_ADA2026/blob/51117a35518505bf11de5a03f1463cdd18f7ad73/documents/dc26s005.md).
- **Dietary Guidelines for Americans, 2025–2030**,
  [official PDF](https://cdn.realfood.gov/DGA.pdf),
  [public plaintext mirror read for this change](https://github.com/acara-app/plate/blob/0dfc2f6c9ce4f72ad83cbb0822ec48bc6ab23e93/resources/markdown/dietary-guidelines-usda.md).
  Saturated fat should not exceed 10% of daily calories, and sodium for ages 14
  and above should be below 2,300 mg/day. The current edition says no amount of
  added sugar is recommended and no meal should contain over 10 g. Its current
  added-sugar advice must not be described as a 10%-of-calories recommendation.
- **FDA: How to Understand and Use the Nutrition Facts Label**,
  [official source](https://www.fda.gov/food/nutrition-facts-label/how-understand-and-use-nutrition-facts-label),
  [public scrape mirror read for this change](https://github.com/bagiicpp/Risbo/blob/1aec3f3ce73d1219d343c59d0c3880ec91a86877/ai-backend/wiki/chunks/sports_nutrition_chunks_md/food_and_nutrition_labels.md).
  FDA's labeling Daily Value for added sugar is 50 g for a 2,000-kcal diet;
  the stored reference scales to the selected daily energy budget, but is not shown as a dashboard bar. FDA
  explicitly says no Daily Reference Value has been established for total sugar.
  FDA's saturated-fat label DV (20 g at 2,000 kcal) is a different reference from
  the 10%-energy saturated-fat guidance used here.

The execution environment permits GitHub but not the authoritative nutrition
sites, so the primary pages/PDFs were not directly retrieved during this change.
The exact public mirrors read are linked above; they may lag or contain
transcription errors. Primary citations are retained for independent review.

## Starter-food estimates

Extra nutrients are per **100 g** in `food-nutrients.js`; sodium is in **mg** and
all other additions are in **g**. A serving, gram amount, teaspoon or mL amount
uses the same gram conversion as calories and macros. A value of `null` means
unknown and must not be silently treated as a measured zero. A zero on a label is
also a rounded label value, not proof that the food contains literally none.

The table is automatically applied only to unmodified starter identities with
matching original macros. It does not guess nutrition from a custom food's name,
overwrite existing extra-nutrient values, or update a custom food merely because
it shares a starter ID. Existing logged snapshots of matching starter foods can
receive missing values; custom snapshots remain unknown. Changing portion weight
does not change the per-100-g source values.

Most estimates come from **USDA National Nutrient Database for Standard Reference,
release 28 (SR28, 2015)**, retrieved from the
[public ASCII data mirror](https://github.com/maxsu/USDA-SR28/tree/e9cf1bca802131e6a16f0e3cd35b6361b9026b69).
`FOOD_DES.txt` identifies food records and `NUT_DATA.txt` supplies nutrients:
291 = dietary fiber, 606 = saturated fatty acids, 269 = total sugars,
307 = sodium. This is older reference data, not a live product-label lookup.
These additions do not revise the existing starter calories or macros.

For plain unprocessed foods, `addedSugar: 0` is a stated no-added-ingredients
assumption. SR28 does not report added sugar. Bread, sweets, ramen, sauces, cream
cheese and crackers retain unknown added sugar rather than substituting total
sugar. Fiber remains part of existing total carbohydrate; the tracker does not
subtract it or add extra calories from it a second time.

| Starter food | USDA NDB record or other source | Important limitation |
| --- | --- | --- |
| Sourdough | 18029, French/Vienna bread including sourdough | Generic comparison; bread recipes and salt vary. |
| White bread toast | 18069, commercially prepared white bread | Matches starter bread weight before extra toasting water loss. |
| Beef, cooked | 23600, lean tenderloin, broiled | Assumes unseasoned, with no added fat. |
| Beef, raw | 23601, lean tenderloin, raw | Assumes unseasoned, with no added fat. |
| Egg | 01123, whole fresh raw egg | Cooking ingredients are separate. |
| Olive oil | 04053 | Generic olive oil. |
| Mini sun-dried tomato | 11956, oil-packed, drained tomatoes | Packing is unspecified in the starter; dry/salted tomatoes can differ greatly. Sugar remains unknown. |
| Kinder Chocolate, 12.5 g and 21 g | Archived UK label below | Exact matching macros, but only an estimated match for regional products and the 21 g size. Fiber and added sugar unknown. |
| Kinder Tronky | 18209, cream-filled sugar wafer | Food-class comparison, **not the Tronky label**. |
| Jin Mild | 06583, dry instant ramen | Food-class comparison, **not the Jin label**. Includes seasoning/broth consumption; sodium can vary substantially. |
| Tuna in water | 15121, light tuna, canned in water, drained | Brand and salt differ; newer reference macros need not match the older starter macros. |
| Salmon, raw | 15236, farmed Atlantic salmon | Species and preparation differ. |
| Salmon, cooked | 15237, farmed Atlantic salmon, dry heat | No added ingredients. |
| Chicken breast, cooked | 05064, breast meat, roasted | Assumes no added salt or brine. |
| Greek yogurt, 0% | 01256, plain nonfat Greek yogurt | Assumes unsweetened. |
| Cream cheese | 01017 | Added sugar unknown. |
| Feta | 01019 | Reference sugar 4.09 g is 0.19 g above the starter's rounded carbohydrate estimate of 3.9 g; retained as a source estimate within rounding tolerance. |
| Pasta, cooked | 20121, cooked enriched pasta | Without added salt or sauce. |
| Pasta bolognese | 36630, restaurant spaghetti with meat sauce | Recipe comparison; sauce, meat, salt and portion composition vary. |
| White rice, cooked | 20045, long-grain cooked white rice | Without added salt. |
| Oats, dry | 08120, plain regular/quick oats | Assumes no flavorings or sugar. |
| Kiwi | 09148, green kiwifruit, raw | Edible portion. |
| Dragon fruit | Public Open Food Facts-derived Pitaya Foods record below | Plain frozen-fruit comparison for fresh fruit; rounded label estimates. |
| Banana | 09040, banana, raw | Edible portion without peel. |
| Chia | 12006, dried chia seeds | Total sugar was not reported and remains unknown. |
| Garlic crackers | 28140, garlic-herb pretzel crackers | Food-class comparison; **not a label for the user's brand**, especially for sodium. |

### Non-USDA source details

- **Kinder Chocolate**: [archived Sainsbury's UK 16 × 12.5 g label](https://github.com/nacnudus/food/blob/29c151ed414fbd67e3217671672061647553f6e0/items/groceries%7Ckinder-chocolate-x16-200g.html).
  The archived page is dated March 2017 and gives, per 100 g: 566 kcal, fat 35 g,
  saturated fat 22.6 g, carbohydrate 53.5 g, total sugar 53.3 g, protein 8.7 g,
  salt 0.31 g. Its macros match the starter's official-label macros. Sodium is
  calculated using `salt g × 1000 / 2.5 = 124 mg`. The 12.5-g per-bar salt cell
  appears inconsistent; this change uses only the per-100-g salt declaration.
  Regional or changed recipes can differ. Fiber and added sugar are not declared.
- **Dragon fruit**: [public Open Food Facts-derived Pitaya Foods record](https://github.com/minnminncherry/scan2food/blob/51ac70802a5fba45bb4127cb59194784d9868528/model/food_images/dragon_fruit/labels/Dragon%20Fruit.json).
  The comparison record has about 60.7 kcal/100 g, dietary fiber 3.57 g, sugar
  11.4 g, added sugar 0 g, saturated fat 0 g, and sodium 0.000714 g, converted
  to **0.714 mg**. It is a secondary record, not independently verified packaging.
  Open Food Facts database attribution: [Open Food Facts](https://world.openfoodfacts.org),
  [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).

The existing macro `verified` flag belongs to the existing calorie/macro label.
It must not be interpreted as verification of these extra-nutrient estimates.
Their separate `nutrientNote` and `nutrientSource` retain this distinction.
