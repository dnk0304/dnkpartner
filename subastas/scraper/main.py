"""
Main entry point for manual scraper execution
"""
import sys
from tasks import discovery_sync, pulse_check, urgent_pulse, teju_scan

def main():
    print("🚀 SubastaPro Scraper - Manual Runner")
    print("=" * 50)
    print("\nAvailable commands:")
    print("  1. discovery  - Run BOE discovery sync")
    print("  2. pulse      - Run pulse check for active auctions")
    print("  3. urgent     - Run urgent pulse (< 24h auctions)")
    print("  4. teju       - Run TEJU pre-auction scan")
    print("  5. all        - Run all scrapers sequentially")
    print()
    
    if len(sys.argv) < 2:
        print("Usage: python main.py [discovery|pulse|urgent|teju|all]")
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    if command == 'discovery':
        print("\n🔍 Running Discovery Sync...")
        result = discovery_sync()
        print(f"Result: {result}")
    
    elif command == 'pulse':
        print("\n💓 Running Pulse Check...")
        result = pulse_check()
        print(f"Result: {result}")
    
    elif command == 'urgent':
        print("\n🚨 Running Urgent Pulse...")
        result = urgent_pulse()
        print(f"Result: {result}")
    
    elif command == 'teju':
        print("\n📄 Running TEJU Scan...")
        result = teju_scan()
        print(f"Result: {result}")
    
    elif command == 'all':
        print("\n🔄 Running ALL scrapers...")
        print("\n1/4: Discovery Sync")
        discovery_sync()
        print("\n2/4: Pulse Check")
        pulse_check()
        print("\n3/4: Urgent Pulse")
        urgent_pulse()
        print("\n4/4: TEJU Scan")
        teju_scan()
        print("\n✅ All scrapers completed!")
    
    else:
        print(f"❌ Unknown command: {command}")
        sys.exit(1)

if __name__ == '__main__':
    main()
