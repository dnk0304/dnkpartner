"""
Database Module
Unified database adapter supporting SQLite and PostgreSQL
"""

from .adapter import DatabaseAdapter, get_database_adapter
from .models import AuctionModel, AuctionStatus
from .queries import AuctionQueries

__all__ = [
    'DatabaseAdapter',
    'get_database_adapter',
    'AuctionModel',
    'AuctionStatus',
    'AuctionQueries',
]
