# Travel Expenses API

Separate travel expense tracking with multi-currency support, exchange rate lookups, and trip grouping.

Travel expenses are stored independently from regular expenses because foreign currency conversion is logged alongside the original amount.

## Base URL

```
/api/travel-expenses
```

---

## Exchange Rate

### Get Latest Exchange Rate

Fetches the latest exchange rate from [frankfurter.dev](https://frankfurter.dev) (free, no API key required).

```
GET /exchange-rate?from=USD&to=IDR
```

**Query Parameters:**

| Param | Type   | Default | Description               |
|-------|--------|---------|---------------------------|
| from  | string | `USD`   | Source currency (ISO 4217) |
| to    | string | `IDR`   | Target currency (ISO 4217) |

**Response (200):**
```json
{
  "from": "USD",
  "to": "IDR",
  "rate": 15930.5,
  "date": "2026-01-28"
}
```

**Errors:**
- `404` — Rate not found for the given currency pair
- `502` — Failed to reach the exchange rate API

---

## Travel Categories

### List Categories

```
GET /categories
```

**Response (200):**
```json
[
  { "id": 1, "name": "Accommodation", "icon": "🏨", "color": "#FF6B6B", "created_at": "..." },
  { "id": 2, "name": "Flights", "icon": "✈️", "color": "#4ECDC4", "created_at": "..." }
]
```

**Default categories:** Accommodation, Flights, Local Transport, Food & Dining, Activities, Shopping, SIM & Internet, Insurance, Visa & Fees, Other.

### Create Category

```
POST /categories
```

**Body:**
```json
{
  "name": "Tour Guide",
  "icon": "🧑‍🏫",
  "color": "#E8DAEF"
}
```

| Field | Type   | Required | Description    |
|-------|--------|----------|----------------|
| name  | string | yes      | Category name (unique) |
| icon  | string | no       | Emoji icon     |
| color | string | no       | Hex color code |

**Response (201):** The created category object.

**Errors:**
- `400` — Name is required
- `409` — Category already exists

---

## Travel Expenses CRUD

### List Travel Expenses

```
GET /
```

**Query Parameters:**

| Param      | Type   | Default | Description                  |
|------------|--------|---------|------------------------------|
| startDate  | string | —       | Filter from date (YYYY-MM-DD) |
| endDate    | string | —       | Filter to date (YYYY-MM-DD)   |
| categoryId | int    | —       | Filter by category ID         |
| currency   | string | —       | Filter by currency (e.g. JPY) |
| tripName   | string | —       | Filter by trip name           |
| limit      | int    | `50`    | Max results                   |
| offset     | int    | `0`     | Pagination offset             |

**Response (200):**
```json
[
  {
    "id": 1,
    "amount": 5000,
    "currency": "JPY",
    "converted_amount": 530000,
    "converted_currency": "IDR",
    "exchange_rate": 106,
    "description": "Ramen lunch",
    "vendor": "Ichiran",
    "category_id": 4,
    "date": "2026-01-15",
    "trip_name": "Japan 2026",
    "source": "manual",
    "notes": null,
    "created_at": "2026-01-15T12:00:00.000Z",
    "updated_at": "2026-01-15T12:00:00.000Z",
    "category_name": "Food & Dining",
    "category_icon": "🍽️",
    "category_color": "#96CEB4"
  }
]
```

### Get Single Travel Expense

```
GET /:id
```

**Response (200):** Single travel expense object (same shape as list items).

**Errors:**
- `404` — Travel expense not found

### Create Travel Expense

```
POST /
```

**Body:**
```json
{
  "amount": 5000,
  "currency": "JPY",
  "converted_amount": 530000,
  "converted_currency": "IDR",
  "exchange_rate": 106,
  "description": "Ramen lunch",
  "vendor": "Ichiran",
  "category_id": 4,
  "date": "2026-01-15",
  "trip_name": "Japan 2026",
  "source": "manual",
  "notes": "Best ramen in Shinjuku"
}
```

| Field              | Type   | Required | Default  | Description                           |
|--------------------|--------|----------|----------|---------------------------------------|
| amount             | number | yes      | —        | Amount in foreign currency            |
| currency           | string | no       | `USD`    | 3-letter ISO 4217 currency code       |
| converted_amount   | number | no       | `null`   | Amount converted to home currency     |
| converted_currency | string | no       | `IDR`    | Home currency code                    |
| exchange_rate      | number | no       | `null`   | Exchange rate used for conversion     |
| description        | string | no       | `null`   | Expense description (max 500 chars)   |
| vendor             | string | no       | `null`   | Vendor/merchant name (max 200 chars)  |
| category_id        | int    | no       | `null`   | Travel category ID                    |
| date               | string | yes      | —        | Date (YYYY-MM-DD or ISO string)       |
| trip_name          | string | no       | `null`   | Trip name for grouping (max 200 chars)|
| source             | string | no       | `manual` | Source of entry                       |
| notes              | string | no       | `null`   | Additional notes (max 1000 chars)     |

**Response (201):** The created travel expense object.

### Update Travel Expense

```
PUT /:id
```

**Body:** Same fields as create, all optional. Only provided fields are updated.

**Response (200):** The updated travel expense object.

**Errors:**
- `404` — Travel expense not found

### Delete Travel Expense

```
DELETE /:id
```

**Response (200):**
```json
{ "success": true }
```

**Errors:**
- `404` — Travel expense not found

---

## Aggregation Endpoints

### List Trips

```
GET /trips
```

Returns all trips with aggregated totals.

**Response (200):**
```json
[
  {
    "trip_name": "Japan 2026",
    "currency": "JPY",
    "expense_count": 42,
    "total_amount": 285000,
    "total_converted": 30210000,
    "converted_currency": "IDR",
    "start_date": "2026-01-10",
    "end_date": "2026-01-20"
  }
]
```

### Get Summary

```
GET /summary?tripName=Japan%202026&startDate=2026-01-01&endDate=2026-01-31
```

**Query Parameters:**

| Param     | Type   | Description                    |
|-----------|--------|--------------------------------|
| tripName  | string | Filter by trip name            |
| startDate | string | Filter from date (YYYY-MM-DD)  |
| endDate   | string | Filter to date (YYYY-MM-DD)    |

**Response (200):**
```json
{
  "by_currency": [
    { "currency": "JPY", "total": 285000, "count": 42 },
    { "currency": "USD", "total": 150, "count": 3 }
  ],
  "converted_total": [
    { "converted_currency": "IDR", "total": 32520000 }
  ],
  "by_category": [
    {
      "category_name": "Food & Dining",
      "category_icon": "🍽️",
      "category_color": "#96CEB4",
      "currency": "JPY",
      "total": 120000,
      "count": 18
    }
  ]
}
```

---

## Typical Workflow

1. **Fetch exchange rate** before creating an expense:
   ```
   GET /exchange-rate?from=JPY&to=IDR
   → { "rate": 106, ... }
   ```

2. **Create the travel expense** with the rate:
   ```
   POST /
   {
     "amount": 5000,
     "currency": "JPY",
     "exchange_rate": 106,
     "converted_amount": 530000,
     "converted_currency": "IDR",
     "trip_name": "Japan 2026",
     "category_id": 4,
     "date": "2026-01-15",
     "description": "Ramen lunch"
   }
   ```

3. **View trip summary**:
   ```
   GET /summary?tripName=Japan%202026
   ```
