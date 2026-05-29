"""
Normalization Service
Centralized service for normalizing auction data from all sources into a standard format
"""

import re
from typing import Dict, Any, Optional
from datetime import datetime
from database.models import AuctionModel, AuctionStatus
import logging

logger = logging.getLogger(__name__)


class NormalizationService:
    """
    Centralized normalization service for all auction data sources
    Converts raw data from BOE, Banks, TEJU into standard AuctionModel
    """
    
    # Spanish month names for date parsing
    SPANISH_MONTHS = {
        'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
        'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
        'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12,
    }
    
    def normalize_auction_item(self, raw_data: Dict[str, Any], source_type: str) -> Optional[AuctionModel]:
        """
        Main entry point for normalization
        
        Args:
            raw_data: Raw auction data from scraper
            source_type: Source identifier (BOE, SERVIHABITAT, HAYA, etc.)
        
        Returns:
            AuctionModel or None if normalization fails
        """
        try:
            # Normalize based on source type
            if source_type == 'BOE':
                return self._normalize_boe(raw_data)
            elif source_type in ['SERVIHABITAT', 'HAYA', 'ALTAMIRA', 'SOLVIA']:
                return self._normalize_bank(raw_data, source_type)
            elif source_type == 'TEJU':
                return self._normalize_teju(raw_data)
            else:
                logger.warning(f"Unknown source type: {source_type}")
                return self._normalize_generic(raw_data, source_type)
        
        except Exception as e:
            logger.error(f"Normalization failed for {source_type}: {e}")
            return None
    
    def map_status(self, source_status: str, source_type: str) -> str:
        """
        Map source-specific status to internal status enum
        
        Args:
            source_status: Status string from source
            source_type: Source identifier
        
        Returns:
            Normalized status (ACTIVE, PRE_AUCTION, FINISHED, etc.)
        """
        status_lower = source_status.lower()
        
        # BOE status mapping
        if source_type == 'BOE':
            if 'celebrándose' in status_lower or 'activa' in status_lower:
                return AuctionStatus.ACTIVE.value
            elif 'suspendida' in status_lower:
                return AuctionStatus.SUSPENDED.value
            elif 'finalizada' in status_lower or 'cerrada' in status_lower:
                return AuctionStatus.FINISHED.value
            elif 'cancelada' in status_lower:
                return AuctionStatus.CANCELLED.value
        
        # TEJU/Pre-auction sources
        if source_type in ['TEJU', 'SEDE']:
            return AuctionStatus.PRE_AUCTION.value
        
        # Bank sources (always active unless specified)
        if source_type in ['SERVIHABITAT', 'HAYA', 'ALTAMIRA']:
            if 'vendida' in status_lower or 'reservada' in status_lower:
                return AuctionStatus.FINISHED.value
            return AuctionStatus.ACTIVE.value
        
        # Default
        return AuctionStatus.ACTIVE.value
    
    def clean_currency(self, value_str: Any) -> float:
        """
        Parse European currency format to float
        
        Examples:
            "150.000,50 €" -> 150000.50
            "1.234.567,89€" -> 1234567.89
            "85000" -> 85000.0
        
        Args:
            value_str: Currency string or number
        
        Returns:
            Float value
        """
        if isinstance(value_str, (int, float)):
            return float(value_str)
        
        if not isinstance(value_str, str):
            return 0.0
        
        # Remove currency symbols and spaces
        cleaned = value_str.replace('€', '').replace('EUR', '').strip()
        
        # Handle European format: 1.000.000,50 -> 1000000.50
        # Remove thousands separators (.)
        cleaned = cleaned.replace('.', '')
        # Replace decimal comma with dot
        cleaned = cleaned.replace(',', '.')
        
        try:
            return float(cleaned)
        except ValueError:
            logger.warning(f"Could not parse currency: {value_str}")
            return 0.0
    
    def parse_spanish_date(self, date_str: str) -> Optional[datetime]:
        """
        Parse Spanish date format to datetime
        
        Examples:
            "28 de Enero de 2024" -> datetime(2024, 1, 28)
            "15/03/2024" -> datetime(2024, 3, 15)
            "2024-01-28T10:00:00Z" -> datetime(2024, 1, 28, 10, 0, 0)
        
        Args:
            date_str: Date string
        
        Returns:
            datetime object or None
        """
        if not date_str:
            return None
        
        date_str = date_str.strip()
        
        # Try ISO format first
        try:
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        except:
            pass
        
        # Try European date format (DD/MM/YYYY)
        try:
            return datetime.strptime(date_str, '%d/%m/%Y')
        except:
            pass
        
        # Try Spanish long format: "28 de Enero de 2024"
        try:
            match = re.match(r'(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})', date_str, re.IGNORECASE)
            if match:
                day = int(match.group(1))
                month_name = match.group(2).lower()
                year = int(match.group(3))
                
                month = self.SPANISH_MONTHS.get(month_name)
                if month:
                    return datetime(year, month, day)
        except:
            pass
        
        # Try YYYY-MM-DD
        try:
            return datetime.strptime(date_str, '%Y-%m-%d')
        except:
            pass
        
        logger.warning(f"Could not parse date: {date_str}")
        return None
    
    def infer_category(self, title: str, description: str = "") -> str:
        """
        Infer category from title and description using keyword matching
        
        Args:
            title: Property title
            description: Property description
        
        Returns:
            Category string
        """
        text = (title + " " + description).lower()
        
        # Real Estate
        if any(word in text for word in ['vivienda', 'piso', 'apartamento', 'casa', 'ático']):
            return 'Viviendas'
        if any(word in text for word in ['garaje', 'parking', 'plaza de garaje']):
            return 'Garajes'
        if any(word in text for word in ['local', 'comercial', 'tienda', 'oficina']):
            return 'Locales'
        if any(word in text for word in ['nave industrial', 'nave']):
            return 'Naves industriales'
        if any(word in text for word in ['terreno', 'solar', 'parcela']):
            return 'Terrenos'
        if any(word in text for word in ['finca rústica', 'finca', 'rural']):
            return 'Fincas rústicas'
        if 'trastero' in text:
            return 'Trasteros'
        
        # Vehicles
        if any(word in text for word in ['turismo', 'coche', 'vehículo', 'automóvil']):
            return 'Turismos'
        if 'motocicleta' in text or 'moto' in text:
            return 'Motocicletas'
        if any(word in text for word in ['camión', 'furgoneta', 'industrial']):
            return 'Vehículos Industriales'
        
        return 'Otros inmuebles'
    
    # Source-specific normalizers
    
    def _normalize_boe(self, raw_data: Dict) -> AuctionModel:
        """Normalize BOE data"""
        return AuctionModel(
            boe_id=raw_data['boe_id'],
            title=raw_data['title'].strip(),
            category=raw_data.get('category', self.infer_category(raw_data['title'])),
            province=raw_data['province'],
            status=self.map_status(raw_data.get('status', 'ACTIVE'), 'BOE'),
            source='BOE',
            appraisal_value=self.clean_currency(raw_data['appraisal_value']),
            published_at=raw_data.get('published_at', datetime.now()),
            ends_at=raw_data.get('ends_at'),
            municipality=raw_data.get('municipality'),
            current_bid=self.clean_currency(raw_data['current_bid']) if raw_data.get('current_bid') else None,
            minimum_bid=self.clean_currency(raw_data['minimum_bid']) if raw_data.get('minimum_bid') else None,
            court_name=raw_data.get('court_name'),
            court_reference=raw_data.get('court_reference'),
            procedure_number=raw_data.get('procedure_number'),
            boe_link=raw_data.get('boe_link'),
            edict_url=raw_data.get('edict_url'),
            address=raw_data.get('address'),
            latitude=raw_data.get('latitude'),
            longitude=raw_data.get('longitude'),
            pdf_url=raw_data.get('pdf_url'),
            image_url=raw_data.get('image_url'),
        )
    
    def _normalize_bank(self, raw_data: Dict, source_type: str) -> AuctionModel:
        """Normalize bank portal data"""
        return AuctionModel(
            boe_id=raw_data['boe_id'],
            title=raw_data['title'].strip(),
            category=raw_data.get('category', self.infer_category(raw_data['title'])),
            province=raw_data['province'],
            status=self.map_status(raw_data.get('status', 'ACTIVE'), source_type),
            source=source_type,
            appraisal_value=self.clean_currency(raw_data['appraisal_value']),
            published_at=raw_data.get('published_at', datetime.now()),
            ends_at=raw_data.get('ends_at'),
            municipality=raw_data.get('municipality'),
            current_bid=None,  # Banks don't use bidding
            minimum_bid=self.clean_currency(raw_data.get('minimum_bid', raw_data['appraisal_value'])),
            boe_link=raw_data.get('boe_link'),  # This is actually bank URL
            address=raw_data.get('address'),
            latitude=raw_data.get('latitude'),
            longitude=raw_data.get('longitude'),
            image_url=raw_data.get('image_url'),
        )
    
    def _normalize_teju(self, raw_data: Dict) -> AuctionModel:
        """Normalize TEJU pre-auction data"""
        return AuctionModel(
            boe_id=raw_data['boe_id'],
            title=raw_data['title'].strip(),
            category=raw_data.get('category', self.infer_category(raw_data['title'])),
            province=raw_data['province'],
            status=AuctionStatus.PRE_AUCTION.value,
            source='TEJU',
            appraisal_value=self.clean_currency(raw_data.get('appraisal_value', 0)),
            published_at=raw_data.get('published_at', datetime.now()),
            municipality=raw_data.get('municipality'),
            court_name=raw_data.get('court_name'),
            procedure_number=raw_data.get('procedure_number'),
            edict_url=raw_data.get('edict_url'),
            pdf_url=raw_data.get('pdf_url'),
            address=raw_data.get('address'),
        )
    
    def _normalize_generic(self, raw_data: Dict, source_type: str) -> AuctionModel:
        """Generic fallback normalizer"""
        return AuctionModel(
            boe_id=raw_data['boe_id'],
            title=raw_data['title'].strip(),
            category=raw_data.get('category', 'Otros inmuebles'),
            province=raw_data['province'],
            status=raw_data.get('status', 'ACTIVE'),
            source=source_type,
            appraisal_value=self.clean_currency(raw_data.get('appraisal_value', 0)),
            published_at=raw_data.get('published_at', datetime.now()),
        )
