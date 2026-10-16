// Extra nutrients per 100 g. These are estimates for the named starter foods;
// they do not turn a generic starter or a food-class comparison into a verified label.
// null means unknown, not zero. Sodium is in mg; the other values are in g.
// Source records and matching/unknown decisions: NUTRITION_SOURCES.md.
const USDA_SOURCE = 'https://github.com/maxsu/USDA-SR28/blob/e9cf1bca802131e6a16f0e3cd35b6361b9026b69/NUT_DATA.txt';

function estimate(ndb, description, fiber, saturatedFat, sugar, addedSugar, sodium, detail = '') {
  return { fiber, saturatedFat, sugar, addedSugar, sodium,
    nutrientSource: USDA_SOURCE,
    nutrientNote: `Estimated extra nutrients from USDA SR28, NDB ${ndb}: ${description}. ${detail}`.trim() };
}

const kinder = {
  fiber: null, saturatedFat: 22.6, sugar: 53.3, addedSugar: null, sodium: 124,
  nutrientSource: 'https://github.com/nacnudus/food/blob/29c151ed414fbd67e3217671672061647553f6e0/items/groceries%7Ckinder-chocolate-x16-200g.html',
  nutrientNote: 'Extra nutrients from an archived UK 12.5 g Kinder Chocolate label matching the starter macros. Salt 0.31 g/100 g converts to sodium 124 mg/100 g. Used as an estimate for both bar sizes; regional labels can differ. Fiber and added sugar were not declared and remain unknown.',
};

export const FOOD_NUTRIENTS = {
  'sourdough': estimate('18029', 'French/Vienna bread including sourdough', 2.2, 0.529, 4.62, null, 602,
    'Generic bread comparison; recipe and salt vary. Added sugar is unknown.'),
  'white-bread': estimate('18069', 'commercially prepared white bread', 2.7, 0.698, 5.67, null, 490,
    'Uses bread as weighed in the starter entry, before extra toasting water loss. Added sugar is unknown.'),
  'beef-cooked': estimate('23600', 'lean tenderloin, cooked/broiled', 0, 3.195, 0, 0, 60,
    'Unseasoned meat; added salt, oil and sauces are separate.'),
  'beef-raw': estimate('23601', 'lean tenderloin, raw', 0, 2.412, 0, 0, 56,
    'Unseasoned meat; added salt, oil and sauces are separate.'),
  'egg': estimate('01123', 'whole raw fresh egg', 0, 3.126, 0.37, 0, 142,
    'Plain egg; added ingredients are separate.'),
  'olive-oil': estimate('04053', 'olive oil, salad or cooking', 0, 13.808, 0, 0, 2),
  'sun-tomato': estimate('11956', 'sun-dried tomatoes, oil-packed and drained', 5.8, 1.893, null, null, 266,
    'Food-class comparison because the starter does not specify packing. Dry/salted tomatoes can differ greatly. Total and added sugar are unknown.'),
  'kinder-small': { ...kinder },
  'kinder-medium': { ...kinder },
  'tronky': estimate('18209', 'cream-filled sugar wafer', 1.6, 11.899, 42.95, null, 103,
    'Food-class comparison only, not the Kinder Tronky label. Added sugar is unknown. Replace with regional packaging when available.'),
  'jin-mild': estimate('06583', 'dry instant ramen, any flavor', 2.9, 8.117, 1.98, null, 1855,
    'Food-class comparison only, not the Jin Mild label. Includes seasoning and assumes the whole packet/broth is consumed. Added sugar is unknown.'),
  'tuna': estimate('15121', 'light tuna in water, drained', 0, 0.211, 0, 0, 247,
    'Generic salted canned tuna; brand and draining affect sodium.'),
  'salmon-raw': estimate('15236', 'farmed Atlantic salmon, raw', 0, 3.05, 0, 0, 59),
  'salmon-cooked': estimate('15237', 'farmed Atlantic salmon, cooked with dry heat', 0, 2.397, 0, 0, 61),
  'chicken': estimate('05064', 'skinless breast meat, roasted', 0, 1.01, 0, 0, 74,
    'Plain unseasoned chicken; brined/processed products can contain much more sodium.'),
  'greek-yogurt': estimate('01256', 'plain nonfat Greek yogurt', 0, 0.117, 3.24, 0, 36,
    'Assumes plain unsweetened yogurt; total sugar includes naturally occurring milk sugar.'),
  'cream-cheese': estimate('01017', 'plain cream cheese', 0, 20.213, 3.76, null, 314,
    'Added sugar is not established by the source and remains unknown.'),
  'feta': estimate('01019', 'feta cheese', 0, 14.946, 4.09, 0, 917,
    'Generic unsweetened feta; total sugar is rounded slightly above the starter carbohydrate estimate.'),
  'pasta': estimate('20121', 'enriched cooked pasta, without added salt', 1.8, 0.176, 0.56, 0, 1),
  'bolognese': estimate('36630', 'restaurant spaghetti with meat sauce', 1.6, 1.062, 1.82, null, 230,
    'Food-class comparison; the starter is a rough recipe and sauce/salt vary. Added sugar is unknown.'),
  'rice': estimate('20045', 'long-grain white rice, cooked', 0.4, 0.077, 0.05, 0, 1,
    'Assumes plain rice without added salt.'),
  'oats': estimate('08120', 'regular/quick oats, dry, unfortified', 10.1, 1.11, 0.99, 0, 6,
    'Assumes plain oats without sugar or flavorings.'),
  'kiwi': estimate('09148', 'green kiwifruit, raw', 3, 0.029, 8.99, 0, 3),
  'dragon-fruit': { fiber: 3.57, saturatedFat: 0, sugar: 11.4, addedSugar: 0, sodium: 0.714,
    nutrientSource: 'https://github.com/minnminncherry/scan2food/blob/51ac70802a5fba45bb4127cb59194784d9868528/model/food_images/dragon_fruit/labels/Dragon%20Fruit.json',
    nutrientNote: 'Food-class estimate from a public Open Food Facts-derived Pitaya Foods dragon fruit record (plain frozen fruit), not a verified label for fresh fruit. Rounded label values, including zero saturated fat, are estimates. Open Food Facts data: ODbL.' },
  'banana': estimate('09040', 'banana, raw', 2.6, 0.112, 12.23, 0, 1),
  'chia': estimate('12006', 'dried chia seeds', 34.4, 3.33, null, 0, 16,
    'Assumes plain seeds. The source does not declare total sugar; it remains unknown.'),
  'garlic-cracker': estimate('28140', 'garlic-herb pretzel crackers', 2.2, 4.1, 6.6, null, 1517,
    'Food-class comparison only, not a label for the user’s crackers. Brands vary greatly, especially sodium. Added sugar is unknown.'),
};
