/**
 * Default Product Categories by Business Type, Studio Type, and Shop Type
 *
 * These categories are for the Products page (what you sell). They are separate from
 * material/inventory categories (Materials page = ingredients/supplies used to make or run the business).
 */

const { getDefaultCategoriesForShopType } = require('./shopTypes');

/** Product categories per shop type (what you sell). Materials = shopTypes (supplies used to run the business). */
const SHOP_TYPE_PRODUCT_CATEGORIES = {
  supermarket: [
    { name: 'Fresh Produce', description: 'Fruits, vegetables, and fresh items' },
    { name: 'Dairy Products', description: 'Milk, cheese, yogurt, and dairy items' },
    { name: 'Meat & Seafood', description: 'Fresh and frozen meat and seafood' },
    { name: 'Bakery Items', description: 'Bread, pastries, and baked goods' },
    { name: 'Beverages', description: 'Soft drinks, juices, water, and beverages' },
    { name: 'Snacks & Confectionery', description: 'Chips, candies, and snacks' },
    { name: 'Canned Goods', description: 'Canned foods and preserved items' },
    { name: 'Frozen Foods', description: 'Frozen meals and frozen products' },
    { name: 'Household Items', description: 'Cleaning supplies and household products' },
    { name: 'Personal Care', description: 'Toiletries and personal hygiene products' }
  ],
  restaurant: [
    { name: 'Appetizers', description: 'Starters and small plates' },
    { name: 'Main Courses', description: 'Main dishes and entrees' },
    { name: 'Sides', description: 'Side dishes and accompaniments' },
    { name: 'Desserts', description: 'Desserts and sweets' },
    { name: 'Beverages', description: 'Soft drinks, juices, and non-alcoholic drinks' },
    { name: 'Hot Drinks', description: 'Coffee, tea, and hot beverages' },
    { name: 'Alcoholic Drinks', description: 'Beer, wine, and spirits' }
  ]
};

const DEFAULT_CATEGORIES = {
  shop: [
    { name: 'Electronics', description: 'Electronic products and devices' },
    { name: 'Clothing & Apparel', description: 'Clothes, shoes, and accessories' },
    { name: 'Food & Beverages', description: 'Food items and drinks' },
    { name: 'Home & Kitchen', description: 'Home goods and kitchen items' },
    { name: 'Beauty & Personal Care', description: 'Beauty products and personal care items' },
    { name: 'Sports & Outdoors', description: 'Sports equipment and outdoor gear' },
    { name: 'Books & Media', description: 'Books, movies, and media' },
    { name: 'Toys & Games', description: 'Toys and games' },
    { name: 'Automotive', description: 'Car parts and accessories' },
    { name: 'Health & Wellness', description: 'Health and wellness products' },
    { name: 'Office Supplies', description: 'Office and stationery items' },
    { name: 'Other', description: 'Miscellaneous products' }
  ],
  studio: {
    printing_press: [
      { name: 'Paper & Substrates', description: 'Paper stocks, vinyl, canvas, label materials' },
      { name: 'Plates & Screens', description: 'Offset plates, screen mesh, stencil supplies' },
      { name: 'Inks & Toners', description: 'Process inks, toners, UV inks' },
      { name: 'Coatings & Laminates', description: 'Varnishes, laminating films, protective finishes' },
      { name: 'Binding & Finishing', description: 'Binding, laminating, finishing supplies' },
      { name: 'Packaging & Shipping', description: 'Boxes, envelopes, tapes, packaging materials' },
      { name: 'Digital Printing Media', description: 'Signage media, fabric substrates' },
      { name: 'Design Services', description: 'Design and custom work' }
    ],
    mechanic: [
      { name: 'Repairs', description: 'General repairs and diagnostics' },
      { name: 'Oil Change', description: 'Oil and filter changes' },
      { name: 'Brake Service', description: 'Brake pads, rotors, and brake fluid' },
      { name: 'Diagnostics', description: 'Vehicle diagnostics and inspections' },
      { name: 'Suspension & Steering', description: 'Shocks, struts, steering components' },
      { name: 'Electrical', description: 'Battery, alternator, electrical repairs' },
      { name: 'Parts', description: 'Parts and components' },
      { name: 'Other Services', description: 'Miscellaneous repair services' }
    ],
    barber: [
      { name: 'Haircuts', description: 'Hair cutting services' },
      { name: 'Beard Trim', description: 'Beard and facial hair grooming' },
      { name: 'Styling', description: 'Hair styling and treatments' },
      { name: 'Shaves', description: 'Traditional shaves and hot towel service' },
      { name: 'Coloring', description: 'Hair coloring and highlights' },
      { name: 'Other Services', description: 'Miscellaneous grooming services' }
    ],
    salon: [
      { name: 'Haircuts', description: 'Hair cutting services' },
      { name: 'Coloring', description: 'Hair coloring and highlights' },
      { name: 'Treatments', description: 'Hair and scalp treatments' },
      { name: 'Styling', description: 'Hair styling and blowouts' },
      { name: 'Nails', description: 'Manicure and pedicure services' },
      { name: 'Skincare', description: 'Facials and skincare treatments' },
      { name: 'Other Services', description: 'Miscellaneous salon services' }
    ],
    // Default categories for studio type if studioType is not specified
    default: [
      { name: 'Services', description: 'General services' },
      { name: 'Materials', description: 'Materials and supplies' },
      { name: 'Equipment', description: 'Equipment and tools' },
      { name: 'Other', description: 'Miscellaneous items' }
    ]
  },
  pharmacy: [
    { name: 'Prescription Medications', description: 'Prescription drugs and medications' },
    { name: 'Over-the-Counter (OTC)', description: 'Non-prescription medications' },
    { name: 'Vitamins & Supplements', description: 'Vitamins and dietary supplements' },
    { name: 'Personal Care', description: 'Personal hygiene and care products' },
    { name: 'Baby Care', description: 'Baby products and care items' },
    { name: 'First Aid', description: 'First aid supplies and bandages' },
    { name: 'Medical Devices', description: 'Medical equipment and devices' },
    { name: 'Health & Wellness', description: 'Health and wellness products' },
    { name: 'Beauty Products', description: 'Beauty and cosmetic products' },
    { name: 'Other', description: 'Miscellaneous pharmacy products' }
  ],
  rental: {
    equipment_rental: [
      { name: 'Power Tools', description: 'Drills, saws, generators, and power equipment' },
      { name: 'Construction Equipment', description: 'Scaffolding, mixers, and construction tools' },
      { name: 'Heavy Machinery', description: 'Excavators, loaders, and large equipment' },
      { name: 'Hand Tools', description: 'Manual tools and accessories' },
      { name: 'Safety Equipment', description: 'Helmets, harnesses, and protective gear' },
      { name: 'Other Equipment', description: 'Miscellaneous rentable equipment' }
    ],
    event_rental: [
      { name: 'Tents & Canopies', description: 'Event tents, marquees, and covers' },
      { name: 'Seating & Tables', description: 'Chairs, tables, and event furniture' },
      { name: 'Sound & Lighting', description: 'Speakers, microphones, and lighting' },
      { name: 'Staging & Décor', description: 'Stages, backdrops, and decorations' },
      { name: 'Catering Equipment', description: 'Chafing dishes, coolers, and serving items' },
      { name: 'Other Event Items', description: 'Miscellaneous event rental items' }
    ],
    vehicle_rental: [
      { name: 'Cars & Sedans', description: 'Passenger cars for hire' },
      { name: 'SUVs & 4x4', description: 'SUVs and off-road vehicles' },
      { name: 'Vans & Minibuses', description: 'Passenger vans and minibuses' },
      { name: 'Trucks & Pickups', description: 'Commercial trucks and pickups' },
      { name: 'Motorcycles & Bikes', description: 'Motorcycles and bicycles' },
      { name: 'Other Vehicles', description: 'Miscellaneous vehicles' }
    ],
    general_rental: [
      { name: 'General Items', description: 'General items for hire' },
      { name: 'Electronics', description: 'Electronics and gadgets' },
      { name: 'Appliances', description: 'Home and office appliances' },
      { name: 'Other', description: 'Miscellaneous rental items' }
    ],
    default: [
      { name: 'Equipment', description: 'Equipment and tools for hire' },
      { name: 'Vehicles', description: 'Vehicles for hire' },
      { name: 'Event Items', description: 'Event and party supplies' },
      { name: 'Other', description: 'Miscellaneous rental items' }
    ]
  }
};

/**
 * Get default categories for a business type, optional studio type, shop type, or rental sub-type
 * @param {string} businessType - The business type ('shop', 'studio', 'pharmacy', 'rental')
 * @param {string|null} studioType - The studio type (for studio business type)
 * @param {string|null} shopType - The shop type (for shop business type; e.g. supermarket, hardware, restaurant)
 * @param {string|null} rentalSubType - The rental sub-type (e.g. equipment_rental, event_rental, vehicle_rental)
 * @returns {Array} Array of category objects with name and description
 */
const getDefaultCategories = (businessType, studioType = null, shopType = null, rentalSubType = null) => {
  if (!businessType) {
    return [];
  }

  if (businessType === 'studio') {
    if (studioType && DEFAULT_CATEGORIES.studio[studioType]) {
      return DEFAULT_CATEGORIES.studio[studioType];
    }
    return DEFAULT_CATEGORIES.studio.default;
  }

  if (businessType === 'rental') {
    if (rentalSubType && DEFAULT_CATEGORIES.rental[rentalSubType]) {
      return DEFAULT_CATEGORIES.rental[rentalSubType];
    }
    return DEFAULT_CATEGORIES.rental.default;
  }

  if (businessType === 'shop' && shopType) {
    // Use dedicated product categories when defined (e.g. restaurant = menu, not ingredients)
    if (SHOP_TYPE_PRODUCT_CATEGORIES[shopType]) {
      return SHOP_TYPE_PRODUCT_CATEGORIES[shopType];
    }
    return getDefaultCategoriesForShopType(shopType);
  }

  return DEFAULT_CATEGORIES[businessType] || [];
};

module.exports = {
  DEFAULT_CATEGORIES,
  SHOP_TYPE_PRODUCT_CATEGORIES,
  getDefaultCategories
};
