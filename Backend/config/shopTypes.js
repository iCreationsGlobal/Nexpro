/**
 * Shop Type Configuration
 *
 * Defines default **material** (inventory) categories for the Materials page only.
 * Used during onboarding to seed inventory_categories. Product categories (Products page)
 * are defined in productCategories.js and may differ per shop type (e.g. restaurant products = menu).
 */

const SHOP_TYPES = {
  supermarket: {
    name: 'Supermarket/Grocery Store',
    // Material categories (Materials page): supplies used to run the store, not products sold
    defaultCategories: [
      { name: 'Packaging & Bags', description: 'Shopping bags, boxes, wraps, and packaging supplies' },
      { name: 'Cleaning Supplies', description: 'Cleaning chemicals, mops, and store hygiene' },
      { name: 'Labels & Tags', description: 'Price labels, shelf tags, and signage supplies' },
      { name: 'Equipment & Maintenance', description: 'Cooler parts, scales, and equipment maintenance' },
      { name: 'Office Supplies', description: 'Register rolls, stationery, and office consumables' },
      { name: 'Safety & Compliance', description: 'Safety gear and compliance supplies' },
      { name: 'Miscellaneous Supplies', description: 'Other materials used to operate the store' }
    ]
  },
  hardware_store: {
    name: 'Hardware Store',
    defaultCategories: [
      { name: 'Tools', description: 'Hand tools, power tools, and equipment' },
      { name: 'Building Materials', description: 'Lumber, cement, and construction materials' },
      { name: 'Electrical Supplies', description: 'Wires, switches, and electrical components' },
      { name: 'Plumbing Supplies', description: 'Pipes, fittings, and plumbing materials' },
      { name: 'Paint & Supplies', description: 'Paint, brushes, and painting supplies' },
      { name: 'Hardware & Fasteners', description: 'Nails, screws, bolts, and fasteners' },
      { name: 'Garden & Outdoor', description: 'Garden tools and outdoor equipment' },
      { name: 'Safety Equipment', description: 'Safety gear and protective equipment' }
    ]
  },
  electronics_shop: {
    name: 'Electronics Store',
    defaultCategories: [
      { name: 'Mobile Phones', description: 'Smartphones and mobile devices' },
      { name: 'Computers & Laptops', description: 'Desktops, laptops, and accessories' },
      { name: 'Audio Equipment', description: 'Speakers, headphones, and audio devices' },
      { name: 'TV & Home Entertainment', description: 'Televisions and entertainment systems' },
      { name: 'Cameras & Accessories', description: 'Cameras, lenses, and photography equipment' },
      { name: 'Gaming Consoles', description: 'Gaming systems and accessories' },
      { name: 'Accessories', description: 'Cables, chargers, and electronic accessories' },
      { name: 'Smart Home Devices', description: 'Smart home automation products' }
    ]
  },
  fashion_boutique: {
    name: 'Clothing/Fashion Store',
    defaultCategories: [
      { name: 'Men\'s Clothing', description: 'Men\'s apparel and fashion items' },
      { name: 'Women\'s Clothing', description: 'Women\'s apparel and fashion items' },
      { name: 'Children\'s Clothing', description: 'Kids and baby clothing' },
      { name: 'Shoes & Footwear', description: 'Shoes, boots, and footwear' },
      { name: 'Accessories', description: 'Bags, belts, jewelry, and fashion accessories' },
      { name: 'Sportswear', description: 'Athletic and sports clothing' }
    ]
  },
  furniture_shop: {
    name: 'Furniture Store',
    defaultCategories: [
      { name: 'Living Room Furniture', description: 'Sofas, chairs, and living room sets' },
      { name: 'Bedroom Furniture', description: 'Beds, dressers, and bedroom sets' },
      { name: 'Dining Room Furniture', description: 'Tables, chairs, and dining sets' },
      { name: 'Office Furniture', description: 'Desks, chairs, and office furniture' },
      { name: 'Outdoor Furniture', description: 'Patio and outdoor furniture' },
      { name: 'Storage & Organization', description: 'Shelving, cabinets, and storage solutions' },
      { name: 'Decorative Items', description: 'Lamps, mirrors, and home decor' }
    ]
  },
  stationery_bookshop: {
    name: 'Bookshop & Stationery',
    defaultCategories: [
      { name: 'Fiction', description: 'Fiction books and novels' },
      { name: 'Non-Fiction', description: 'Non-fiction and educational books' },
      { name: 'Children\'s Books', description: 'Books for children and young adults' },
      { name: 'Academic Textbooks', description: 'Educational and academic textbooks' },
      { name: 'Writing Instruments', description: 'Pens, pencils, and writing tools' },
      { name: 'Paper Products', description: 'Notebooks, paper, and stationery paper' },
      { name: 'Office Supplies', description: 'Folders, binders, and office organization' },
      { name: 'Art Supplies', description: 'Paints, brushes, and art materials' },
      { name: 'School Supplies', description: 'Backpacks, lunch boxes, and school items' },
      { name: 'Gift Items', description: 'Greeting cards, gift wrap, and gift items' },
      { name: 'Magazines & Periodicals', description: 'Magazines and periodical publications' }
    ]
  },
  auto_parts: {
    name: 'Auto Parts Store',
    defaultCategories: [
      { name: 'Engine Parts', description: 'Engine components and parts' },
      { name: 'Brake System', description: 'Brake pads, rotors, and brake components' },
      { name: 'Suspension & Steering', description: 'Shocks, struts, and steering parts' },
      { name: 'Electrical & Lighting', description: 'Batteries, alternators, and lighting' },
      { name: 'Filters & Fluids', description: 'Oil filters, air filters, and fluids' },
      { name: 'Tires & Wheels', description: 'Tires, rims, and wheel accessories' },
      { name: 'Body Parts', description: 'Body panels and exterior parts' },
      { name: 'Accessories', description: 'Car accessories and aftermarket parts' }
    ]
  },
  provision_store: {
    name: 'Provision Store / Kiosk',
    defaultCategories: [
      { name: 'Snacks & Beverages', description: 'Chips, drinks, and convenience snacks' },
      { name: 'Tobacco Products', description: 'Cigarettes and tobacco items' },
      { name: 'Personal Care', description: 'Basic toiletries and personal care items' },
      { name: 'Household Essentials', description: 'Basic household and cleaning supplies' },
      { name: 'Magazines & Newspapers', description: 'Publications and reading materials' },
      { name: 'Confectionery', description: 'Candies, chocolates, and sweets' }
    ]
  },
  cosmetics_shop: {
    name: 'Beauty/Cosmetics Store',
    defaultCategories: [
      { name: 'Skincare', description: 'Face creams, cleansers, and skincare products' },
      { name: 'Makeup', description: 'Cosmetics and makeup products' },
      { name: 'Hair Care', description: 'Shampoos, conditioners, and hair products' },
      { name: 'Fragrances', description: 'Perfumes and colognes' },
      { name: 'Nail Care', description: 'Nail polish and nail care products' },
      { name: 'Beauty Tools', description: 'Brushes, applicators, and beauty tools' },
      { name: 'Men\'s Grooming', description: 'Men\'s skincare and grooming products' }
    ]
  },
  sports: {
    name: 'Sports Store',
    defaultCategories: [
      { name: 'Athletic Apparel', description: 'Sports clothing and activewear' },
      { name: 'Footwear', description: 'Athletic shoes and sports footwear' },
      { name: 'Sports Equipment', description: 'Balls, rackets, and sports equipment' },
      { name: 'Fitness Equipment', description: 'Weights, gym equipment, and fitness gear' },
      { name: 'Outdoor Gear', description: 'Camping and outdoor equipment' },
      { name: 'Accessories', description: 'Sports bags, water bottles, and accessories' }
    ]
  },
  toys: {
    name: 'Toy Store',
    defaultCategories: [
      { name: 'Action Figures', description: 'Action figures and collectibles' },
      { name: 'Board Games', description: 'Board games and puzzles' },
      { name: 'Educational Toys', description: 'Learning and educational toys' },
      { name: 'Outdoor Toys', description: 'Bikes, scooters, and outdoor play items' },
      { name: 'Dolls & Accessories', description: 'Dolls and doll accessories' },
      { name: 'Electronic Toys', description: 'Electronic and interactive toys' },
      { name: 'Arts & Crafts', description: 'Craft supplies and art materials' }
    ]
  },
  pet: {
    name: 'Pet Store',
    defaultCategories: [
      { name: 'Pet Food', description: 'Dog food, cat food, and pet nutrition' },
      { name: 'Pet Toys', description: 'Toys and entertainment for pets' },
      { name: 'Pet Accessories', description: 'Collars, leashes, and pet accessories' },
      { name: 'Pet Care Products', description: 'Grooming and health care products' },
      { name: 'Aquarium Supplies', description: 'Fish tanks and aquarium equipment' },
      { name: 'Small Animal Supplies', description: 'Supplies for small pets and rodents' }
    ]
  },
  restaurant: {
    name: 'Restaurant',
    // Material/ingredient categories for inventory (used to prepare food)
    defaultCategories: [
      { name: 'Fresh Produce', description: 'Fruits, vegetables, and fresh ingredients' },
      { name: 'Dairy Products', description: 'Milk, cheese, butter, cream, and dairy items' },
      { name: 'Meat & Seafood', description: 'Fresh and frozen meat, poultry, and seafood' },
      { name: 'Bakery & Bread', description: 'Bread, flour, and baking ingredients' },
      { name: 'Canned Goods', description: 'Canned foods, sauces, and preserved items' },
      { name: 'Dry Goods', description: 'Pasta, rice, grains, and pantry staples' },
      { name: 'Beverages', description: 'Soft drinks, juices, and non-alcoholic drinks' },
      { name: 'Hot Drinks', description: 'Coffee, tea, and hot beverage supplies' },
      { name: 'Oils & Condiments', description: 'Cooking oils, spices, and condiments' },
      { name: 'Cleaning & Supplies', description: 'Cleaning supplies and kitchen consumables' }
    ]
  },
  bakery: {
    name: 'Bakery / Pastry Shop',
    // Material/ingredient categories for inventory (used to bake products)
    defaultCategories: [
      { name: 'Flour & Baking Mixes', description: 'Flour, baking mixes, and dry baking staples' },
      { name: 'Sugars & Sweeteners', description: 'Sugar, honey, and sweetening ingredients' },
      { name: 'Dairy & Eggs', description: 'Milk, butter, cream, and eggs' },
      { name: 'Fillings & Flavorings', description: 'Fruit fillings, chocolate, essences, and flavorings' },
      { name: 'Decorating Supplies', description: 'Icing, fondant, and cake decorating supplies' },
      { name: 'Packaging & Boxes', description: 'Cake boxes, wrapping, and bakery packaging' },
      { name: 'Cleaning & Supplies', description: 'Cleaning supplies and kitchen consumables' }
    ]
  },
  other: {
    name: 'Other',
    defaultCategories: [
      { name: 'General Merchandise', description: 'General store items' },
      { name: 'Miscellaneous', description: 'Other products and items' }
    ]
  }
};

/**
 * Get shop type configuration
 * @param {string} shopType - The shop type key
 * @returns {object|null} Shop type configuration or null if not found
 */
const getShopTypeConfig = (shopType) => {
  return SHOP_TYPES[shopType] || null;
};

/**
 * Get all shop type options for display
 * @returns {array} Array of {key, name} objects
 */
const getShopTypeOptions = () => {
  return Object.entries(SHOP_TYPES).map(([key, config]) => ({
    key,
    name: config.name
  }));
};

/**
 * Get default categories for a shop type
 * @param {string} shopType - The shop type key
 * @returns {array} Array of category objects with name and description
 */
const getDefaultCategoriesForShopType = (shopType) => {
  const normalized = shopType === 'groceries' ? 'supermarket' : shopType;
  const config = getShopTypeConfig(normalized);
  return config ? config.defaultCategories : [];
};

module.exports = {
  SHOP_TYPES,
  getShopTypeConfig,
  getShopTypeOptions,
  getDefaultCategoriesForShopType
};
