// Producten die je met de hand aan een bestelling kunt toevoegen (bijv. voor Marktplaats).
// Voeg hier gerust producten of pakketten aan toe.
module.exports = [
  { ean: '8721082290449', title: 'Minifiguren wapens set 10 stuks - zwart' },
  { ean: '8721082290425', title: 'WW2 wapens voor minifiguren 15 stuks - zwart' },
  { ean: '8721082290432', title: 'Staand minigun machinegeweer' },
  { ean: '8721082290326', title: 'WW2 geweren 3 stuks bruin met granaten' },
  { ean: '8721082290043', title: 'Militaire body armour set 36 delig - zand' },
  { ean: '8721082290463', title: 'Militaire body armour set 36 delig - donkergroen' },
  { ean: '8721082290456', title: 'Ghillie suit camouflage' },
  { ean: '8721082290036', title: 'Staand machinegeweer op driepoot' },
  { ean: '8721082290081', title: 'Minifiguren hoofden geel 22 stuks' },
  { ean: '8721082290074', title: 'Minifiguren hoofden huidskleur 8 stuks' },

  // Pakketten: kies je er een, dan komen de losse artikelen op de pakbon.
  { ean: 'PAKKET-ZAND', title: '📦 Militair voordeelpakket zand', bundle: [['8721082290043', 1], ['8721082290449', 1], ['8721082290425', 1], ['8721082290432', 1]] },
  { ean: 'PAKKET-GROEN', title: '📦 Militair voordeelpakket groen (jungle)', bundle: [['8721082290463', 1], ['8721082290449', 1], ['8721082290036', 1], ['8721082290456', 1]] },
  { ean: 'PAKKET-60', title: '📦 Wapens voor 60 minifiguren', bundle: [['8721082290449', 3], ['8721082290425', 2]] },
  { ean: 'PAKKET-MINIGUN', title: '📦 5x staande minigun', bundle: [['8721082290432', 5]] },
];
