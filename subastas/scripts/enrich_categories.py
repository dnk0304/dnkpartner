#!/usr/bin/env python3
"""
Category enrichment script
Converts generic 'Subasta' categories to proper categories based on title keywords
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / 'data' / 'database' / 'prod.db'

def detect_category(title):
    if not title:
        return 'Otros inmuebles'
    
    text = title.lower()
    
    # Vehicles
    if any(w in text for w in ['turismo', 'vehículo', 'coche', 'automóvil', 'furgoneta', 'camión']):
        return 'Turismos'
    if any(w in text for w in ['moto', 'motocicleta', 'ciclomotor', 'scooter']):
        return 'Motocicletas'
    if any(w in text for w in ['barco', 'embarcación', 'yate', 'lancha', 'velero']):
        return 'Embarcaciones'
    
    # Properties
    if any(w in text for w in ['piso', 'vivienda', 'apartamento', 'ático', 'casa', 'chalet', 'dúplex', 'adosado']):
        return 'Viviendas'
    if any(w in text for w in ['local comercial', 'local', 'oficina', 'bajo comercial', 'comercio']):
        return 'Locales'
    if any(w in text for w in ['garaje', 'parking', 'plaza de garaje', 'aparcamiento', 'cochera']):
        return 'Garajes'
    if any(w in text for w in ['nave industrial', 'nave', 'almacén', 'bodega', 'industrial']):
        return 'Naves industriales'
    if any(w in text for w in ['terreno', 'parcela', 'solar', 'suelo']):
        return 'Terrenos'
    if any(w in text for w in ['finca rústica', 'finca', 'agrícola', 'rústica', 'rural']):
        return 'Fincas rústicas'
    if any(w in text for w in ['trastero', 'cuarto']):
        return 'Trasteros'
    
    return 'Otros inmuebles'

def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Get auctions with generic category
    cur.execute("SELECT id, title FROM Auction WHERE category = 'Subasta' OR category IS NULL")
    auctions = cur.fetchall()
    print(f'Found {len(auctions)} auctions to enrich')
    
    updated = 0
    for auction_id, title in auctions:
        if not title:
            continue
        category = detect_category(title)
        if category != 'Subasta':
            cur.execute('UPDATE Auction SET category = ? WHERE id = ?', (category, auction_id))
            updated += 1
    
    conn.commit()
    print(f'Enriched {updated} auctions')
    
    # Show new distribution
    cur.execute('SELECT category, COUNT(*) FROM Auction GROUP BY category ORDER BY COUNT(*) DESC')
    print('Category distribution:')
    for cat, count in cur.fetchall():
        print(f'  {cat}: {count}')
    
    conn.close()

if __name__ == '__main__':
    main()
