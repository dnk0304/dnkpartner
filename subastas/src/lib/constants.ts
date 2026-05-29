import { AuctionCategory } from "@/types";

export const OFFICIAL_CATEGORIES: {
  REAL_ESTATE: AuctionCategory[];
  MOVABLE: AuctionCategory[];
} = {
  REAL_ESTATE: [
    'Viviendas',
    'Garajes',
    'Trasteros',
    'Terrenos',
    'Locales',
    'Fincas rústicas',
    'Naves industriales',
    'Otros inmuebles'
  ],
  MOVABLE: [
    'Turismos',
    'Motocicletas',
    'Vehículos Industriales',
    'Barcos',
    'Maquinaria',
    'Joyas',
    'Arte'
  ]
};

export const PROVINCES_BY_COMMUNITY: Record<string, string[]> = {
  "Andalucía": ["Almería", "Cádiz", "Córdoba", "Granada", "Huelva", "Jaén", "Málaga", "Sevilla"],
  "Aragón": ["Huesca", "Teruel", "Zaragoza"],
  "Asturias": ["Asturias"],
  "Illes Balears": ["Illes Balears"],
  "Canarias": ["Las Palmas", "Santa Cruz de Tenerife"],
  "Cantabria": ["Cantabria"],
  "Castilla y León": ["Ávila", "Burgos", "León", "Palencia", "Salamanca", "Segovia", "Soria", "Valladolid", "Zamora"],
  "Castilla-La Mancha": ["Albacete", "Ciudad Real", "Cuenca", "Guadalajara", "Toledo"],
  "Cataluña": ["Barcelona", "Girona", "Lleida", "Tarragona"],
  "Comunitat Valenciana": ["Alicante", "Castellón", "Valencia"],
  "Extremadura": ["Badajoz", "Cáceres"],
  "Galicia": ["A Coruña", "Lugo", "Ourense", "Pontevedra"],
  "Madrid": ["Madrid"],
  "Murcia": ["Murcia"],
  "Navarra": ["Navarra"],
  "País Vasco": ["Álava", "Bizkaia", "Gipuzkoa"],
  "La Rioja": ["La Rioja"],
  // Including Autonomous Cities for completeness if needed, though usually treated separately
  "Ceuta y Melilla": ["Ceuta", "Melilla"]
};

export const ALL_PROVINCES = Object.values(PROVINCES_BY_COMMUNITY).flat().sort();

// Auction sources based on Spanish government entities
export const AUCTION_SOURCES = [
  "Todos", // All sources
  "BOE Judiciales",
  "Agencia Tributaria",
  "Seguridad social",
  "Notariales",
  "Ayuntamientos",
  "Diputaciones",
  "Consejos comarcales",
  "Agencias tributarias",
  "Administrativas generales"
] as const;

export type AuctionSource = typeof AUCTION_SOURCES[number];

// Comprehensive municipalities by province for all of Spain
export const MUNICIPALITIES_BY_PROVINCE: Record<string, string[]> = {
  // Andalucía
  "Almería": ["Almería", "Roquetas de Mar", "El Ejido", "Vícar", "Adra", "Níjar", "Huércal de Almería", "Vera", "Mojácar", "Pulpí", "Huércal-Overa", "Cuevas del Almanzora", "Berja", "Olula del Río", "Albox"],
  "Cádiz": ["Cádiz", "Jerez de la Frontera", "Algeciras", "San Fernando", "El Puerto de Santa María", "Chiclana de la Frontera", "Puerto Real", "La Línea de la Concepción", "Sanlúcar de Barrameda", "Arcos de la Frontera", "Barbate", "Conil de la Frontera", "Rota", "Tarifa", "Ubrique"],
  "Córdoba": ["Córdoba", "Lucena", "Puente Genil", "Montilla", "Priego de Córdoba", "Cabra", "Baena", "Pozoblanco", "Palma del Río", "Peñarroya-Pueblonuevo", "Rute", "Aguilar de la Frontera", "Villafranca de Córdoba", "Fernán Núñez", "Bujalance"],
  "Granada": ["Granada", "Motril", "Almuñécar", "Guadix", "Loja", "Baza", "Armilla", "Maracena", "Santa Fe", "Huétor Vega", "Atarfe", "Peligros", "Salobreña", "Pinos Puente", "La Zubia"],
  "Huelva": ["Huelva", "Lepe", "Almonte", "Moguer", "Isla Cristina", "Ayamonte", "Aljaraque", "Cartaya", "Punta Umbría", "Bollullos Par del Condado", "La Palma del Condado", "Palos de la Frontera", "San Juan del Puerto", "Valverde del Camino", "Rociana del Condado"],
  "Jaén": ["Jaén", "Linares", "Andújar", "Úbeda", "Martos", "Alcalá la Real", "Bailén", "Villacarrillo", "La Carolina", "Jódar", "Torredonjimeno", "Mancha Real", "Orcera", "Cazorla", "Baeza"],
  "Málaga": ["Málaga", "Marbella", "Mijas", "Vélez-Málaga", "Fuengirola", "Torremolinos", "Estepona", "Benalmádena", "Antequera", "Rincón de la Victoria", "Ronda", "Alhaurín de la Torre", "Nerja", "Coín", "Manilva"],
  "Sevilla": ["Sevilla", "Dos Hermanas", "Alcalá de Guadaíra", "Mairena del Aljarafe", "Utrera", "Écija", "Los Palacios y Villafranca", "La Rinconada", "Coria del Río", "Carmona", "Lebrija", "Morón de la Frontera", "San Juan de Aznalfarache", "Tomares", "Bormujos"],
  
  // Aragón
  "Huesca": ["Huesca", "Monzón", "Barbastro", "Jaca", "Fraga", "Binéfar", "Sabiñánigo", "Ejea de los Caballeros", "Graus", "Almudévar"],
  "Teruel": ["Teruel", "Alcañiz", "Andorra", "Calamocha", "Utrillas", "Monreal del Campo", "Híjar", "Albarracín", "Valderrobres", "Mora de Rubielos"],
  "Zaragoza": ["Zaragoza", "Calatayud", "Utebo", "Ejea de los Caballeros", "Cuarte de Huerva", "Zuera", "La Almunia de Doña Godina", "Tarazona", "Caspe", "Borja", "Alagón", "Tauste", "Illueca", "Épila", "Fuentes de Ebro"],
  
  // Asturias
  "Asturias": ["Gijón", "Oviedo", "Avilés", "Siero", "Langreo", "Mieres", "Castrillón", "Llanera", "Corvera de Asturias", "Carreño", "Gozón", "Villaviciosa", "Lena", "Cangas del Narcea", "Valdés"],
  
  // Illes Balears
  "Illes Balears": ["Palma", "Calvià", "Manacor", "Llucmajor", "Marratxí", "Inca", "Alcúdia", "Felanitx", "Pollença", "Sóller", "Ciutadella de Menorca", "Mahón", "Ibiza", "San Antonio Abad", "Santa Eulalia del Río"],
  
  // Canarias
  "Las Palmas": ["Las Palmas de Gran Canaria", "Telde", "Santa Lucía de Tirajana", "Arucas", "Agüimes", "Ingenio", "Gáldar", "San Bartolomé de Tirajana", "Mogán", "Pájara", "Puerto del Rosario", "Antigua", "La Oliva", "Tuineje", "Arrecife"],
  "Santa Cruz de Tenerife": ["Santa Cruz de Tenerife", "San Cristóbal de La Laguna", "Arona", "Adeje", "Los Realejos", "Granadilla de Abona", "Puerto de la Cruz", "Los Llanos de Aridane", "Santa Cruz de La Palma", "Icod de los Vinos", "Güímar", "Candelaria", "San Miguel de Abona", "Tacoronte", "La Orotava"],
  
  // Cantabria
  "Cantabria": ["Santander", "Torrelavega", "Castro-Urdiales", "Camargo", "Piélagos", "El Astillero", "Santa Cruz de Bezana", "Laredo", "Santoña", "Los Corrales de Buelna", "Reinosa", "Suances", "Noja", "Comillas", "San Vicente de la Barquera"],
  
  // Castilla y León
  "Ávila": ["Ávila", "Arévalo", "Arenas de San Pedro", "Las Navas del Marqués", "Candeleda", "Sotillo de la Adrada", "El Barco de Ávila", "Cebreros", "Piedrahíta", "El Tiemblo"],
  "Burgos": ["Burgos", "Miranda de Ebro", "Aranda de Duero", "Briviesca", "Villarcayo de Merindad de Castilla la Vieja", "Medina de Pomar", "Lerma", "Roa", "Belorado", "Quintanar de la Sierra"],
  "León": ["León", "Ponferrada", "San Andrés del Rabanedo", "Villaquilambre", "Astorga", "La Bañeza", "Bembibre", "Valencia de Don Juan", "Villafranca del Bierzo", "Sahagún"],
  "Palencia": ["Palencia", "Guardo", "Aguilar de Campoo", "Venta de Baños", "Villamuriel de Cerrato", "Dueñas", "Carrión de los Condes", "Barruelo de Santullán", "Cervera de Pisuerga", "Herrera de Pisuerga"],
  "Salamanca": ["Salamanca", "Béjar", "Ciudad Rodrigo", "Santa Marta de Tormes", "Peñaranda de Bracamonte", "Alba de Tormes", "Vitigudino", "Lumbrales", "Ledesma", "Guijuelo"],
  "Segovia": ["Segovia", "Cuéllar", "San Ildefonso o La Granja", "El Espinar", "Cantalejo", "Riaza", "Carbonero el Mayor", "Nava de la Asunción", "Sepúlveda", "Santa María la Real de Nieva"],
  "Soria": ["Soria", "Almazán", "El Burgo de Osma-Ciudad de Osma", "San Leonardo de Yagüe", "Ágreda", "Golmayo", "Ólvega", "Covaleda", "Duruelo de la Sierra", "Arcos de Jalón"],
  "Valladolid": ["Valladolid", "Laguna de Duero", "Medina del Campo", "Arroyo de la Encomienda", "Tudela de Duero", "Íscar", "Peñafiel", "Cigales", "Tordesillas", "Olmedo"],
  "Zamora": ["Zamora", "Benavente", "Toro", "Villalpando", "Puebla de Sanabria", "Fermoselle", "Fuentesaúco", "Alcañices", "Bermillo de Sayago", "Corrales del Vino"],
  
  // Castilla-La Mancha
  "Albacete": ["Albacete", "Hellín", "Villarrobledo", "Almansa", "La Roda", "Caudete", "Yeste", "Tobarra", "Tarazona de la Mancha", "Elche de la Sierra"],
  "Ciudad Real": ["Ciudad Real", "Puertollano", "Tomelloso", "Alcázar de San Juan", "Valdepeñas", "Manzanares", "Daimiel", "Almadén", "Miguelturra", "La Solana"],
  "Cuenca": ["Cuenca", "Tarancón", "Quintanar del Rey", "San Clemente", "Motilla del Palancar", "Las Pedroñeras", "Huete", "Minglanilla", "Villares del Saz", "Iniesta"],
  "Guadalajara": ["Guadalajara", "Azuqueca de Henares", "Alovera", "Cabanillas del Campo", "Yunquera de Henares", "El Casar", "Sigüenza", "Molina de Aragón", "Villanueva de la Torre", "Marchamalo"],
  "Toledo": ["Toledo", "Talavera de la Reina", "Illescas", "Seseña", "Torrijos", "Quintanar de la Orden", "Mora", "Ocaña", "Sonseca", "Madridejos"],
  
  // Cataluña
  "Barcelona": ["Barcelona", "L'Hospitalet de Llobregat", "Badalona", "Terrassa", "Sabadell", "Mataró", "Santa Coloma de Gramenet", "Cornellà de Llobregat", "Sant Boi de Llobregat", "Rubí", "Manresa", "Vilanova i la Geltrú", "Viladecans", "El Prat de Llobregat", "Granollers"],
  "Girona": ["Girona", "Figueres", "Blanes", "Lloret de Mar", "Olot", "Salt", "Palafrugell", "Sant Feliu de Guíxols", "Roses", "Palamós"],
  "Lleida": ["Lleida", "Tàrrega", "Mollerussa", "Balaguer", "La Seu d'Urgell", "Cervera", "Almacelles", "Alcarràs", "Agramunt", "Tremp"],
  "Tarragona": ["Tarragona", "Reus", "Cambrils", "Tortosa", "El Vendrell", "Valls", "Salou", "Vila-seca", "Amposta", "Calafell"],
  
  // Comunitat Valenciana
  "Alicante": ["Alicante", "Elche", "Torrevieja", "Orihuela", "Benidorm", "Alcoy", "Elda", "San Vicente del Raspeig", "Dénia", "Villena", "Santa Pola", "Calpe", "Jávea", "Altea", "Petrer"],
  "Castellón": ["Castellón de la Plana", "Vila-real", "Burriana", "Onda", "Vinaròs", "Benicarló", "Vall d'Uixó", "Almazora", "Segorbe", "Alcora"],
  "Valencia": ["Valencia", "Gandía", "Torrent", "Paterna", "Sagunto", "Alzira", "Mislata", "Burjassot", "Xirivella", "Ontinyent", "Manises", "Catarroja", "Sueca", "Cullera", "Requena"],
  
  // Extremadura
  "Badajoz": ["Badajoz", "Mérida", "Don Benito", "Almendralejo", "Villanueva de la Serena", "Zafra", "Montijo", "Villafranca de los Barros", "Olivenza", "Jerez de los Caballeros"],
  "Cáceres": ["Cáceres", "Plasencia", "Navalmoral de la Mata", "Coria", "Trujillo", "Miajadas", "Talayuela", "Arroyo de la Luz", "Valencia de Alcántara", "Jaraíz de la Vera"],
  
  // Galicia
  "A Coruña": ["A Coruña", "Santiago de Compostela", "Ferrol", "Oleiros", "Narón", "Arteixo", "Culleredo", "Carballo", "Cambre", "Betanzos", "Ames", "Ribeira", "Boiro", "Padrón", "Noia"],
  "Lugo": ["Lugo", "Viveiro", "Monforte de Lemos", "Vilalba", "Foz", "Sarria", "Burela", "Chantada", "Ribadeo", "Guitiriz"],
  "Ourense": ["Ourense", "Verín", "O Carballiño", "Xinzo de Limia", "Barbadás", "Celanova", "Ribadavia", "Allariz", "A Rúa", "Maceda"],
  "Pontevedra": ["Vigo", "Pontevedra", "Vilagarcía de Arousa", "Redondela", "Cangas", "Marín", "Ponteareas", "Lalín", "O Porriño", "Moaña", "Poio", "Sanxenxo", "A Estrada", "Caldas de Reis", "Cambados"],
  
  // Madrid
  "Madrid": ["Madrid", "Móstoles", "Alcalá de Henares", "Fuenlabrada", "Leganés", "Getafe", "Alcorcón", "Torrejón de Ardoz", "Parla", "Alcobendas", "Las Rozas de Madrid", "San Sebastián de los Reyes", "Pozuelo de Alarcón", "Coslada", "Valdemoro"],
  
  // Murcia
  "Murcia": ["Murcia", "Cartagena", "Lorca", "Molina de Segura", "Alcantarilla", "Mazarrón", "Cieza", "Yecla", "Águilas", "Totana", "San Javier", "Jumilla", "Torre-Pacheco", "Caravaca de la Cruz", "San Pedro del Pinatar"],
  
  // Navarra
  "Navarra": ["Pamplona", "Tudela", "Barañáin", "Burlada", "Zizur Mayor", "Estella-Lizarra", "Tafalla", "Valle de Egüés", "Villava", "Ansoáin"],
  
  // País Vasco
  "Álava": ["Vitoria-Gasteiz", "Llodio", "Amurrio", "Salvatierra", "Zuia", "Ayala", "Oyón-Oion", "Alegría-Dulantzi", "Laguardia", "Labastida"],
  "Bizkaia": ["Bilbao", "Barakaldo", "Getxo", "Portugalete", "Santurtzi", "Basauri", "Leioa", "Sestao", "Durango", "Galdakao", "Erandio", "Ermua", "Mungia", "Berango", "Amorebieta-Etxano"],
  "Gipuzkoa": ["Donostia-San Sebastián", "Irún", "Eibar", "Errenteria", "Zarautz", "Arrasate", "Hernani", "Pasaia", "Hondarribia", "Andoain"],
  
  // La Rioja
  "La Rioja": ["Logroño", "Calahorra", "Arnedo", "Haro", "Alfaro", "Lardero", "Nájera", "Santo Domingo de la Calzada", "Ezcaray", "Cervera del Río Alhama"],
  
  // Ceuta y Melilla
  "Ceuta": ["Ceuta"],
  "Melilla": ["Melilla"]
};