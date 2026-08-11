const INPUT_TENSOR_NAME = "input";
const OUTPUT_TENSOR_NAME = "output";
const TARGET_SIZE = 224;
const DEFAULT_BASE_URL = "https://nginx-gateway-http-trainee-playground-7.test.medone-1.med.one";

let selectedModelName = "image_classifier";
let tritonUrl = DEFAULT_BASE_URL;
let selectedImageElement = null;

window.onload = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const modelFromUrl = urlParams.get('model');
  
  if (modelFromUrl) {
    selectedModelName = modelFromUrl;
  }
  
  tritonUrl = (localStorage.getItem('tritonUrl') || DEFAULT_BASE_URL).replace(/\/$/, "");
  document.getElementById('activeModelBadge').innerText = `Model: ${selectedModelName}`;
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

// Preprocessing: Resize image to 224x224 & convert to Float32 RGB NCHW
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
      headers: { 'Content-Type': 'application/json' },
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

// Display Top 5 Rankings (1st through 5th, no percentages/scores)
function displayPredictions(responseJson) {
  const resultsGrid = document.getElementById('resultsGrid');
  resultsGrid.innerHTML = "";

  const outputData = responseJson.outputs[0].data;
  const rankLabels = ["1st", "2nd", "3rd", "4th", "5th"];

  outputData.slice(0, 5).forEach((item, index) => {
    const parts = item.split(':');
    const label = parts.length > 2 ? parts.slice(2).join(':') : (parts[1] || 'Unknown');
    const rankName = rankLabels[index] || `${index + 1}th`;
    const colorClass = index === 0 ? 'rank-green' : index === 1 || index === 2 ? 'rank-yellow' : 'rank-white';

    const card = document.createElement('div');
    card.className = 'prediction-card';
    card.innerHTML = `
      <div class="prediction-header ${colorClass}">
        <span class="prediction-rank">${rankName} Highest Rating:</span>
        <span class="prediction-label">${label}</span>
      </div>
    `;
    resultsGrid.appendChild(card);
  });
}