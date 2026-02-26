FROM node:20-bookworm-slim

# Install necessary OS dependencies and tools
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy the configuration files
COPY package*.json ./
COPY scraper-api/package*.json ./scraper-api/
COPY api-docs/package*.json ./api-docs/
COPY aliseda-scraper/package*.json ./aliseda-scraper/
COPY altamira-scraper/package*.json ./altamira-scraper/
COPY fotocasa-scraper/package*.json ./fotocasa-scraper/
COPY idealista-scraper/package*.json ./idealista-scraper/
COPY solvia-scraper/package*.json ./solvia-scraper/

# Install dependencies for all projects
# The postinstall script in the root package.json will run automatically and install sub-dependencies
RUN npm install

# Install Playwright dependencies and browsers (specifically chromium)
RUN npx playwright install --with-deps chromium

# Copy the rest of the application code
COPY . .

# Build API docs
RUN npm run build

# Expose the port where the API listens
EXPOSE 3000

# Start the API server
CMD ["npm", "start"]
