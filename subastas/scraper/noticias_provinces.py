#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
noticias_provinces.py — canonical DB-province-key -> (slug, display label) map
for the monthly noticias job (Forge, 2026-07-20).

GENERATED to match src/lib/seo/slugs.ts buildProvinceSlug() + src/lib/
spain-provinces.ts SPAIN_PROVINCES EXACTLY (52 canonical provinces). The slug
MUST equal PROVINCE_DB_KEY_TO_SLUG so NoticiaMonthly.province resolves against
the Next /noticias/[provincia] route. If SPAIN_PROVINCES or the slug overrides
change, regenerate this (the node one-liner that built it is in the Forge LOG).

  key   = Auction.province value in the DB (some Basque provinces use their
          native spelling, e.g. 'Gipuzkoa' / 'Bizkaia').
  slug  = canonical province slug (route segment).
  label = display name for the prose ({provincia} placeholder).
"""

# key -> (slug, label)
PROVINCE_KEY_TO_SLUG_LABEL = {
    "A Coruña": ("a-coruna", "A Coruña"),
    "Álava": ("araba-alava", "Álava"),
    "Albacete": ("albacete", "Albacete"),
    "Alicante": ("alicante", "Alicante"),
    "Almería": ("almeria", "Almería"),
    "Asturias": ("asturias", "Asturias"),
    "Ávila": ("avila", "Ávila"),
    "Badajoz": ("badajoz", "Badajoz"),
    "Barcelona": ("barcelona", "Barcelona"),
    "Burgos": ("burgos", "Burgos"),
    "Cáceres": ("caceres", "Cáceres"),
    "Cádiz": ("cadiz", "Cádiz"),
    "Cantabria": ("cantabria", "Cantabria"),
    "Castellón": ("castellon", "Castellón"),
    "Ceuta": ("ceuta", "Ceuta"),
    "Ciudad Real": ("ciudad-real", "Ciudad Real"),
    "Córdoba": ("cordoba", "Córdoba"),
    "Cuenca": ("cuenca", "Cuenca"),
    "Girona": ("girona", "Girona"),
    "Granada": ("granada", "Granada"),
    "Guadalajara": ("guadalajara", "Guadalajara"),
    "Gipuzkoa": ("gipuzkoa", "Guipúzcoa"),
    "Huelva": ("huelva", "Huelva"),
    "Huesca": ("huesca", "Huesca"),
    "Illes Balears": ("baleares", "Illes Balears"),
    "Jaén": ("jaen", "Jaén"),
    "León": ("leon", "León"),
    "Lleida": ("lleida", "Lleida"),
    "Lugo": ("lugo", "Lugo"),
    "Madrid": ("madrid", "Madrid"),
    "Málaga": ("malaga", "Málaga"),
    "Melilla": ("melilla", "Melilla"),
    "Murcia": ("murcia", "Murcia"),
    "Navarra": ("navarra", "Navarra"),
    "Ourense": ("ourense", "Ourense"),
    "Palencia": ("palencia", "Palencia"),
    "Las Palmas": ("las-palmas", "Las Palmas"),
    "Pontevedra": ("pontevedra", "Pontevedra"),
    "La Rioja": ("la-rioja", "La Rioja"),
    "Salamanca": ("salamanca", "Salamanca"),
    "Segovia": ("segovia", "Segovia"),
    "Sevilla": ("sevilla", "Sevilla"),
    "Soria": ("soria", "Soria"),
    "Tarragona": ("tarragona", "Tarragona"),
    "Santa Cruz de Tenerife": ("santa-cruz-de-tenerife", "Santa Cruz de Tenerife"),
    "Teruel": ("teruel", "Teruel"),
    "Toledo": ("toledo", "Toledo"),
    "Valencia": ("valencia", "Valencia"),
    "Valladolid": ("valladolid", "Valladolid"),
    "Bizkaia": ("bizkaia", "Vizcaya"),
    "Zamora": ("zamora", "Zamora"),
    "Zaragoza": ("zaragoza", "Zaragoza"),
}

# Ordered list of canonical DB keys (52).
PROVINCE_KEYS = list(PROVINCE_KEY_TO_SLUG_LABEL.keys())
