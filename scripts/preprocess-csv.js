/**
 * Optional: Pre-process CSV to create a smaller JSON file
 * Run this script if the CSV file is too large for Vercel deployment
 * 
 * Usage: node scripts/preprocess-csv.js
 */

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const CSV_PATH = path.join(__dirname, '../public/safetoswim_geomeans_2020-present.csv');
const OUTPUT_PATH = path.join(__dirname, '../public/processed-data.json');

console.log('Starting CSV preprocessing...');
console.log('This may take several minutes for large files...');

const validRecords = [];
let rowCount = 0;

// Process CSV in chunks
const fileStream = fs.createReadStream(CSV_PATH);

Papa.parse(fileStream, {
  header: true,
  skipEmptyLines: true,
  worker: true,
  step: (result) => {
    rowCount++;
    if (rowCount % 10000 === 0) {
      console.log(`Processed ${rowCount} rows, found ${validRecords.length} valid records...`);
    }

    const record = result.data;
    
    // Filter and extract only needed fields
    if (
      record &&
      record.TargetLatitude && 
      record.TargetLongitude && 
      record.Result &&
      record.TargetLatitude !== 'NR' &&
      record.TargetLongitude !== 'NR' &&
      !isNaN(parseFloat(record.TargetLatitude)) &&
      !isNaN(parseFloat(record.TargetLongitude))
    ) {
      // Extract only essential fields to reduce size
      validRecords.push({
        StationName: record.StationName,
        StationCode: record.StationCode,
        TargetLatitude: parseFloat(record.TargetLatitude),
        TargetLongitude: parseFloat(record.TargetLongitude),
        SampleDate: record.SampleDate,
        Result: parseFloat(record.Result) || 0,
        '30DayGeoMean': parseFloat(record['30DayGeoMean']) || 0,
        '6WeekGeoMean': parseFloat(record['6WeekGeoMean']) || 0,
      });
    }
  },
  complete: () => {
    console.log(`\nProcessing complete!`);
    console.log(`Total rows: ${rowCount}`);
    console.log(`Valid records: ${validRecords.length}`);
    
    // Write to JSON file
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(validRecords), 'utf8');
    
    const originalSize = fs.statSync(CSV_PATH).size / (1024 * 1024);
    const newSize = fs.statSync(OUTPUT_PATH).size / (1024 * 1024);
    
    console.log(`\nOriginal CSV: ${originalSize.toFixed(2)} MB`);
    console.log(`Processed JSON: ${newSize.toFixed(2)} MB`);
    console.log(`Size reduction: ${((1 - newSize/originalSize) * 100).toFixed(1)}%`);
    console.log(`\n✅ Saved to: ${OUTPUT_PATH}`);
    console.log(`\nYou can now use this JSON file instead of the CSV in your app.`);
  },
  error: (error) => {
    console.error('Error processing CSV:', error);
    process.exit(1);
  },
});
