const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

export async function getBatches() {
  const response = await fetch(`${API_BASE_URL}/batches`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  return response.json();
}

export async function getBatchById(id: string) {
  const response = await fetch(`${API_BASE_URL}/batches/${id}`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  return response.json();
}

export async function getBatchDetails(id: string) {
  const response = await fetch(`${API_BASE_URL}/batches/${id}/details`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  return response.json();
}

export async function parseImportFile(importFileId: string) {
  const response = await fetch(`${API_BASE_URL}/batches/import-files/${importFileId}/parse`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Parse request failed: ${response.statusText}`);
  }
  return response.json();
}

export async function getImportFileSummary(importFileId: string) {
  const response = await fetch(`${API_BASE_URL}/batches/import-files/${importFileId}/summary`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  return response.json();
}
