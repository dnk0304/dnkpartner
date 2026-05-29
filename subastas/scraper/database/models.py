"""
Models Module
Data classes for auctions and related entities
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from enum import Enum


class AuctionStatus(Enum):
    """Auction status enum"""
    PRE_AUCTION = 'PRE_AUCTION'  # Found in TEJU/Sede but not yet on BOE
    ACTIVE = 'ACTIVE'            # Live on BOE Portal
    FINISHED = 'FINISHED'        # Auction completed
    SUSPENDED = 'SUSPENDED'      # Temporarily halted
    CANCELLED = 'CANCELLED'      # Court cancelled
    TEJU = 'TEJU'               # Legacy status for pre-auction


@dataclass
class AuctionModel:
    """
    Auction data model
    Represents a single auction from any source
    """
    boe_id: str
    title: str
    category: str
    province: str
    status: str  # Use AuctionStatus enum values
    source: str  # BOE, TEJU, SEDE, REGISTRO, BORME
    appraisal_value: float
    published_at: datetime
    ends_at: Optional[datetime] = None
    
    # Optional fields
    municipality: Optional[str] = None
    current_bid: Optional[float] = None
    minimum_bid: Optional[float] = None
    court_name: Optional[str] = None
    court_reference: Optional[str] = None
    procedure_number: Optional[str] = None
    boe_link: Optional[str] = None
    edict_url: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    pdf_url: Optional[str] = None
    image_url: Optional[str] = None
    boe_announcement: Optional[str] = None
    lot_description: Optional[str] = None
    property_description: Optional[str] = None
    charges_detail: Optional[str] = None
    auction_type: Optional[str] = None
    
    # Metadata
    created_at: Optional[datetime] = field(default_factory=datetime.now)
    updated_at: Optional[datetime] = field(default_factory=datetime.now)
    
    def to_dict(self) -> dict:
        """Convert to dictionary for database insertion"""
        return {
            'boe_id': self.boe_id,
            'title': self.title,
            'category': self.category,
            'province': self.province,
            'municipality': self.municipality,
            'status': self.status,
            'source': self.source,
            'appraisal_value': self.appraisal_value,
            'current_bid': self.current_bid,
            'minimum_bid': self.minimum_bid,
            'court_name': self.court_name,
            'court_reference': self.court_reference,
            'procedure_number': self.procedure_number,
            'boe_link': self.boe_link,
            'edict_url': self.edict_url,
            'published_at': self.published_at,
            'ends_at': self.ends_at,
            'address': self.address,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'pdf_url': self.pdf_url,
            'image_url': self.image_url,
            'boe_announcement': self.boe_announcement,
            'lot_description': self.lot_description,
            'property_description': self.property_description,
            'charges_detail': self.charges_detail,
            'auction_type': self.auction_type,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'AuctionModel':
        """Create AuctionModel from dictionary"""
        return cls(
            boe_id=data['boe_id'],
            title=data['title'],
            category=data['category'],
            province=data['province'],
            status=data['status'],
            source=data.get('source', 'BOE'),
            appraisal_value=data['appraisal_value'],
            published_at=data['published_at'],
            ends_at=data.get('ends_at'),
            municipality=data.get('municipality'),
            current_bid=data.get('current_bid'),
            minimum_bid=data.get('minimum_bid'),
            court_name=data.get('court_name'),
            court_reference=data.get('court_reference'),
            procedure_number=data.get('procedure_number'),
            boe_link=data.get('boe_link'),
            edict_url=data.get('edict_url'),
            address=data.get('address'),
            latitude=data.get('latitude'),
            longitude=data.get('longitude'),
            pdf_url=data.get('pdf_url'),
            image_url=data.get('image_url'),
            boe_announcement=data.get('boe_announcement'),
            lot_description=data.get('lot_description'),
            property_description=data.get('property_description'),
            charges_detail=data.get('charges_detail'),
            auction_type=data.get('auction_type'),
            created_at=data.get('created_at', datetime.now()),
            updated_at=data.get('updated_at', datetime.now()),
        )
    
    def is_valid(self) -> bool:
        """Validate required fields"""
        return all([
            self.boe_id,
            self.title,
            self.category,
            self.province,
            self.status,
            self.source,
            self.appraisal_value is not None,
        ])
