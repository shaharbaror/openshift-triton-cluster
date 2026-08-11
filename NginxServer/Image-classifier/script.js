const MODEL_NAME = "image_classifier";
const INPUT_TENSOR_NAME = "input";
const OUTPUT_TENSOR_NAME = "output";
const TARGET_SIZE = 224; // Standard ImageNet input shape [1, 3, 224, 224]

let selectedImageElement = null;

// File Upload & Preview Handling
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const previewContainer = document.getElementById('previewContainer');
const imagePreview = document.getElementById('imagePreview');

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) handleFile(e.target.files[0]);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please upload a valid image file.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = e.target.result;
    previewContainer.classList.remove('hidden');
    
    // Create an Image object for canvas tensor processing
    const img = new Image();
    img.src = e.target.result;
    img.onload = () => { selectedImageElement = img; };
  };
  reader.readAsDataURL(file);
}

// Preprocessing: Resize any image to 224x224 & convert to Float32 RGB Flat Array [1, 3, 224, 224]
function preprocessImage(img) {
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext('2d');

  // Draw image stretched/scaled to 224x224
  ctx.drawImage(img, 0, 0, TARGET_SIZE, TARGET_SIZE);
  const imageData = ctx.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE);
  const rgbaData = imageData.data; // Uint8Array [R, G, B, A, R, G, B, A, ...]

  const numPixels = TARGET_SIZE * TARGET_SIZE;
  const floatArray = new Float32Array(3 * numPixels);

  // Re-arrange from Interleaved RGBA to Planar NCHW [Red_Plane, Green_Plane, Blue_Plane]
  for (let i = 0; i < numPixels; i++) {
    const r = rgbaData[i * 4] / 255.0;
    const g = rgbaData[i * 4 + 1] / 255.0;
    const b = rgbaData[i * 4 + 2] / 255.0;

    floatArray[i] = r;                    // Red channel plane
    floatArray[numPixels + i] = g;        // Green channel plane
    floatArray[2 * numPixels + i] = b;    // Blue channel plane
  }

  return Array.from(floatArray);
}

// Perform Inference Call to Triton
async function classifyImage() {
  const baseUrl = document.getElementById('routeUrl').value.replace(/\/$/, "");
  const statusMsg = document.getElementById('statusMessage');
  const resultsGrid = document.getElementById('resultsGrid');

  if (!baseUrl) {
    alert("Please enter your OpenShift Route URL.");
    return;
  }

  if (!selectedImageElement) {
    alert("Please select or drop an image first.");
    return;
  }

  statusMsg.className = "status-idle";
  statusMsg.innerText = "Processing image & contacting Triton...";
  resultsGrid.innerHTML = "";

  try {
    // 1. Convert Image to FP32 Flattened Tensor
    const pixelData = preprocessImage(selectedImageElement);

    // 2. Build Triton V2 Request Payload
    const payload = {
      inputs: [
        {
          name: INPUT_TENSOR_NAME,
          shape: [1, 3, TARGET_SIZE, TARGET_SIZE],
          datatype: "FP32",
          data: pixelData
        }
      ],
      outputs: [
        {
          name: OUTPUT_TENSOR_NAME,
          parameters: {
            classification: 5
          }
        }
      ]
    };

    // 3. Send HTTP POST (using text/plain header to bypass preflight OPTIONS)
    const endpoint = `${baseUrl}/v2/models/${MODEL_NAME}/infer`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}: ${await response.text()}`);
    }

    const jsonResult = await response.json();
    statusMsg.innerText = "";
    
    // 4. Render Top 5 Predictions
    displayPredictions(jsonResult);

  } catch (err) {
    statusMsg.className = "status-idle";
    statusMsg.innerText = `Inference Failed: ${err.message}`;
    console.error(err);
  }
}

// Display Top 5 Prediction Cards
function displayPredictions(responseJson) {
  const resultsGrid = document.getElementById('resultsGrid');
  resultsGrid.innerHTML = "";

  const outputData = responseJson.outputs[0].data; // Formatted as "score:class_index:label"

  outputData.forEach((item) => {
    // Triton classification output string parsing
    const parts = item.split(':');
    const score = parseFloat(parts[0]);
    const certaintyPercent = (score * 100).toFixed(1);
    
    // Extract label (handles cases with or without class index)
    const label = parts.length > 2 ? parts.slice(2).join(':') : (parts[1] || 'Unknown');

    const card = document.createElement('div');
    card.className = 'prediction-card';
    card.innerHTML = `
      <div class="prediction-header">
        <span class="prediction-label">${label}</span>
        <span class="prediction-score">${certaintyPercent}%</span>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width: ${certaintyPercent}%"></div>
      </div>
    `;
    resultsGrid.appendChild(card);
  });
}
