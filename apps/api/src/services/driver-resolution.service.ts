import { PrismaClient } from '@prisma/client';

export interface DriverInfo {
  driverName: string;
  driverNumber?: string;
  accountNumber?: string;
  confidence: 'high' | 'medium' | 'low';
  source: string; // Which document type provided this info
}

export interface ResolvedDriver {
  driverName: string;
  driverNumber?: string;
  driverId?: string; // Matched database driver ID
  confidence: 'high' | 'medium' | 'low';
  sources: string[];
}

/**
 * Simple fuzzy match for driver names
 * Returns a score from 0-1 where 1 is exact match
 */
function fuzzyMatchScore(name1: string, name2: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  if (n1 === n2) return 1.0;
  
  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) {
    return 0.8;
  }
  
  // Calculate Levenshtein distance
  const maxLen = Math.max(n1.length, n2.length);
  const distance = levenshteinDistance(n1, n2);
  return 1 - (distance / maxLen);
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Extract driver information from all import lines for a given trip
 */
async function getDriverInfoForTrip(
  prisma: PrismaClient,
  importFileId: string,
  tripNumber: string
): Promise<DriverInfo[]> {
  const lines = await prisma.importLine.findMany({
    where: {
      tripNumber,
      importDocument: {
        importFileId,
      },
    },
    include: {
      importDocument: {
        select: {
          documentType: true,
        },
      },
    },
  });

  const driverInfos: DriverInfo[] = [];

  for (const line of lines) {
    if (!line.rawData) continue;

    try {
      const rawData = JSON.parse(line.rawData);
      
      if (rawData.driverName) {
        driverInfos.push({
          driverName: rawData.driverName,
          driverNumber: rawData.driverNumber,
          accountNumber: rawData.accountNumber,
          // Advance docs have cleanest driver data
          confidence: line.importDocument.documentType === 'ADVANCE_ADVICE' ? 'high' : 'medium',
          source: line.importDocument.documentType,
        });
      }
    } catch (e) {
      // Skip invalid JSON
    }
  }

  return driverInfos;
}

/**
 * Resolve the best driver name for a trip by aggregating from multiple sources
 */
export async function resolveDriverForTrip(
  prisma: PrismaClient,
  importFileId: string,
  tripNumber: string,
  agencyCode: string
): Promise<ResolvedDriver | null> {
  // Get all driver info from various documents
  const driverInfos = await getDriverInfoForTrip(prisma, importFileId, tripNumber);

  if (driverInfos.length === 0) {
    return null;
  }

  // Prioritize high confidence sources (ADVANCE_ADVICE)
  const highConfidence = driverInfos.filter((d) => d.confidence === 'high');
  const bestSource = highConfidence.length > 0 ? highConfidence[0] : driverInfos[0];

  // Try to match against existing driver in database by name
  let matchedDriver: { id: string; fullName: string } | null = null;

  if (bestSource.driverName) {
    // Try fuzzy match by name
    const allDrivers = await prisma.driver.findMany({
      where: {
        agency: { code: agencyCode },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    let bestMatch = null;
    let bestScore = 0;

    for (const driver of allDrivers) {
      const driverFullName = `${driver.lastName}, ${driver.firstName}`;
      const score = fuzzyMatchScore(bestSource.driverName, driverFullName);
      if (score > 0.7 && score > bestScore) {
        bestScore = score;
        bestMatch = { id: driver.id, fullName: driverFullName };
      }
    }

    if (bestMatch) {
      matchedDriver = bestMatch;
    }
  }

  return {
    driverName: matchedDriver?.fullName || bestSource.driverName,
    driverNumber: bestSource.driverNumber,
    driverId: matchedDriver?.id,
    confidence: matchedDriver ? 'high' : bestSource.confidence,
    sources: driverInfos.map((d) => d.source),
  };
}

/**
 * Resolve drivers for all trips in an import file and update import lines
 */
export async function resolveDriversForImportFile(
  prisma: PrismaClient,
  importFileId: string
): Promise<{
  tripsProcessed: number;
  driversResolved: number;
  driversMatched: number;
}> {
  // Get the batch and agency info
  const importFile = await prisma.importFile.findUnique({
    where: { id: importFileId },
    include: {
      batch: {
        include: {
          agency: {
            select: { code: true },
          },
        },
      },
    },
  });

  if (!importFile?.batch) {
    throw new Error('Import file or batch not found');
  }

  const agencyCode = importFile.batch.agency.code;

  // Get all unique trip numbers
  const trips = await prisma.importLine.findMany({
    where: {
      importDocument: {
        importFileId,
      },
      tripNumber: { not: null },
    },
    select: { tripNumber: true },
    distinct: ['tripNumber'],
  });

  let driversResolved = 0;
  let driversMatched = 0;

  for (const trip of trips) {
    if (!trip.tripNumber) continue;

    const resolved = await resolveDriverForTrip(
      prisma,
      importFileId,
      trip.tripNumber,
      agencyCode
    );

    if (resolved) {
      driversResolved++;
      if (resolved.driverId) {
        driversMatched++;
      }

      // Update all import lines for this trip with resolved driver info
      await prisma.importLine.updateMany({
        where: {
          tripNumber: trip.tripNumber,
          importDocument: {
            importFileId,
          },
        },
        data: {
          driverId: resolved.driverId,
        },
      });

      // Update rawData with resolved driver name for revenue distribution lines
      const revDistLines = await prisma.importLine.findMany({
        where: {
          tripNumber: trip.tripNumber,
          category: 'REV DIST',
          importDocument: {
            importFileId,
          },
        },
      });

      for (const line of revDistLines) {
        if (line.rawData) {
          try {
            const rawData = JSON.parse(line.rawData);
            rawData.driverName = resolved.driverName;
            rawData.driverNumber = resolved.driverNumber;
            
            if (rawData.driverFirstName || rawData.driverLastName) {
              // Update split name fields if they exist
              const nameParts = resolved.driverName.split(',').map(s => s.trim());
              if (nameParts.length === 2) {
                rawData.driverLastName = nameParts[0];
                rawData.driverFirstName = nameParts[1];
              }
            }

            // Update description with correct driver info
            const shipper = rawData.shipperName || 'Unknown';
            const origin = rawData.origin || 'Unknown';
            const destination = rawData.destination || 'Unknown';
            const newDescription = `${shipper}: ${origin} → ${destination}`;

            await prisma.importLine.update({
              where: { id: line.id },
              data: {
                rawData: JSON.stringify(rawData),
                description: newDescription,
              },
            });
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  return {
    tripsProcessed: trips.length,
    driversResolved,
    driversMatched,
  };
}
