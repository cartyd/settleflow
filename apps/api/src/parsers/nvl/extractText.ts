export async function extractText(fileContent: string): Promise<string[]> {
  // Stub: In production, this would use a PDF parsing library like pdf-parse or pdfjs-dist
  // For now, treat the content as plain text and split by pages
  const pages = fileContent.split('\f'); // Form feed character typically separates pages
  return pages.map((page) => page.trim()).filter((page) => page.length > 0);
}
