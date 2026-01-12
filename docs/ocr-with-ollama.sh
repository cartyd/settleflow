#!/usr/bin/env zsh

# Script to perform OCR on a base64 encoded image using Ollama
# Usage: ./ocr-with-ollama.sh <base64-string> [model]

if [ -z "$1" ]; then
  echo "Usage: $0 <base64-string> [model]"
  echo "Example: $0 'iVBORw0KGgoAAAANSUhEUgAAAAUA...' 'llama3.2-vision'"
  exit 1
fi

BASE64_IMAGE="$1"
MODEL="${2:-llama3.2-vision}"
OLLAMA_URL="${OLLAMA_URL:-http://10.147.17.205:11434}"

# Create the JSON payload with the image
curlie -s "${OLLAMA_URL}/api/generate" \
  Content-Type:application/json \
  model="$MODEL" \
  prompt="Extract and return all text from this image. Provide only the text content without any additional commentary." \
  stream:=false \
  images:="[\"$BASE64_IMAGE\"]" | jq -r '.response'
