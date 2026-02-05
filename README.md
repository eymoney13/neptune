# Water Quality Dashboard

A minimalistic, Airbnb-style web application for visualizing BeachWatch water quality data with interactive maps and charts.

## Features

- **Interactive Map**: Explore sampling stations with color-coded markers based on water quality
- **Time Series Charts**: View water quality trends over time for individual stations
- **Geometric Mean Comparisons**: Compare 30-day and 6-week geometric means across stations
- **Station Browser**: Search and filter through all sampling stations
- **Minimalistic Design**: Clean, modern UI inspired by Airbnb's design system

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Leaflet & React-Leaflet (maps)
- Recharts (data visualization)
- PapaParse (CSV processing)

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Make sure the CSV file is in the `public` directory:
   - `public/safetoswim_geomeans_2020-present.csv`

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment to Vercel

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)

2. Import your repository in [Vercel](https://vercel.com)

3. Vercel will automatically detect Next.js and configure the build settings

4. The CSV file in the `public` directory will be served as a static asset

## Data Structure

The application expects a CSV file with the following key columns:
- `StationName`, `StationCode`: Station identifiers
- `TargetLatitude`, `TargetLongitude`: Geographic coordinates
- `SampleDate`: Date of sample collection
- `Result`: Measurement result (fecal coliform in CFU/100mL)
- `30DayGeoMean`, `6WeekGeoMean`: Geometric mean calculations

## Water Quality Status

- **Green (<70 CFU/100mL)**: Safe - Low risk
- **Yellow (70-104 CFU/100mL)**: Poor - Poor water quality
- **Red (>104 CFU/100mL)**: Unsafe - Not recommended to swim
