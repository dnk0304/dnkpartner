"""
Categories Module
Official BOE auction categories and classification utilities
"""

# Official BOE category mappings
CATEGORIES = {
    'real_estate': {
        'name': 'Inmuebles',
        'subcategories': [
            'Viviendas',
            'Garajes',
            'Locales',
            'Terrenos',
            'Fincas rústicas',
            'Otros inmuebles',
            'Naves industriales',
            'Oficinas',
            'Trasteros',
        ],
        'keywords': [
            'vivienda', 'piso', 'apartamento', 'ático', 'casa', 'chalet', 'dúplex',
            'garaje', 'parking', 'plaza', 'cochera',
            'local', 'comercial', 'tienda', 'establecimiento',
            'terreno', 'solar', 'parcela', 'suelo',
            'finca', 'rústica', 'agrícola', 'rural',
            'nave', 'industrial', 'almacén',
            'oficina', 'despacho',
            'trastero', 'bodega',
        ]
    },
    'vehicles': {
        'name': 'Vehículos',
        'subcategories': [
            'Turismos',
            'Motocicletas',
            'Camiones',
            'Barcos',
            'Aeronaves',
            'Otros vehículos',
        ],
        'keywords': [
            'coche', 'turismo', 'vehículo', 'automóvil', 'auto',
            'moto', 'motocicleta', 'ciclomotor', 'scooter',
            'camión', 'furgoneta', 'trailer', 'remolque',
            'barco', 'embarcación', 'yate', 'lancha', 'velero', 'navío',
            'aeronave', 'avión', 'avioneta', 'helicóptero',
            'bmw', 'mercedes', 'audi', 'volkswagen', 'seat', 'renault',
        ]
    },
    'movable': {
        'name': 'Bienes muebles',
        'subcategories': [
            'Joyas',
            'Maquinaria',
            'Mobiliario',
            'Otros bienes muebles',
            'Arte y antigüedades',
            'Electrónica',
        ],
        'keywords': [
            'joya', 'oro', 'plata', 'diamante', 'reloj', 'sortija', 'anillo',
            'maquinaria', 'herramienta', 'equipo', 'máquina',
            'mobiliario', 'muebles', 'silla', 'mesa', 'armario',
            'arte', 'cuadro', 'pintura', 'escultura', 'antigüedad',
            'electrónica', 'ordenador', 'televisión', 'móvil',
        ]
    },
    'rights': {
        'name': 'Derechos',
        'subcategories': [
            'Derechos de crédito',
            'Derechos reales',
            'Participaciones sociales',
            'Otros derechos',
        ],
        'keywords': [
            'crédito', 'préstamo', 'deuda',
            'usufructo', 'servidumbre', 'hipoteca',
            'participación', 'acción', 'título', 'valor',
        ]
    },
}


def get_category_type(title: str, description: str = '') -> str:
    """
    Classify auction into a category based on title and description
    Returns the most specific subcategory found
    """
    text = f"{title} {description}".lower()
    
    # Priority order: real estate > vehicles > movable > rights
    # Real estate subcategories
    if any(kw in text for kw in ['vivienda', 'piso', 'apartamento', 'ático', 'casa', 'chalet', 'dúplex']):
        return 'Viviendas'
    elif any(kw in text for kw in ['garaje', 'parking', 'plaza', 'cochera']):
        return 'Garajes'
    elif any(kw in text for kw in ['local', 'comercial', 'tienda', 'establecimiento']):
        return 'Locales'
    elif any(kw in text for kw in ['terreno', 'solar', 'parcela', 'suelo']):
        return 'Terrenos'
    elif any(kw in text for kw in ['finca', 'rústica', 'agrícola', 'rural']):
        return 'Fincas rústicas'
    elif any(kw in text for kw in ['nave', 'industrial', 'almacén']):
        return 'Naves industriales'
    elif any(kw in text for kw in ['oficina', 'despacho']):
        return 'Oficinas'
    elif any(kw in text for kw in ['trastero', 'bodega']):
        return 'Trasteros'
    
    # Vehicle subcategories
    elif any(kw in text for kw in ['coche', 'turismo', 'vehículo', 'automóvil', 'auto', 'bmw', 'mercedes', 'audi']):
        return 'Turismos'
    elif any(kw in text for kw in ['moto', 'motocicleta', 'ciclomotor', 'scooter']):
        return 'Motocicletas'
    elif any(kw in text for kw in ['camión', 'furgoneta', 'trailer', 'remolque']):
        return 'Camiones'
    elif any(kw in text for kw in ['barco', 'embarcación', 'yate', 'lancha', 'velero']):
        return 'Barcos'
    elif any(kw in text for kw in ['aeronave', 'avión', 'avioneta', 'helicóptero']):
        return 'Aeronaves'
    
    # Movable property subcategories
    elif any(kw in text for kw in ['joya', 'oro', 'plata', 'diamante', 'reloj', 'sortija']):
        return 'Joyas'
    elif any(kw in text for kw in ['maquinaria', 'herramienta', 'equipo', 'máquina']):
        return 'Maquinaria'
    elif any(kw in text for kw in ['mobiliario', 'muebles', 'silla', 'mesa']):
        return 'Mobiliario'
    elif any(kw in text for kw in ['arte', 'cuadro', 'pintura', 'escultura', 'antigüedad']):
        return 'Arte y antigüedades'
    elif any(kw in text for kw in ['electrónica', 'ordenador', 'televisión', 'móvil']):
        return 'Electrónica'
    
    # Rights subcategories
    elif any(kw in text for kw in ['crédito', 'préstamo', 'deuda']):
        return 'Derechos de crédito'
    elif any(kw in text for kw in ['participación', 'acción', 'título', 'valor']):
        return 'Participaciones sociales'
    elif any(kw in text for kw in ['usufructo', 'servidumbre']):
        return 'Derechos reales'
    
    # Default fallback
    return 'Otros inmuebles'


def get_main_category(subcategory: str) -> str:
    """Get the main category for a subcategory"""
    for main_cat, data in CATEGORIES.items():
        if subcategory in data['subcategories']:
            return data['name']
    return 'Inmuebles'


def get_all_subcategories() -> list:
    """Get all available subcategories"""
    all_subs = []
    for data in CATEGORIES.values():
        all_subs.extend(data['subcategories'])
    return all_subs
