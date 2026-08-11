const INPUT_TENSOR_NAME = "input";
const OUTPUT_TENSOR_NAME = "output";
const TARGET_SIZE = 224;

let selectedModelName = "image_classifier";
let tritonUrl = "";
let selectedImageElement = null;

// Initialize state from URL params and localStorage
window.onload = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const modelFromUrl = urlParams.get('model');
  
  if (modelFromUrl) {
    selectedModelName = modelFromUrl;
  }
  
  tritonUrl = localStorage.getItem('tritonUrl') || "";
  document.getElementById('activeModelBadge').innerText = `Model: ${selectedModelName}`;

  if (!tritonUrl) {
    alert("No Triton URL found. Please connect via the main menu first.");
    window.location.href = "index.html";
  }
};

// Drag and Drop & File Processing
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');

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
    document.getElementById('imagePreview').src = e.target.result;
    document.getElementById('previewContainer').classList.remove('hidden');
    
    const img = new Image();
    img.src = e.target.result;
    img.onload = () => { selectedImageElement = img; };
  };
  reader.readAsDataURL(file);
}

// Preprocessing: Resize image to 224x224 & convert to Float32 RGB NCHW Plane
function preprocessImage(img) {
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(img, 0, 0, TARGET_SIZE, TARGET_SIZE);
  const rgbaData = ctx.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE).data;

  const numPixels = TARGET_SIZE * TARGET_SIZE;
  const floatArray = new Float32Array(3 * numPixels);

  for (let i = 0; i < numPixels; i++) {
    floatArray[i] = rgbaData[i * 4] / 255.0;                    // Red
    floatArray[numPixels + i] = rgbaData[i * 4 + 1] / 255.0;    // Green
    floatArray[2 * numPixels + i] = rgbaData[i * 4 + 2] / 255.0; // Blue
  }

  return Array.from(floatArray);
}

// Perform Inference
async function classifyImage() {
  const statusMsg = document.getElementById('statusMessage');
  const resultsGrid = document.getElementById('resultsGrid');

  if (!selectedImageElement) {
    alert("Please upload an image first.");
    return;
  }

  statusMsg.className = "status-idle";
  statusMsg.innerText = `Sending request to ${selectedModelName}...`;
  resultsGrid.innerHTML = "";

  try {
    const pixelData = preprocessImage(selectedImageElement);

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
          parameters: { classification: 5 }
        }
      ]
    };

    const endpoint = `${tritonUrl}/v2/models/${selectedModelName}/infer`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const jsonResult = await response.json();
    statusMsg.innerText = "";
    displayPredictions(jsonResult);

  } catch (err) {
    statusMsg.className = "status-idle";
    statusMsg.innerText = `Inference Failed: ${err.message}`;
    console.error(err);
  }
}

// Display Top 5 Cards
function displayPredictions(responseJson) {
  const resultsGrid = document.getElementById('resultsGrid');
  resultsGrid.innerHTML = "";

  const outputData = responseJson.outputs[0].data;

  outputData.forEach((item) => {
    const parts = item.split(':');
    const score = parseFloat(parts[0]);
    const certaintyPercent = (score * 100).toFixed(1);
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
