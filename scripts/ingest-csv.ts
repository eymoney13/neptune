#!/usr/bin/env node

/**
 * CSV ingestion CLI
 * Supports local files and CKAN API sources
 */

import { Command } from 'commander';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { Readable } from 'stream';
import {
  resolveResourceUrlFromDataset,
  resolveResourceUrlFromResourceId,
} from '../lib/ckan';
import {
  getDbClient,
  ensureStagingTable,
  truncateStagingTable,
  copyFromStream,
  mergeStagingToMain,
} from '../lib/db';

const program = new Command();

program
  .name('ingest:csv')
  .description('Ingest CSV data into Postgres using COPY')
  .option('--file <path>', 'Local CSV file path')
  .option('--ckan-base <url>', 'CKAN base URL (e.g., https://data.example.gov/)')
  .option('--dataset-id <id>', 'CKAN dataset/package ID')
  .option('--resource-id <id>', 'CKAN resource ID')
  .option('--resource-name <name>', 'Resource name (if dataset has multiple)')
  .option('--format <format>', 'Preferred format (e.g., CSV)', 'CSV')
  .option('--staging-table <name>', 'Staging table name', 'water_quality_staging')
  .option('--main-table <name>', 'Main table name', 'water_quality')
  .option('--skip-merge', 'Skip merging staging to main table', false)
  .action(async (options) => {
    try {
      // Validate options
      if (!options.file && !options.ckanBase) {
        console.error('Error: Either --file or --ckan-base must be provided');
        process.exit(1);
      }

      if (options.ckanBase && !options.datasetId && !options.resourceId) {
        console.error(
          'Error: When using --ckan-base, either --dataset-id or --resource-id must be provided'
        );
        process.exit(1);
      }

      // Resolve CSV source
      let csvStream: Readable;
      let isGzipped = false;

      if (options.file) {
        // Local file mode
        console.log(`Reading local file: ${options.file}`);
        csvStream = createReadStream(options.file);
        isGzipped = options.file.endsWith('.gz');
      } else {
        // CKAN mode
        console.log('Fetching CSV from CKAN...');
        let resourceUrl: string;

        if (options.resourceId) {
          resourceUrl = await resolveResourceUrlFromResourceId(
            options.ckanBase!,
            options.resourceId
          );
        } else {
          resourceUrl = await resolveResourceUrlFromDataset(
            options.ckanBase!,
            options.datasetId!,
            options.resourceName,
            options.format
          );
        }

        // Download stream
        console.log('Downloading stream...');
        isGzipped =
          resourceUrl.toLowerCase().endsWith('.gz') ||
          resourceUrl.toLowerCase().includes('.csv.gz');

        const response = await fetch(resourceUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to download resource: ${response.status} ${response.statusText}`
          );
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        // Convert ReadableStream to Node.js Readable
        csvStream = Readable.fromWeb(response.body as any);
      }

      // Handle gzip decompression
      let finalStream: Readable = csvStream;
      if (isGzipped) {
        console.log('Decompressing gzip stream...');
        finalStream = csvStream.pipe(createGunzip());
      }

      // Connect to database
      console.log('Connecting to database...');
      const client = getDbClient();
      await client.connect();

      try {
        // Prepare staging table
        console.log(`Ensuring staging table exists: ${options.stagingTable}`);
        await ensureStagingTable(client, options.stagingTable);
        await truncateStagingTable(client, options.stagingTable);

        // Stream CSV into staging table
        console.log('COPY streaming started...');
        const rowCount = await copyFromStream(
          client,
          options.stagingTable,
          finalStream
        );
        console.log(`✓ Ingested approximately ${rowCount} rows into staging table`);

        // Merge to main table
        if (!options.skipMerge) {
          console.log(`Merging staging table into ${options.mainTable}...`);
          const mergedCount = await mergeStagingToMain(
            client,
            options.stagingTable,
            options.mainTable
          );
          console.log(`✓ Merged ${mergedCount} rows into main table`);
        } else {
          console.log('Skipping merge (--skip-merge flag set)');
        }

        console.log('✓ Ingestion complete!');
      } finally {
        await client.end();
      }
    } catch (error: any) {
      console.error('Error:', error.message);
      if (error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program.parse();
