#!/usr/bin/env python3

"""
PDF OCR using Ollama with vision models
Usage: python ocr_pdf.py <pdf-file> [--model MODEL] [--output OUTPUT]
"""

import argparse
import base64
import json
import sys
from pathlib import Path

import requests
from pdf2image import convert_from_path


def convert_pdf_to_images(pdf_path):
    """Convert PDF pages to images."""
    try:
        images = convert_from_path(pdf_path)
        return images
    except Exception as e:
        print(f"Error converting PDF: {e}", file=sys.stderr)
        sys.exit(1)


def image_to_base64(image):
    """Convert PIL Image to base64 string."""
    from io import BytesIO
    
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode('utf-8')


def ocr_image_with_ollama(base64_image, model, server_url):
    """Send image to Ollama for OCR."""
    payload = {
        "model": model,
        "prompt": "Extract and return all text from this image. Provide only the text content without any additional commentary.",
        "stream": False,
        "images": [base64_image]
    }
    
    try:
        response = requests.post(
            server_url,
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        response.raise_for_status()
        return response.json().get('response', '')
    except Exception as e:
        print(f"Error calling Ollama API: {e}", file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser(description='Perform OCR on PDF using Ollama')
    parser.add_argument('pdf_file', help='Path to PDF file')
    parser.add_argument('--model', default='gemma3:27b', help='Ollama model to use (default: gemma3:27b)')
    parser.add_argument('--server', default='http://10.147.17.205:11434/api/generate', 
                        help='Ollama server URL')
    parser.add_argument('--output', help='Output file (default: stdout)')
    
    args = parser.parse_args()
    
    pdf_path = Path(args.pdf_file)
    if not pdf_path.exists():
        print(f"Error: File '{pdf_path}' not found", file=sys.stderr)
        sys.exit(1)
    
    print(f"Converting PDF to images...", file=sys.stderr)
    images = convert_pdf_to_images(pdf_path)
    print(f"Processing {len(images)} page(s)...", file=sys.stderr)
    
    all_text = []
    
    for i, image in enumerate(images, 1):
        print(f"Processing page {i}/{len(images)}...", file=sys.stderr)
        base64_image = image_to_base64(image)
        text = ocr_image_with_ollama(base64_image, args.model, args.server)
        
        if text:
            all_text.append(f"--- Page {i} ---\n{text}\n")
        else:
            print(f"Warning: No text extracted from page {i}", file=sys.stderr)
    
    result = "\n".join(all_text)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(result)
        print(f"Output written to {args.output}", file=sys.stderr)
    else:
        print(result)


if __name__ == "__main__":
    main()
