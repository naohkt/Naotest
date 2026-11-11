/* =========================================================
   Smile Bar & Restaurant — content
   Edit this file to update the restaurant details and menu.
   A dish's `price` (in THB) is optional: when left out,
   no price is shown. Fill them in from the current menu.
   ========================================================= */

window.SMILE = {
  restaurant: {
    name: "Smile Bar & Restaurant",
    phoneDisplay: "089 677 4851",
    phoneIntl: "+66896774851",
    whatsapp: "66896774851",
    address: [
      "97/85 Kamala Beach Road",
      "Soi Kamala Police Station",
      "Kamala, Kathu, Phuket 83150",
      "Thailand",
    ],
    mapsQuery: "Smile Bar Kamala Beach Phuket",
    lat: 7.9516,
    lng: 98.2812,
    timezone: "Asia/Bangkok",
    open: "10:00",
    close: "24:00",
    fireShow: { days: [5, 6], start: "21:00", end: "21:30" }, // Fri, Sat
  },

  // Booking settings.
  booking: {
    // Set to a URL that accepts a JSON POST (e.g. your own API,
    // a Formspree / Google Apps Script endpoint) to receive
    // reservations by email or in a spreadsheet. Left empty, the
    // site confirms the request and offers WhatsApp / phone.
    endpoint: "",
    firstSeating: "11:00",
    lastSeating: "22:30",
    stepMinutes: 30,
    maxGuests: 12,
    daysAhead: 60,
  },

  menu: [
    {
      id: "signature",
      label: { en: "Signature", fr: "Signature" },
      intro: {
        en: "The dish that made our name on Kamala Beach.",
        fr: "Le plat qui a fait notre réputation sur la plage de Kamala.",
      },
      dishes: [
        {
          name: { en: "Charcoal-Grilled Chicken", fr: "Poulet grillé au charbon" },
          desc: {
            en: "Marinated for the better part of a day, then slowly grilled over charcoal until lacquered and tender. Served with our house dipping sauces.",
            fr: "Mariné presque une journée entière, puis grillé lentement au charbon de bois jusqu'à devenir laqué et fondant. Servi avec nos sauces maison.",
          },
          tags: ["signature", "grill"],
        },
      ],
    },
    {
      id: "starters",
      label: { en: "To Begin", fr: "Pour commencer" },
      intro: {
        en: "Small plates to share as the sun goes down.",
        fr: "Petites assiettes à partager pendant que le soleil se couche.",
      },
      dishes: [
        {
          name: { en: "Chicken Satay", fr: "Satay de poulet" },
          desc: {
            en: "Skewers grilled over the coals, with peanut sauce and cucumber relish.",
            fr: "Brochettes grillées sur les braises, sauce cacahuète et pickles de concombre.",
          },
          tags: ["grill"],
        },
        {
          name: { en: "Spring Rolls", fr: "Rouleaux de printemps" },
          desc: {
            en: "Golden and crisp, with sweet chilli dip.",
            fr: "Dorés et croustillants, sauce chili douce.",
          },
          tags: [],
        },
      ],
    },
    {
      id: "sea",
      label: { en: "From the Sea", fr: "De la mer" },
      intro: {
        en: "The Andaman's catch, grilled on the sand a few steps from the water.",
        fr: "La pêche de la mer d'Andaman, grillée sur le sable à quelques pas de l'eau.",
      },
      dishes: [
        {
          name: { en: "Grilled Lobster", fr: "Homard grillé" },
          desc: {
            en: "Split and grilled over charcoal, finished with garlic butter.",
            fr: "Fendu et grillé au charbon, beurre à l'ail.",
          },
          tags: ["grill", "sea"],
        },
        {
          name: { en: "Tiger Prawns", fr: "Gambas tigrées" },
          desc: {
            en: "Grilled whole, with Thai seafood sauce and lime.",
            fr: "Grillées entières, sauce fruits de mer thaïe et citron vert.",
          },
          tags: ["grill", "sea"],
        },
        {
          name: { en: "Crab", fr: "Crabe" },
          desc: {
            en: "Ask your server for today's preparation.",
            fr: "Demandez la préparation du jour à votre serveur.",
          },
          tags: ["sea"],
        },
      ],
    },
    {
      id: "thai",
      label: { en: "Thai Kitchen", fr: "Cuisine thaïe" },
      intro: {
        en: "The classics of the kingdom, cooked to order.",
        fr: "Les grands classiques du royaume, cuisinés à la minute.",
      },
      dishes: [
        {
          name: { en: "Panang Curry", fr: "Curry Panang" },
          desc: {
            en: "Rich red curry with coconut cream and kaffir lime, with jasmine rice.",
            fr: "Curry rouge onctueux à la crème de coco et combava, riz jasmin.",
          },
          tags: ["spicy"],
        },
        {
          name: { en: "Pad Thai", fr: "Pad Thaï" },
          desc: {
            en: "Wok-tossed rice noodles, tamarind, egg, peanuts and lime.",
            fr: "Nouilles de riz sautées au wok, tamarin, œuf, cacahuètes et citron vert.",
          },
          tags: [],
        },
      ],
    },
    {
      id: "west",
      label: { en: "Western", fr: "Cuisine occidentale" },
      intro: {
        en: "Familiar comfort, beachside.",
        fr: "Le réconfort des classiques, les pieds dans le sable.",
      },
      dishes: [
        {
          name: { en: "Cheeseburger", fr: "Cheeseburger" },
          desc: { en: "With fries.", fr: "Servi avec des frites." },
          tags: [],
        },
        {
          name: { en: "Spaghetti Carbonara", fr: "Spaghetti carbonara" },
          desc: { en: "Creamy, with smoked bacon.", fr: "Crémeux, au lard fumé." },
          tags: [],
        },
        {
          name: { en: "Club Sandwich", fr: "Club sandwich" },
          desc: { en: "Triple-decker, with fries.", fr: "Trois étages, avec frites." },
          tags: [],
        },
      ],
    },
    {
      id: "sweet",
      label: { en: "Sweet", fr: "Douceurs" },
      intro: { en: "To end on a high note.", fr: "Pour finir en beauté." },
      dishes: [
        {
          name: { en: "Mango Sticky Rice", fr: "Riz gluant à la mangue" },
          desc: {
            en: "Ripe mango, sweet coconut sticky rice, toasted mung beans.",
            fr: "Mangue mûre, riz gluant au lait de coco, haricots mungo grillés.",
          },
          tags: ["veg"],
        },
      ],
    },
    {
      id: "bar",
      label: { en: "The Bar", fr: "Le bar" },
      intro: {
        en: "Cocktails for the golden hour. Ask about happy hour.",
        fr: "Des cocktails pour l'heure dorée. Demandez notre happy hour.",
      },
      dishes: [
        {
          name: { en: "Sunset Cocktails", fr: "Cocktails du coucher de soleil" },
          desc: {
            en: "Our bartenders' creations and the great classics, shaken to order.",
            fr: "Les créations de nos barmen et les grands classiques, préparés à la minute.",
          },
          tags: [],
        },
        {
          name: { en: "Ice-Cold Beer", fr: "Bière bien fraîche" },
          desc: {
            en: "Thai and imported, served frosted.",
            fr: "Thaïes et importées, servies glacées.",
          },
          tags: [],
        },
        {
          name: { en: "Fresh Coconut & Juices", fr: "Noix de coco & jus frais" },
          desc: {
            en: "Something cool for the afternoon.",
            fr: "De quoi se rafraîchir l'après-midi.",
          },
          tags: ["veg"],
        },
      ],
    },
  ],

  tagLabels: {
    signature: { en: "Signature", fr: "Signature" },
    grill: { en: "Charcoal", fr: "Charbon" },
    sea: { en: "Seafood", fr: "Fruits de mer" },
    spicy: { en: "Spicy", fr: "Épicé" },
    veg: { en: "Vegetarian", fr: "Végétarien" },
  },
};
