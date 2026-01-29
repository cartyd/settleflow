declare module 'pdf-poppler' {
  interface ConvertOptions {
    format: string;
    out_dir: string;
    out_prefix: string;
    page: number | null;
  }

  interface PdfPoppler {
    convert(pdfPath: string, options: ConvertOptions): Promise<void>;
  }

  const pdfPoppler: PdfPoppler;
  export default pdfPoppler;
}

declare module 'pdf-poppler' {
  interface ConvertOptions {
    format: string;
    out_dir: string;
    out_prefix: string;
    page: number | null;
  }

  function convert(input: string, options: ConvertOptions): Promise<void>;

  export default {
    convert,
  };
}
