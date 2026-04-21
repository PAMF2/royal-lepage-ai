# IDX Website

Next.js property search portal with live MLS listings. Lead capture funnel for the Royal LePage platform.

## What It Does

The IDX website is a public-facing property search engine that:

1. **Displays live MLS listings** — Pulls from IDX/CREA DDF or SimplyRETS API
2. **Search & filter** — By city, price range, property type, beds/baths
3. **Captures leads** — Forms at property detail pages and homepage
4. **Integrates with GHL** — New lead form submissions create contacts automatically
5. **Drives qualification** — Lead captures include budget, timeline, interest indicators

Result: Brokers get pre-qualified leads from their website, AI agent qualifies further.

## Environment Variables

Required:
- `IDX_API_KEY` — IDX provider API key
- `IDX_API_SECRET` — IDX provider secret
- `GHL_API_KEY` — GoHighLevel API key for lead creation
- `GHL_LOCATION_ID` — Your GHL location

Optional:
- `IDX_PROVIDER` — "crea_ddf" (Canada) or "simplyrets" (US), default: crea_ddf
- `IDX_FEED_URL` — Custom IDX feed endpoint (if not standard)

## Running Locally

```bash
cd idx-website
npm install
npm run dev
```

Opens on http://localhost:3000

## Building & Deployment

```bash
npm run build
npm start
```

Serves on port 3000 by default.

## Key Pages

### `/` — Home Page

**Hero section:**
- Search bar with city input
- CTA: "Find Your Next Home"

**Featured listings:**
- Grid of 6-12 recent listings
- Card shows: photo, address, price, beds/baths, days on market

**Lead capture form:**
- Name, email, phone
- "Get matched with listings" newsletter signup
- Submits to GHL as new contact with source="website"

### `/listings` — Listings Search

Searchable listings table:

**Filters:**
- City / neighborhood
- Price range (min/max)
- Property type (house, condo, townhouse)
- Beds / baths
- New listing (last 7 days)

**Display:**
- Sortable table: address, price, beds, baths, days on market
- Click row → detail page

### `/listings/[mlsId]` — Property Detail

Single listing page:

**Info:**
- Full address, MLS #
- Price, property type, beds/baths, sqft
- Description, features
- Days on market, list date, price history

**Photo gallery** — Carousel of listing photos

**Lead capture:**
- "I'm interested in this property"
- Form: name, email, phone, "I'm a buyer/seller/investor"
- Pre-fills city, budget with listing price
- Submits to GHL + enrolls in campaign

**Agent info:**
- Agent name, phone, photo
- "Schedule a showing" button (optional, integrates with showings-mcp)

## Components

- `SearchBar.tsx` — City input + search button
- `ListingCard.tsx` — Compact listing preview
- `ListingGrid.tsx` — Grid of listing cards
- `LeadCaptureForm.tsx` — Email signup / lead form

## Lead Capture Workflow

1. User fills form on homepage or listing detail
2. Frontend POSTs to `/api/leads`
3. Backend:
   - Creates contact in GHL
   - Sets source = "website" or "listing-detail"
   - Adds tags: "website-lead", property interest tags
   - Stores listing interest in custom field (if applicable)
4. GHL fires ContactCreated webhook → Orchestrator processes

## API Routes

### `POST /api/leads`

Create a lead from website form.

**Request:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+12125551234",
  "interested_in": "buyer",
  "listing_mls_id": "abc123",
  "listing_price": 500000,
  "listing_city": "Toronto"
}
```

**Response:**
```json
{
  "success": true,
  "contactId": "contact_xyz789"
}
```

### `GET /api/listings`

Search listings (calls IDX provider).

**Query params:**
- `city` — City name
- `minPrice` — Minimum price
- `maxPrice` — Maximum price
- `beds` — Number of bedrooms
- `baths` — Number of bathrooms
- `type` — Property type (house, condo, etc.)
- `limit` — Results per page (default: 20)
- `offset` — Pagination offset (default: 0)

**Response:**
```json
{
  "total": 1234,
  "listings": [
    {
      "mlsId": "abc123",
      "address": "123 Main St, Toronto, ON",
      "price": 500000,
      "beds": 3,
      "baths": 2,
      "sqft": 1800,
      "daysOnMarket": 12,
      "photos": ["url1", "url2"],
      "type": "house"
    }
  ]
}
```

### `GET /api/listings/:mlsId`

Get single listing detail.

**Response:**
```json
{
  "mlsId": "abc123",
  "address": "123 Main St, Toronto, ON",
  "price": 500000,
  "beds": 3,
  "baths": 2,
  "sqft": 1800,
  "daysOnMarket": 12,
  "listDate": "2024-03-15",
  "description": "Beautiful home in quiet neighborhood...",
  "features": ["pool", "garage", "updated kitchen"],
  "photos": ["url1", "url2", "url3"],
  "type": "house",
  "agentName": "Jane Smith",
  "agentPhone": "+12125556789"
}
```

## Integration with IDX Providers

### CREA DDF (Canada)

Setup:
1. Apply at crea.ca/data-feed for DDF access
2. Get API key and secret
3. Set `IDX_PROVIDER=crea_ddf`

Request format:
```
GET https://api.crea.ca/listings
Authorization: Bearer {token}
```

### SimplyRETS (US)

Setup:
1. Sign up at simplyrets.com
2. Get API key/secret
3. Set `IDX_PROVIDER=simplyrets`

Request format:
```
GET https://api.simplyrets.com/properties
Authorization: Basic {base64(key:secret)}
```

## Code Structure

- `src/app/page.tsx` — Home page with hero + featured listings + lead capture
- `src/app/listings/page.tsx` — Listings search with filters
- `src/app/listings/[mlsId]/page.tsx` — Single listing detail
- `src/app/api/leads/route.ts` — Lead capture endpoint
- `src/app/api/listings/route.ts` — Listings search endpoint
- `src/app/layout.tsx` — Root layout, Royal LePage branding
- `src/components/SearchBar.tsx` — City search input
- `src/components/ListingCard.tsx` — Compact listing preview
- `src/components/ListingGrid.tsx` — Grid layout for listings
- `src/components/LeadCaptureForm.tsx` — Email/lead form

## Styling

Uses Tailwind CSS with Royal LePage brand colors:
- Red: #C8102E (CTA buttons, hero)
- Gray: #374151 (text, borders)
- White: #ffffff (backgrounds)

Responsive design: mobile-first, breakpoints at 768px (md) and 1024px (lg).

## Lead Capture Strategy

**Homepage:** Quick email signup for "new listings matching your criteria"
- Low friction: just name/email
- Enrolls in 7-day nurture campaign
- Agent/AI reaches out within 24h

**Listing detail:** Interested buyer form
- Medium friction: name, email, phone, "I'm a buyer"
- Pre-fills city + sets budget = listing price
- Triggers immediate agent notification
- Orchestrator sends personalized SMS within 60s

## Performance

- Homepage load: <1s (static content + recent listings cached)
- Listings search: <500ms (IDX API call)
- Detail page: <300ms (cached listing data)

For 100k+ listings, implement:
- Redis caching (hourly refresh)
- Pagination (20 listings per page)
- Algolia search (for fast full-text)

## SEO

Metadata set in `layout.tsx`:
- Title: "Royal LePage — Find Your Home"
- Description: "Search live MLS listings across Canada"
- Open Graph: preview for social sharing

Dynamic pages (`/listings/[mlsId]`) generate metadata from listing data for social sharing.

## Analytics

Track:
- Homepage load (unique visitors)
- Search queries (popular cities/price ranges)
- Lead form submissions (conversion rate)
- Listing detail views (popular properties)

Integrate with Google Analytics or Segment:

```typescript
// In src/app/page.tsx
useEffect(() => {
  gtag.event('page_view', { page_path: '/' });
}, []);
```

## Mobile Optimization

- Touch-friendly buttons (44px min height)
- Responsive images (srcset for different screen sizes)
- Fast mobile search (autocomplete city names)
- Mobile-first forms (large input fields)

## Email Integration (Optional)

Connect to email campaigns:
- Homepage signup → 7-day drip campaign
- Listing interest form → Send property details + market report

Configure in setup wizard or manually:

```typescript
// In api/leads/route.ts
await ghl('POST', `/contacts/${contactId}/campaigns/${GHL_CAMPAIGN_ID}`);
```

## Customization

### Change Hero Copy

Edit `src/app/page.tsx`:
```typescript
<h1 className="text-4xl font-bold">Find Your Perfect Home</h1>
```

### Add Property Types Filter

Edit `ListingGrid.tsx`:
```typescript
const [type, setType] = useState('');
// Add select dropdown for types: house, condo, townhouse, etc.
```

### Custom Listing Fields

Add fields to listing detail based on IDX provider response:
```typescript
<div>Year Built: {listing.yearBuilt}</div>
<div>Property Tax: {listing.annualTax}</div>
```

## Showing Scheduling

Integrate with `showings-mcp` for "Schedule a showing" button:

```typescript
// On listing detail page
<button onClick={() => {
  // Call showings-mcp to book appointment
  const slot = await getAvailableSlots(agentId);
  // Show calendar
}}>
  Schedule a Showing
</button>
```

See `../showings-mcp/` for integration details.

## Testing

```bash
npm test
```

Tests:
- Listing search filters
- Lead form validation
- API endpoints
- Responsive layout

## Deployment

Deploy to Vercel, Netlify, or Railway:

```bash
npm run build
# Files in .next/ ready for deployment
```

Environment variables in deployment dashboard.

## Monitoring

Set up alerts:
- IDX API down → show cached listings
- GHL lead creation failing → queue for retry
- High 404 errors → check listing detail routes

## Common Issues

**"IDX_API_KEY not set"** — Missing environment variable. Set in deployment.

**Listings not loading** — Check IDX provider API status. Verify credentials.

**Lead form submitting but contact not in GHL** — Check GHL_API_KEY, GHL_LOCATION_ID. Verify webhook is firing.

**Slow search** — Add Redis caching layer or reduce listing count per page.

**Mobile layout broken** — Check Tailwind responsive classes (md:, lg:, etc.).
