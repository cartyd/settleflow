import { PrismaClient } from '@prisma/client';

import { captureCustomError } from '../utils/sentry.js';

export interface DriverMatchResult {
  importLineId: string;
  matchedDriverId?: string;
  confidence: 'exact' | 'fuzzy' | 'none';
  candidateMatches?: Array<{
    driverId: string;
    driverName: string;
    score: number;
  }>;
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses Levenshtein distance for fuzzy matching
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;

  const len1 = s1.length;
  const len2 = s2.length;
  
  if (len1 === 0 || len2 === 0) return 0;

  // Levenshtein distance
  const matrix: number[][] = [];
  
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[len1][len2];
  const maxLength = Math.max(len1, len2);
  
  return 1 - distance / maxLength;
}

/**
 * Match a driver name to existing Driver records
 */
export async function matchDriverByName(
  prisma: PrismaClient,
  firstName: string | null,
  lastName: string | null,
  batchId: string
): Promise<DriverMatchResult | null> {
  if (!firstName && !lastName) {
    return null;
  }

  // Get batch to find agency
  const batch = await prisma.settlementBatch.findUnique({
    where: { id: batchId },
    select: { agencyId: true },
  });

  if (!batch) {
    return null;
  }

  // Get all drivers for this agency
  const drivers = await prisma.driver.findMany({
    where: {
      agencyId: batch.agencyId,
      active: true,
    },
  });

  const candidates: Array<{
    driverId: string;
    driverName: string;
    score: number;
  }> = [];

  for (const driver of drivers) {
    let score = 0;
    let matches = 0;

    // Check first name match
    if (firstName && driver.firstName) {
      score += calculateSimilarity(firstName, driver.firstName);
      matches++;
    }

    // Check last name match
    if (lastName && driver.lastName) {
      score += calculateSimilarity(lastName, driver.lastName);
      matches++;
    }

    if (matches > 0) {
      const avgScore = score / matches;
      if (avgScore > 0.5) { // Only consider matches with >50% similarity
        candidates.push({
          driverId: driver.id,
          driverName: `${driver.firstName} ${driver.lastName}`,
          score: avgScore,
        });
      }
    }
  }

  // Sort by score
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return null;
  }

  const bestMatch = candidates[0];

  // Determine confidence
  let confidence: 'exact' | 'fuzzy' | 'none' = 'none';
  if (bestMatch.score >= 0.95) {
    confidence = 'exact';
  } else if (bestMatch.score >= 0.7) {
    confidence = 'fuzzy';
  }

  return {
    importLineId: '', // Will be set by caller
    matchedDriverId: confidence !== 'none' ? bestMatch.driverId : undefined,
    confidence,
    candidateMatches: candidates.slice(0, 5), // Top 5 matches
  };
}

/**
 * Match all import lines with driver information to Driver records
 */
export async function matchDriversForImportFile(
  prisma: PrismaClient,
  importFileId: string
): Promise<{
  matched: number;
  unmatched: number;
  results: DriverMatchResult[];
}> {
  // Get all import lines with driver info
  const lines = await prisma.importLine.findMany({
    where: {
      importDocument: {
        importFileId,
      },
      driverId: null, // Only match unmatched lines
    },
    include: {
      importDocument: {
        include: {
          importFile: {
            include: {
              batch: true,
            },
          },
        },
      },
    },
  });

  let matched = 0;
  let unmatched = 0;
  const results: DriverMatchResult[] = [];

  for (const line of lines) {
    try {
      const rawData = typeof line.rawData === 'string' ? JSON.parse(line.rawData) : line.rawData;
      const firstName = rawData.driverFirstName;
      const lastName = rawData.driverLastName;

      if (!firstName && !lastName) {
        continue;
      }

      const match = await matchDriverByName(
        prisma,
        firstName,
        lastName,
        line.importDocument.importFile.batchId
      );

      if (match?.matchedDriverId && match.confidence === 'exact') {
        // Auto-match exact matches
        await prisma.importLine.update({
          where: { id: line.id },
          data: { driverId: match.matchedDriverId },
        });
        matched++;
        
        match.importLineId = line.id;
        results.push(match);
      } else if (match) {
        // Store fuzzy matches for manual review
        unmatched++;
        match.importLineId = line.id;
        results.push(match);
      } else {
        unmatched++;
      }
    } catch (error) {
      console.error(`Failed to match driver for line ${line.id}:`, error);
      captureCustomError(error as Error, {
        level: 'warning',
        tags: {
          module: 'driver-matcher',
          operation: 'match_driver',
        },
        extra: {
          lineId: line.id,
          importFileId,
        },
      });
      unmatched++;
    }
  }

  return {
    matched,
    unmatched,
    results,
  };
}
