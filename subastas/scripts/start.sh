#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo ""
echo "============================================================"
echo -e "${BOLD}${CYAN}  🚀 SubastaPro - Master Startup Script${NC}"
echo "============================================================"
echo ""

# Step 1: Check Docker
echo -e "${BOLD}${BLUE}Step 1: Checking Docker...${NC}"
if ! docker ps > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running!${NC}"
    echo -e "${YELLOW}Please start Docker Desktop and try again.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# Step 2: Start Docker Compose
echo ""
echo -e "${BOLD}${BLUE}Step 2: Starting database services...${NC}"
docker compose up -d
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 5

# Step 3: Setup database
echo ""
echo -e "${BOLD}${BLUE}Step 3: Setting up database...${NC}"
if [ ! -d "prisma/migrations" ] || [ -z "$(ls -A prisma/migrations)" ]; then
    echo -e "${CYAN}▶ Creating database schema...${NC}"
    npx prisma migrate dev --name init
    
    echo -e "${CYAN}▶ Seeding database...${NC}"
    npm run seed
else
    echo -e "${GREEN}✓ Database already configured${NC}"
    echo -e "${YELLOW}(Run 'npx prisma migrate reset' to reset database)${NC}"
fi

# Step 4: Generate Prisma Client
echo ""
echo -e "${BOLD}${BLUE}Step 4: Generating Prisma Client...${NC}"
npx prisma generate

# Step 5: Build or Dev
if [ "$1" == "--dev" ]; then
    echo ""
    echo "============================================================"
    echo -e "${BOLD}${GREEN}✅ Setup Complete! Starting in DEV mode...${NC}"
    echo "============================================================"
    echo ""
    echo -e "${CYAN}🌐 Opening: http://localhost:3000${NC}"
    echo -e "${CYAN}📊 Database: http://localhost:5555 (run 'npx prisma studio')${NC}"
    echo ""
    npm run dev
else
    echo ""
    echo -e "${BOLD}${BLUE}Step 5: Building application...${NC}"
    npm run build
    
    echo ""
    echo "============================================================"
    echo -e "${BOLD}${GREEN}✅ Setup Complete! Starting in PRODUCTION mode...${NC}"
    echo "============================================================"
    echo ""
    echo -e "${CYAN}🌐 Opening: http://localhost:3000${NC}"
    echo -e "${CYAN}📊 Database: http://localhost:5555 (run 'npx prisma studio')${NC}"
    echo ""
    npm start
fi
