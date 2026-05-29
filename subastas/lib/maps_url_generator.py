"""
Google Maps URL Generator - Free Implementation (No API Required)
Generates Google Maps and Street View URLs using only address/coordinates
"""

from typing import Optional, Dict
from urllib.parse import quote_plus


class GoogleMapsUrlGenerator:
    """
    Generate free Google Maps URLs without using any API.
    
    All URL formats are from publicly documented Google Maps URL schemes.
    No API key, no rate limits, no cost.
    """
    
    BASE_MAPS_URL = "https://www.google.com/maps"
    
    @staticmethod
    def generate_standard_map_url(
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        address: Optional[str] = None,
        zoom: int = 17
    ) -> str:
        """
        Generate standard Google Maps URL with marker.
        
        Args:
            latitude: Location latitude
            longitude: Location longitude
            address: Full address string
            zoom: Zoom level (1-21, default 17)
            
        Returns:
            Google Maps URL string
        """
        if latitude and longitude:
            # Format: https://www.google.com/maps/@{lat},{lng},{zoom}z
            return f"{GoogleMapsUrlGenerator.BASE_MAPS_URL}/@{latitude},{longitude},{zoom}z"
        elif address:
            # Format: https://www.google.com/maps/search/?api=1&query={address}
            encoded_address = quote_plus(address)
            return f"{GoogleMapsUrlGenerator.BASE_MAPS_URL}/search/?api=1&query={encoded_address}"
        else:
            return ""
    
    @staticmethod
    def generate_street_view_url(
        latitude: float,
        longitude: float,
        heading: int = 0,
        pitch: int = 0,
        fov: int = 90
    ) -> str:
        """
        Generate Street View URL.
        
        Args:
            latitude: Location latitude
            longitude: Location longitude
            heading: Camera heading in degrees (0-360, 0=North)
            pitch: Camera pitch in degrees (-90 to 90, 0=horizontal)
            fov: Field of view in degrees (10-100, default 90)
            
        Returns:
            Google Street View URL
        """
        if not (latitude and longitude):
            return ""
        
        # Format: https://www.google.com/maps/@{lat},{lng},3a,75y,{heading}h,{pitch}t/data=!3m6!1e1
        return (
            f"{GoogleMapsUrlGenerator.BASE_MAPS_URL}/"
            f"@{latitude},{longitude},3a,75y,{heading}h,{pitch}t/data=!3m6!1e1"
        )
    
    @staticmethod
    def generate_place_url(
        address: str,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        zoom: int = 17
    ) -> str:
        """
        Generate Place URL (best for properties with address).
        Combines address search with coordinates for most accurate result.
        
        Args:
            address: Full address string
            latitude: Optional location latitude
            longitude: Optional location longitude
            zoom: Zoom level (default 17)
            
        Returns:
            Google Maps Place URL
        """
        if not address:
            return GoogleMapsUrlGenerator.generate_standard_map_url(latitude, longitude, zoom=zoom)
        
        # Clean and encode address
        encoded_address = quote_plus(address)
        
        if latitude and longitude:
            # Format: https://www.google.com/maps/place/{address}/@{lat},{lng},{zoom}z
            return (
                f"{GoogleMapsUrlGenerator.BASE_MAPS_URL}/place/{encoded_address}/"
                f"@{latitude},{longitude},{zoom}z"
            )
        else:
            # Format: https://www.google.com/maps/place/{address}
            return f"{GoogleMapsUrlGenerator.BASE_MAPS_URL}/place/{encoded_address}"
    
    @staticmethod
    def generate_directions_url(
        latitude: float,
        longitude: float,
        address: Optional[str] = None
    ) -> str:
        """
        Generate Directions URL (opens navigation to location).
        
        Args:
            latitude: Destination latitude
            longitude: Destination longitude
            address: Optional destination address
            
        Returns:
            Google Maps Directions URL
        """
        if latitude and longitude:
            destination = f"{latitude},{longitude}"
        elif address:
            destination = quote_plus(address)
        else:
            return ""
        
        # Format: https://www.google.com/maps/dir/?api=1&destination={dest}
        return f"{GoogleMapsUrlGenerator.BASE_MAPS_URL}/dir/?api=1&destination={destination}"
    
    @staticmethod
    def build_full_address(
        address: Optional[str],
        municipality: Optional[str],
        province: Optional[str],
        postal_code: Optional[str] = None
    ) -> str:
        """
        Build a complete address string from components.
        
        Args:
            address: Street address
            municipality: Municipality/city name
            province: Province name
            postal_code: Optional postal code
            
        Returns:
            Formatted address string
        """
        parts = []
        
        if address:
            parts.append(address)
        if municipality:
            parts.append(municipality)
        if province:
            parts.append(province)
        if postal_code:
            parts.append(postal_code)
        
        parts.append("España")  # Always add country
        
        return ", ".join(parts)
    
    @staticmethod
    def generate_all_urls(
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        address: Optional[str] = None,
        municipality: Optional[str] = None,
        province: Optional[str] = None,
        postal_code: Optional[str] = None
    ) -> Dict[str, str]:
        """
        Generate all types of Google Maps URLs for an auction.
        
        Args:
            latitude: Location latitude
            longitude: Location longitude
            address: Street address
            municipality: Municipality name
            province: Province name
            postal_code: Optional postal code
            
        Returns:
            Dictionary with different URL types
        """
        full_address = GoogleMapsUrlGenerator.build_full_address(
            address, municipality, province, postal_code
        )
        
        result = {
            'searchQuery': full_address
        }
        
        # Only generate URLs if we have at least coordinates or address
        if latitude and longitude:
            result['mapUrl'] = GoogleMapsUrlGenerator.generate_standard_map_url(
                latitude, longitude, zoom=17
            )
            result['streetViewUrl'] = GoogleMapsUrlGenerator.generate_street_view_url(
                latitude, longitude
            )
            result['directionsUrl'] = GoogleMapsUrlGenerator.generate_directions_url(
                latitude, longitude
            )
        
        if full_address:
            result['placeUrl'] = GoogleMapsUrlGenerator.generate_place_url(
                full_address, latitude, longitude, zoom=17
            )
        
        return result


# Example usage
if __name__ == '__main__':
    generator = GoogleMapsUrlGenerator()
    
    # Example 1: With coordinates and address
    print("Example 1: Complete property data")
    print("="*80)
    urls = generator.generate_all_urls(
        latitude=40.4168,
        longitude=-3.7038,
        address="Calle Mayor 1",
        municipality="Madrid",
        province="Madrid",
        postal_code="28013"
    )
    for url_type, url in urls.items():
        print(f"{url_type}: {url}")
    
    print("\n" + "="*80 + "\n")
    
    # Example 2: Only coordinates
    print("Example 2: Only coordinates (no address)")
    print("="*80)
    urls = generator.generate_all_urls(
        latitude=41.3851,
        longitude=2.1734
    )
    for url_type, url in urls.items():
        if url:  # Only print non-empty URLs
            print(f"{url_type}: {url}")
    
    print("\n" + "="*80 + "\n")
    
    # Example 3: Only address (no coordinates)
    print("Example 3: Only address (no coordinates)")
    print("="*80)
    urls = generator.generate_all_urls(
        address="Plaza España",
        municipality="Sevilla",
        province="Sevilla"
    )
    for url_type, url in urls.items():
        if url:
            print(f"{url_type}: {url}")
